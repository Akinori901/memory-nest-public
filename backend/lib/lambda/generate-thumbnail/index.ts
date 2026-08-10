import { S3Event } from "aws-lambda";
import {
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { execFile } from "child_process";
import { promisify } from "util";
import { createWriteStream } from "fs";
import { unlink, readFile } from "fs/promises";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { s3, ddb } from "../shared/clients";

const execFileAsync = promisify(execFile);

const TABLE_NAME = process.env.MEDIA_TABLE_NAME!;
const BUCKET_NAME = process.env.MEDIA_BUCKET_NAME!;
// Lambda Layer にマウントされる ffmpeg のパス
const FFMPEG = process.env.FFMPEG_PATH || "/opt/bin/ffmpeg";
const THUMB_WIDTH = 512;
// S3の同一イベントに複数通知を付けられないため、動画の変換ジョブ投入は
// この Lambda から convert-video Lambda を非同期Invokeして行う。
const CONVERT_FN_NAME = process.env.CONVERT_FN_NAME;

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i;
const VIDEO_EXT = /\.(mp4|mov|avi|mts|m2ts|wmv|flv|mkv|webm|3gp)$/i;
// 既にブラウザ再生可能な形式は変換不要
const ALREADY_PLAYABLE = /\.(mp4|webm|ogg|ogv)$/i;

const lambdaClient = new LambdaClient({});

/**
 * S3にメディアがアップロードされたら、サムネイル(幅512pxのJPG)を生成して
 * thumbnails/{mediaId}.jpg に保存し、DynamoDB に thumbnailKey を記録する。
 * - 画像: リサイズ
 * - 動画: 冒頭付近の1フレームを抽出してリサイズ
 * ffmpeg は Lambda Layer(/opt/bin/ffmpeg)から使う。
 */
export async function handler(event: S3Event) {
  for (const record of event.Records) {
    const key = decodeURIComponent(
      record.s3.object.key.replace(/\+/g, " ")
    );
    // thumbnails/ 配下は対象外(自分が作った物で無限ループを避ける)
    if (key.startsWith("thumbnails/")) continue;

    const isImage = IMAGE_EXT.test(key);
    const isVideo = VIDEO_EXT.test(key);
    if (!isImage && !isVideo) continue;

    // ブラウザ非対応の動画は MP4 変換ジョブを投入(convert-video を非同期Invoke)
    if (isVideo && !ALREADY_PLAYABLE.test(key) && CONVERT_FN_NAME) {
      try {
        await lambdaClient.send(
          new InvokeCommand({
            FunctionName: CONVERT_FN_NAME,
            InvocationType: "Event",
            Payload: Buffer.from(JSON.stringify({ Records: [record] })),
          })
        );
      } catch (err) {
        console.error(
          JSON.stringify({
            level: "ERROR",
            msg: "convert_invoke_failed",
            key,
            error: err instanceof Error ? err.message : String(err),
          })
        );
      }
    }

    try {
      await processOne(key, isVideo);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "ERROR",
          msg: "thumbnail_failed",
          key,
          error: err instanceof Error ? err.message : String(err),
        })
      );
      // 1件失敗しても他は続行(throwしない)
    }
  }
}

async function processOne(key: string, isVideo: boolean) {
  const outPath = `/tmp/out-${Date.now()}.jpg`;
  const vf = `scale=${THUMB_WIDTH}:-2`;

  // 入力の渡し方:
  //  - 動画: presigned URL を ffmpeg に直接渡す。ffmpeg は HTTP Range で冒頭
  //    だけ読むため、500MB級の動画でも全体DL不要で一瞬(タイムアウト回避)。
  //  - 画像: /tmp にDLして渡す(小さいので問題なし)。
  const LARGE = 200 * 1024 * 1024;
  const obj = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key })
  );
  const size = obj.ContentLength ?? 0;

  let inputArg: string;
  let srcPath: string | undefined;

  if (isVideo && size > LARGE) {
    // 大きい動画のみ presigned URL で冒頭だけ読む(全体DL回避)。
    inputArg = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }),
      { expiresIn: 600 }
    );
  } else {
    // 画像・通常サイズの動画は /tmp にDL。ローカルファイルの方が AVI 等の
    // シーク・インデックス参照が安定する。
    srcPath = `/tmp/src-${sanitize(key)}`;
    await pipeline(obj.Body as Readable, createWriteStream(srcPath));
    inputArg = srcPath;
  }

  if (isVideo) {
    // 動画は形式が多様(古いAVI/MS-MPEG4等)なので段階的にフォールバック。
    // (1) 1秒地点をシークして1フレーム (2) 先頭フレームをエラー許容で抽出
    const attempts: string[][] = [
      ["-y", "-ss", "1", "-i", inputArg, "-frames:v", "1", "-vf", vf, outPath],
      [
        "-y",
        "-err_detect",
        "ignore_err",
        "-i",
        inputArg,
        "-frames:v",
        "1",
        "-vf",
        vf,
        outPath,
      ],
    ];
    let ok = false;
    let lastErr = "";
    for (const a of attempts) {
      try {
        await execFileAsync(FFMPEG, a, { timeout: 240_000 });
        ok = true;
        break;
      } catch (e) {
        lastErr =
          (e as { stderr?: string })?.stderr?.slice(-500) ??
          (e instanceof Error ? e.message : String(e));
      }
    }
    if (!ok) throw new Error(`ffmpeg failed: ${lastErr}`);
  } else {
    await execFileAsync(FFMPEG, ["-y", "-i", inputArg, "-vf", vf, outPath], {
      timeout: 240_000,
    });
  }

  const thumbBody = await readFile(outPath);
  const thumbKey = `thumbnails/${keyToMediaId(key)}.jpg`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: thumbKey,
      Body: thumbBody,
      ContentType: "image/jpeg",
    })
  );

  // DynamoDB の該当アイテムに thumbnailKey を記録
  await recordThumbnailKey(key, thumbKey);

  await Promise.allSettled([
    unlink(outPath),
    ...(srcPath ? [unlink(srcPath)] : []),
  ]);
  console.log(
    JSON.stringify({ level: "INFO", msg: "thumbnail_ok", key, thumbKey })
  );
}

// s3Key は `${userId}/YYYY/MM/DD/${mediaId}.${ext}` なので、ファイル名部分が mediaId。
function keyToMediaId(key: string): string {
  const base = key.split("/").pop() || key;
  return base.replace(/\.[^.]+$/, "");
}

function sanitize(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function recordThumbnailKey(s3Key: string, thumbnailKey: string) {
  const mediaId = keyToMediaId(s3Key);
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "MediaByIdIndex",
      KeyConditionExpression: "mediaId = :mediaId",
      ExpressionAttributeValues: { ":mediaId": mediaId },
    })
  );
  const item = res.Items?.[0];
  if (!item) {
    console.warn(`[thumbnail] media not found for mediaId=${mediaId}`);
    return;
  }
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { userId: item.userId, sk: item.sk },
      UpdateExpression: "SET thumbnailKey = :tk",
      ExpressionAttributeValues: { ":tk": thumbnailKey },
    })
  );
}
