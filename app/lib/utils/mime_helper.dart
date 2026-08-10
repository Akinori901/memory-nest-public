/// ファイル拡張子から MIME タイプを判定する共通ヘルパー
class MimeHelper {
  static const Map<String, String> _imageExtensions = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'heic': 'image/heic',
    'heif': 'image/heif',
    'webp': 'image/webp',
    'bmp': 'image/bmp',
  };

  static const Map<String, String> _videoExtensions = {
    'mp4': 'video/mp4',
    'm4v': 'video/mp4',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    'mkv': 'video/x-matroska',
    'webm': 'video/webm',
    'mts': 'video/mp2t',
    'm2ts': 'video/mp2t',
    'ts': 'video/mp2t',
    '3gp': 'video/3gpp',
    'flv': 'video/x-flv',
    'wmv': 'video/x-ms-wmv',
  };

  static String getMimeType(String fileName) {
    final ext = _extensionOf(fileName);
    return _imageExtensions[ext] ??
        _videoExtensions[ext] ??
        'application/octet-stream';
  }

  static bool isImageExtension(String fileName) {
    return _imageExtensions.containsKey(_extensionOf(fileName));
  }

  static bool isVideoExtension(String fileName) {
    return _videoExtensions.containsKey(_extensionOf(fileName));
  }

  static bool isSupportedExtension(String fileName) {
    final ext = _extensionOf(fileName);
    return _imageExtensions.containsKey(ext) ||
        _videoExtensions.containsKey(ext);
  }

  static Set<String> get supportedExtensions => {
        ..._imageExtensions.keys,
        ..._videoExtensions.keys,
      };

  static String _extensionOf(String fileName) {
    if (!fileName.contains('.')) return '';
    return fileName.split('.').last.toLowerCase();
  }
}
