/**
 * 既存メディア全件のサムネイルを生成する。
 * generate-thumbnail Lambda を、各メディアの s3Key を含む合成S3イベントで
 * 非同期Invoke する。thumbnailKey が既にあるものはスキップ(再実行しても安全)。
 *
 * 使い方: AWS_REGION=ap-northeast-1 npx tsx scripts/backfill-thumbnails.ts
 *   FORCE=1 で thumbnailKey 済みも再生成
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const TABLE_NAME = process.env.MEDIA_TABLE_NAME || "memory-nest-media";
const REGION = process.env.AWS_REGION || "ap-northeast-1";
const BUCKET = process.env.MEDIA_BUCKET_NAME!; // 必須(CDK Output の MediaBucketName)
const FN = process.env.THUMBNAIL_FN || "memory-nest-thumbnail";
const FORCE = process.env.FORCE === "1";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const lambda = new LambdaClient({ region: REGION });

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
  console.log(
    `[backfill] table=${TABLE_NAME} bucket=${BUCKET} fn=${FN} force=${FORCE}`
  );

  let scanned = 0;
  let invoked = 0;
  let skipped = 0;
  let lastKey: Record<string, unknown> | undefined;

  do {
    const res = await ddb.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        ...(lastKey && { ExclusiveStartKey: lastKey }),
      })
    );
    for (const item of res.Items ?? []) {
      if (!item.mediaId || !item.s3Key) continue;
      scanned++;
      if (item.thumbnailKey && !FORCE) {
        skipped++;
        continue;
      }
      await lambda.send(
        new InvokeCommand({
          FunctionName: FN,
          InvocationType: "Event", // 非同期
          Payload: Buffer.from(
            JSON.stringify(makeS3Event(item.s3Key as string))
          ),
        })
      );
      invoked++;
      if (invoked % 50 === 0) console.log(`[backfill] invoked=${invoked}...`);
    }
    lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  console.log(
    `[backfill] done. scanned=${scanned} invoked=${invoked} skipped=${skipped}`
  );
}

main().catch((e) => {
  console.error("[backfill] failed:", e);
  process.exit(1);
});
