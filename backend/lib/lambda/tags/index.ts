import { APIGatewayProxyEvent } from "aws-lambda";
import { PutCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import { success, error, getUserId, Tag } from "../shared/types";
import { ddb } from "../shared/clients";

const TABLE_NAME = process.env.MEDIA_TABLE_NAME!;

export async function handler(event: APIGatewayProxyEvent) {
  const userId = getUserId(event);
  if (!userId) return error(401, "Unauthorized");

  switch (event.httpMethod) {
    case "GET":
      return handleList(userId);
    case "POST":
      return handleCreate(userId, event);
    case "DELETE":
      return handleDelete(userId, event);
    default:
      return error(405, "Method not allowed");
  }
}

async function handleList(userId: string) {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "userId = :userId AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":userId": userId,
        ":prefix": "TAG#",
      },
    })
  );
  return success({ items: result.Items || [] });
}

async function handleCreate(userId: string, event: APIGatewayProxyEvent) {
  const { tagName, color } = JSON.parse(event.body || "{}");
  if (!tagName) return error(400, "tagName is required");

  const tagId = randomUUID();
  const now = new Date().toISOString();

  const item: Tag = {
    userId,
    sk: `TAG#${tagId}`,
    tagId,
    tagName,
    color: color || "#5B86E5",
    createdAt: now,
  };

  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  return success(item);
}

async function handleDelete(userId: string, event: APIGatewayProxyEvent) {
  const tagId = event.pathParameters?.id;
  if (!tagId) return error(400, "Tag ID is required");

  await ddb.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { userId, sk: `TAG#${tagId}` },
    })
  );
  return success({ success: true });
}
