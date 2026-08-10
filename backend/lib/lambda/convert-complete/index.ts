import { QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../shared/clients";

const TABLE_NAME = process.env.MEDIA_TABLE_NAME!;

/**
 * MediaConvert のジョブ完了(EventBridge)を受けて、対象メディアに mp4Key を記録。
 * ジョブ投入時に UserMetadata.mediaId を付けているので、それで DynamoDB を引く。
 * mp4Key = converted/{mediaId}.mp4
 */
interface MediaConvertEvent {
  detail?: {
    status?: string;
    userMetadata?: { mediaId?: string; srcKey?: string };
  };
}

export async function handler(event: MediaConvertEvent) {
  const status = event.detail?.status;
  const mediaId = event.detail?.userMetadata?.mediaId;

  if (status !== "COMPLETE" || !mediaId) {
    console.log(
      JSON.stringify({ level: "INFO", msg: "skip", status, mediaId })
    );
    return;
  }

  const mp4Key = `converted/${mediaId}.mp4`;

  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "MediaByIdIndex",
      KeyConditionExpression: "mediaId = :mediaId",
      ExpressionAttributeValues: { ":mediaId": mediaId },
    })
  );
  const item = res.Items?.[0];
  if (!item) {
    console.warn(`[convert-complete] media not found: ${mediaId}`);
    return;
  }

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { userId: item.userId, sk: item.sk },
      UpdateExpression: "SET mp4Key = :k",
      ExpressionAttributeValues: { ":k": mp4Key },
    })
  );

  console.log(
    JSON.stringify({ level: "INFO", msg: "mp4_recorded", mediaId, mp4Key })
  );
}
