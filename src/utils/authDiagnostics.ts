export const AUTH_LAST_ERROR_KEY = "auth_last_error";
export const AUTH_USER_CACHE_KEY = "auth_user_cache";

export type AuthLastError = {
  at: string;
  message: string;
  source?: string;
};

export function recordAuthError(message: string, source = "auth"): void {
  try {
    const payload: AuthLastError = { at: new Date().toISOString(), message, source };
    sessionStorage.setItem(AUTH_LAST_ERROR_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function readAuthLastError(): AuthLastError | null {
  try {
    const raw = sessionStorage.getItem(AUTH_LAST_ERROR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthLastError;
    if (!parsed?.message) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearAuthLastError(): void {
  try {
    sessionStorage.removeItem(AUTH_LAST_ERROR_KEY);
  } catch {
    // ignore
  }
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 20000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export function formatFetchError(err: unknown): string {
  if (err instanceof DOMException && err.name === "AbortError") {
    return "Превышено время ожидания ответа сервера";
  }
  if (err instanceof TypeError) {
    return "Нет связи с сервером. Проверьте интернет.";
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
