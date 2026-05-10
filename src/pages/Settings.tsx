import { Link } from "react-router-dom";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { useEffect, useState } from "react";
import { api } from "../api";

const DEFAULT_SIDEBAR_MENU_ORDER = [
  "/",
  "/orders",
  "/lens-catalog",
  "/drive",
  "/pricelist",
  "/pricelist-rx",
  "/pricelist-mkl",
  "/reports",
  "/schedule-management",
  "/chat",
  "/supply-tickets",
  "/tasks",
  "/training",
  "/normative-acts",
  "/settings",
] as const;

const SIDEBAR_MENU_LABELS: Record<string, string> = {
  "/": "Главная",
  "/orders": "Заказы",
  "/lens-catalog": "Поставщики",
  "/drive": "Общий диск",
  "/pricelist": "Прайс склад",
  "/pricelist-rx": "RX",
  "/pricelist-mkl": "Прайс МКЛ",
  "/reports": "Отчеты",
  "/schedule-management": "График работ",
  "/chat": "Чат",
  "/supply-tickets": "Заявки на поставку",
  "/tasks": "Задачник",
  "/training": "Обучение",
  "/normative-acts": "Нормативные акты",
  "/settings": "Настройки",
};

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const { user, refreshUser } = useAuth();
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [profileUploadLoading, setProfileUploadLoading] = useState(false);
  const [profileUploadError, setProfileUploadError] = useState<string | null>(null);
  const [sidebarVideoLoading, setSidebarVideoLoading] = useState(false);
  const [sidebarVideoSaving, setSidebarVideoSaving] = useState(false);
  const [sidebarVideoError, setSidebarVideoError] = useState<string | null>(null);
  const [sidebarVideoUrl, setSidebarVideoUrl] = useState<string | null>(null);
  const [sidebarVideoGroupIds, setSidebarVideoGroupIds] = useState<number[]>([]);
  const [sidebarMenuOrder, setSidebarMenuOrder] = useState<string[]>([...DEFAULT_SIDEBAR_MENU_ORDER]);
  const [sidebarMenuOrderSaving, setSidebarMenuOrderSaving] = useState(false);
  const [sidebarMenuOrderError, setSidebarMenuOrderError] = useState<string | null>(null);
  const [allGroups, setAllGroups] = useState<{ id: number; name: string }[]>([]);
  const [activeExportType, setActiveExportType] = useState<"all" | "warehouse" | "rx" | "mkl" | null>(null);
  const [offlineSyncLoading, setOfflineSyncLoading] = useState(false);
  const [offlineSyncError, setOfflineSyncError] = useState<string | null>(null);
  const [offlineSyncMessage, setOfflineSyncMessage] = useState<string | null>(null);
  const [offlineSyncProgress, setOfflineSyncProgress] = useState<{
    stage: string;
    doneFiles: number;
    totalFiles: number;
    toDownloadFiles: number;
    downloadedBytes: number;
  } | null>(null);
  const [browserChatNotifyEnabled, setBrowserChatNotifyEnabled] = useState(false);
  const [browserChatNotifyPermission, setBrowserChatNotifyPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [browserChatNotifyError, setBrowserChatNotifyError] = useState<string | null>(null);

  const BROWSER_CHAT_NOTIFY_KEY = "chat_browser_notifications_enabled";

  const onProfileImageSelect = async (file: File | null) => {
    if (!file) return;
    setProfileUploadLoading(true);
    setProfileUploadError(null);
    try {
      const uploaded = await api.upload.profileImage(file);
      await api.updateMyProfile({ avatar_url: uploaded.url });
      await refreshUser();
    } catch (err) {
      setProfileUploadError(err instanceof Error ? err.message : "Не удалось обновить фото профиля");
    } finally {
      setProfileUploadLoading(false);
    }
  };

  const downloadPricelistExport = async (catalog: "all" | "warehouse" | "rx" | "mkl") => {
    setExportLoading(true);
    setActiveExportType(catalog);
    setExportError(null);
    try {
      const token = localStorage.getItem("token");
      const sp = new URLSearchParams();
      sp.set("catalog", catalog);
      const resp = await fetch(`/api/settings/pricelist/export?${sp.toString()}`, {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || "Не удалось выгрузить данные");
      }
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = resp.headers.get("content-disposition") || "";
      const filenameMatch = cd.match(/filename="([^"]+)"/i);
      a.download = filenameMatch?.[1] || `pricelist-export-${catalog}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Ошибка загрузки архива");
    } finally {
      setExportLoading(false);
      setActiveExportType(null);
    }
  };

  const syncPricelistOfflineData = async () => {
    setOfflineSyncLoading(true);
    setOfflineSyncError(null);
    setOfflineSyncMessage(null);
    setOfflineSyncProgress(null);
    try {
      const result = await api.pricelistOffline.syncAllWithProgress((p) => {
        setOfflineSyncProgress(p);
      });
      setOfflineSyncMessage(
        `Офлайн-данные обновлены: склад ${result.warehouse.count} (${result.warehouse.assets} фото), RX ${result.rx.count} (${result.rx.assets} фото), MKL ${result.mkl.count} (${result.mkl.assets} фото), видео сайдбара: ${result.sidebarVideo.saved ? "сохранено" : "нет/не сохранено"}. Загружено: ${Math.round((result.progress.downloadedBytes || 0) / 1024 / 1024 * 10) / 10} МБ.`
      );
    } catch (err) {
      setOfflineSyncError(
        err instanceof Error ? err.message : "Не удалось обновить офлайн-данные. Проверьте интернет и попробуйте снова."
      );
    } finally {
      setOfflineSyncLoading(false);
    }
  };

  const loadSidebarVideoSettings = async () => {
    if (!user?.is_admin) return;
    try {
      const [settings, groups, menuOrderSettings] = await Promise.all([
        api.getSidebarVideoSettings(),
        api.getGroups(),
        api.getSidebarMenuOrderSettings(),
      ]);
      setSidebarVideoUrl(settings.video_url ?? null);
      setSidebarVideoGroupIds(settings.visible_group_ids ?? []);
      setAllGroups(groups);
      const saved = Array.isArray(menuOrderSettings.order) ? menuOrderSettings.order : [];
      const uniqueSaved = saved.filter((to, idx) => typeof to === "string" && saved.indexOf(to) === idx);
      const withMissing = [...uniqueSaved, ...DEFAULT_SIDEBAR_MENU_ORDER.filter((to) => !uniqueSaved.includes(to))];
      setSidebarMenuOrder(withMissing);
    } catch (err) {
      setSidebarVideoError(err instanceof Error ? err.message : "Не удалось загрузить настройки видео");
      setSidebarMenuOrderError(err instanceof Error ? err.message : "Не удалось загрузить порядок меню");
    }
  };

  const saveSidebarVideoSettings = async () => {
    setSidebarVideoSaving(true);
    setSidebarVideoError(null);
    try {
      const saved = await api.updateSidebarVideoSettings({
        video_url: sidebarVideoUrl,
        visible_group_ids: sidebarVideoGroupIds,
      });
      setSidebarVideoUrl(saved.video_url ?? null);
      setSidebarVideoGroupIds(saved.visible_group_ids ?? []);
    } catch (err) {
      setSidebarVideoError(err instanceof Error ? err.message : "Не удалось сохранить настройки видео");
    } finally {
      setSidebarVideoSaving(false);
    }
  };

  const onSidebarVideoSelect = async (file: File | null) => {
    if (!file) return;
    setSidebarVideoLoading(true);
    setSidebarVideoError(null);
    try {
      const uploaded = await api.upload.sidebarVideo(file);
      setSidebarVideoUrl(uploaded.url);
    } catch (err) {
      setSidebarVideoError(err instanceof Error ? err.message : "Не удалось загрузить видео");
    } finally {
      setSidebarVideoLoading(false);
    }
  };

  const moveSidebarMenuItem = (index: number, direction: -1 | 1) => {
    setSidebarMenuOrder((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
      return copy;
    });
  };

  const resetSidebarMenuOrder = () => {
    setSidebarMenuOrder([...DEFAULT_SIDEBAR_MENU_ORDER]);
  };

  const saveSidebarMenuOrder = async () => {
    setSidebarMenuOrderSaving(true);
    setSidebarMenuOrderError(null);
    try {
      const saved = await api.updateSidebarMenuOrderSettings({ order: sidebarMenuOrder });
      const next = Array.isArray(saved.order) ? saved.order : [];
      const uniqueSaved = next.filter((to, idx) => typeof to === "string" && next.indexOf(to) === idx);
      const withMissing = [...uniqueSaved, ...DEFAULT_SIDEBAR_MENU_ORDER.filter((to) => !uniqueSaved.includes(to))];
      setSidebarMenuOrder(withMissing);
    } catch (err) {
      setSidebarMenuOrderError(err instanceof Error ? err.message : "Не удалось сохранить порядок меню");
    } finally {
      setSidebarMenuOrderSaving(false);
    }
  };

  useEffect(() => {
    void loadSidebarVideoSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.is_admin]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const supported = "Notification" in window;
    setBrowserChatNotifyPermission(supported ? Notification.permission : "unsupported");
    try {
      setBrowserChatNotifyEnabled(localStorage.getItem(BROWSER_CHAT_NOTIFY_KEY) === "1");
    } catch {
      setBrowserChatNotifyEnabled(false);
    }
  }, []);

  const setBrowserNotifyEnabled = async (next: boolean) => {
    setBrowserChatNotifyError(null);
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
      setBrowserChatNotifyPermission("unsupported");
      setBrowserChatNotifyEnabled(false);
      setBrowserChatNotifyError("Ваш браузер не поддерживает web push уведомления.");
      return;
    }
    if (!next) {
      try {
        const reg = await navigator.serviceWorker.getRegistration("/chat-sw.js");
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          await api.chat.webpushUnsubscribe(sub.endpoint);
          await sub.unsubscribe();
        }
      } catch {
        // ignore cleanup errors
      }
      try {
        localStorage.setItem(BROWSER_CHAT_NOTIFY_KEY, "0");
      } catch {
        // ignore
      }
      setBrowserChatNotifyEnabled(false);
      return;
    }
    if (Notification.permission === "granted") {
      // continue to subscription step
    } else {
      const result = await Notification.requestPermission();
      setBrowserChatNotifyPermission(result);
      if (result !== "granted") {
        try {
          localStorage.setItem(BROWSER_CHAT_NOTIFY_KEY, "0");
        } catch {
          // ignore
        }
        setBrowserChatNotifyEnabled(false);
        setBrowserChatNotifyError("Разрешение не выдано. Включите уведомления в настройках браузера Safari/Chrome.");
        return;
      }
    }
    try {
      const keyResp = await api.chat.webpushPublicKey();
      const reg = await navigator.serviceWorker.register("/chat-sw.js");
      const existing = await reg.pushManager.getSubscription();
      const vapidKey = Uint8Array.from(
        atob(keyResp.public_key.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(keyResp.public_key.length / 4) * 4, "=")),
        (c) => c.charCodeAt(0)
      );
      const sub =
        existing ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey,
        }));
      const json = sub.toJSON();
      const p256dh = json.keys?.p256dh || "";
      const auth = json.keys?.auth || "";
      if (!json.endpoint || !p256dh || !auth) {
        throw new Error("Не удалось получить web push ключи подписки");
      }
      await api.chat.webpushSubscribe({
        endpoint: json.endpoint,
        p256dh,
        auth,
        platform: "web",
      });
      try {
        localStorage.setItem(BROWSER_CHAT_NOTIFY_KEY, "1");
      } catch {
        // ignore
      }
      setBrowserChatNotifyEnabled(true);
    } catch (e) {
      try {
        localStorage.setItem(BROWSER_CHAT_NOTIFY_KEY, "0");
      } catch {
        // ignore
      }
      setBrowserChatNotifyEnabled(false);
      setBrowserChatNotifyError(e instanceof Error ? e.message : "Не удалось зарегистрировать web push подписку.");
    }
  };

  return (
    <div className="animate-slide-in">
      <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        Настройки
      </h1>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
        Управление системой и параметрами
      </p>
      
      <div className="space-y-6">
        <section>
          <h2 className="text-xs font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
            Профиль
          </h2>
          <div
            className="rounded-lg p-5"
            style={{
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border)',
            }}
          >
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center text-lg font-semibold"
                style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
              >
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt="Аватар профиля" className="w-full h-full object-cover" />
                ) : (
                  (user?.username?.[0] || "?").toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Фото профиля</div>
                <div className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                  Используется в чате и в карточке пользователя.
                </div>
                <label
                  className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium cursor-pointer"
                  style={{
                    backgroundColor: profileUploadLoading ? 'var(--bg-secondary)' : 'var(--accent)',
                    color: profileUploadLoading ? 'var(--text-secondary)' : '#fff',
                    border: `1px solid ${profileUploadLoading ? 'var(--border)' : 'var(--accent)'}`,
                  }}
                >
                  {profileUploadLoading ? 'Загрузка…' : 'Выбрать фото'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={profileUploadLoading}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      void onProfileImageSelect(f);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                {profileUploadError && (
                  <div className="text-xs mt-2" style={{ color: 'var(--error)' }}>
                    {profileUploadError}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section>
          <div
            className="rounded-lg p-5"
            style={{
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border)',
            }}
          >
            <div className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
              Уведомления чата в браузере
            </div>
            <div className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
              Разрешение запрашивается только здесь, в настройках. Для iPhone работает в Safari (лучше через «На экран Домой»).
            </div>
            <label className="inline-flex items-center gap-3 text-sm" style={{ color: 'var(--text-primary)' }}>
              <input
                type="checkbox"
                checked={browserChatNotifyEnabled}
                onChange={(e) => {
                  void setBrowserNotifyEnabled(e.target.checked);
                }}
              />
              Включить системные уведомления чата
            </label>
            <div className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
              Статус разрешения: {browserChatNotifyPermission}
            </div>
            {browserChatNotifyError && (
              <div className="text-xs mt-2" style={{ color: 'var(--error)' }}>
                {browserChatNotifyError}
              </div>
            )}
          </div>
        </section>

        <section>
          {user?.is_admin && (
            <div
              className="rounded-lg p-5"
              style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}
            >
              <div className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                Видео в сайдбаре
              </div>
              <div className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                Вертикальное видео под меню. Отображается только у выбранных групп.
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                <label
                  className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium cursor-pointer"
                  style={{
                    backgroundColor: sidebarVideoLoading ? 'var(--bg-secondary)' : 'var(--accent)',
                    color: sidebarVideoLoading ? 'var(--text-secondary)' : '#fff',
                    border: `1px solid ${sidebarVideoLoading ? 'var(--border)' : 'var(--accent)'}`,
                  }}
                >
                  {sidebarVideoLoading ? 'Загрузка…' : 'Загрузить видео'}
                  <input
                    type="file"
                    accept="video/mp4,video/webm"
                    className="hidden"
                    disabled={sidebarVideoLoading || sidebarVideoSaving}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      void onSidebarVideoSelect(f);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                {sidebarVideoUrl && (
                  <button
                    type="button"
                    className="px-4 py-2 rounded-md text-sm font-medium"
                    style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                    onClick={() => setSidebarVideoUrl(null)}
                  >
                    Убрать видео
                  </button>
                )}
              </div>
              {sidebarVideoUrl && (
                <video
                  src={sidebarVideoUrl}
                  className="w-[150px] h-[260px] object-cover rounded-md mb-3"
                  controls
                  muted
                  playsInline
                />
              )}
              <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Показывать группам
              </div>
              <div className="grid gap-2 sm:grid-cols-2 mb-3">
                {allGroups.map((g) => {
                  const checked = sidebarVideoGroupIds.includes(g.id);
                  return (
                    <label
                      key={g.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-md"
                      style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setSidebarVideoGroupIds((prev) =>
                            on ? [...prev, g.id] : prev.filter((id) => id !== g.id)
                          );
                        }}
                      />
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{g.name}</span>
                    </label>
                  );
                })}
              </div>
              <button
                type="button"
                className="px-4 py-2 rounded-md text-sm font-medium"
                style={{
                  backgroundColor: sidebarVideoSaving ? 'var(--bg-secondary)' : 'var(--accent)',
                  color: sidebarVideoSaving ? 'var(--text-secondary)' : '#fff',
                  border: `1px solid ${sidebarVideoSaving ? 'var(--border)' : 'var(--accent)'}`,
                }}
                disabled={sidebarVideoSaving || sidebarVideoLoading}
                onClick={() => void saveSidebarVideoSettings()}
              >
                {sidebarVideoSaving ? 'Сохранение…' : 'Сохранить видео для групп'}
              </button>
              {sidebarVideoError && (
                <div className="text-xs mt-2" style={{ color: 'var(--error)' }}>
                  {sidebarVideoError}
                </div>
              )}
            </div>
          )}
        </section>

        {user?.is_admin && (
          <section>
            <div
              className="rounded-lg p-5"
              style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)" }}
            >
              <div className="font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                Порядок разделов в сайдбаре
              </div>
              <div className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
                Настройте, какой раздел в меню идет выше или ниже. Порядок применяется для всех пользователей.
              </div>
              <div className="space-y-2 mb-3">
                {sidebarMenuOrder.map((to, index) => (
                  <div
                    key={to}
                    className="flex items-center justify-between rounded-md px-3 py-2"
                    style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                  >
                    <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                      {SIDEBAR_MENU_LABELS[to] || to}
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => moveSidebarMenuItem(index, -1)}
                        disabled={index === 0 || sidebarMenuOrderSaving}
                        className="px-2 py-1 rounded text-xs"
                        style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSidebarMenuItem(index, 1)}
                        disabled={index === sidebarMenuOrder.length - 1 || sidebarMenuOrderSaving}
                        className="px-2 py-1 rounded text-xs"
                        style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="px-4 py-2 rounded-md text-sm font-medium"
                  style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                  onClick={resetSidebarMenuOrder}
                  disabled={sidebarMenuOrderSaving}
                >
                  Сбросить
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded-md text-sm font-medium"
                  style={{
                    backgroundColor: sidebarMenuOrderSaving ? "var(--bg-secondary)" : "var(--accent)",
                    color: sidebarMenuOrderSaving ? "var(--text-secondary)" : "#fff",
                    border: `1px solid ${sidebarMenuOrderSaving ? "var(--border)" : "var(--accent)"}`,
                  }}
                  onClick={() => void saveSidebarMenuOrder()}
                  disabled={sidebarMenuOrderSaving}
                >
                  {sidebarMenuOrderSaving ? "Сохранение…" : "Сохранить порядок меню"}
                </button>
              </div>
              {sidebarMenuOrderError && (
                <div className="text-xs mt-2" style={{ color: "var(--error)" }}>
                  {sidebarMenuOrderError}
                </div>
              )}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-xs font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
            Внешний вид
          </h2>
          <div 
            className="rounded-lg p-5 flex items-center justify-between gap-4"
            style={{ 
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border)',
            }}
          >
            <div>
              <div className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Тема</div>
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Выберите цветовую схему</div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTheme("light")}
                className="px-4 py-2 rounded-md text-sm font-medium transition-all"
                style={{
                  backgroundColor: theme === "light" ? 'var(--accent)' : 'var(--bg-secondary)',
                  color: theme === "light" ? '#ffffff' : 'var(--text-primary)',
                  border: `1px solid ${theme === "light" ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                Светлая
              </button>
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className="px-4 py-2 rounded-md text-sm font-medium transition-all"
                style={{
                  backgroundColor: theme === "dark" ? 'var(--accent)' : 'var(--bg-secondary)',
                  color: theme === "dark" ? '#ffffff' : 'var(--text-primary)',
                  border: `1px solid ${theme === "dark" ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                Тёмная
              </button>
            </div>
          </div>
        </section>
        
        <section>
          <h2 className="text-xs font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
            Управление
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {user?.is_admin && (
              <>
                <Link
                  to="/settings/users"
                  className="rounded-lg p-5 transition-all hover:shadow-md no-underline"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    Пользователи
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Управление доступом
                  </div>
                </Link>
                <Link
                  to="/settings/references"
                  className="rounded-lg p-5 transition-all hover:shadow-md no-underline"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    Справочники
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Настройка данных
                  </div>
                </Link>
                <Link
                  to="/settings/permissions"
                  className="rounded-lg p-5 transition-all hover:shadow-md no-underline"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    Права групп
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Доступ к URL и пунктам меню
                  </div>
                </Link>
                <Link
                  to="/settings/custom-fields"
                  className="rounded-lg p-5 transition-all hover:shadow-md no-underline"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    Доп. поля товаров
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Конструктор полей карточки прайслиста
                  </div>
                </Link>
                <Link
                  to="/settings/pricelist-publications"
                  className="rounded-lg p-5 transition-all hover:shadow-md no-underline"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    Версии прайслистов
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Публикация сейчас и по расписанию
                  </div>
                </Link>
                <Link
                  to="/tasks"
                  className="rounded-lg p-5 transition-all hover:shadow-md no-underline"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    Задачник
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Канбан и список задач с дедлайнами и ответственными
                  </div>
                </Link>
              </>
            )}
            <div
              className="rounded-lg p-5 transition-all hover:shadow-md"
              style={{
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border)',
              }}
            >
              <div className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                Экспорт прайслиста
              </div>
              <div className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                Скачать ZIP для офлайн-работы в APK: склад, RX, MKL или общий архив.
              </div>
              <div className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
                Для работы без интернета нажмите «Обновить офлайн-данные»: прайсы сохранятся в память устройства (APK/WebView).
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void downloadPricelistExport("all")}
                  disabled={exportLoading}
                  className="px-4 py-2 rounded-md text-sm font-medium"
                  style={{
                    backgroundColor: exportLoading && activeExportType === "all" ? "var(--bg-secondary)" : "var(--accent)",
                    color: exportLoading && activeExportType === "all" ? "var(--text-secondary)" : "#fff",
                    border: `1px solid ${exportLoading && activeExportType === "all" ? "var(--border)" : "var(--accent)"}`,
                  }}
                >
                  {exportLoading && activeExportType === "all" ? "Подготовка..." : "Скачать всё"}
                </button>
                <button
                  type="button"
                  onClick={() => void downloadPricelistExport("warehouse")}
                  disabled={exportLoading}
                  className="px-4 py-2 rounded-md text-sm font-medium"
                  style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                >
                  Склад
                </button>
                <button
                  type="button"
                  onClick={() => void downloadPricelistExport("rx")}
                  disabled={exportLoading}
                  className="px-4 py-2 rounded-md text-sm font-medium"
                  style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                >
                  RX
                </button>
                <button
                  type="button"
                  onClick={() => void downloadPricelistExport("mkl")}
                  disabled={exportLoading}
                  className="px-4 py-2 rounded-md text-sm font-medium"
                  style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                >
                  MKL
                </button>
                <button
                  type="button"
                  onClick={() => void syncPricelistOfflineData()}
                  disabled={offlineSyncLoading}
                  className="px-4 py-2 rounded-md text-sm font-medium"
                  style={{
                    backgroundColor: offlineSyncLoading ? "var(--bg-secondary)" : "var(--accent-light)",
                    color: offlineSyncLoading ? "var(--text-secondary)" : "var(--accent)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {offlineSyncLoading ? "Обновление..." : "Обновить офлайн-данные"}
                </button>
              </div>
              {exportError && (
                <div className="text-xs mt-2" style={{ color: "var(--error)" }}>
                  {exportError}
                </div>
              )}
              {offlineSyncError && (
                <div className="text-xs mt-2" style={{ color: "var(--error)" }}>
                  {offlineSyncError}
                </div>
              )}
              {offlineSyncLoading && offlineSyncProgress && (
                <div className="mt-2 rounded-md p-2" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                  <div className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                    {offlineSyncProgress.stage}
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
                    <div
                      className="h-full"
                      style={{
                        width:
                          offlineSyncProgress.totalFiles > 0
                            ? `${Math.min(100, Math.round((offlineSyncProgress.doneFiles / offlineSyncProgress.totalFiles) * 100))}%`
                            : "0%",
                        backgroundColor: "var(--accent)",
                        transition: "width 0.2s ease",
                      }}
                    />
                  </div>
                  <div className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
                    Файлы: {offlineSyncProgress.doneFiles}/{offlineSyncProgress.totalFiles || "?"}
                    {" · "}
                    Нужно скачать: {offlineSyncProgress.toDownloadFiles}
                    {" · "}
                    Загружено: {Math.round((offlineSyncProgress.downloadedBytes || 0) / 1024 / 1024 * 10) / 10} МБ
                  </div>
                </div>
              )}
              {offlineSyncMessage && (
                <div className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
                  {offlineSyncMessage}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
