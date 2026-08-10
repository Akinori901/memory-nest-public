/**
 * 既存の(ブラウザ非対応)動画をMP4変換する。
 * convert-video Lambda を、各動画の s3Key を含む合成S3イベントで非同期Invoke。
 * mp4Key が既にあるものはスキップ(再実行しても安全)。
 *
 * 使い方:
 *   AWS_REGION=ap-northeast-1 MEDIA_BUCKET_NAME=<bucket> npx tsx scripts/backfill-convert.ts
 *   FORCE=1 で mp4Key 済みも再変換
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const TABLE_NAME = process.env.MEDIA_TABLE_NAME || "memory-nest-media";
const REGION = process.env.AWS_REGION || "ap-northeast-1";
const BUCKET = process.env.MEDIA_BUCKET_NAME!;
const FN = process.env.CONVERT_FN || "memory-nest-convert-video";
const FORCE = process.env.FORCE === "1";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const lambda = new LambdaClient({ region: REGION });

const ALREADY_PLAYABLE = /\.(mp4|webm|ogg|ogv)$/i;

function makeS3Event(key: string) {
  return {
    Records: [
      {
        s3: {
          bucket: { name: BUCKET },
          object: { key: encodeURIComponent(key).replace(/%2F/g, "/") },
        },
      },
    ],
  };
}

async function main() {
  if (!BUCKET) {
    console.error("MEDIA_BUCKET_NAME env is required");
    process.exit(1);
  }
  console.log(`[backfill-convert] bucket=${BUCKET} fn=${FN} force=${FORCE}`);

  let scanned = 0;
  let invoked = 0;
  let skipped = 0;
  let lastKey: Record<string, unknown> | undefined;

  do {
    const res = await ddb.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: "begins_with(mimeType, :v)",
        ExpressionAttributeValues: { ":v": "video/" },
        ...(lastKey && { ExclusiveStartKey: lastKey }),
      })
    );
    for (const item of res.Items ?? []) {
      if (!item.s3Key) continue;
      scanned++;
      const key = item.s3Key as string;
      if (ALREADY_PLAYABLE.test(key)) {
        skipped++;
        continue;
      }
      if (item.mp4Key && !FORCE) {
        skipped++;
        continue;
      }
      await lambda.send(
        new InvokeCommand({
          FunctionName: FN,
          InvocationType: "Event",
          Payload: Buffer.from(JSON.stringify(makeS3Event(key))),
        })
      );
      invoked++;
      if (invoked % 25 === 0) console.log(`[backfill-convert] invoked=${invoked}...`);
    }
    lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  console.log(
    `[backfill-convert] done. scanned=${scanned} invoked=${invoked} skipped=${skipped}`
  );
}

main().catch((e) => {
  console.error("[backfill-convert] failed:", e);
  process.exit(1);
});
