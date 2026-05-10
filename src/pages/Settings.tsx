import { Link } from "react-router-dom";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { useEffect, useState } from "react";
import { api, type MobileClientRow } from "../api";

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
  const [browserChatNotifyEnabled, setBrowserChatNotifyEnabled] = useState(false);
  const [browserChatNotifyPermission, setBrowserChatNotifyPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [browserChatNotifyError, setBrowserChatNotifyError] = useState<string | null>(null);
  const [mobileClients, setMobileClients] = useState<MobileClientRow[]>([]);
  const [mobileClientsLoading, setMobileClientsLoading] = useState(false);
  const [mobileClientsError, setMobileClientsError] = useState<string | null>(null);
  const [mobileClientDeletingId, setMobileClientDeletingId] = useState<number | null>(null);

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

  const loadMobileClients = async () => {
    if (!user?.is_admin) return;
    setMobileClientsLoading(true);
    setMobileClientsError(null);
    try {
      const rows = await api.listMobileClients();
      setMobileClients(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setMobileClientsError(err instanceof Error ? err.message : "Не удалось загрузить список устройств");
      setMobileClients([]);
    } finally {
      setMobileClientsLoading(false);
    }
  };

  const deleteMobileClientRow = async (id: number) => {
    if (!user?.is_admin) return;
    setMobileClientDeletingId(id);
    setMobileClientsError(null);
    try {
      await api.deleteMobileClientRow(id);
      setMobileClients((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setMobileClientsError(err instanceof Error ? err.message : "Не удалось удалить запись");
    } finally {
      setMobileClientDeletingId(null);
    }
  };

  useEffect(() => {
    void loadSidebarVideoSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.is_admin]);

  useEffect(() => {
    if (user?.is_admin) void loadMobileClients();
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

        {user?.is_admin && (
          <section id="mobile-app-clients">
            <h2 className="text-xs font-medium mb-3" style={{ color: "var(--text-secondary)" }}>
              Мобильные приложения
            </h2>
            <div
              className="rounded-lg p-5 overflow-x-auto"
              style={{
                backgroundColor: "var(--bg-primary)",
                border: "1px solid var(--border)",
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <div className="font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                    Устройства и версии
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    Регистрация при открытии APK и после входа в CRM в WebView. Колонка «Пользователь» заполняется только при&nbsp;реальном входе на&nbsp;сервер (при интернете); в&nbsp;чистом офлайне используется локальный токен без привязки к аккаунту. Для строки «crm-webview» версия APP/CRM — номер веб-сборки с&nbsp;сайта.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void loadMobileClients()}
                  disabled={mobileClientsLoading}
                  className="px-4 py-2 rounded-md text-sm font-medium shrink-0"
                  style={{
                    backgroundColor: mobileClientsLoading ? "var(--bg-secondary)" : "var(--accent)",
                    color: mobileClientsLoading ? "var(--text-secondary)" : "#fff",
                    border: `1px solid ${mobileClientsLoading ? "var(--border)" : "var(--accent)"}`,
                  }}
                >
                  {mobileClientsLoading ? "Загрузка…" : "Обновить"}
                </button>
              </div>
              {mobileClientsError && (
                <div className="text-sm mb-3" style={{ color: "var(--error)" }}>
                  {mobileClientsError}
                </div>
              )}
              {!mobileClientsLoading && mobileClients.length === 0 && !mobileClientsError ? (
                <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Пока нет данных — откройте приложение на устройстве с интернетом.
                </div>
              ) : null}
              {mobileClients.length > 0 ? (
                <div className="overflow-x-auto min-w-0">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                        <th className="text-left py-2 pr-3 font-medium">Пользователь</th>
                        <th className="text-left py-2 pr-3 font-medium">Приложение</th>
                        <th className="text-left py-2 pr-3 font-medium">APP / CRM</th>
                        <th className="text-left py-2 pr-3 font-medium">OTA</th>
                        <th className="text-left py-2 pr-3 font-medium">Офлайн JSON</th>
                        <th className="text-left py-2 pr-3 font-medium">Платформа</th>
                        <th className="text-left py-2 pr-3 font-medium">Устройство</th>
                        <th className="text-left py-2 pr-3 font-medium">Последний визит</th>
                        <th className="text-right py-2 pl-2 font-medium w-24"> </th>
                      </tr>
                    </thead>
                    <tbody>
                      {mobileClients.map((row) => (
                        <tr key={row.id} style={{ borderBottom: "1px solid var(--border)", color: "var(--text-primary)" }}>
                          <td className="py-2 pr-3 align-top whitespace-nowrap">{row.username ?? "—"}</td>
                          <td className="py-2 pr-3 align-top">{row.app_slug}</td>
                          <td className="py-2 pr-3 align-top whitespace-nowrap">
                            {[row.native_version, row.native_build != null ? `#${row.native_build}` : ""].filter(Boolean).join(" ") || "—"}
                          </td>
                          <td className="py-2 pr-3 align-top max-w-[140px] truncate" title={row.bundle_version ?? ""}>
                            {row.bundle_version ?? "—"}
                          </td>
                          <td className="py-2 pr-3 align-top max-w-[120px] truncate" title={row.offline_data_version ?? ""}>
                            {row.offline_data_version ?? "—"}
                          </td>
                          <td className="py-2 pr-3 align-top whitespace-nowrap">
                            {[row.platform, row.os_version].filter(Boolean).join(" ") || "—"}
                          </td>
                          <td className="py-2 pr-3 align-top max-w-[160px] truncate" title={[row.device_manufacturer, row.device_model].filter(Boolean).join(" ") || ""}>
                            {[row.device_manufacturer, row.device_model].filter(Boolean).join(" ") || "—"}
                          </td>
                          <td className="py-2 pr-3 align-top whitespace-nowrap text-[11px]" style={{ color: "var(--text-secondary)" }}>
                            {row.last_seen_at
                              ? new Date(row.last_seen_at).toLocaleString("ru-RU", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </td>
                          <td className="py-2 pl-2 align-top text-right">
                            <button
                              type="button"
                              className="text-[11px] underline decoration-dotted disabled:opacity-50"
                              style={{ color: "var(--text-tertiary)" }}
                              disabled={mobileClientDeletingId === row.id}
                              onClick={() => void deleteMobileClientRow(row.id)}
                            >
                              {mobileClientDeletingId === row.id ? "…" : "Удалить"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
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
                Обновление кэша прайсов на устройстве — на главной приложения (кнопка «Обновить данные»).
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
              </div>
              {exportError && (
                <div className="text-xs mt-2" style={{ color: "var(--error)" }}>
                  {exportError}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
