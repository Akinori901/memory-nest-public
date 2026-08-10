import 'dart:io';
import 'package:exif/exif.dart';

/// 画像ファイルから EXIF の DateTimeOriginal を取得して ISO 8601 文字列で返す。
/// 取得できなければ null。動画や EXIF 無しの画像では null。
class ExifHelper {
  static Future<String?> readCapturedAt(File file) async {
    try {
      final bytes = await file.readAsBytes();
      final tags = await readExifFromBytes(bytes);

      // 優先順: DateTimeOriginal > DateTimeDigitized > DateTime
      final raw = tags['EXIF DateTimeOriginal']?.printable ??
          tags['EXIF DateTimeDigitized']?.printable ??
          tags['Image DateTime']?.printable;

      if (raw == null || raw.isEmpty) return null;

      // EXIF 形式: "2024:01:15 14:30:22" → ISO 8601 へ変換
      // 日付部分の : を - に置換
      if (raw.length < 19) return null;
      final iso =
          '${raw.substring(0, 4)}-${raw.substring(5, 7)}-${raw.substring(8, 10)}T${raw.substring(11, 19)}';

      // ローカル時刻として扱う (EXIF は通常タイムゾーン情報なし)
      final parsed = DateTime.tryParse(iso);
      if (parsed == null) return null;

      // タイムゾーン情報を付与せず ISO 8601 として返す (Backend はそのまま createdAt として保存)
      return parsed.toIso8601String();
    } catch (_) {
      return null;
    }
  }
}
