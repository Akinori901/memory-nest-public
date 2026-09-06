import { APIGatewayProxyEvent } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { success, error, getUserId } from "../shared/types";
import { ddb } from "../shared/clients";
import { signUrl } from "../shared/cf-signer";

const TABLE_NAME = process.env.MEDIA_TABLE_NAME!;
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN!;

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

  // 一覧（get-media）と同じく CloudFront 経由の署名付き URL を返す。
  // S3 の署名付き URL でも見られるが、CDN を経由しないので
  // キャッシュが効かず、同じ画像でも配信が遅く高くつく。
  const viewUrl = await signUrl(
    `https://${CLOUDFRONT_DOMAIN}/${item.s3Key as string}`
  );

  return success({ media: item, viewUrl });
}
