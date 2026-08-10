/**
 * AWS Amplify Auth (Cognito) 設定。
 *
 * `main.tsx` から副作用 import され `Amplify.configure()` を呼ぶ。
 * 環境変数（VITE_COGNITO_*）が未設定の場合は configure をスキップし、
 * ローカル開発（Cognito 認証なし）で UI 確認できるようにする。
 *
 * Flutter アプリと同じく email/password（SRP）ログインを使うため、
 * Hosted UI OAuth は必須ではない。
 */
import { Amplify } from "aws-amplify";

const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
const userPoolClientId = import.meta.env.VITE_COGNITO_WEB_CLIENT_ID;

export const isCognitoConfigured = Boolean(userPoolId && userPoolClientId);

if (isCognitoConfigured) {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: userPoolId!,
        userPoolClientId: userPoolClientId!,
      },
    },
  });
} else {
  console.info(
    "[amplify-config] VITE_COGNITO_* env vars not set. Cognito auth is disabled (local UI preview mode)."
  );
}
