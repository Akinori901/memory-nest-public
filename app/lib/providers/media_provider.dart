import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/media_item.dart';
import '../services/api_service.dart';
import 'auth_provider.dart';

class MediaState {
  final List<MediaItem> items;
  final bool isLoading;
  final bool hasMore;
  final String? nextCursor;
  final String? errorMessage;
  final String? filterTag;
  final String? filterAlbum;
  final bool filterUnassigned;
  final String? filterMediaType; // "photo" or "video"

  const MediaState({
    this.items = const [],
    this.isLoading = false,
    this.hasMore = true,
    this.nextCursor,
    this.errorMessage,
    this.filterTag,
    this.filterAlbum,
    this.filterUnassigned = false,
    this.filterMediaType,
  });

  MediaState copyWith({
    List<MediaItem>? items,
    bool? isLoading,
    bool? hasMore,
    String? nextCursor,
    String? errorMessage,
    String? filterTag,
    String? filterAlbum,
    bool? filterUnassigned,
    String? filterMediaType,
    bool clearFilters = false,
    bool clearMediaType = false,
  }) {
    return MediaState(
      items: items ?? this.items,
      isLoading: isLoading ?? this.isLoading,
      hasMore: hasMore ?? this.hasMore,
      nextCursor: nextCursor ?? this.nextCursor,
      errorMessage: errorMessage,
      filterTag: clearFilters ? null : (filterTag ?? this.filterTag),
      filterAlbum: clearFilters ? null : (filterAlbum ?? this.filterAlbum),
      filterUnassigned: clearFilters ? false : (filterUnassigned ?? this.filterUnassigned),
      filterMediaType: clearMediaType ? null : (filterMediaType ?? this.filterMediaType),
    );
  }
}

class MediaNotifier extends Notifier<MediaState> {
  @override
  MediaState build() => const MediaState();

  ApiService get _apiService => ref.read(apiServiceProvider);

  Future<void> loadMedia({
    String? tag,
    String? album,
    bool unassigned = false,
    String? mediaType,
  }) async {
    state = state.copyWith(
      isLoading: true,
      errorMessage: null,
      filterTag: tag,
      filterAlbum: album,
      filterUnassigned: unassigned,
      filterMediaType: mediaType,
      clearFilters: tag == null && album == null && !unassigned,
      clearMediaType: mediaType == null,
    );
    try {
      final result = await _apiService.getMedia(
        tag: tag,
        album: album,
        unassigned: unassigned,
        mediaType: mediaType,
      );
      state = state.copyWith(
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.nextCursor != null,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, errorMessage: e.toString());
    }
  }

  Future<void> loadMore() async {
    if (state.isLoading || !state.hasMore) return;

    state = state.copyWith(isLoading: true);
    try {
      final result = await _apiService.getMedia(
        cursor: state.nextCursor,
        tag: state.filterTag,
        album: state.filterAlbum,
        unassigned: state.filterUnassigned,
        mediaType: state.filterMediaType,
      );
      state = state.copyWith(
        items: [...state.items, ...result.items],
        nextCursor: result.nextCursor,
        hasMore: result.nextCursor != null,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, errorMessage: e.toString());
    }
  }

  Future<void> deleteMedia(String mediaId) async {
    try {
      await _apiService.deleteMedia(mediaId);
      state = state.copyWith(
        items: state.items.where((item) => item.mediaId != mediaId).toList(),
      );
    } catch (e) {
      state = state.copyWith(errorMessage: e.toString());
    }
  }

  Future<void> updateMediaTags(String mediaId, List<String> tags) async {
    final updated = await _apiService.updateMediaTags(mediaId, tags);
    state = state.copyWith(
      items: state.items.map((item) {
        return item.mediaId == mediaId ? item.copyWith(tags: updated.tags) : item;
      }).toList(),
    );
  }

  Future<void> updateMediaAlbums(String mediaId, List<String> albumIds) async {
    final updated = await _apiService.updateMediaAlbums(mediaId, albumIds);
    state = state.copyWith(
      items: state.items.map((item) {
        return item.mediaId == mediaId ? item.copyWith(albumIds: updated.albumIds) : item;
      }).toList(),
    );
  }

  /// 複数メディアのアルバムを上書きする（既存所属は破棄）
  Future<void> bulkSetAlbums(List<String> mediaIds, List<String> newAlbumIds) async {
    for (final mediaId in mediaIds) {
      try {
        final updated = await _apiService.updateMediaAlbums(mediaId, newAlbumIds);
        state = state.copyWith(
          items: state.items.map((i) {
            return i.mediaId == mediaId ? i.copyWith(albumIds: updated.albumIds) : i;
          }).toList(),
        );
      } catch (e) {
        // Continue with remaining items on error
      }
    }
  }

  Future<void> bulkUpdateAlbums(List<String> mediaIds, List<String> albumIdsToAdd) async {
    for (final mediaId in mediaIds) {
      final item = state.items.firstWhere((i) => i.mediaId == mediaId);
      final mergedAlbumIds = {...item.albumIds, ...albumIdsToAdd}.toList();
      try {
        final updated = await _apiService.updateMediaAlbums(mediaId, mergedAlbumIds);
        state = state.copyWith(
          items: state.items.map((i) {
            return i.mediaId == mediaId ? i.copyWith(albumIds: updated.albumIds) : i;
          }).toList(),
        );
      } catch (e) {
        // Continue with remaining items on error
      }
    }
  }

  void addItem(MediaItem item) {
    state = state.copyWith(items: [item, ...state.items]);
  }
}

final apiServiceProvider = Provider<ApiService>((ref) {
  final authNotifier = ref.watch(authProvider.notifier);
  return ApiService(getToken: () => authNotifier.accessToken ?? '');
});

final mediaProvider =
    NotifierProvider<MediaNotifier, MediaState>(MediaNotifier.new);
