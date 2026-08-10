// バックエンド（backend/lib/lambda/shared/types.ts）と対応する型定義。

export interface MediaItem {
  userId: string;
  sk: string;
  mediaId: string;
  s3Key: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: "pending" | "active" | "deleted";
  tags: string[];
  albumIds: string[];
  createdAt: string;
  capturedAt?: string;
  thumbnailKey?: string;
  mp4Key?: string;
  /** GET /media で付与される CloudFront URL(元ファイル。DL用) */
  viewUrl?: string;
  /** サムネイルの CloudFront URL(あれば一覧はこれを表示) */
  thumbnailUrl?: string;
  /** 変換済みMP4の CloudFront URL(あればブラウザ再生に使う) */
  mp4Url?: string;
}

export interface Tag {
  userId: string;
  sk: string;
  tagId: string;
  tagName: string;
  color: string;
  createdAt: string;
}

export interface Album {
  userId: string;
  sk: string;
  albumId: string;
  albumName: string;
  coverS3Key?: string;
  createdAt: string;
}

export interface MediaListResponse {
  items: MediaItem[];
  nextCursor: string | null;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  mediaId: string;
  s3Key: string;
}

export interface MediaDetailResponse {
  media: MediaItem;
  viewUrl: string;
}

export interface MediaListParams {
  cursor?: string;
  limit?: number;
  tag?: string;
  album?: string;
  unassigned?: boolean;
  mediaType?: "photo" | "video";
  dateFrom?: string;
  dateTo?: string;
  order?: "desc" | "asc"; // 撮影日の並び順(desc=新しい順)
  bucket?: "all" | "dated" | "undated"; // 撮影日の有無で分離(dated=あり/undated=なし)
}
