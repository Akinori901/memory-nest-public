import { APIGatewayProxyEvent } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { success, error, getUserId } from "../shared/types";
import { ddb } from "../shared/clients";

const TABLE_NAME = process.env.MEDIA_TABLE_NAME!;
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN!;

// 撮影日ソート用GSI。SK = capturedSk = `${capturedAt ?? createdAt}#${mediaId}`
// USE_CAPTURED_INDEX=1 の間だけこの GSI を使う(段階移行のためのフラグ)。
// 既存データへの capturedSk 後付けが済むまでは旧ロジック(テーブル直Query)を使い、
// 移行完了後にフラグを有効化する。
const CAPTURED_INDEX = "MediaByCapturedAtIndex";
const USE_CAPTURED_INDEX = process.env.USE_CAPTURED_INDEX === "1";

export async function handler(event: APIGatewayProxyEvent) {
  const userId = getUserId(event);
  if (!userId) return error(401, "Unauthorized");

  const limit = parseInt(event.queryStringParameters?.limit || "20", 10);
  const cursor = event.queryStringParameters?.cursor;
  const tagFilter = event.queryStringParameters?.tag;
  const albumFilter = event.queryStringParameters?.album;
  const mediaType = event.queryStringParameters?.mediaType; // "photo" | "video"
  const dateFrom = event.queryStringParameters?.dateFrom; // ISO 8601
  const dateTo = event.queryStringParameters?.dateTo; // ISO 8601
  const order = event.queryStringParameters?.order === "asc" ? "asc" : "desc";
  const unassigned = event.queryStringParameters?.unassigned === "true";
  // 撮影日の有無で分離する枠(撮影日ソートGSI使用時のみ有効):
  //  - "dated"(既定): 撮影日ありのみ(capturedSk < '~')
  //  - "undated"     : 撮影日なしのみ(capturedSk begins_with '~')
  //  - "all"         : 分離しない(全件、なし枠が降順先頭に来る=カレンダー用)
  const bucket = event.queryStringParameters?.bucket ?? "all";

  const exclusiveStartKey = cursor
    ? JSON.parse(Buffer.from(cursor, "base64").toString())
    : undefined;

  // フィルタ(status=active + タグ/アルバム/種類/未分類)
  const filterParts = ["#status = :active"];
  const attrNames: Record<string, string> = { "#status": "status" };
  const attrValues: Record<string, unknown> = {
    ":userId": userId,
    ":active": "active",
  };

  if (tagFilter) {
    filterParts.push("contains(tags, :tagFilter)");
    attrValues[":tagFilter"] = tagFilter;
  }
  if (albumFilter) {
    filterParts.push("contains(albumIds, :albumFilter)");
    attrValues[":albumFilter"] = albumFilter;
  }
  if (unassigned) {
    filterParts.push(
      "(attribute_not_exists(albumIds) OR size(albumIds) = :zero)"
    );
    attrValues[":zero"] = 0;
  }
  if (mediaType === "photo") {
    filterParts.push("begins_with(mimeType, :mimePrefix)");
    attrValues[":mimePrefix"] = "image/";
  } else if (mediaType === "video") {
    filterParts.push("begins_with(mimeType, :mimePrefix)");
    attrValues[":mimePrefix"] = "video/";
  }

  // 移行完了後は撮影日GSI、それまでは旧ロジック(テーブルの sk=createdAt 直Query)。
  const sortKeyName = USE_CAPTURED_INDEX ? "capturedSk" : "sk";
  let keyCondition = "userId = :userId";
  if (dateFrom && dateTo) {
    keyCondition = `userId = :userId AND ${sortKeyName} BETWEEN :skFrom AND :skTo`;
    attrValues[":skFrom"] = dateFrom;
    attrValues[":skTo"] = `${dateTo}￿`;
  } else if (USE_CAPTURED_INDEX && bucket === "dated") {
    // 撮影日ありのみ: capturedSk が '~'(なし枠接頭辞)より前
    keyCondition = "userId = :userId AND capturedSk < :noDate";
    attrValues[":noDate"] = "~";
  } else if (USE_CAPTURED_INDEX && bucket === "undated") {
    // 撮影日なしのみ: capturedSk が '~' で始まる
    keyCondition = "userId = :userId AND begins_with(capturedSk, :noDate)";
    attrValues[":noDate"] = "~";
  }

  const collected: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined = exclusiveStartKey;
  const MAX_LOOPS = 20;
  const PER_PAGE = 100;

  for (let i = 0; i < MAX_LOOPS && collected.length < limit; i++) {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        ...(USE_CAPTURED_INDEX && { IndexName: CAPTURED_INDEX }),
        KeyConditionExpression: keyCondition,
        FilterExpression: filterParts.join(" AND "),
        ExpressionAttributeNames: attrNames,
        ExpressionAttributeValues: attrValues,
        // desc = 新しい順 → ScanIndexForward:false
        ScanIndexForward: order === "asc",
        Limit: PER_PAGE,
        ...(lastKey && { ExclusiveStartKey: lastKey }),
      })
    );

    if (result.Items) collected.push(...result.Items);

    if (!result.LastEvaluatedKey) {
      lastKey = undefined;
      break;
    }
    lastKey = result.LastEvaluatedKey;
  }

  const items = collected.slice(0, limit).map((item) => ({
    ...item,
    viewUrl: `https://${CLOUDFRONT_DOMAIN}/${item.s3Key}`,
    ...(item.thumbnailKey
      ? { thumbnailUrl: `https://${CLOUDFRONT_DOMAIN}/${item.thumbnailKey}` }
      : {}),
    ...(item.mp4Key
      ? { mp4Url: `https://${CLOUDFRONT_DOMAIN}/${item.mp4Key}` }
      : {}),
  }));

  let nextCursor: string | null = null;
  if (collected.length > limit) {
    const lastReturned = collected[limit - 1];
    const key: Record<string, unknown> = {
      userId: lastReturned.userId,
      sk: lastReturned.sk,
    };
    if (USE_CAPTURED_INDEX) key.capturedSk = lastReturned.capturedSk;
    nextCursor = Buffer.from(JSON.stringify(key)).toString("base64");
  } else if (lastKey) {
    nextCursor = Buffer.from(JSON.stringify(lastKey)).toString("base64");
  }

  return success({ items, nextCursor });
}
