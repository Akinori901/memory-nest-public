export interface MediaItem {
  userId: string;
  sk: string; // createdAt#mediaId
  mediaId: string;
  s3Key: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: "pending" | "active" | "deleted";
  tags: string[];      // タグID配列
  albumIds: string[];  // アルバムID配列
  createdAt: string;   // アップロード受信日時 (ISO 8601)
  capturedAt?: string; // EXIF 等から取れた撮影日時 (ISO 8601, optional)
  capturedSk?: string; // 撮影日ソート用GSIキー(buildCapturedSk参照)
  thumbnailKey?: string; // サムネイル画像のS3キー(thumbnails/{mediaId}.jpg)
  mp4Key?: string; // 変換済みMP4のS3キー(converted/{mediaId}.mp4)。動画のブラウザ再生用
}

// 撮影日なしアイテムの capturedSk 接頭辞。'~'(0x7E)は数字/英大文字より後ろの
// コードポイントなので、降順(ScanIndexForward:false)で先頭に、昇順で末尾に来る。
// これにより「撮影日なし」を DB のソート上で1つの塊として分離できる。
export const NO_DATE_PREFIX = "~";

/**
 * 撮影日ソート用GSI(MediaByCapturedAtIndex)の SK 値を組み立てる。
 * - 撮影日あり: `${capturedAt}#${mediaId}`
 * - 撮影日なし: `~${createdAt}#${mediaId}`  (なし枠として分離)
 */
export function buildCapturedSk(
  mediaId: string,
  createdAt: string,
  capturedAt?: string
): string {
  return capturedAt
    ? `${capturedAt}#${mediaId}`
    : `${NO_DATE_PREFIX}${createdAt}#${mediaId}`;
}

export interface Tag {
  userId: string;
  sk: string; // TAG#tagId
  tagId: string;
  tagName: string;
  color: string;
  createdAt: string;
}

export interface Album {
  userId: string;
  sk: string; // ALBUM#albumId
  albumId: string;
  albumName: string;
  coverS3Key?: string;
  createdAt: string;
}

export interface ApiResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Content-Type": "application/json",
};

export function success(body: unknown): ApiResponse {
  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

export function error(statusCode: number, message: string): ApiResponse {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: message }),
  };
}

export function getUserId(event: { requestContext?: { authorizer?: Record<string, unknown> | null } }): string | null {
  const claims = (event.requestContext?.authorizer as { claims?: { sub?: string } } | null)?.claims;
  return claims?.sub ?? null;
}
