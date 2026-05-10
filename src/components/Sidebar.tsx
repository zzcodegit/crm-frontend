import React, { useState, useEffect, useCallback } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionsContext";
import { api, type PricelistGroupItem, type UserItem } from "../api";
import type { SectionKey } from "../permissions";
import { isNativeAppShell } from "../utils/nativeApp";
import { apkFullOfflineSync } from "../utils/apkFullOfflineSync";

/** В APK показываем только главную и три прайса (без заказов, чата, настроек и т.д.). */
const NATIVE_SHELL_NAV_PATHS = new Set(["/", "/lens-catalog", "/pricelist", "/pricelist-rx", "/pricelist-mkl"]);

// Профессиональные SVG иконки
const HomeIcon = (_props: { isActive: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const OrdersIcon = (_props: { isActive: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
);

const LensCatalogIcon = (_props: { isActive: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const PricelistIcon = (_props: { isActive: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23"/>
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
  </svg>
);

const ReportsIcon = (_props: { isActive: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

const ScheduleIcon = (_props: { isActive: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
    <path d="M8 14h.01"/>
    <path d="M12 14h.01"/>
    <path d="M16 14h.01"/>
    <path d="M8 18h.01"/>
    <path d="M12 18h.01"/>
    <path d="M16 18h.01"/>
  </svg>
);

const TrainingIcon = (_props: { isActive: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    <path d="M12 6v3"/>
    <path d="M12 12v3"/>
    <path d="M12 18v3"/>
  </svg>
);

const ActsIcon = (_props: { isActive: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 6h13" />
    <path d="M8 12h13" />
    <path d="M8 18h13" />
    <path d="M3 6h.01" />
    <path d="M3 12h.01" />
    <path d="M3 18h.01" />
  </svg>
);

const SettingsIcon = (_props: { isActive: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

const TicketIcon = (_props: { isActive: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7z"/>
    <path d="M12 8v8"/>
    <path d="M9 11h6"/>
  </svg>
);

const TasksKanbanIcon = (_props: { isActive: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="5" height="18" rx="1" />
    <rect x="10" y="3" width="5" height="18" rx="1" />
    <rect x="17" y="3" width="5" height="12" rx="1" />
  </svg>
);

const ChatIcon = (_props: { isActive: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a4 4 0 0 1-4 4H8l-5 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    <path d="M8 9h8" />
    <path d="M8 13h5" />
  </svg>
);

const DriveIcon = (_props: { isActive: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="14" rx="2" ry="2" />
    <path d="M3 10h18" />
    <path d="M8 14h.01" />
    <path d="M12 14h.01" />
    <path d="M16 14h.01" />
  </svg>
);

const navItems: { 
  to: string; 
  label: string; 
  icon: (props: { isActive: boolean }) => React.ReactElement; 
  color: string;
  end?: boolean; 
  adminOnly?: boolean;
  subItemsKey?: "pricelist";
  sectionKey?: SectionKey;
}[] = [
  { to: "/", label: "Главная", icon: HomeIcon, color: "#0066cc", end: true, sectionKey: "dashboard" },
  { to: "/orders", label: "Заказы", icon: OrdersIcon, color: "#0066cc", end: false, sectionKey: "orders" },
  { to: "/lens-catalog", label: "Поставщики", icon: LensCatalogIcon, color: "#0066cc", end: false, sectionKey: "lensCatalog" },
  { to: "/drive", label: "Общий диск", icon: DriveIcon, color: "#0066cc", end: false, sectionKey: "drive" },
  { to: "/pricelist", label: "Прайс склад", icon: PricelistIcon, color: "#0066cc", end: true, subItemsKey: "pricelist", sectionKey: "pricelist" },
  { to: "/pricelist-rx", label: "RX", icon: PricelistIcon, color: "#0066cc", end: true, subItemsKey: "pricelist", sectionKey: "pricelistRx" },
  { to: "/pricelist-mkl", label: "Прайс МКЛ", icon: PricelistIcon, color: "#0066cc", end: true, subItemsKey: "pricelist", sectionKey: "pricelistMkl" },
  { to: "/reports", label: "Отчеты", icon: ReportsIcon, color: "#0066cc", end: true, sectionKey: "reports" },
  { to: "/schedule-management", label: "График работ", icon: ScheduleIcon, color: "#0066cc", end: true, adminOnly: true },
  { to: "/chat", label: "Чат", icon: ChatIcon, color: "#0066cc", end: true, sectionKey: "chat" },
  { to: "/supply-tickets", label: "Заявки на поставку", icon: TicketIcon, color: "#0066cc", end: true, sectionKey: "supplyTickets" },
  { to: "/tasks", label: "Задачник", icon: TasksKanbanIcon, color: "#0066cc", end: true, sectionKey: "tasks" },
  { to: "/training", label: "Обучение", icon: TrainingIcon, color: "#0066cc", end: true, sectionKey: "training" },
  { to: "/normative-acts", label: "Нормативные акты", icon: ActsIcon, color: "#0066cc", end: false, sectionKey: "normativeActs" },
  { to: "/settings", label: "Настройки", icon: SettingsIcon, color: "#0066cc", end: false },
];
const DEFAULT_SIDEBAR_MENU_ORDER = navItems.map((item) => item.to);

function sidebarDisplayName(user: Pick<UserItem, "username"> & { first_name?: string | null; last_name?: string | null } | null | undefined): string {
  if (!user) return "";
  const last = (user.last_name || "").trim();
  const first = (user.first_name || "").trim();
  if (last || first) return `${last} ${first}`.trim();
  return user.username;
}

export default function Sidebar({
  open,
  onClose,
  collapsed = false,
  onToggleCollapsed,
}: {
  open: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const { user } = useAuth();
  const { isSectionAllowed } = usePermissions();
  const chatSectionAllowed = isSectionAllowed("chat");
  const [chatUnread, setChatUnread] = useState(0);

  useEffect(() => {
    const readWindow = () => {
      const w = (window as unknown as { __crmChatNotify?: { unreadCount?: number } }).__crmChatNotify;
      if (w && typeof w.unreadCount === "number") setChatUnread(Math.max(0, w.unreadCount));
    };
    const onNotify = (ev: Event) => {
      const d = (ev as CustomEvent<{ unreadCount?: number }>).detail;
      if (d && typeof d.unreadCount === "number") setChatUnread(Math.max(0, d.unreadCount));
      else readWindow();
    };
    readWindow();
    window.addEventListener("crm-chat-notify", onNotify);
    return () => window.removeEventListener("crm-chat-notify", onNotify);
  }, []);

  const showChatBadge =
    chatSectionAllowed && user?.chat_notifications_enabled !== false && chatUnread > 0;
  const badgeText = chatUnread > 99 ? "99+" : String(chatUnread);

  const openNotificationsFeed = () => {
    if (!chatSectionAllowed) return;
    window.dispatchEvent(new CustomEvent("chatwidget:open", { detail: {} }));
    onClose?.();
  };
  const location = useLocation();
  const [mobile, setMobile] = useState(false);
  const [pricelistGroupsWarehouse, setPricelistGroupsWarehouse] = useState<PricelistGroupItem[]>([]);
  const [pricelistGroupsRx, setPricelistGroupsRx] = useState<PricelistGroupItem[]>([]);
  const [pricelistGroupsMkl, setPricelistGroupsMkl] = useState<PricelistGroupItem[]>([]);
  const [pricelistSubmenuCollapsed, setPricelistSubmenuCollapsed] = useState(false);
  /** Активная группа по скроллу списка прайса (см. `Pricelist.tsx` → `crm-pricelist-scroll-group`). */
  const [pricelistScrollActive, setPricelistScrollActive] = useState<{ basePath: string; groupName: string | null } | null>(
    null
  );
  const [sidebarVideoUrl, setSidebarVideoUrl] = useState<string | null>(null);
  const [resolvedSidebarVideoUrl, setResolvedSidebarVideoUrl] = useState<string | null>(null);
  const [sidebarVideoGroupIds, setSidebarVideoGroupIds] = useState<number[]>([]);
  const [sidebarMenuOrder, setSidebarMenuOrder] = useState<string[]>(DEFAULT_SIDEBAR_MENU_ORDER);
  const [apkSyncBusy, setApkSyncBusy] = useState(false);
  const [apkSyncErr, setApkSyncErr] = useState<string | null>(null);

  const runNativeApkSync = useCallback(async () => {
    setApkSyncBusy(true);
    setApkSyncErr(null);
    try {
      await apkFullOfflineSync();
    } catch (e) {
      setApkSyncErr(e instanceof Error ? e.message : "Не удалось обновить данные");
    } finally {
      setApkSyncBusy(false);
    }
  }, []);

  useEffect(() => {
    const onScrollGroup = (ev: Event) => {
      const d = (ev as CustomEvent<{ basePath?: string; groupName?: string | null }>).detail;
      if (!d?.basePath) return;
      setPricelistScrollActive({ basePath: d.basePath, groupName: d.groupName ?? null });
    };
    window.addEventListener("crm-pricelist-scroll-group", onScrollGroup);
    return () => window.removeEventListener("crm-pricelist-scroll-group", onScrollGroup);
  }, []);

  useEffect(() => {
    const onList =
      location.pathname === "/pricelist" || location.pathname === "/pricelist-rx" || location.pathname === "/pricelist-mkl";
    if (!onList) setPricelistScrollActive(null);
  }, [location.pathname]);

  // Fallback: определяем активную группу прямо из DOM по скроллу списка прайса.
  // Нужен на случай, если событие с страницы не дошло/не сработало.
  useEffect(() => {
    const basePath =
      location.pathname === "/pricelist" || location.pathname === "/pricelist-rx" || location.pathname === "/pricelist-mkl"
        ? location.pathname
        : null;
    if (!basePath) return;

    const root = document.getElementById("app-main-scroll");
    if (!root) return;

    let raf = 0;
    let retryTimer: number | null = null;
    let lastGroup = "";
    const compute = () => {
      const sections = Array.from(root.querySelectorAll<HTMLElement>("[data-pricelist-section]"));
      if (sections.length === 0) return false;
      const rr = root.getBoundingClientRect();
      const anchorY = rr.top + Math.min(160, rr.height * 0.18);
      let best: HTMLElement | null = null;
      let bestDist = Infinity;
      for (const el of sections) {
        const r = el.getBoundingClientRect();
        if (r.bottom < rr.top + 4) continue;
        if (r.top > rr.bottom - 4) continue;
        const topClamped = Math.max(r.top, rr.top);
        const dist = Math.abs(topClamped - anchorY);
        if (dist < bestDist) {
          bestDist = dist;
          best = el;
        }
      }
      const name = (best ?? sections[0])?.dataset?.groupName ?? "";
      if (!name) return false;
      if (name === lastGroup) return true;
      lastGroup = name;
      setPricelistScrollActive({ basePath, groupName: name });
      return true;
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const ok = compute();
        if (!ok) {
          if (retryTimer != null) window.clearTimeout(retryTimer);
          retryTimer = window.setTimeout(onScroll, 120);
        }
      });
    };

    const mo = new MutationObserver(onScroll);
    mo.observe(root, { childList: true, subtree: true });
    root.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();

    return () => {
      cancelAnimationFrame(raf);
      if (retryTimer != null) window.clearTimeout(retryTimer);
      mo.disconnect();
      root.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [location.pathname]);

  useEffect(() => {
    const q = window.matchMedia("(max-width: 767px)");
    const fn = () => setMobile(q.matches);
    q.addEventListener("change", fn);
    fn();
    return () => q.removeEventListener("change", fn);
  }, []);
  useEffect(() => {
    api.ref.pricelistGroups
      .list()
      .then((list) =>
        setPricelistGroupsWarehouse([...list].sort((a, b) => a.sort_index - b.sort_index || a.name.localeCompare(b.name)))
      )
      .catch(() => setPricelistGroupsWarehouse([]));
    api.ref.pricelistRxGroups
      .list()
      .then((list) =>
        setPricelistGroupsRx([...list].sort((a, b) => a.sort_index - b.sort_index || a.name.localeCompare(b.name)))
      )
      .catch(() => setPricelistGroupsRx([]));
    api.ref.pricelistMklGroups
      .list()
      .then((list) =>
        setPricelistGroupsMkl([...list].sort((a, b) => a.sort_index - b.sort_index || a.name.localeCompare(b.name)))
      )
      .catch(() => setPricelistGroupsMkl([]));
  }, []);
  useEffect(() => {
    api
      .getSidebarVideoSettings()
      .then((cfg) => {
        setSidebarVideoUrl(cfg.video_url ?? null);
        setSidebarVideoGroupIds(cfg.visible_group_ids ?? []);
      })
      .catch(() => {
        setSidebarVideoUrl(null);
        setSidebarVideoGroupIds([]);
      });
  }, []);
  useEffect(() => {
    api
      .getSidebarMenuOrderSettings()
      .then((cfg) => {
        const saved = Array.isArray(cfg.order) ? cfg.order : [];
        if (saved.length === 0) {
          setSidebarMenuOrder(DEFAULT_SIDEBAR_MENU_ORDER);
          return;
        }
        const uniqueSaved = saved.filter((to, idx) => typeof to === "string" && saved.indexOf(to) === idx);
        const withMissing = [...uniqueSaved, ...DEFAULT_SIDEBAR_MENU_ORDER.filter((to) => !uniqueSaved.includes(to))];
        setSidebarMenuOrder(withMissing);
      })
      .catch(() => {
        setSidebarMenuOrder(DEFAULT_SIDEBAR_MENU_ORDER);
      });
  }, []);
  useEffect(() => {
    let cancelled = false;
    const raw = (sidebarVideoUrl || "").trim();
    if (!raw) {
      setResolvedSidebarVideoUrl(null);
      return;
    }
    void (async () => {
      try {
        const resolved = await api.pricelistOffline.resolveAssetUrl(raw);
        if (!cancelled) setResolvedSidebarVideoUrl(resolved || raw);
      } catch {
        if (!cancelled) setResolvedSidebarVideoUrl(raw);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sidebarVideoUrl]);
  const isAdmin = user?.role === "admin" || Boolean(user?.is_admin);
  const isManagerOnly = user?.role === "manager";
  const bySectionAccess = (item: (typeof navItems)[number]) => !item.sectionKey || isSectionAllowed(item.sectionKey);
  const groupsByPath = (path: string) =>
    path === "/pricelist" ? pricelistGroupsWarehouse : path === "/pricelist-rx" ? pricelistGroupsRx : pricelistGroupsMkl;
  const inNativeShell = isNativeAppShell();
  const itemsRawBase = isManagerOnly
    ? navItems.filter(
        (i) =>
          (i.to === "/orders" ||
            i.to === "/drive" ||
            i.to === "/lens-catalog" ||
            i.to === "/pricelist" ||
            i.to === "/pricelist-rx" ||
            i.to === "/pricelist-mkl" ||
            i.to === "/reports" ||
            i.to === "/supply-tickets" ||
            i.to === "/chat" ||
            i.to === "/settings") &&
          bySectionAccess(i)
      )
    : navItems.filter((i) => (!i.adminOnly || isAdmin) && bySectionAccess(i));
  const itemsRaw = inNativeShell ? itemsRawBase.filter((i) => NATIVE_SHELL_NAV_PATHS.has(i.to)) : itemsRawBase;
  const sidebarOrderMap = new Map(sidebarMenuOrder.map((to, index) => [to, index]));
  const items = [...itemsRaw].sort((a, b) => {
    const ia = sidebarOrderMap.get(a.to) ?? Number.MAX_SAFE_INTEGER;
    const ib = sidebarOrderMap.get(b.to) ?? Number.MAX_SAFE_INTEGER;
    if (ia !== ib) return ia - ib;
    return DEFAULT_SIDEBAR_MENU_ORDER.indexOf(a.to) - DEFAULT_SIDEBAR_MENU_ORDER.indexOf(b.to);
  });
  const userGroupIds = user?.group_ids ?? [];
  const canShowSidebarVideo =
    !inNativeShell &&
    !!sidebarVideoUrl &&
    sidebarVideoGroupIds.length > 0 &&
    userGroupIds.some((gid) => sidebarVideoGroupIds.includes(gid));
  const closed = mobile && !open;
  const narrow = !mobile && collapsed;
  return (
    <>
      {open && mobile && (
        <div
          className="fixed inset-0 z-40 backdrop-blur-sm md:hidden"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={`fixed top-0 left-0 z-50 h-screen flex flex-col md:translate-x-0 transition-[width,transform] duration-300 ease-out ${
          closed ? "-translate-x-full w-full md:w-60" : narrow ? "w-20 translate-x-0" : "w-full md:w-60 translate-x-0"
        }`}
        style={{
          paddingTop: mobile ? "calc(8px + env(safe-area-inset-top, 0px))" : undefined,
          backgroundColor: 'var(--bg-primary)',
          borderRight: '1px solid var(--border)',
        }}
      >
        {/* Header */}
        <div className="flex h-16 items-center shrink-0 px-3 md:px-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className={`flex items-center gap-3 w-full ${narrow ? "justify-center" : ""}`}>
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white relative overflow-hidden group shrink-0"
              style={{ 
                background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
                boxShadow: '0 4px 12px rgba(0, 82, 204, 0.25)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="9" y1="9" x2="15" y2="9"/>
                <line x1="9" y1="15" x2="15" y2="15"/>
                <line x1="9" y1="12" x2="15" y2="12"/>
              </svg>
              <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                  background: 'linear-gradient(45deg, transparent 30%, rgba(255, 255, 255, 0.3) 50%, transparent 70%)',
                  animation: 'shimmer 2s infinite',
                }}
              />
            </div>
            {!narrow && (
              <div className="min-w-0 flex-1">
                <div className="text-lg font-bold tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>
                  Mosoptika
                </div>
                <div className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                  v2.0
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className={`flex-1 px-2 md:px-3 py-6 space-y-1 overflow-y-auto overflow-x-hidden ${narrow ? "flex flex-col items-center" : ""}`}>
          {items.map((item) => (
            <div key={item.to}>
              <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={(e) => {
                    if (item.to === "/chat") {
                      e.preventDefault();
                      window.dispatchEvent(new CustomEvent("chatwidget:open", { detail: {} }));
                    }
                    onClose?.();
                  }}
                  className={`flex items-center rounded-lg text-sm transition-all group relative overflow-hidden ${narrow ? "justify-center w-12 h-12 p-0" : "gap-3 px-4 py-3"}`}
                  style={({ isActive }) => ({
                    backgroundColor: isActive ? 'var(--accent-light)' : 'transparent',
                    color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                    fontWeight: isActive ? '600' : '500',
                    border: isActive ? '1px solid var(--accent)' : '1px solid transparent',
                  })}
                  onMouseEnter={(e) => {
                    const target = e.currentTarget;
                    const isActive = target.getAttribute('aria-current') === 'page';
                    if (!isActive) {
                      target.style.backgroundColor = 'var(--bg-secondary)';
                      target.style.borderColor = 'var(--border)';
                      if (!narrow) target.style.transform = 'translateX(4px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    const target = e.currentTarget;
                    const isActive = target.getAttribute('aria-current') === 'page';
                    if (!isActive) {
                      target.style.backgroundColor = 'transparent';
                      target.style.borderColor = 'transparent';
                      target.style.transform = 'translateX(0)';
                    }
                  }}
                  title={narrow ? item.label : undefined}
                >
                  {({ isActive }) => (
                    <>
                      <div 
                        className={`flex items-center justify-center rounded-lg transition-all ${narrow ? "w-10 h-10" : "w-9 h-9"}`}
                        style={{ 
                          backgroundColor: isActive ? 'var(--accent)' : 'var(--bg-secondary)',
                          color: isActive ? '#ffffff' : 'var(--text-secondary)',
                        }}
                      >
                        <item.icon isActive={isActive} />
                      </div>
                      {!narrow && (
                        <>
                          <span className="flex-1">{item.label}</span>
                          {isActive && (
                            <div 
                              className="w-1.5 h-1.5 rounded-full animate-pulse"
                              style={{ backgroundColor: 'var(--accent)' }}
                            />
                          )}
                        </>
                      )}
                    </>
                  )}
                </NavLink>
              {/* Подпункты прайса — группы (раздел Прайс склад / RX), с возможностью свернуть */}
              {!narrow &&
                item.subItemsKey === "pricelist" &&
                (location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)) &&
                groupsByPath(item.to).length > 0 && (
                <div className="ml-4 mt-1 pl-4 border-l-2" style={{ borderColor: "var(--border)" }}>
                  <button
                    type="button"
                    onClick={() => setPricelistSubmenuCollapsed((v) => !v)}
                    className="flex items-center gap-2 w-full rounded-lg text-sm py-2 px-3 transition-all text-left"
                    style={{ color: "var(--text-secondary)" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--bg-secondary)";
                      e.currentTarget.style.color = "var(--text-primary)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.color = "var(--text-secondary)";
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ transform: pricelistSubmenuCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                    <span>Группы</span>
                    {pricelistSubmenuCollapsed ? " (свернуто)" : ""}
                  </button>
                  {!pricelistSubmenuCollapsed
                    ? (() => {
                        const groupFromUrl =
                          location.pathname === item.to ? new URLSearchParams(location.search).get("group") : null;
                        const scrollHighlight =
                          pricelistScrollActive?.basePath === item.to && location.pathname === item.to
                            ? pricelistScrollActive.groupName
                            : null;
                        const currentLabel = groupFromUrl || scrollHighlight;
                        return (
                          <>
                            {location.pathname === item.to && currentLabel ? (
                              <div
                                className="px-3 pb-1 text-[11px] leading-snug truncate"
                                style={{ color: "var(--text-tertiary)" }}
                                title={currentLabel}
                              >
                                {groupFromUrl ? `Фильтр: ${groupFromUrl}` : `Сейчас: ${scrollHighlight}`}
                              </div>
                            ) : null}
                            <div className="space-y-0.5">
                              {groupsByPath(item.to).map((g) => {
                                const to = `${item.to}?group=${encodeURIComponent(g.name)}#${encodeURIComponent(g.name)}`;
                                const isActive = groupFromUrl ? groupFromUrl === g.name : scrollHighlight === g.name;
                                return (
                                  <NavLink
                                    key={g.id}
                                    to={to}
                                    onClick={onClose}
                                    className="flex items-center rounded-lg text-sm py-2 px-3 transition-all"
                                    style={{
                                      backgroundColor: isActive ? "var(--accent-light)" : "transparent",
                                      color: isActive ? "var(--accent)" : "var(--text-secondary)",
                                      fontWeight: isActive ? "600" : "400",
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!isActive) {
                                        e.currentTarget.style.backgroundColor = "var(--bg-secondary)";
                                        e.currentTarget.style.color = "var(--text-primary)";
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      if (!isActive) {
                                        e.currentTarget.style.backgroundColor = "transparent";
                                        e.currentTarget.style.color = "var(--text-secondary)";
                                      }
                                    }}
                                  >
                                    {g.name}
                                  </NavLink>
                                );
                              })}
                            </div>
                          </>
                        );
                      })()
                    : null}
                </div>
              )}
            </div>
          ))}
          {!narrow && canShowSidebarVideo && (
            <div className="mt-4 px-1">
              <div
                className="rounded-xl overflow-hidden"
                style={{
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--bg-secondary)",
                }}
              >
                <video
                  src={(resolvedSidebarVideoUrl || sidebarVideoUrl) ?? undefined}
                  className="w-full h-auto object-contain"
                  style={{ aspectRatio: "9 / 16", maxHeight: "320px", backgroundColor: "#000" }}
                  autoPlay
                  loop
                  muted
                  playsInline
                  controls
                />
              </div>
            </div>
          )}
        </nav>

        {inNativeShell ? (
          <div
            className={`shrink-0 px-2 md:px-3 py-3 ${narrow ? "flex justify-center" : ""}`}
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <button
              type="button"
              disabled={apkSyncBusy}
              onClick={() => void runNativeApkSync()}
              className={`rounded-xl text-xs font-semibold transition-all disabled:opacity-60 ${
                narrow ? "w-12 h-12 p-0 inline-flex items-center justify-center" : "w-full px-3 py-3 min-h-[44px]"
              }`}
              style={{
                color: "#ffffff",
                background: apkSyncBusy ? "var(--bg-secondary)" : "linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)",
                border: "1px solid transparent",
              }}
              title={narrow ? (apkSyncBusy ? "Обновление…" : "Обновить данные офлайн") : undefined}
              aria-label={narrow ? "Обновить данные офлайн" : undefined}
            >
              {narrow ? (
                apkSyncBusy ? (
                  <span
                    className="inline-block w-4 h-4 border-2 border-white/35 border-t-white rounded-full animate-spin"
                    aria-hidden
                  />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                    <path d="M16 16h5v5" />
                  </svg>
                )
              ) : apkSyncBusy ? (
                "Обновление…"
              ) : (
                "Обновить данные"
              )}
            </button>
            {apkSyncErr && !narrow ? (
              <p className="text-[11px] mt-2 px-0.5 leading-snug" style={{ color: "var(--error)" }}>
                {apkSyncErr}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Кнопка сворачивания (только десктоп) */}
        {!mobile && onToggleCollapsed && (
          <div className="shrink-0 p-2" style={{ borderTop: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-medium transition-all"
              style={{
                color: 'var(--text-secondary)',
                backgroundColor: 'var(--bg-secondary)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--accent-light)';
                e.currentTarget.style.color = 'var(--accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
              title={collapsed ? "Развернуть меню" : "Свернуть меню"}
            >
              {collapsed ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                  <span>Свернуть</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Footer — профиль + уведомления (чат); в APK скрыто */}
        {!inNativeShell ? (
          <div className={`shrink-0 p-2 ${narrow ? "flex justify-center" : "p-3"}`} style={{ borderTop: '1px solid var(--border)' }}>
            <div
              role="button"
              tabIndex={chatSectionAllowed ? 0 : -1}
              className={`flex items-center rounded-lg transition-all ${chatSectionAllowed ? "cursor-pointer" : "cursor-default"} ${narrow ? "justify-center w-12 h-12 p-0" : "gap-3 px-3 py-3"}`}
              style={{ backgroundColor: 'var(--bg-secondary)' }}
              onClick={chatSectionAllowed ? openNotificationsFeed : undefined}
              onKeyDown={
                chatSectionAllowed
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openNotificationsFeed();
                      }
                    }
                  : undefined
              }
              onMouseEnter={(e) => {
                if (chatSectionAllowed) e.currentTarget.style.backgroundColor = 'var(--accent-light)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
              }}
              title={
                narrow
                  ? chatSectionAllowed
                    ? showChatBadge
                      ? `Непрочитанных: ${chatUnread}. Открыть уведомления`
                      : "Открыть уведомления и чат"
                    : user?.username
                  : chatSectionAllowed
                    ? showChatBadge
                      ? `Непрочитанных: ${chatUnread}`
                      : "Уведомления и чат"
                    : undefined
              }
              aria-label={chatSectionAllowed ? "Открыть уведомления и чат" : undefined}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm relative overflow-hidden shrink-0"
                style={{
                  background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
                }}
              >
                {user?.username?.charAt(0).toUpperCase() || 'U'}
                {showChatBadge ? (
                  <span
                    aria-hidden
                    className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-[4px] rounded-full flex items-center justify-center text-[10px] font-bold leading-none"
                    style={{
                      backgroundColor: "#ef4444",
                      color: "#fff",
                      border: "2px solid var(--bg-secondary)",
                      boxShadow: "0 2px 8px rgba(239,68,68,0.4)",
                    }}
                  >
                    {badgeText}
                  </span>
                ) : null}
                <div
                  className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity pointer-events-none"
                  style={{
                    background: 'radial-gradient(circle at center, rgba(255, 255, 255, 0.2) 0%, transparent 70%)',
                  }}
                />
              </div>
              {!narrow && (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {sidebarDisplayName(user)}
                    </div>
                    <div className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                      {user?.role === "admin"
                        ? "Администратор"
                        : user?.role === "manager"
                          ? "Менеджер"
                          : user?.role === "consultant"
                            ? "Консультант"
                            : "Пользователь"}
                    </div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)' }} className="shrink-0" aria-hidden>
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </>
              )}
            </div>
          </div>
        ) : null}
      </aside>
    </>
  );
}
