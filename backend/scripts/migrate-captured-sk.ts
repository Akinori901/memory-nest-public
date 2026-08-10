/**
 * 既存メディアに capturedSk を後付けするマイグレーション。
 *
 * 撮影日ソートGSI(MediaByCapturedAtIndex)の SK = capturedSk が無い既存アイテムは
 * GSI に載らない(=ギャラリーに出ない)ため、全既存 MediaItem に
 *   capturedSk = `${capturedAt ?? createdAt}#${mediaId}`
 * を埋める。TAG#/ALBUM# のアイテムは対象外(mediaId を持たない)。
 *
 * べき等: 既に capturedSk がある / mediaId が無いアイテムはスキップする。
 * 本番テーブルに対して実行するため、AWS 認証情報が本番を指している必要がある。
 *
 * 使い方:
 *   npx tsx scripts/migrate-captured-sk.ts            # 実行
 *   DRY_RUN=1 npx tsx scripts/migrate-captured-sk.ts  # 変更せず件数だけ確認
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.MEDIA_TABLE_NAME || "memory-nest-media";
const REGION = process.env.AWS_REGION || "ap-northeast-1";
const DRY_RUN = process.env.DRY_RUN === "1";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

const NO_DATE_PREFIX = "~";

function buildCapturedSk(
  mediaId: string,
  createdAt: string,
  capturedAt?: string
): string {
  return capturedAt
    ? `${capturedAt}#${mediaId}`
    : `${NO_DATE_PREFIX}${createdAt}#${mediaId}`;
}

async function main() {
  console.log(
    `[migrate] table=${TABLE_NAME} region=${REGION} dryRun=${DRY_RUN}`
  );

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let lastKey: Record<string, unknown> | undefined;

  do {
    const res = await ddb.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        ...(lastKey && { ExclusiveStartKey: lastKey }),
      })
    );
    const items = res.Items ?? [];
    for (const item of items) {
      scanned++;
      // MediaItem のみ対象(mediaId を持つ)。
      if (!item.mediaId || !item.createdAt) {
        skipped++;
        continue;
      }
      const capturedSk = buildCapturedSk(
        item.mediaId as string,
        item.createdAt as string,
        item.capturedAt as string | undefined
      );
      // 既に正しい値ならスキップ(べき等 + なし枠の '~' 再キー化にも対応)。
      if (item.capturedSk === capturedSk) {
        skipped++;
        continue;
      }
      if (DRY_RUN) {
        console.log(
          `[dry] ${item.mediaId} ${item.capturedSk ?? "(none)"} -> ${capturedSk}`
        );
        updated++;
        continue;
      }
      await ddb.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { userId: item.userId, sk: item.sk },
          UpdateExpression: "SET capturedSk = :cs",
          ExpressionAttributeValues: { ":cs": capturedSk },
        })
      );
      updated++;
    }
    lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  console.log(
    `[migrate] done. scanned=${scanned} updated=${updated} skipped=${skipped}`
  );
}

main().catch((e) => {
  console.error("[migrate] failed:", e);
  process.exit(1);
});
