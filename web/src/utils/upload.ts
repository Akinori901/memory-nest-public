/**
 * 署名付き URL への直接アップロード + 完了通知。
 *
 * フロー（Flutter アプリの upload_service.dart と同じ）:
 *  1. POST /upload-url で presigned PUT URL を取得
 *  2. その URL に PUT でファイル本体をアップロード（S3 直）
 *  3. POST /upload-complete で status を active に更新
 */
import { completeUpload, getUploadUrl } from "../api/media";
import type { MediaItem } from "../api/types";

export async function uploadFile(
  file: File,
  onProgress?: (ratio: number) => void
): Promise<MediaItem> {
  const capturedAt = file.lastModified
    ? new Date(file.lastModified).toISOString()
    : undefined;

  const { uploadUrl, mediaId } = await getUploadUrl({
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    fileSize: file.size,
    capturedAt,
  });

  await putToS3(uploadUrl, file, onProgress);

  return completeUpload(mediaId);
}

function putToS3(
  url: string,
  file: File,
  onProgress?: (ratio: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream"
    );
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(e.loaded / e.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Upload network error"));
    xhr.send(file);
  });
}
