import { NavLink } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import WorkScheduleBoard from "../components/WorkScheduleBoard";
import { isNativeAppShell } from "../utils/nativeApp";
import { api } from "../api";

/** Главная внутри APK: поставщики, три прайса и одна кнопка полного обновления офлайн-данных. */
const APK_NATIVE_HOME_TABS = [
  { to: "/lens-catalog", label: "Поставщики" },
  { to: "/pricelist", label: "Прайс склад" },
  { to: "/pricelist-rx", label: "RX" },
  { to: "/pricelist-mkl", label: "Прайс МКЛ" },
] as const;

export default function Dashboard() {
  const { user } = useAuth();
  const [apkSyncBusy, setApkSyncBusy] = useState(false);
  const [apkSyncError, setApkSyncError] = useState<string | null>(null);
  const [apkSyncHint, setApkSyncHint] = useState<string | null>(null);

  const runApkFullDataSync = async () => {
    setApkSyncBusy(true);
    setApkSyncError(null);
    setApkSyncHint(null);
    const parts: string[] = [];
    try {
      if (typeof window !== "undefined" && typeof window.__mosoptikaApkSyncOffline === "function") {
        const snap = await window.__mosoptikaApkSyncOffline();
        const msg = snap && typeof snap === "object" && "message" in snap ? String((snap as { message?: string }).message ?? "") : "";
        if (msg) parts.push(msg);
      }
      const result = await api.pricelistOffline.syncAllWithProgress(() => {});
      parts.push(
        `Прайсы в памяти: склад ${result.warehouse.count}, RX ${result.rx.count}, MKL ${result.mkl.count} · загружено ${Math.round(((result.progress.downloadedBytes || 0) / 1024 / 1024) * 10) / 10} МБ`,
      );
      setApkSyncHint(parts.filter(Boolean).join(" · "));
    } catch (err) {
      setApkSyncError(err instanceof Error ? err.message : "Не удалось обновить данные");
    } finally {
      setApkSyncBusy(false);
    }
  };

  if (isNativeAppShell()) {
    return (
      <div className="animate-slide-in min-w-0">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
          Главная
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
          Выберите раздел или обновите данные для работы без сети
        </p>

        <nav className="flex flex-col sm:flex-row flex-wrap gap-3 mb-6" aria-label="Разделы приложения">
          {APK_NATIVE_HOME_TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end
              className={({ isActive }) =>
                `rounded-xl text-sm font-semibold text-center transition-all px-4 py-3.5 min-h-[48px] flex items-center justify-center sm:min-w-[160px] ${
                  isActive ? "shadow-md" : "hover:opacity-95 active:scale-[0.99]"
                }`
              }
              style={({ isActive }) =>
                isActive
                  ? {
                      color: "#ffffff",
                      background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)",
                      border: "1px solid transparent",
                      boxShadow: "0 4px 14px rgba(0, 82, 204, 0.25)",
                    }
                  : {
                      color: "var(--text-primary)",
                      backgroundColor: "var(--bg-primary)",
                      border: "1px solid var(--border)",
                    }
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex flex-col gap-2 max-w-md">
          <button
            type="button"
            disabled={apkSyncBusy}
            onClick={() => void runApkFullDataSync()}
            className="rounded-xl text-sm font-semibold px-4 py-3.5 min-h-[48px] transition-all disabled:opacity-60"
            style={{
              color: "#ffffff",
              background: apkSyncBusy ? "var(--bg-secondary)" : "linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)",
              border: "1px solid transparent",
              boxShadow: apkSyncBusy ? "none" : "0 4px 14px rgba(29, 78, 216, 0.35)",
            }}
          >
            {apkSyncBusy ? "Обновление…" : "Обновить данные"}
          </button>
          {apkSyncError ? (
            <div className="text-xs rounded-lg px-3 py-2" style={{ backgroundColor: "var(--error-light)", color: "var(--error)" }}>
              {apkSyncError}
            </div>
          ) : null}
          {apkSyncHint ? (
            <div className="text-xs rounded-lg px-3 py-2" style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
              {apkSyncHint}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-slide-in min-w-0">
      <h1 className="text-2xl font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
        Главная
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        Добро пожаловать, {user?.username}
      </p>

      <div className="mt-6">
        <WorkScheduleBoard mode="consultant" />
      </div>
    </div>
  );
}
