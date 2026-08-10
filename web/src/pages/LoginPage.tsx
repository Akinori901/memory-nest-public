import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Link,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";
import {
  confirmPasswordReset,
  confirmSignUp,
  getCurrentAuthUser,
  requestPasswordReset,
  signIn,
  signUp,
} from "../auth/authService";
import { isCognitoConfigured } from "../auth/amplify-config";
import { useAuthStore } from "../stores/authStore";

// login: 通常ログイン / signup: 新規登録 / confirm: 登録確認コード
// reset: パスワードリセット開始(コード送信) / resetConfirm: コード+新PWで確定
type Mode = "login" | "signup" | "confirm" | "reset" | "resetConfirm";

const TITLES: Record<Mode, string> = {
  login: "ログイン",
  signup: "アカウント作成",
  confirm: "確認して続行",
  reset: "リセットコードを送信",
  resetConfirm: "パスワードを再設定",
};

export function LoginPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setInfo(null);
  };

  const finishLogin = async () => {
    const user = await getCurrentAuthUser();
    setUser(user ?? { email, sub: "unknown" });
    navigate("/", { replace: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (!isCognitoConfigured) {
        // ローカル UI プレビュー: そのまま入れる
        setUser({ email: email || "local@example.com", sub: "local-test-user" });
        navigate("/", { replace: true });
        return;
      }
      if (mode === "login") {
        await signIn(email, password);
        await finishLogin();
      } else if (mode === "signup") {
        await signUp(email, password);
        setMode("confirm");
      } else if (mode === "confirm") {
        await confirmSignUp(email, code);
        await signIn(email, password);
        await finishLogin();
      } else if (mode === "reset") {
        // 登録メールに確認コードを送る
        await requestPasswordReset(email);
        setInfo(`${email} に確認コードを送信しました。`);
        setMode("resetConfirm");
      } else if (mode === "resetConfirm") {
        // コード + 新パスワードで確定 → そのままログイン
        await confirmPasswordReset(email, code, password);
        await signIn(email, password);
        await finishLogin();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const showEmail = mode !== "confirm";
  const showPassword =
    mode === "login" || mode === "signup" || mode === "resetConfirm";
  const showCode = mode === "confirm" || mode === "resetConfirm";

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #5B86E5 0%, #36D1DC 100%)",
        p: 2,
      }}
    >
      <Card sx={{ width: "100%", maxWidth: 420 }}>
        <CardContent sx={{ p: 4 }}>
          <Stack alignItems="center" spacing={1} sx={{ mb: 3 }}>
            <PhotoLibraryIcon sx={{ fontSize: 48, color: "primary.main" }} />
            <Typography variant="h5" fontWeight={700}>
              Memory Nest
            </Typography>
            <Typography variant="body2" color="text.secondary">
              思い出を安全に保存します
            </Typography>
          </Stack>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {info && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {info}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              {mode === "confirm" && (
                <Typography variant="body2">
                  {email} に届いた確認コードを入力してください。
                </Typography>
              )}
              {mode === "reset" && (
                <Typography variant="body2">
                  登録済みのメールアドレスを入力してください。
                  パスワード再設定用の確認コードをお送りします。
                </Typography>
              )}
              {mode === "resetConfirm" && (
                <Typography variant="body2">
                  メールに届いた確認コードと、新しいパスワードを入力してください。
                </Typography>
              )}

              {showEmail && (
                <TextField
                  label="メールアドレス"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  fullWidth
                  required
                />
              )}
              {showCode && (
                <TextField
                  label="確認コード"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  fullWidth
                  required
                />
              )}
              {showPassword && (
                <TextField
                  label={
                    mode === "resetConfirm" ? "新しいパスワード" : "パスワード"
                  }
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  fullWidth
                  required
                  helperText={
                    mode === "signup" || mode === "resetConfirm"
                      ? "8文字以上・大文字・小文字・数字を含む"
                      : undefined
                  }
                />
              )}

              <Button
                type="submit"
                variant="contained"
                size="large"
                fullWidth
                disabled={loading}
              >
                {TITLES[mode]}
              </Button>
            </Stack>
          </form>

          {mode === "login" && (
            <Stack spacing={1} sx={{ mt: 2 }} alignItems="center">
              <Link
                component="button"
                type="button"
                underline="hover"
                onClick={() => switchMode("reset")}
              >
                パスワードをお忘れですか？
              </Link>
              <Button fullWidth onClick={() => switchMode("signup")}>
                アカウントを作成
              </Button>
            </Stack>
          )}

          {mode === "resetConfirm" && (
            <Button
              fullWidth
              sx={{ mt: 1 }}
              onClick={() => switchMode("reset")}
            >
              コードを再送する
            </Button>
          )}

          {mode !== "login" && (
            <Button
              fullWidth
              sx={{ mt: 1 }}
              onClick={() => switchMode("login")}
            >
              ログインに戻る
            </Button>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
