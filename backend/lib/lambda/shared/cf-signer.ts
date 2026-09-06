/**
 * CloudFront 署名付き URL の生成。
 *
 * メディアの配信元 CloudFront は署名を必須にしてある（storage.ts の
 * trustedKeyGroups）。署名の無い URL は 403 になるため、
 * **一覧・詳細ともにここを通して URL を組み立てる**。
 *
 * 署名が無かった頃は「URL を知っていれば他人の写真が見られる」状態だった。
 * URL は UUID で推測しにくいが、推測しにくさは防御ではない。
 */
import { getSignedUrl } from "@aws-sdk/cloudfront-signer";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

const KEY_PAIR_ID = process.env.CF_KEY_PAIR_ID ?? "";
const PRIVATE_KEY_PARAM = process.env.CF_PRIVATE_KEY_PARAM ?? "";

/** 署名の有効期間。短すぎるとページを開いたまま放置したときに切れる。 */
const EXPIRES_SECONDS = 60 * 60 * 6;

const ssm = new SSMClient({});

/**
 * 秘密鍵は実行ごとに取りに行かず、コンテナが生きている間は使い回す。
 *
 * SSM は API 呼び出しに課金とレイテンシがあり、一覧では数十枚分の署名を
 * まとめて作るため、毎回取得すると効かない。
 */
let cachedKey: Promise<string> | null = null;

function loadPrivateKey(): Promise<string> {
  if (!cachedKey) {
    cachedKey = ssm
      .send(
        new GetParameterCommand({
          Name: PRIVATE_KEY_PARAM,
          WithDecryption: true,
        })
      )
      .then((res) => {
        const value = res.Parameter?.Value;
        if (!value) {
          // 取得できないと全画像が 403 になる。原因が分かる形で落とす。
          throw new Error(
            `CloudFront の秘密鍵を取得できません: ${PRIVATE_KEY_PARAM}`
          );
        }
        return value;
      })
      .catch((e) => {
        // 失敗をキャッシュすると、一時障害の後も復旧しなくなる。
        cachedKey = null;
        throw e;
      });
  }
  return cachedKey;
}

/** 署名の設定が揃っているか。未設定なら署名せず素の URL を返す運用にする。 */
export function isSigningConfigured(): boolean {
  return KEY_PAIR_ID !== "" && PRIVATE_KEY_PARAM !== "";
}

/**
 * CloudFront の URL に署名を付ける。
 *
 * 署名が未設定のときは素の URL を返す。ローカル開発や、
 * まだ trustedKeyGroups を有効にしていない環境で動かすため。
 */
export async function signUrl(url: string): Promise<string> {
  if (!isSigningConfigured()) return url;

  const privateKey = await loadPrivateKey();
  return getSignedUrl({
    url,
    keyPairId: KEY_PAIR_ID,
    privateKey,
    dateLessThan: new Date(Date.now() + EXPIRES_SECONDS * 1000).toISOString(),
  });
}
