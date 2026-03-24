import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../api";
import ChatMessenger from "../pages/ChatMessenger";
import { createPortal } from "react-dom";

const FloatingChatIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a4 4 0 0 1-4 4H8l-5 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    <path d="M8 9h8" />
    <path d="M8 13h5" />
  </svg>
);

export default function ChatWidget() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [openTarget, setOpenTarget] = useState<{ userId?: number; username?: string; nonce: number } | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [readVersion, setReadVersion] = useState(0);
  const [lastUnreadMessageText, setLastUnreadMessageText] = useState<string>("");

  useEffect(() => {
    const onClose = () => setOpen(false);
    const onOpen = (event: Event) => {
      const e = event as CustomEvent<{ userId?: number; username?: string }>;
      const userId = Number(e.detail?.userId);
      const username = e.detail?.username;
      setOpenTarget({
        userId: Number.isFinite(userId) && userId > 0 ? userId : undefined,
        username: typeof username === "string" && username.trim().length > 0 ? username.trim() : undefined,
        nonce: Date.now(),
      });
      setOpen(true);
    };
    window.addEventListener("chatwidget:close", onClose);
    window.addEventListener("chatwidget:open", onOpen as EventListener);
    return () => {
      window.removeEventListener("chatwidget:close", onClose);
      window.removeEventListener("chatwidget:open", onOpen as EventListener);
    };
  }, []);

  const READ_GENERAL_AT_KEY = "chat_read_general_at";
  const READ_PRIVATE_AT_PREFIX = "chat_read_private_at_";
  const READ_GROUP_AT_PREFIX = "chat_read_group_at_";

  const safeSetTs = (key: string, ts: number) => {
    try {
      localStorage.setItem(key, String(ts));
    } catch {
      // ignore write errors (private mode / disabled storage)
    }
  };

  const setAllRead = (privateDialogs: { id: number }[], groupDialogs: { id: number }[]) => {
    const now = Date.now();
    safeSetTs(READ_GENERAL_AT_KEY, now);
    privateDialogs.forEach((d) => safeSetTs(`${READ_PRIVATE_AT_PREFIX}${d.id}`, now));
    groupDialogs.forEach((d) => safeSetTs(`${READ_GROUP_AT_PREFIX}${d.id}`, now));
  };

  const publishNotificationState = (count: number, messageText: string) => {
    const payload = {
      unreadCount: Math.max(0, count),
      lastMessageText: messageText || "",
    };
    (window as any).__crmChatNotify = payload;
    window.dispatchEvent(new CustomEvent("crm-chat-notify", { detail: payload }));
  };

  const fetchUnread = async () => {
    if (!user) return;
    try {
      const summary = await api.chat.notificationsSummary();
      const count = Number(summary?.unread_count ?? 0);
      const text = (summary?.last_message_text ?? "").trim();
      setUnreadCount(count);
      setLastUnreadMessageText(text);
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
    if (open) {
      // когда открыли — считаем все прочитанным
      (async () => {
        try {
          const dialogs = await api.chat.privateDialogs.list();
          const groupDialogs = await api.chat.groupDialogs.list();
          setAllRead(dialogs, groupDialogs);
          setReadVersion((v) => v + 1);
        } catch {
          safeSetTs(READ_GENERAL_AT_KEY, Date.now());
        } finally {
          setUnreadCount(0);
          setLastUnreadMessageText("");
          publishNotificationState(0, "");
        }
      })();
      return;
    }

    // когда закрыто — подсчитываем непрочитанное
    fetchUnread();
    const id = window.setInterval(fetchUnread, 6000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading, user?.id]);

  useEffect(() => {
    publishNotificationState(unreadCount, lastUnreadMessageText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadCount, lastUnreadMessageText]);

  const unreadBadgeText = useMemo(() => {
    if (unreadCount <= 0) return "";
    if (unreadCount > 99) return "99+";
    return String(unreadCount);
  }, [unreadCount]);

  if (loading || !user) return null;

  const widget = (
    <>
      <button
        type="button"
        aria-label="Открыть чат"
        onClick={() => setOpen(true)}
        className="chat-widget-button fixed z-[60] w-14 h-14 rounded-3xl flex items-center justify-center text-white shadow-elevated animate-chat-bubble relative"
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

        {unreadCount > 0 && (
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

      {open && (
        <>
          <div
            className="fixed inset-0 z-[55]"
            style={{
              backgroundColor: "rgba(0,0,0,0.35)",
              backdropFilter: "blur(6px)",
            }}
            onClick={() => setOpen(false)}
          />
          <div
            className="chat-widget-panel fixed z-[60] top-0 right-0 bottom-0 overflow-hidden"
            style={{
              width: "95vw",
              maxWidth: "560px",
              backgroundColor: "var(--bg-secondary)",
              borderLeft: "1px solid var(--border)",
              right: 0,
              left: "auto",
              borderTopLeftRadius: 18,
              borderBottomLeftRadius: 18,
              boxShadow: "0 18px 60px rgba(0,0,0,0.28)",
            }}
          >
            <div
              className="flex items-center justify-between p-2 sm:p-4"
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

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-2 py-1.5 rounded-lg text-xs sm:text-sm font-medium"
                style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)" }}
              >
                Закрыть
              </button>
            </div>

            <div className="h-full animate-slide-in">
              <ChatMessenger readVersion={readVersion} openPrivateTarget={openTarget} />
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

