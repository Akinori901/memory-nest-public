import { APIGatewayProxyEvent } from "aws-lambda";
import { QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { success, error, getUserId } from "../shared/types";
import { ddb } from "../shared/clients";

const TABLE_NAME = process.env.MEDIA_TABLE_NAME!;

export async function handler(event: APIGatewayProxyEvent) {
  const userId = getUserId(event);
  if (!userId) return error(401, "Unauthorized");

  const mediaId = event.pathParameters?.id;
  if (!mediaId) return error(400, "Media ID is required");

  const { albumIds } = JSON.parse(event.body || "{}");
  if (!Array.isArray(albumIds)) return error(400, "albumIds must be an array");

  // Find media by mediaId
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "MediaByIdIndex",
      KeyConditionExpression: "mediaId = :mediaId",
      ExpressionAttributeValues: { ":mediaId": mediaId },
    })
  );

  const item = result.Items?.[0];
  if (!item || item.userId !== userId) return error(404, "Media not found");

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { userId, sk: item.sk },
      UpdateExpression: "SET albumIds = :albumIds",
      ExpressionAttributeValues: { ":albumIds": albumIds },
    })
  );

  return success({ ...item, albumIds });
}
