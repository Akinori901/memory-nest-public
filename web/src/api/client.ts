/**
 * バックエンド API への axios クライアント。
 *
 * 認証は Cognito (Amplify) を使用。`fetchAuthSession()` から id token を取得し
 * Authorization ヘッダに付与する。API Gateway の Cognito Authorizer は
 * claims.sub を userId として使うため、id token を送る。
 *
 * baseURL:
 * - VITE_API_BASE_URL があればそれ（本番: API Gateway URL）
 * - なければ "/api"（ローカル: vite プロキシ → localhost:9292）
 */
import axios, { type InternalAxiosRequestConfig } from "axios";
import { fetchAuthSession, signOut } from "aws-amplify/auth";
import { isCognitoConfigured } from "../auth/amplify-config";

const baseURL = import.meta.env.VITE_API_BASE_URL || "/api";

const apiClient = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
});

async function getAuthToken(): Promise<string | null> {
  if (!isCognitoConfigured) return null;
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  }
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status !== 401) {
      return Promise.reject(error);
    }
    const token = await getAuthToken();
    if (!token) {
      return Promise.reject(error);
    }
    // session があるのに 401 = refresh も失敗 → signOut して /login へ
    try {
      await signOut();
    } catch {
      /* noop */
    }
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default apiClient;
