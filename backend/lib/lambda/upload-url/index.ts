import { APIGatewayProxyEvent } from "aws-lambda";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import { success, error, getUserId, MediaItem, buildCapturedSk } from "../shared/types";
import { s3, ddb } from "../shared/clients";

const TABLE_NAME = process.env.MEDIA_TABLE_NAME!;
const BUCKET_NAME = process.env.MEDIA_BUCKET_NAME!;

export async function handler(event: APIGatewayProxyEvent) {
  const userId = getUserId(event);
  if (!userId) return error(401, "Unauthorized");

  const body = JSON.parse(event.body || "{}");
  const { fileName, mimeType, fileSize, capturedAt } = body;

  if (!fileName || !mimeType) {
    return error(400, "fileName and mimeType are required");
  }

  const mediaId = randomUUID();
  const now = new Date().toISOString();
  const datePath = now.slice(0, 10).replace(/-/g, "/"); // YYYY/MM/DD
  const ext = fileName.includes(".") ? fileName.split(".").pop() : "";
  const s3Key = `${userId}/${datePath}/${mediaId}.${ext}`;

  // Generate presigned URL for upload
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    ContentType: mimeType,
  });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

  // Save metadata as pending
  const item: MediaItem = {
    userId,
    sk: `${now}#${mediaId}`,
    mediaId,
    s3Key,
    fileName,
    mimeType,
    fileSize: fileSize || 0,
    status: "pending",
    tags: [],
    albumIds: [],
    createdAt: now,
    ...(capturedAt && { capturedAt }),
    capturedSk: buildCapturedSk(mediaId, now, capturedAt),
  };

  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));

  return success({ uploadUrl, mediaId, s3Key });
}
