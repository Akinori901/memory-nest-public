import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createAlbum,
  createTag,
  deleteAlbum,
  deleteMedia,
  deleteTag,
  getAlbums,
  getAllMedia,
  getMedia,
  getMediaDetail,
  getTags,
  updateMediaAlbums,
  updateMediaCapturedAt,
  updateMediaTags,
} from "../api/media";
import type { MediaListParams } from "../api/types";

export function useMediaList(params: MediaListParams = {}) {
  return useInfiniteQuery({
    queryKey: ["media", params],
    queryFn: ({ pageParam }) =>
      getMedia({ ...params, cursor: pageParam ?? undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/**
 * フィルタ条件に合う全メディアを取得する。カレンダー表示・全件並び替え用。
 * enabled で必要な時だけ発火させる(一覧表示中は取得しない)。
 */
export function useAllMedia(
  params: Omit<MediaListParams, "cursor" | "limit"> = {},
  enabled = true
) {
  return useQuery({
    queryKey: ["media", "all", params],
    queryFn: () => getAllMedia(params),
    enabled,
    staleTime: 60_000,
  });
}

export function useMediaDetail(mediaId: string | null) {
  return useQuery({
    queryKey: ["media", "detail", mediaId],
    queryFn: () => getMediaDetail(mediaId!),
    enabled: !!mediaId,
  });
}

export function useTags() {
  return useQuery({ queryKey: ["tags"], queryFn: getTags });
}

export function useAlbums() {
  return useQuery({ queryKey: ["albums"], queryFn: getAlbums });
}

export function useMediaMutations() {
  const qc = useQueryClient();
  const invalidateMedia = () =>
    qc.invalidateQueries({ queryKey: ["media"] });

  return {
    remove: useMutation({
      mutationFn: deleteMedia,
      onSuccess: invalidateMedia,
    }),
    setTags: useMutation({
      mutationFn: ({ mediaId, tags }: { mediaId: string; tags: string[] }) =>
        updateMediaTags(mediaId, tags),
      onSuccess: invalidateMedia,
    }),
    setAlbums: useMutation({
      mutationFn: ({
        mediaId,
        albumIds,
      }: {
        mediaId: string;
        albumIds: string[];
      }) => updateMediaAlbums(mediaId, albumIds),
      onSuccess: invalidateMedia,
    }),
    setCapturedAt: useMutation({
      mutationFn: ({
        mediaId,
        capturedAt,
      }: {
        mediaId: string;
        capturedAt: string | null;
      }) => updateMediaCapturedAt(mediaId, capturedAt),
      onSuccess: invalidateMedia,
    }),
  };
}

export function useTagMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["tags"] });
  return {
    create: useMutation({ mutationFn: createTag, onSuccess: invalidate }),
    remove: useMutation({ mutationFn: deleteTag, onSuccess: invalidate }),
  };
}

export function useAlbumMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["albums"] });
  return {
    create: useMutation({ mutationFn: createAlbum, onSuccess: invalidate }),
    remove: useMutation({ mutationFn: deleteAlbum, onSuccess: invalidate }),
  };
}
