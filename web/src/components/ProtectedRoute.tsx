import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
