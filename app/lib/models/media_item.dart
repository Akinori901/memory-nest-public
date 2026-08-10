import '../utils/mime_helper.dart';

class MediaItem {
  final String mediaId;
  final String userId;
  final String s3Key;
  final String fileName;
  final String mimeType;
  final int fileSize;
  final String status;
  final List<String> tags;
  final List<String> albumIds;
  final String createdAt;
  final String? capturedAt;
  final String? viewUrl;

  MediaItem({
    required this.mediaId,
    required this.userId,
    required this.s3Key,
    required this.fileName,
    required this.mimeType,
    required this.fileSize,
    required this.status,
    this.tags = const [],
    this.albumIds = const [],
    required this.createdAt,
    this.capturedAt,
    this.viewUrl,
  });

  factory MediaItem.fromJson(Map<String, dynamic> json) {
    return MediaItem(
      mediaId: json['mediaId'] as String,
      userId: json['userId'] as String,
      s3Key: json['s3Key'] as String,
      fileName: json['fileName'] as String,
      mimeType: json['mimeType'] as String,
      fileSize: (json['fileSize'] as num).toInt(),
      status: json['status'] as String,
      tags: (json['tags'] as List<dynamic>?)?.cast<String>() ?? [],
      albumIds: (json['albumIds'] as List<dynamic>?)?.cast<String>() ?? [],
      createdAt: json['createdAt'] as String,
      capturedAt: json['capturedAt'] as String?,
      viewUrl: json['viewUrl'] as String?,
    );
  }

  MediaItem copyWith({List<String>? tags, List<String>? albumIds}) {
    return MediaItem(
      mediaId: mediaId,
      userId: userId,
      s3Key: s3Key,
      fileName: fileName,
      mimeType: mimeType,
      fileSize: fileSize,
      status: status,
      tags: tags ?? this.tags,
      albumIds: albumIds ?? this.albumIds,
      createdAt: createdAt,
      capturedAt: capturedAt,
      viewUrl: viewUrl,
    );
  }

  bool get isImage {
    if (mimeType.startsWith('image/')) return true;
    if (_isAmbiguousMime) return MimeHelper.isImageExtension(fileName);
    return false;
  }

  bool get isVideo {
    if (mimeType.startsWith('video/')) return true;
    if (_isAmbiguousMime) return MimeHelper.isVideoExtension(fileName);
    return false;
  }

  bool get _isAmbiguousMime =>
      mimeType.isEmpty || mimeType == 'application/octet-stream';

  DateTime get createdDateTime => DateTime.parse(createdAt);

  /// 表示用日時。撮影日 (capturedAt) があればそれ、なければアップロード日 (createdAt)。
  DateTime get displayDateTime =>
      DateTime.parse(capturedAt ?? createdAt);
}
