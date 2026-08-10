import { APIGatewayProxyEvent } from "aws-lambda";
import { QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { success, error, getUserId, buildCapturedSk } from "../shared/types";
import { ddb } from "../shared/clients";

const TABLE_NAME = process.env.MEDIA_TABLE_NAME!;

/**
 * 撮影日(capturedAt)を設定/更新する。撮影日ソートGSIの capturedSk も再計算して
 * 更新するため、並び順(なし枠→撮影日順)が自動で正しくなる。
 * body: { capturedAt: string(ISO) | null }  null で撮影日をクリア(なし枠へ)
 */
export async function handler(event: APIGatewayProxyEvent) {
  const userId = getUserId(event);
  if (!userId) return error(401, "Unauthorized");

  const mediaId = event.pathParameters?.id;
  if (!mediaId) return error(400, "Media ID is required");

  const body = JSON.parse(event.body || "{}");
  const capturedAt: string | null | undefined = body.capturedAt;

  // 日付フォーマットの軽いバリデーション(null はクリアとして許可)
  if (capturedAt !== null && capturedAt !== undefined) {
    const t = Date.parse(capturedAt);
    if (Number.isNaN(t)) return error(400, "capturedAt must be a valid date");
  }

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

  const newCapturedAt = capturedAt || undefined; // "" や null は undefined 扱い
  const capturedSk = buildCapturedSk(
    mediaId,
    item.createdAt as string,
    newCapturedAt
  );

  if (newCapturedAt) {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { userId, sk: item.sk },
        UpdateExpression: "SET capturedAt = :ca, capturedSk = :cs",
        ExpressionAttributeValues: {
          ":ca": newCapturedAt,
          ":cs": capturedSk,
        },
      })
    );
  } else {
    // クリア: capturedAt を削除し、capturedSk は「なし枠」に更新
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { userId, sk: item.sk },
        UpdateExpression: "REMOVE capturedAt SET capturedSk = :cs",
        ExpressionAttributeValues: { ":cs": capturedSk },
      })
    );
  }

  return success({
    ...item,
    capturedAt: newCapturedAt,
    capturedSk,
  });
}
