import 'dart:io';
import 'package:http/http.dart' as http;
import 'api_service.dart';
import '../models/media_item.dart';
import '../utils/exif_helper.dart';
import '../utils/mime_helper.dart';

class UploadService {
  final ApiService _apiService;

  UploadService({required ApiService apiService}) : _apiService = apiService;

  /// ファイルをS3にアップロード
  /// 1. Presigned URL取得
  /// 2. S3へストリームでPUT（メモリに全体を読み込まない）
  /// 3. アップロード完了通知
  Future<MediaItem> uploadFile({
    required File file,
    required String fileName,
    required String mimeType,
    void Function(double progress)? onProgress,
  }) async {
    final fileSize = await file.length();

    // EXIF から撮影日時を取得 (画像のみ)
    String? capturedAt;
    if (MimeHelper.isImageExtension(fileName) ||
        mimeType.startsWith('image/')) {
      capturedAt = await ExifHelper.readCapturedAt(file);
    }

    // 1. Get presigned URL
    final urlData = await _apiService.getUploadUrl(
      fileName: fileName,
      mimeType: mimeType,
      fileSize: fileSize,
      capturedAt: capturedAt,
    );

    final uploadUrl = urlData['uploadUrl'] as String;
    final mediaId = urlData['mediaId'] as String;

    // 2. Stream upload to S3 (avoids loading entire file into memory)
    final request = http.StreamedRequest('PUT', Uri.parse(uploadUrl));
    request.headers['Content-Type'] = mimeType;
    request.contentLength = fileSize;

    int sent = 0;
    file.openRead().listen(
      (chunk) {
        request.sink.add(chunk);
        sent += chunk.length;
        onProgress?.call(sent / fileSize);
      },
      onDone: () => request.sink.close(),
      onError: (e) {
        request.sink.addError(e);
        request.sink.close();
      },
      cancelOnError: true,
    );

    final streamedResponse = await request.send();
    if (streamedResponse.statusCode != 200) {
      throw Exception(
          'S3 upload failed with status ${streamedResponse.statusCode}');
    }

    // 3. Notify backend upload complete
    final media = await _apiService.completeUpload(mediaId);
    return media;
  }
}
