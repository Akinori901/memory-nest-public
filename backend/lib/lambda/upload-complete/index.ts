import { APIGatewayProxyEvent } from "aws-lambda";
import { QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { success, error, getUserId } from "../shared/types";
import { ddb } from "../shared/clients";

const TABLE_NAME = process.env.MEDIA_TABLE_NAME!;

export async function handler(event: APIGatewayProxyEvent) {
  const userId = getUserId(event);
  if (!userId) return error(401, "Unauthorized");

  const { mediaId } = JSON.parse(event.body || "{}");
  if (!mediaId) return error(400, "mediaId is required");

  // Find the item by mediaId using GSI
  const queryResult = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "MediaByIdIndex",
      KeyConditionExpression: "mediaId = :mediaId",
      ExpressionAttributeValues: { ":mediaId": mediaId },
    })
  );

  const item = queryResult.Items?.[0];
  if (!item || item.userId !== userId) {
    return error(404, "Media not found");
  }

  // Update status to active
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { userId, sk: item.sk },
      UpdateExpression: "SET #status = :status",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": "active" },
    })
  );

  return success({ ...item, status: "active" });
}
