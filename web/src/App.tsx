import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { getCurrentAuthUser } from "./auth/authService";
import { isCognitoConfigured } from "./auth/amplify-config";
import { useAuthStore } from "./stores/authStore";
import { AppShell } from "./components/AppShell";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { GalleryPage } from "./pages/GalleryPage";
import { UploadPage } from "./pages/UploadPage";
import { AlbumsPage } from "./pages/AlbumsPage";
import { TagsPage } from "./pages/TagsPage";

export default function App() {
  const { initialized, setUser, setInitialized } = useAuthStore();

  useEffect(() => {
    // Cognito 未設定（ローカル UI プレビュー）なら擬似ログイン扱いにする。
    if (!isCognitoConfigured) {
      setUser({ email: "local@example.com", sub: "local-test-user" });
      setInitialized(true);
      return;
    }
    getCurrentAuthUser().then((user) => {
      setUser(user);
      setInitialized(true);
    });
  }, [setUser, setInitialized]);

  if (!initialized) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<GalleryPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/albums" element={<AlbumsPage />} />
        <Route path="/tags" element={<TagsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
