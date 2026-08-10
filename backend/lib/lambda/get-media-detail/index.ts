import { APIGatewayProxyEvent } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { success, error, getUserId } from "../shared/types";
import { s3, ddb } from "../shared/clients";

const TABLE_NAME = process.env.MEDIA_TABLE_NAME!;
const BUCKET_NAME = process.env.MEDIA_BUCKET_NAME!;

export async function handler(event: APIGatewayProxyEvent) {
  const userId = getUserId(event);
  if (!userId) return error(401, "Unauthorized");

  const mediaId = event.pathParameters?.id;
  if (!mediaId) return error(400, "Media ID is required");

  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "MediaByIdIndex",
      KeyConditionExpression: "mediaId = :mediaId",
      ExpressionAttributeValues: { ":mediaId": mediaId },
    })
  );

  const item = result.Items?.[0];
  if (!item || item.userId !== userId) {
    return error(404, "Media not found");
  }

  const viewUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET_NAME, Key: item.s3Key as string }),
    { expiresIn: 3600 }
  );

  return success({ media: item, viewUrl });
}
