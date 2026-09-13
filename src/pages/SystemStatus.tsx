import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AUTH_USER_CACHE_KEY,
  clearAuthLastError,
  fetchWithTimeout,
  formatFetchError,
  readAuthLastError,
  type AuthLastError,
} from "../utils/authDiagnostics";

type CheckStatus = "pending" | "ok" | "fail";

type CheckResult = {
  label: string;
  status: CheckStatus;
  detail: string;
};

function statusBadge(status: CheckStatus): string {
  if (status === "ok") return "OK";
  if (status === "fail") return "Ошибка";
  return "…";
}

function statusColor(status: CheckStatus): string {
  if (status === "ok") return "var(--success, #16a34a)";
  if (status === "fail") return "var(--error)";
  return "var(--text-tertiary)";
}

export default function SystemStatus() {
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(true);
  const [lastError, setLastError] = useState<AuthLastError | null>(readAuthLastError());
  const [tokenPreview, setTokenPreview] = useState<string>("нет");
  const [cachedUser, setCachedUser] = useState<string>("нет");

  const runChecks = useCallback(async () => {
    setRunning(true);
    const results: CheckResult[] = [];

    const token = localStorage.getItem("token");
    setTokenPreview(token ? `${token.slice(0, 12)}… (${token.length} симв.)` : "нет");

    try {
      const raw = localStorage.getItem(AUTH_USER_CACHE_KEY);
      if (raw) {
        const u = JSON.parse(raw) as { username?: string; id?: number };
        setCachedUser(u?.username ? `${u.username} (id ${u.id ?? "?"})` : raw.slice(0, 80));
      } else {
        setCachedUser("нет");
      }
    } catch {
      setCachedUser("повреждён");
    }

    // 1. API доступен
    try {
      const apiBases =
        window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
          ? ["https://mosoptika-study.ru", ""]
          : [""];
      let apiOk = false;
      let apiDetail = "неизвестная ошибка";
      for (const base of apiBases) {
        try {
          const res = await fetchWithTimeout(`${base}/api/health?_=${Date.now()}`, { cache: "no-store" });
          if (res.ok) {
            const data = (await res.json().catch(() => ({}))) as { ts?: string };
            apiOk = true;
            apiDetail = data.ts ? `сервер отвечает, ${data.ts}` : "сервер отвечает";
            break;
          }
          apiDetail = `HTTP ${res.status}${base ? ` (${base})` : ""}`;
        } catch (err) {
          apiDetail = `${formatFetchError(err)}${base ? ` (${base})` : ""}`;
        }
      }
      results.push({
        label: "API сервера",
        status: apiOk ? "ok" : "fail",
        detail: apiDetail,
      });
    } catch (err) {
      results.push({
        label: "API сервера",
        status: "fail",
        detail: formatFetchError(err),
      });
    }

    // 2. Статика фронта
    try {
      const res = await fetchWithTimeout("/", { cache: "no-store", method: "HEAD" });
      results.push({
        label: "Страница сайта",
        status: res.ok ? "ok" : "fail",
        detail: res.ok ? "главная открывается" : `HTTP ${res.status}`,
      });
    } catch (err) {
      results.push({
        label: "Страница сайта",
        status: "fail",
        detail: formatFetchError(err),
      });
    }

    // 3. Сессия /auth/me
    if (!token) {
      results.push({
        label: "Сессия",
        status: "ok",
        detail: "токен не сохранён — это нормально до входа",
      });
    } else {
      try {
        const res = await fetchWithTimeout("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (res.ok) {
          const me = (await res.json().catch(() => ({}))) as { username?: string };
          results.push({
            label: "Сессия",
            status: "ok",
            detail: me.username ? `вход активен: ${me.username}` : "токен принят",
          });
        } else if (res.status === 401) {
          results.push({
            label: "Сессия",
            status: "fail",
            detail: "токен устарел — войдите заново",
          });
        } else {
          const text = await res.text().catch(() => "");
          results.push({
            label: "Сессия",
            status: "fail",
            detail: `HTTP ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}`,
          });
        }
      } catch (err) {
        results.push({
          label: "Сессия",
          status: "fail",
          detail: formatFetchError(err),
        });
      }
    }

    // 4. Сеть браузера
    results.push({
      label: "Интернет в браузере",
      status: typeof navigator.onLine === "boolean" && navigator.onLine ? "ok" : "fail",
      detail: typeof navigator.onLine === "boolean" && navigator.onLine ? "онлайн" : "офлайн",
    });

    setChecks(results);
    setRunning(false);
  }, []);

  useEffect(() => {
    void runChecks();
  }, [runChecks]);

  function handleClearSession() {
    localStorage.removeItem("token");
    localStorage.removeItem(AUTH_USER_CACHE_KEY);
    clearAuthLastError();
    setLastError(null);
    void runChecks();
  }

  return (
    <div className="min-h-screen p-4 sm:p-8" style={{ backgroundColor: "var(--bg-secondary)" }}>
      <div className="max-w-2xl mx-auto">
        <div
          className="rounded-2xl p-6 sm:p-8"
          style={{
            backgroundColor: "var(--bg-primary)",
            border: "1px solid var(--border)",
          }}
        >
          <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            Диагностика входа
          </h1>
          <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
            Страница доступна без авторизации. Если при входе крутится загрузка — посмотрите результаты
            проверок ниже и пришлите скриншот администратору.
          </p>

          {lastError && (
            <div
              className="mb-5 p-4 rounded-xl text-sm"
              style={{
                backgroundColor: "rgba(222, 53, 11, 0.08)",
                color: "var(--error)",
                border: "1px solid rgba(222, 53, 11, 0.2)",
              }}
            >
              <div className="font-semibold mb-1">Последняя ошибка авторизации</div>
              <div>{lastError.message}</div>
              <div className="mt-1 text-xs opacity-80">
                {new Date(lastError.at).toLocaleString("ru-RU")}
                {lastError.source ? ` • ${lastError.source}` : ""}
              </div>
            </div>
          )}

          <div className="space-y-3 mb-6">
            {checks.map((check) => (
              <div
                key={check.label}
                className="flex items-start justify-between gap-3 p-3 rounded-xl"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
              >
                <div>
                  <div className="font-medium" style={{ color: "var(--text-primary)" }}>
                    {check.label}
                  </div>
                  <div className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    {check.detail}
                  </div>
                </div>
                <span
                  className="text-xs font-semibold px-2 py-1 rounded-full shrink-0"
                  style={{
                    color: statusColor(check.status),
                    backgroundColor:
                      check.status === "ok"
                        ? "rgba(22, 163, 74, 0.1)"
                        : check.status === "fail"
                          ? "rgba(222, 53, 11, 0.1)"
                          : "var(--bg-tertiary, var(--bg-secondary))",
                  }}
                >
                  {statusBadge(check.status)}
                </span>
              </div>
            ))}
            {running && checks.length === 0 && (
              <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Проверяем…
              </div>
            )}
          </div>

          <div
            className="mb-6 p-4 rounded-xl text-sm space-y-1"
            style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
          >
            <div>
              <span style={{ color: "var(--text-tertiary)" }}>Токен: </span>
              <span style={{ color: "var(--text-primary)" }}>{tokenPreview}</span>
            </div>
            <div>
              <span style={{ color: "var(--text-tertiary)" }}>Кэш пользователя: </span>
              <span style={{ color: "var(--text-primary)" }}>{cachedUser}</span>
            </div>
            <div>
              <span style={{ color: "var(--text-tertiary)" }}>Браузер: </span>
              <span style={{ color: "var(--text-primary)" }} className="break-all">
                {navigator.userAgent}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void runChecks()}
              disabled={running}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)" }}
            >
              {running ? "Проверяем…" : "Повторить проверку"}
            </button>
            <button
              type="button"
              onClick={handleClearSession}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
            >
              Сбросить сессию
            </button>
            <Link
              to="/login"
              className="px-4 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
            >
              На страницу входа
            </Link>
          </div>

          <div className="mt-6 pt-4 text-xs" style={{ color: "var(--text-tertiary)", borderTop: "1px solid var(--border)" }}>
            Mosoptika v2.0.2 • если «Сессия» в ошибке — нажмите «Сбросить сессию» и войдите снова.
            Логин обычно в формате «Фамилия Имя».
          </div>
        </div>
      </div>
    </div>
  );
}
