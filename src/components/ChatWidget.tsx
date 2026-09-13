import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api, type ChatNotificationSummary } from "../api";
import ChatMessenger from "../pages/ChatMessenger";
import {
  hasSpecificChatOpenTarget,
  parseChatOpenTarget,
  stripChatOpenParams,
  type ChatOpenTarget,
} from "../utils/chatOpenNavigation";
import { createPortal } from "react-dom";

const FloatingChatIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a4 4 0 0 1-4 4H8l-5 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    <path d="M8 9h8" />
    <path d="M8 13h5" />
  </svg>
);

export default function ChatWidget({ hideLauncher = false }: { hideLauncher?: boolean }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [openTarget, setOpenTarget] = useState<ChatOpenTarget | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [lastUnreadMessageText, setLastUnreadMessageText] = useState<string>("");
  const lastPublishedRef = useRef<{ unreadCount: number; lastMessageText: string } | null>(null);
  const lastUnreadOpenTargetRef = useRef<Omit<ChatOpenTarget, "nonce"> | null>(null);
  const prevUnreadCountRef = useRef<number | null>(null);
  const BROWSER_CHAT_NOTIFY_KEY = "chat_browser_notifications_enabled";

function openTargetFromNotificationSummary(
  summary: ChatNotificationSummary,
): Omit<ChatOpenTarget, "nonce"> | null {
  const messageId = Number(summary.last_message_id ?? 0);
  if (!Number.isFinite(messageId) || messageId <= 0) return null;
  const rawKind = (summary.last_message_chat_type || "").trim().toLowerCase();
  const kind =
    rawKind === "private" || rawKind === "group" || rawKind === "bot" || rawKind === "general"
      ? rawKind
      : "general";
  const dialogId = Number(summary.last_message_dialog_id ?? 0);
  const threadUserId = Number(summary.last_message_thread_user_id ?? 0);
  const partial: Omit<ChatOpenTarget, "nonce"> = {
    kind,
    messageId,
    dialogId: Number.isFinite(dialogId) && dialogId > 0 ? dialogId : undefined,
    threadUserId: Number.isFinite(threadUserId) && threadUserId > 0 ? threadUserId : undefined,
  };
  return hasSpecificChatOpenTarget(partial) ? partial : null;
}

  const applyOpenTarget = useCallback((partial: Omit<ChatOpenTarget, "nonce">) => {
    setOpenTarget({ ...partial, nonce: Date.now() });
    setOpen(true);
  }, []);

  useEffect(() => {
    const onClose = () => {
      setOpen(false);
      setExpanded(false);
      setOpenTarget(null);
    };
    const onToggleExpand = () => setExpanded((v) => !v);
    const onOpen = (event: Event) => {
      const e = event as CustomEvent<{
        userId?: number;
        username?: string;
        kind?: ChatOpenTarget["kind"];
        dialogId?: number;
        messageId?: number;
        threadUserId?: number;
      }>;
      const userId = Number(e.detail?.userId);
      const dialogId = Number(e.detail?.dialogId);
      const messageId = Number(e.detail?.messageId);
      const threadUserId = Number(e.detail?.threadUserId);
      const partial = {
        kind:
          e.detail?.kind ??
          (Number.isFinite(threadUserId) && threadUserId > 0
            ? ("bot" as const)
            : Number.isFinite(dialogId) && dialogId > 0
              ? ("group" as const)
              : Number.isFinite(userId) && userId > 0
                ? ("private" as const)
                : ("general" as const)),
        userId: Number.isFinite(userId) && userId > 0 ? userId : undefined,
        username: typeof e.detail?.username === "string" && e.detail.username.trim() ? e.detail.username.trim() : undefined,
        dialogId: Number.isFinite(dialogId) && dialogId > 0 ? dialogId : undefined,
        messageId: Number.isFinite(messageId) && messageId > 0 ? messageId : undefined,
        threadUserId: Number.isFinite(threadUserId) && threadUserId > 0 ? threadUserId : undefined,
      };
      if (!hasSpecificChatOpenTarget(partial)) {
        setOpenTarget(null);
        setOpen(true);
        return;
      }
      applyOpenTarget(partial);
    };
    window.addEventListener("chatwidget:close", onClose);
    window.addEventListener("chatwidget:toggle-expand", onToggleExpand);
    window.addEventListener("chatwidget:open", onOpen as EventListener);
    return () => {
      window.removeEventListener("chatwidget:close", onClose);
      window.removeEventListener("chatwidget:toggle-expand", onToggleExpand);
      window.removeEventListener("chatwidget:open", onOpen as EventListener);
    };
  }, [applyOpenTarget]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onSwMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        detail?: {
          kind?: ChatOpenTarget["kind"];
          dialogId?: number;
          messageId?: number;
          userId?: number;
          username?: string;
          threadUserId?: number;
        };
      } | null;
      if (data?.type !== "crm-open-chat" || !data.detail) return;
      const d = data.detail;
      const partial = {
        kind: d.kind ?? ("general" as const),
        dialogId: d.dialogId,
        messageId: d.messageId,
        userId: d.userId,
        username: d.username,
        threadUserId: d.threadUserId,
      };
      if (!hasSpecificChatOpenTarget(partial)) {
        setOpenTarget(null);
        setOpen(true);
        return;
      }
      applyOpenTarget(partial);
    };
    navigator.serviceWorker.addEventListener("message", onSwMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onSwMessage);
  }, [applyOpenTarget]);

  useEffect(() => {
    if (location.pathname === "/chat") {
      const params = new URLSearchParams(location.search);
      if (!params.has("openChat")) params.set("openChat", "1");
      const parsed = parseChatOpenTarget(params);
      if (parsed) applyOpenTarget(parsed);
      else setOpen(true);
      navigate({ pathname: "/", search: stripChatOpenParams(params) }, { replace: true });
      return;
    }
    const parsed = parseChatOpenTarget(location.search);
    if (!parsed) return;
    applyOpenTarget(parsed);
    navigate({ pathname: location.pathname, search: stripChatOpenParams(location.search) }, { replace: true });
  }, [location.pathname, location.search, navigate, applyOpenTarget]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("chatwidget:expanded", { detail: { expanded } }));
  }, [expanded]);

  const [imageLightboxOpen, setImageLightboxOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setImageLightboxOpen(true);
    const onClose = () => setImageLightboxOpen(false);
    window.addEventListener("crm-chat-image-lightbox-open", onOpen);
    window.addEventListener("crm-chat-image-lightbox-close", onClose);
    return () => {
      window.removeEventListener("crm-chat-image-lightbox-open", onOpen);
      window.removeEventListener("crm-chat-image-lightbox-close", onClose);
    };
  }, []);

  useEffect(() => {
    if (!open || !expanded || imageLightboxOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, expanded, imageLightboxOpen]);

  const publishNotificationState = (count: number, messageText: string) => {
    const normalizedCount = Math.max(0, count);
    const normalizedText = messageText || "";
    const payload = {
      unreadCount: normalizedCount,
      lastMessageText: normalizedText,
    };
    const prev = lastPublishedRef.current;
    if (prev && prev.unreadCount === payload.unreadCount && prev.lastMessageText === payload.lastMessageText) {
      return;
    }
    lastPublishedRef.current = payload;
    (window as any).__crmChatNotify = payload;
    window.dispatchEvent(new CustomEvent("crm-chat-notify", { detail: payload }));
  };

  const fetchUnread = async () => {
    if (!user) return;
    if (user.chat_notifications_enabled === false) {
      setUnreadCount(0);
      setLastUnreadMessageText("");
      publishNotificationState(0, "");
      return;
    }
    // Полноэкранный /chat: сообщения просматриваются в ChatMessenger; не публикуем
    // устаревший счётчик в window.__crmChatNotify — иначе APK-пулл снова показывает уведомления.
    try {
      const summary = await api.chat.notificationsSummary();
      const count = Number(summary?.unread_count ?? 0);
      const text = (summary?.last_message_text ?? "").trim();
      setUnreadCount(count);
      setLastUnreadMessageText(text);
      lastUnreadOpenTargetRef.current = count > 0 ? openTargetFromNotificationSummary(summary) : null;
      publishNotificationState(count, text);
    } catch {
      // fallback: keep previous count in case of temporary backend issue
      publishNotificationState(unreadCount, lastUnreadMessageText);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    if (user.chat_notifications_enabled === false) {
      setUnreadCount(0);
      setLastUnreadMessageText("");
      publishNotificationState(0, "");
      return;
    }
  }, [loading, user?.id, user?.chat_notifications_enabled]);

  useEffect(() => {
    if (loading || !user) return;
    if (open) {
      // Важно: открытие панели чата не должно автоматически читать все диалоги.
      // Прочтение выполняется только внутри ChatMessenger для реально открытого чата.
      return;
    }

    // когда закрыто — подсчитываем непрочитанное (реже, если вкладка в фоне)
    const pollMs = () => (typeof document !== "undefined" && document.hidden ? 60000 : 15000);
    fetchUnread();
    let id = window.setInterval(fetchUnread, pollMs());
    const onVisibility = () => {
      void fetchUnread();
      window.clearInterval(id);
      id = window.setInterval(fetchUnread, pollMs());
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading, user?.id, user?.chat_notifications_enabled, location.pathname]);

  useEffect(() => {
    const onRefresh = () => {
      void fetchUnread();
    };
    window.addEventListener("crm-chat-refresh-unread", onRefresh);
    return () => window.removeEventListener("crm-chat-refresh-unread", onRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.chat_notifications_enabled]);

  useEffect(() => {
    publishNotificationState(unreadCount, lastUnreadMessageText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadCount, lastUnreadMessageText]);

  useEffect(() => {
    if (!user || user.chat_notifications_enabled === false) {
      prevUnreadCountRef.current = unreadCount;
      return;
    }
    const prev = prevUnreadCountRef.current;
    prevUnreadCountRef.current = unreadCount;
    if (prev == null) return;
    if (unreadCount <= prev) return;
    if (open) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    let enabled = false;
    try {
      enabled = localStorage.getItem(BROWSER_CHAT_NOTIFY_KEY) === "1";
    } catch {
      enabled = false;
    }
    if (!enabled) return;
    if (document.visibilityState === "visible") return;
    const body = lastUnreadMessageText?.trim() || "Новое сообщение";
    const notif = new Notification("Mosoptika: новое сообщение в чате", {
      body,
      tag: "crm-chat",
    });
    notif.onclick = () => {
      window.focus();
      const target = lastUnreadOpenTargetRef.current;
      window.dispatchEvent(
        new CustomEvent("chatwidget:open", {
          detail: target ?? {},
        }),
      );
      notif.close();
    };
  }, [unreadCount, lastUnreadMessageText, open, location.pathname, user]);

  const unreadBadgeText = useMemo(() => {
    if (unreadCount <= 0) return "";
    if (unreadCount > 99) return "99+";
    return String(unreadCount);
  }, [unreadCount]);

  if (loading || !user) return null;

  const widget = (
    <>
      {!hideLauncher && (
        <button
          type="button"
          aria-label="Открыть чат"
          onClick={() => {
            setOpenTarget(null);
            setOpen(true);
          }}
          className="chat-widget-button fixed z-[80] w-14 h-14 rounded-3xl flex items-center justify-center text-white shadow-elevated animate-chat-bubble relative"
          style={{
            right: 16,
            bottom: 24,
            left: "auto",
            background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)",
            boxShadow: "0 10px 30px rgba(0, 82, 204, 0.25)",
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          <FloatingChatIcon />

          {user.chat_notifications_enabled !== false && unreadCount > 0 && (
            <span
              aria-hidden
              className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-[4px] rounded-full flex items-center justify-center text-[11px] font-bold"
              style={{
                backgroundColor: "#ef4444",
                color: "#fff",
                border: "2px solid var(--bg-primary)",
                boxShadow: "0 6px 18px rgba(239,68,68,0.35)",
                transform: "translateZ(0)",
              }}
            >
              {unreadBadgeText}
            </span>
          )}
        </button>
      )}

      {open && (
        <>
          {!expanded ? (
            <div
              className="fixed inset-0 z-[85]"
              style={{
                backgroundColor: "rgba(0,0,0,0.35)",
                backdropFilter: "blur(6px)",
              }}
              onClick={() => setOpen(false)}
            />
          ) : null}
          <div
            className={`chat-widget-panel fixed flex flex-col overflow-hidden min-h-0 ${
              expanded ? "chat-widget-panel--fullscreen z-[200]" : "z-[90] top-0 right-0 bottom-0"
            }`}
            style={
              expanded
                ? {
                    inset: 0,
                    width: "100vw",
                    maxWidth: "100vw",
                    height: "100dvh",
                    backgroundColor: "var(--bg-secondary)",
                  }
                : {
                    backgroundColor: "var(--bg-secondary)",
                    borderLeft: "1px solid var(--border)",
                    right: 0,
                    left: "auto",
                    borderTopLeftRadius: 18,
                    borderBottomLeftRadius: 18,
                    boxShadow: "0 18px 60px rgba(0,0,0,0.28)",
                  }
            }
          >
            <div
              className="flex flex-shrink-0 items-center justify-between p-2 sm:p-4"
              style={{
                borderBottom: "1px solid var(--border)",
                backgroundColor: "var(--bg-secondary)",
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="min-w-0">
                  <div className="font-bold text-sm sm:text-base" style={{ color: "var(--text-primary)" }}>
                    Чат
                  </div>
                  <div className="text-[11px] sm:text-xs truncate" style={{ color: "var(--text-tertiary)" }}>
                    Общий чат и личные сообщения
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-2 py-1.5 rounded-lg text-xs sm:text-sm font-medium"
                  style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)" }}
                >
                  Закрыть
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <ChatMessenger variant="widget" openChatTarget={openTarget} />
            </div>
          </div>
        </>
      )}
    </>
  );

  // Порталим виджет в body, чтобы `position: fixed` всегда привязывался к viewport.
  if (!mounted) return null;
  return createPortal(widget, document.body);
}

