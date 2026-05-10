import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, ApiHttpError } from "../api";

type User = {
  id: number;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  is_admin: boolean;
  is_manager?: boolean;
  is_consultant?: boolean;
  role?: string;
  group_ids?: number[];
  chat_notifications_enabled?: boolean;
  avatar_url?: string | null;
  /** Логин администратора, если сессия выдана через «войти под пользователем» */
  impersonator_username?: string | null;
};

const AUTH_USER_CACHE_KEY = "auth_user_cache";

function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as User | null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user: User | null): void {
  try {
    if (!user) {
      localStorage.removeItem(AUTH_USER_CACHE_KEY);
      return;
    }
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(user));
  } catch {
    // ignore storage errors
  }
}

const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  stopImpersonation: () => Promise<void>;
} | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api.getMe();
      setUser(me);
      writeCachedUser(me);
    } catch (err) {
      if (err instanceof ApiHttpError && err.status === 401) {
        localStorage.removeItem("token");
        writeCachedUser(null);
        setUser(null);
      } else {
        const cached = readCachedUser();
        if (cached) setUser(cached);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const me = await api.getMe();
      setUser(me);
      writeCachedUser(me);
    } catch (err) {
      if (err instanceof ApiHttpError && err.status === 401) {
        localStorage.removeItem("token");
        writeCachedUser(null);
        setUser(null);
      } else {
        const cached = readCachedUser();
        if (cached) setUser(cached);
      }
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = useCallback(async (username: string, password: string) => {
    const { access_token } = await api.login(username, password);
    localStorage.setItem("token", access_token);
    const me = await api.getMe();
    setUser(me);
    writeCachedUser(me);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    writeCachedUser(null);
    setUser(null);
  }, []);

  const stopImpersonation = useCallback(async () => {
    const { access_token } = await api.stopImpersonation();
    localStorage.setItem("token", access_token);
    const me = await api.getMe();
    setUser(me);
    writeCachedUser(me);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, stopImpersonation }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
