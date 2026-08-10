/**
 * Cognito 認証操作（Amplify ラッパ）。
 * Flutter アプリと同じく email/password ログイン + email 確認コードによる
 * サインアップフローを提供する。
 */
import {
  signIn as amplifySignIn,
  signUp as amplifySignUp,
  confirmSignUp as amplifyConfirmSignUp,
  resetPassword as amplifyResetPassword,
  confirmResetPassword as amplifyConfirmResetPassword,
  signOut as amplifySignOut,
  fetchAuthSession,
  getCurrentUser,
} from "aws-amplify/auth";

export interface CurrentUser {
  sub: string;
  email: string;
}

export async function signIn(email: string, password: string): Promise<void> {
  await amplifySignIn({ username: email, password });
}

export async function signUp(email: string, password: string): Promise<void> {
  await amplifySignUp({
    username: email,
    password,
    options: { userAttributes: { email } },
  });
}

export async function confirmSignUp(
  email: string,
  code: string
): Promise<void> {
  await amplifyConfirmSignUp({ username: email, confirmationCode: code });
}

/**
 * パスワードリセット開始。登録メールに確認コードを送信する
 * （Cognito の accountRecovery: EMAIL_ONLY）。
 */
export async function requestPasswordReset(email: string): Promise<void> {
  await amplifyResetPassword({ username: email });
}

/**
 * 確認コード + 新パスワードでリセットを確定する。
 */
export async function confirmPasswordReset(
  email: string,
  code: string,
  newPassword: string
): Promise<void> {
  await amplifyConfirmResetPassword({
    username: email,
    confirmationCode: code,
    newPassword,
  });
}

export async function signOut(): Promise<void> {
  await amplifySignOut();
}

/**
 * 現在のセッションからユーザー情報を取得。未ログインなら null。
 */
export async function getCurrentAuthUser(): Promise<CurrentUser | null> {
  try {
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken;
    if (!idToken) return null;
    const { userId } = await getCurrentUser();
    const email =
      (idToken.payload.email as string | undefined) ?? "";
    return { sub: userId, email };
  } catch {
    return null;
  }
}
