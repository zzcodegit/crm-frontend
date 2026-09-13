import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, ApiHttpError } from "../api";
import { scheduleMobileClientPing } from "../utils/mobileClientPing";
import { AUTH_USER_CACHE_KEY, recordAuthError } from "../utils/authDiagnostics";

const AUTH_LOAD_TIMEOUT_MS = 15000;

type User = {
  id: number;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  is_admin: boolean;
  is_manager?: boolean;
  is_consultant?: boolean;
  is_reportnik?: boolean;
  role?: string;
  group_ids?: number[];
  chat_notifications_enabled?: boolean;
  avatar_url?: string | null;
  chat_wallpaper_id?: number | null;
  chat_wallpaper_url?: string | null;
  /** Логин администратора, если сессия выдана через «войти под пользователем» */
  impersonator_username?: string | null;
};

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
  authError: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  stopImpersonation: () => Promise<void>;
  clearAuthError: () => void;
} | null>(null);

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        window.clearTimeout(timer);
        reject(err);
      });
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setUser(null);
      setAuthError(null);
      setLoading(false);
      scheduleMobileClientPing();
      return;
    }
    try {
      const me = await withTimeout(
        api.getMe(),
        AUTH_LOAD_TIMEOUT_MS,
        "Сервер не отвечает при проверке сессии",
      );
      setUser(me);
      writeCachedUser(me);
      setAuthError(null);
    } catch (err) {
      if (err instanceof ApiHttpError && err.status === 401) {
        localStorage.removeItem("token");
        writeCachedUser(null);
        setUser(null);
        setAuthError(null);
      } else {
        const message =
          err instanceof Error ? err.message : "Не удалось проверить сессию. Откройте /status для диагностики.";
        recordAuthError(message, "loadUser");
        setAuthError(message);
        setUser(null);
      }
    } finally {
      setLoading(false);
      scheduleMobileClientPing();
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
      scheduleMobileClientPing();
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
    scheduleMobileClientPing();
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    writeCachedUser(null);
    setUser(null);
    setAuthError(null);
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const stopImpersonation = useCallback(async () => {
    const { access_token } = await api.stopImpersonation();
    localStorage.setItem("token", access_token);
    const me = await api.getMe();
    setUser(me);
    writeCachedUser(me);
    scheduleMobileClientPing();
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, authError, login, logout, refreshUser, stopImpersonation, clearAuthError }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
