/**
 * DynamoDB の userId（= Cognito sub）を新しいプールの sub に付け替える。
 *
 * memory-nest は認証を専用プール（memory-nest-users）から共通の
 * qol-user-pool に移す。プールが変わると sub も変わるが、**sub は
 * media テーブルのパーティションキーそのもの**なので、放置すると
 * 既存データが一切見えなくなる。
 *
 * DynamoDB はパーティションキーを更新できないため、put（新キー）→
 * delete（旧キー）で書き直す。
 *
 * --- 触らないもの ---
 *
 * sk / capturedSk : userId を含まないのでそのまま流用できる
 * s3Key           : `{旧sub}/YYYY/MM/DD/{mediaId}.ext` のまま残す。
 *                   S3 のパスは配信時に解釈されず（keyToMediaId は
 *                   ファイル名しか見ない）、そのまま参照されるだけなので
 *                   **58GB のオブジェクトを移動する必要はない**。
 *                   新規アップロード分だけ新 sub のパスになり混在するが、
 *                   動作には影響しない。
 *
 * --- 使い方 ---
 *
 *   # 何が起きるか確認（書き込まない）
 *   npx tsx scripts/migrate-user-id.ts --from <旧sub> --to <新sub> --dry-run
 *
 *   # 実行
 *   npx tsx scripts/migrate-user-id.ts --from <旧sub> --to <新sub>
 *
 * 途中で失敗しても、成功した分は新旧どちらのキーでも残る（put が先）。
 * 再実行すれば続きから進むので、そのまま流し直してよい。
 */
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const TABLE_NAME = process.env.MEDIA_TABLE_NAME ?? "memory-nest-media";
const REGION = process.env.AWS_REGION ?? "ap-northeast-1";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** BatchWrite の上限。25 件を超えると弾かれる。 */
const BATCH_SIZE = 25;

async function main() {
  const from = arg("from");
  const to = arg("to");
  const dryRun = process.argv.includes("--dry-run");

  if (!from || !to) {
    console.error("使い方: --from <旧sub> --to <新sub> [--dry-run]");
    process.exit(1);
  }
  if (from === to) {
    console.error("--from と --to が同じです");
    process.exit(1);
  }

  console.log(`テーブル : ${TABLE_NAME}`);
  console.log(`移行元   : ${from.slice(0, 8)}...`);
  console.log(`移行先   : ${to.slice(0, 8)}...`);
  console.log(dryRun ? "モード   : dry-run（書き込まない）\n" : "モード   : 実行\n");

  // 旧 userId の全アイテムを読む。Query なので Scan より速く、
  // 他ユーザーのデータに触れる心配もない。
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "userId = :u",
        ExpressionAttributeValues: { ":u": from },
        ExclusiveStartKey: lastKey,
      })
    );
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  console.log(`対象: ${items.length} 件`);
  if (items.length === 0) {
    console.log("移行するものがありません。");
    return;
  }

  // 種別ごとの内訳を出す。想定外のデータが混ざっていないか確認するため。
  const kinds = new Map<string, number>();
  for (const it of items) {
    const sk = String(it.sk ?? "");
    const kind = sk.startsWith("TAG#")
      ? "タグ"
      : sk.startsWith("ALBUM#")
        ? "アルバム"
        : "メディア";
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
  }
  for (const [k, v] of kinds) console.log(`  ${k}: ${v} 件`);

  if (dryRun) {
    console.log("\ndry-run のため書き込みませんでした。");
    return;
  }

  // 1. 新しい userId で書く
  let written = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: chunk.map((it) => ({
            PutRequest: { Item: { ...it, userId: to } },
          })),
        },
      })
    );
    written += chunk.length;
    process.stdout.write(`\r  書き込み: ${written}/${items.length}`);
  }
  console.log();

  // 2. 旧 userId を消す
  //
  // 書き込みが終わってから消す。順序が逆だと、途中で落ちたときに
  // 「消えたが書けていない」データが出る。
  let deleted = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: chunk.map((it) => ({
            DeleteRequest: { Key: { userId: from, sk: it.sk } },
          })),
        },
      })
    );
    deleted += chunk.length;
    process.stdout.write(`\r  旧データ削除: ${deleted}/${items.length}`);
  }
  console.log();

  console.log(`\n完了: ${items.length} 件を移行しました。`);
}

main().catch((e) => {
  console.error("\n失敗:", e);
  process.exit(1);
});
