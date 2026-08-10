import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import '../models/media_item.dart';
import '../models/tag.dart';
import '../models/album.dart';

class ApiService {
  final String Function() _getToken;

  ApiService({required String Function() getToken}) : _getToken = getToken;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': _getToken(),
      };

  /// 署名付きアップロードURL取得
  Future<Map<String, dynamic>> getUploadUrl({
    required String fileName,
    required String mimeType,
    int? fileSize,
    String? capturedAt,
  }) async {
    final response = await http.post(
      Uri.parse('${AppConfig.apiBaseUrl}/upload-url'),
      headers: _headers,
      body: jsonEncode({
        'fileName': fileName,
        'mimeType': mimeType,
        if (fileSize != null) 'fileSize': fileSize,
        if (capturedAt != null) 'capturedAt': capturedAt,
      }),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to get upload URL: ${response.body}');
    }

    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  /// アップロード完了通知
  Future<MediaItem> completeUpload(String mediaId) async {
    final response = await http.post(
      Uri.parse('${AppConfig.apiBaseUrl}/upload-complete'),
      headers: _headers,
      body: jsonEncode({'mediaId': mediaId}),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to complete upload: ${response.body}');
    }

    return MediaItem.fromJson(jsonDecode(response.body));
  }

  /// メディア一覧取得
  Future<({List<MediaItem> items, String? nextCursor})> getMedia({
    String? cursor,
    int limit = AppConfig.mediaPageSize,
    String? tag,
    String? album,
    bool unassigned = false,
    String? mediaType, // "photo" or "video"
    String? dateFrom, // ISO 8601
    String? dateTo, // ISO 8601
  }) async {
    final queryParams = <String, String>{
      'limit': limit.toString(),
      if (cursor != null) 'cursor': cursor,
      if (tag != null) 'tag': tag,
      if (album != null) 'album': album,
      if (unassigned) 'unassigned': 'true',
      if (mediaType != null) 'mediaType': mediaType,
      if (dateFrom != null) 'dateFrom': dateFrom,
      if (dateTo != null) 'dateTo': dateTo,
    };

    final uri = Uri.parse('${AppConfig.apiBaseUrl}/media')
        .replace(queryParameters: queryParams);

    final response = await http.get(uri, headers: _headers);

    if (response.statusCode != 200) {
      throw Exception('Failed to get media: ${response.body}');
    }

    final data = jsonDecode(response.body);
    final items = (data['items'] as List)
        .map((item) => MediaItem.fromJson(item))
        .toList();

    return (items: items, nextCursor: data['nextCursor'] as String?);
  }

  /// アルバム指定で全件取得 (重複チェック用、ページネーションを内部で繰り返す)。
  /// album が null の場合は全メディアを取得する。
  Future<List<MediaItem>> getAllMedia({String? album}) async {
    final all = <MediaItem>[];
    String? cursor;
    int safety = 0;
    do {
      final result = await getMedia(cursor: cursor, limit: 200, album: album);
      all.addAll(result.items);
      cursor = result.nextCursor;
      safety++;
    } while (cursor != null && safety < 30);
    return all;
  }

  /// メディア詳細取得
  Future<({MediaItem media, String viewUrl})> getMediaDetail(
      String mediaId) async {
    final response = await http.get(
      Uri.parse('${AppConfig.apiBaseUrl}/media/$mediaId'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to get media detail: ${response.body}');
    }

    final data = jsonDecode(response.body);
    return (
      media: MediaItem.fromJson(data['media']),
      viewUrl: data['viewUrl'] as String,
    );
  }

  /// メディア削除
  Future<void> deleteMedia(String mediaId) async {
    final response = await http.delete(
      Uri.parse('${AppConfig.apiBaseUrl}/media/$mediaId'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to delete media: ${response.body}');
    }
  }

  // === タグ API ===

  Future<List<Tag>> getTags() async {
    final response = await http.get(
      Uri.parse('${AppConfig.apiBaseUrl}/tags'),
      headers: _headers,
    );
    if (response.statusCode != 200) throw Exception('Failed to get tags');
    final data = jsonDecode(response.body);
    return (data['items'] as List).map((e) => Tag.fromJson(e)).toList();
  }

  Future<Tag> createTag({required String tagName, String? color}) async {
    final response = await http.post(
      Uri.parse('${AppConfig.apiBaseUrl}/tags'),
      headers: _headers,
      body: jsonEncode({
        'tagName': tagName,
        if (color != null) 'color': color,
      }),
    );
    if (response.statusCode != 200) throw Exception('Failed to create tag');
    return Tag.fromJson(jsonDecode(response.body));
  }

  Future<void> deleteTag(String tagId) async {
    final response = await http.delete(
      Uri.parse('${AppConfig.apiBaseUrl}/tags/$tagId'),
      headers: _headers,
    );
    if (response.statusCode != 200) throw Exception('Failed to delete tag');
  }

  // === アルバム API ===

  Future<List<Album>> getAlbums() async {
    final response = await http.get(
      Uri.parse('${AppConfig.apiBaseUrl}/albums'),
      headers: _headers,
    );
    if (response.statusCode != 200) throw Exception('Failed to get albums');
    final data = jsonDecode(response.body);
    return (data['items'] as List).map((e) => Album.fromJson(e)).toList();
  }

  Future<Album> createAlbum({required String albumName}) async {
    final response = await http.post(
      Uri.parse('${AppConfig.apiBaseUrl}/albums'),
      headers: _headers,
      body: jsonEncode({'albumName': albumName}),
    );
    if (response.statusCode != 200) throw Exception('Failed to create album');
    return Album.fromJson(jsonDecode(response.body));
  }

  Future<void> deleteAlbum(String albumId) async {
    final response = await http.delete(
      Uri.parse('${AppConfig.apiBaseUrl}/albums/$albumId'),
      headers: _headers,
    );
    if (response.statusCode != 200) throw Exception('Failed to delete album');
  }

  // === メディアのタグ・アルバム更新 ===

  Future<MediaItem> updateMediaTags(String mediaId, List<String> tags) async {
    final response = await http.put(
      Uri.parse('${AppConfig.apiBaseUrl}/media/$mediaId/tags'),
      headers: _headers,
      body: jsonEncode({'tags': tags}),
    );
    if (response.statusCode != 200) throw Exception('Failed to update tags');
    return MediaItem.fromJson(jsonDecode(response.body));
  }

  Future<MediaItem> updateMediaAlbums(String mediaId, List<String> albumIds) async {
    final response = await http.put(
      Uri.parse('${AppConfig.apiBaseUrl}/media/$mediaId/album'),
      headers: _headers,
      body: jsonEncode({'albumIds': albumIds}),
    );
    if (response.statusCode != 200) throw Exception('Failed to update albums');
    return MediaItem.fromJson(jsonDecode(response.body));
  }
}
