import { create } from "zustand";

interface AuthUser {
  email: string;
  sub: string;
}

interface AuthState {
  user: AuthUser | null;
  /** 起動時のセッション確認が終わったか */
  initialized: boolean;
  setUser: (user: AuthUser | null) => void;
  setInitialized: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  initialized: false,
  setUser: (user) => set({ user }),
  setInitialized: (initialized) => set({ initialized }),
}));
