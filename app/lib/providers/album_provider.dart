import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/album.dart';
import '../services/api_service.dart';
import 'media_provider.dart';

class AlbumState {
  final List<Album> albums;
  final bool isLoading;

  const AlbumState({this.albums = const [], this.isLoading = false});

  AlbumState copyWith({List<Album>? albums, bool? isLoading}) {
    return AlbumState(
      albums: albums ?? this.albums,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

class AlbumNotifier extends Notifier<AlbumState> {
  @override
  AlbumState build() => const AlbumState();

  ApiService get _api => ref.read(apiServiceProvider);

  Future<void> loadAlbums() async {
    state = state.copyWith(isLoading: true);
    try {
      final albums = await _api.getAlbums();
      state = state.copyWith(albums: albums, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false);
    }
  }

  Future<void> createAlbum(String albumName) async {
    final album = await _api.createAlbum(albumName: albumName);
    state = state.copyWith(albums: [...state.albums, album]);
  }

  Future<void> deleteAlbum(String albumId) async {
    await _api.deleteAlbum(albumId);
    state = state.copyWith(
      albums: state.albums.where((a) => a.albumId != albumId).toList(),
    );
  }

  Album? getAlbumById(String albumId) {
    try {
      return state.albums.firstWhere((a) => a.albumId == albumId);
    } catch (_) {
      return null;
    }
  }
}

final albumProvider =
    NotifierProvider<AlbumNotifier, AlbumState>(AlbumNotifier.new);
