import apiClient from "./client";
import type {
  Album,
  MediaDetailResponse,
  MediaItem,
  MediaListParams,
  MediaListResponse,
  Tag,
  UploadUrlResponse,
} from "./types";

// === メディア ===

export async function getUploadUrl(input: {
  fileName: string;
  mimeType: string;
  fileSize?: number;
  capturedAt?: string;
}): Promise<UploadUrlResponse> {
  const res = await apiClient.post<UploadUrlResponse>("/upload-url", input);
  return res.data;
}

export async function completeUpload(mediaId: string): Promise<MediaItem> {
  const res = await apiClient.post<MediaItem>("/upload-complete", { mediaId });
  return res.data;
}

export async function getMedia(
  params: MediaListParams = {}
): Promise<MediaListResponse> {
  const query: Record<string, string> = {
    limit: String(params.limit ?? 20),
  };
  if (params.cursor) query.cursor = params.cursor;
  if (params.tag) query.tag = params.tag;
  if (params.album) query.album = params.album;
  if (params.unassigned) query.unassigned = "true";
  if (params.mediaType) query.mediaType = params.mediaType;
  if (params.dateFrom) query.dateFrom = params.dateFrom;
  if (params.dateTo) query.dateTo = params.dateTo;
  if (params.order) query.order = params.order;
  if (params.bucket) query.bucket = params.bucket;

  const res = await apiClient.get<MediaListResponse>("/media", {
    params: query,
  });
  return res.data;
}

/**
 * フィルタ条件に合う全メディアを、ページングを内部で繰り返して一括取得する。
 * カレンダー表示や厳密な並び替えで「全件」が必要な場合に使う。
 * (将来 撮影日GSI を入れたら、この関数の中身を年月Queryに差し替えるだけで済む)
 */
export async function getAllMedia(
  params: Omit<MediaListParams, "cursor" | "limit"> = {}
): Promise<MediaItem[]> {
  const all: MediaItem[] = [];
  let cursor: string | undefined;
  let safety = 0;
  do {
    const page = await getMedia({ ...params, cursor, limit: 200 });
    all.push(...page.items);
    cursor = page.nextCursor ?? undefined;
    safety++;
  } while (cursor && safety < 50);
  return all;
}

export async function getMediaDetail(
  mediaId: string
): Promise<MediaDetailResponse> {
  const res = await apiClient.get<MediaDetailResponse>(`/media/${mediaId}`);
  return res.data;
}

export async function deleteMedia(mediaId: string): Promise<void> {
  await apiClient.delete(`/media/${mediaId}`);
}

export async function updateMediaTags(
  mediaId: string,
  tags: string[]
): Promise<MediaItem> {
  const res = await apiClient.put<MediaItem>(`/media/${mediaId}/tags`, {
    tags,
  });
  return res.data;
}

export async function updateMediaAlbums(
  mediaId: string,
  albumIds: string[]
): Promise<MediaItem> {
  const res = await apiClient.put<MediaItem>(`/media/${mediaId}/album`, {
    albumIds,
  });
  return res.data;
}

/**
 * 撮影日を設定/更新する。null で撮影日をクリア(撮影日なし枠へ)。
 * バックエンドが capturedSk も再計算するので並び順が自動で正しくなる。
 */
export async function updateMediaCapturedAt(
  mediaId: string,
  capturedAt: string | null
): Promise<MediaItem> {
  const res = await apiClient.put<MediaItem>(`/media/${mediaId}/captured-at`, {
    capturedAt,
  });
  return res.data;
}

// === タグ ===

export async function getTags(): Promise<Tag[]> {
  const res = await apiClient.get<{ items: Tag[] }>("/tags");
  return res.data.items;
}

export async function createTag(input: {
  tagName: string;
  color?: string;
}): Promise<Tag> {
  const res = await apiClient.post<Tag>("/tags", input);
  return res.data;
}

export async function deleteTag(tagId: string): Promise<void> {
  await apiClient.delete(`/tags/${tagId}`);
}

// === アルバム ===

export async function getAlbums(): Promise<Album[]> {
  const res = await apiClient.get<{ items: Album[] }>("/albums");
  return res.data.items;
}

export async function createAlbum(input: {
  albumName: string;
}): Promise<Album> {
  const res = await apiClient.post<Album>("/albums", input);
  return res.data;
}

export async function deleteAlbum(albumId: string): Promise<void> {
  await apiClient.delete(`/albums/${albumId}`);
}
