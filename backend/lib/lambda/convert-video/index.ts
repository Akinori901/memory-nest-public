import { S3Event } from "aws-lambda";
import {
  MediaConvertClient,
  CreateJobCommand,
  DescribeEndpointsCommand,
} from "@aws-sdk/client-mediaconvert";

const BUCKET = process.env.MEDIA_BUCKET_NAME!;
const ROLE_ARN = process.env.MEDIACONVERT_ROLE_ARN!;
const REGION = process.env.AWS_REGION;

// ブラウザ再生可能な形式は変換不要
const ALREADY_PLAYABLE = /\.(mp4|webm|ogg|ogv)$/i;
const VIDEO_EXT = /\.(mp4|mov|avi|mts|m2ts|wmv|flv|mkv|webm|3gp|mpg|mpeg|m4v)$/i;

// アカウント固有の MediaConvert エンドポイントは呼び出しコスト削減のため
// コンテナ再利用中はキャッシュする。
let cachedClient: MediaConvertClient | null = null;

async function getClient(): Promise<MediaConvertClient> {
  if (cachedClient) return cachedClient;
  const bootstrap = new MediaConvertClient({ region: REGION });
  const res = await bootstrap.send(new DescribeEndpointsCommand({}));
  const endpoint = res.Endpoints?.[0]?.Url;
  cachedClient = new MediaConvertClient({ region: REGION, endpoint });
  return cachedClient;
}

export async function handler(event: S3Event) {
  const client = await getClient();

  for (const record of event.Records) {
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    // 変換出力やサムネイルは対象外(無限ループ防止)
    if (key.startsWith("converted/") || key.startsWith("thumbnails/")) continue;
    if (!VIDEO_EXT.test(key)) continue;
    if (ALREADY_PLAYABLE.test(key)) continue; // 既に再生可能

    const mediaId = keyToMediaId(key);
    const inputUri = `s3://${BUCKET}/${key}`;
    // Destination の末尾セグメントが出力ファイル名の基底になる。
    // ここを converted/{mediaId} にし、NameModifier を付けなければ
    // 出力は converted/{mediaId}.mp4 になる。
    const outputPrefix = `s3://${BUCKET}/converted/${mediaId}`;

    try {
      await client.send(
        new CreateJobCommand({
          Role: ROLE_ARN,
          // メタで mediaId を持たせ、完了イベント側で紐付ける
          UserMetadata: { mediaId, srcKey: key },
          Settings: {
            Inputs: [
              {
                FileInput: inputUri,
                AudioSelectors: {
                  "Audio Selector 1": { DefaultSelection: "DEFAULT" },
                },
                VideoSelector: {},
                TimecodeSource: "ZEROBASED",
              },
            ],
            OutputGroups: [
              {
                Name: "File Group",
                OutputGroupSettings: {
                  Type: "FILE_GROUP_SETTINGS",
                  FileGroupSettings: { Destination: outputPrefix },
                },
                Outputs: [
                  {
                    // NameModifier は付けない(Destination末尾=mediaId が基底名)
                    ContainerSettings: {
                      Container: "MP4",
                      Mp4Settings: {},
                    },
                    VideoDescription: {
                      CodecSettings: {
                        Codec: "H_264",
                        H264Settings: {
                          RateControlMode: "QVBR",
                          QvbrSettings: { QvbrQualityLevel: 7 },
                          MaxBitrate: 5000000,
                          SceneChangeDetect: "TRANSITION_DETECTION",
                        },
                      },
                    },
                    AudioDescriptions: [
                      {
                        CodecSettings: {
                          Codec: "AAC",
                          AacSettings: {
                            Bitrate: 96000,
                            CodingMode: "CODING_MODE_2_0",
                            SampleRate: 48000,
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        })
      );
      console.log(
        JSON.stringify({ level: "INFO", msg: "convert_job_created", key, mediaId })
      );
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "ERROR",
          msg: "convert_job_failed",
          key,
          error: err instanceof Error ? err.message : String(err),
        })
      );
      // 1件失敗しても他は続行
    }
  }
}

// s3Key は `${userId}/YYYY/MM/DD/${mediaId}.${ext}` なのでファイル名部分が mediaId。
function keyToMediaId(key: string): string {
  const base = key.split("/").pop() || key;
  return base.replace(/\.[^.]+$/, "");
}
