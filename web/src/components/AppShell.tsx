import {
  AppBar,
  Box,
  Button,
  Container,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";
import { Link as RouterLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { signOut } from "../auth/authService";
import { isCognitoConfigured } from "../auth/amplify-config";
import { useAuthStore } from "../stores/authStore";

const NAV = [
  { to: "/", label: "ギャラリー" },
  { to: "/upload", label: "アップロード" },
  { to: "/albums", label: "アルバム" },
  { to: "/tags", label: "タグ" },
];

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);

  const handleSignOut = async () => {
    if (isCognitoConfigured) {
      await signOut().catch(() => {});
    }
    setUser(null);
    navigate("/login", { replace: true });
  };

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <AppBar position="sticky" color="default" elevation={1}>
        <Toolbar>
          <PhotoLibraryIcon sx={{ color: "primary.main", mr: 1 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, mr: 3 }}>
            Memory Nest
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexGrow: 1 }}>
            {NAV.map((n) => (
              <Button
                key={n.to}
                component={RouterLink}
                to={n.to}
                color={location.pathname === n.to ? "primary" : "inherit"}
                variant={location.pathname === n.to ? "outlined" : "text"}
              >
                {n.label}
              </Button>
            ))}
          </Stack>
          <Button color="inherit" onClick={handleSignOut}>
            ログアウト
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
