import { APIGatewayProxyEvent } from "aws-lambda";
import { PutCommand, QueryCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import { success, error, getUserId, Album } from "../shared/types";
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
    case "PUT":
      return handleUpdate(userId, event);
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
        ":prefix": "ALBUM#",
      },
    })
  );
  return success({ items: result.Items || [] });
}

async function handleCreate(userId: string, event: APIGatewayProxyEvent) {
  const { albumName } = JSON.parse(event.body || "{}");
  if (!albumName) return error(400, "albumName is required");

  const albumId = randomUUID();
  const now = new Date().toISOString();

  const item: Album = {
    userId,
    sk: `ALBUM#${albumId}`,
    albumId,
    albumName,
    createdAt: now,
  };

  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  return success(item);
}

async function handleUpdate(userId: string, event: APIGatewayProxyEvent) {
  const albumId = event.pathParameters?.id;
  if (!albumId) return error(400, "Album ID is required");

  const { albumName, coverS3Key } = JSON.parse(event.body || "{}");
  const updates: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  if (albumName) {
    updates.push("#name = :name");
    names["#name"] = "albumName";
    values[":name"] = albumName;
  }
  if (coverS3Key !== undefined) {
    updates.push("coverS3Key = :cover");
    values[":cover"] = coverS3Key;
  }

  if (updates.length === 0) return error(400, "No fields to update");

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { userId, sk: `ALBUM#${albumId}` },
      UpdateExpression: `SET ${updates.join(", ")}`,
      ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
      ExpressionAttributeValues: values,
    })
  );
  return success({ success: true });
}

async function handleDelete(userId: string, event: APIGatewayProxyEvent) {
  const albumId = event.pathParameters?.id;
  if (!albumId) return error(400, "Album ID is required");

  await ddb.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { userId, sk: `ALBUM#${albumId}` },
    })
  );
  return success({ success: true });
}
