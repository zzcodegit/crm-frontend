import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  api,
  CHAT_USERS_QUERY_LIMIT,
  type ChatAttachment,
  type ChatMediaType,
  type ChatMessageItem,
  type ChatReactionSummary,
  type ChatUserShortResponse,
  type PrivateDialogItem,
  type GroupDialogItem,
  type GroupMemberItem,
  type ChatMessageReadsResponse,
  type ChatSharedMediaCategory,
  type ChatUserProfileResponse,
  type ChatPollCreatePayload,
  type ChatFolder,
  type ChatBotThreadItem,
  type ChatSearchMessageHit,
  type ChatWallpaperItem,
} from "../api";
import ChatPollCreateModal from "../components/ChatPollCreateModal";
import ChatPollBubble from "../components/ChatPollBubble";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import ChatMentionText from "../components/ChatMentionText";
import { formatBirthDateDisplay } from "../utils/birthDate";
import {
  ChatSharedMediaPanel,
  SHARED_MEDIA_CATEGORIES,
  SHARED_MEDIA_CATEGORY_LABELS,
  type ChatSharedMediaScope,
} from "../components/ChatSharedMediaPanel";

import ChatStickerPicker from "../components/ChatStickerPicker";
import ChatUserAddPicker from "../components/ChatUserAddPicker";
import { chatCallClient } from "../utils/chatCallClient";
import { chatStickerToFile, isStickerUploadFile } from "../data/chatStickers";
import { formatChatTimestamp } from "../utils/chatTimestamp";
import { callLogIsMissed, isCallLogMessage } from "../utils/chatCallLog";
import { buildChannelAckGroups, type ChannelAckGroupInfo } from "../utils/chatAckGroups";
import {
  filterUsersForMention,
  mentionInsertToken,
  parseMentionAtCaret,
} from "../utils/chatMentions";
import { hasSpecificChatOpenTarget, type ChatOpenTarget } from "../utils/chatOpenNavigation";
import ChatImageLightbox from "../components/ChatImageLightbox";

const EDIT_WINDOW_MINUTES = 15;

/** Скрытие кнопок звонков, стикеров и смайликов в UI чата. */
const CHAT_UI = {
  showCalls: false,
  showStickers: false,
  showEmojis: false,
} as const;

const CHAT_QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥"] as const;

function reactionsSnapshotKey(reactions?: ChatReactionSummary[] | null): string {
  if (!reactions?.length) return "";
  return [...reactions]
    .sort((a, b) => a.emoji.localeCompare(b.emoji))
    .map((r) => `${r.emoji}:${r.count}:${r.reacted_by_me ? 1 : 0}`)
    .join("|");
}

function attachmentCopyLabel(a: ChatAttachment): string {
  if (a.filename?.trim()) return a.filename.trim();
  const labels: Record<ChatMediaType, string> = {
    image: "Изображение",
    video: "Видео",
    audio: "Голосовое сообщение",
    sticker: "Стикер",
    file: "Файл",
  };
  return labels[a.media_type] || "Вложение";
}

function messageCopyText(m: ChatMessageItem): string | null {
  if (m.is_deleted) return null;
  const parts: string[] = [];
  if (m.display_text?.trim()) {
    const t = m.display_text.trim();
    parts.push(isCallLogMessage(t) ? t.replace(/^📞\s*/, "") : t);
  }
  if (m.poll) {
    const opts = m.poll.options
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((o) => `• ${o.text}`)
      .join("\n");
    parts.push(`${m.poll.question}\n${opts}`);
  }
  if (m.attachments.length > 0) {
    parts.push(m.attachments.map(attachmentCopyLabel).join("\n"));
  }
  const text = parts.join("\n\n").trim();
  return text || null;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".webm"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".webm"]);
const MAX_IMAGE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB (must match backend)
const MAX_VIDEO_SIZE_BYTES = 80 * 1024 * 1024; // 80MB (must match backend)
const MAX_AUDIO_SIZE_BYTES = 20 * 1024 * 1024; // 20MB (must match backend)
const MAX_STICKER_SIZE_BYTES = 512 * 1024; // 512KB (must match backend)
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB (must match backend)
const MAX_VIDEO_NOTE_SECONDS = 60;
const VIDEO_NOTE_PREVIEW_PX = 240;

/** В виджете на планшете — одноколоночный UI; на странице /chat — с 640px как телефон. */
function chatStackedLayoutMediaQuery(variant: "page" | "widget") {
  return variant === "widget" ? "(max-width: 1023px)" : "(max-width: 639px)";
}

type ChatSendMode = "enter" | "ctrl-enter";

const CHAT_SEND_MODE_KEY = "chat_send_mode";

const getChatSendMode = (): ChatSendMode => {
  try {
    const raw = localStorage.getItem(CHAT_SEND_MODE_KEY);
    if (raw === "ctrl-enter") return "ctrl-enter";
    return "enter";
  } catch {
    return "enter";
  }
};

const setChatSendMode = (mode: ChatSendMode) => {
  try {
    localStorage.setItem(CHAT_SEND_MODE_KEY, mode);
  } catch {
    // ignore
  }
};

function ChevronRightIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function fmtProfileBirthDate(v?: string | null): string {
  return formatBirthDateDisplay(v);
}

function formatPhoneTelHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    return `tel:+7${digits.slice(-10)}`;
  }
  return `tel:${digits}`;
}

/** Поле профиля в стиле Telegram (подпись + значение). */
function ChatProfileInfoRow({
  label,
  value,
  href,
  onCopy,
}: {
  label: string;
  value: string;
  href?: string;
  onCopy?: () => void;
}) {
  const empty = value === "не указан" || value === "не указана";
  return (
    <div
      className="px-4 py-3"
      style={{ backgroundColor: "var(--bg-primary)", borderBottom: "1px solid var(--border)" }}
    >
      <div className="text-xs mb-1" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </div>
      {href && !empty ? (
        <a
          href={href}
          className="text-[15px] font-medium"
          style={{ color: "var(--accent)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {value}
        </a>
      ) : (
        <button
          type="button"
          className="text-left text-[15px] font-medium w-full"
          style={{ color: empty ? "var(--text-tertiary)" : "var(--text-primary)" }}
          disabled={!onCopy || empty}
          onClick={() => onCopy?.()}
        >
          {value}
        </button>
      )}
    </div>
  );
}

function MobileChatInfoRow({
  label,
  hint,
  onClick,
  destructive,
  icon,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
  destructive?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors active:opacity-80"
      style={{
        backgroundColor: "var(--bg-primary)",
        borderBottom: "1px solid var(--border)",
        color: destructive ? "var(--error)" : "var(--text-primary)",
      }}
      onClick={onClick}
    >
      <span
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
        style={{
          backgroundColor: destructive ? "rgba(222,53,11,0.12)" : "rgba(87,157,255,0.14)",
          color: destructive ? "var(--error)" : "var(--accent)",
        }}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-medium leading-tight">{label}</span>
        {hint ? (
          <span className="block text-xs mt-0.5 truncate" style={{ color: "var(--text-tertiary)" }}>
            {hint}
          </span>
        ) : null}
      </span>
      {!destructive ? (
        <span style={{ color: "var(--text-tertiary)" }}>
          <ChevronRightIcon />
        </span>
      ) : null}
    </button>
  );
}

const CHAT_MESSAGE_MENU_WIDTH = 220;

function getViewportBox(): { width: number; height: number; offsetLeft: number; offsetTop: number } {
  const vv = window.visualViewport;
  return {
    width: vv?.width ?? window.innerWidth,
    height: vv?.height ?? window.innerHeight,
    offsetLeft: vv?.offsetLeft ?? 0,
    offsetTop: vv?.offsetTop ?? 0,
  };
}

/** Меню действий над сообщением: не выходит за край экрана (мобильный long-press и ПК). */
function ChatMessageActionsMenu({
  anchorX,
  anchorY,
  onClose,
  children,
}: {
  anchorX: number;
  anchorY: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchorX, top: anchorY });

  const reposition = useCallback(() => {
    const el = menuRef.current;
    if (!el) return;
    const pad = 12;
    const safeBottom = 12;
    const { width: vw, height: vh, offsetLeft, offsetTop } = getViewportBox();
    const rect = el.getBoundingClientRect();
    const w = rect.width || CHAT_MESSAGE_MENU_WIDTH;
    const h = rect.height;

    let left = anchorX;
    let top = anchorY;

    if (left + w > offsetLeft + vw - pad) {
      left = offsetLeft + vw - w - pad;
    }
    if (left < offsetLeft + pad) {
      left = offsetLeft + pad;
    }

    if (top + h > offsetTop + vh - safeBottom) {
      top = anchorY - h;
    }
    if (top + h > offsetTop + vh - safeBottom) {
      top = offsetTop + vh - h - safeBottom;
    }
    if (top < offsetTop + pad) {
      top = offsetTop + pad;
    }

    setPos({ left, top });
  }, [anchorX, anchorY]);

  useLayoutEffect(() => {
    reposition();
  }, [reposition, children]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onChange = () => reposition();
    vv.addEventListener("resize", onChange);
    vv.addEventListener("scroll", onChange);
    return () => {
      vv.removeEventListener("resize", onChange);
      vv.removeEventListener("scroll", onChange);
    };
  }, [reposition]);

  return (
    <div
      className="fixed inset-0 z-[130]"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={menuRef}
        data-chat-message-menu
        className="fixed rounded-2xl overflow-hidden overflow-y-auto"
        style={{
          left: pos.left,
          top: pos.top,
          width: CHAT_MESSAGE_MENU_WIDTH,
          maxHeight: "min(70vh, calc(100dvh - 24px))",
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border)",
          boxShadow: "0 18px 60px rgba(0,0,0,0.28)",
          padding: 6,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function ChatSettingsFields({
  sendMode,
  setSendMode,
  notifEnabled,
  notifSaving,
  notificationsScope,
  onToggleNotifications,
  wallpapers,
  wallpapersLoading,
  wallpaperId,
  wallpaperCustomUrl,
  wallpaperSaving,
  onSelectWallpaper,
  onResetWallpaper,
  onUploadCustomWallpaper,
  isAdmin,
  onAdminAddWallpaper,
}: {
  sendMode: ChatSendMode;
  setSendMode: (m: ChatSendMode) => void;
  notifEnabled: boolean;
  notifSaving: boolean;
  notificationsScope: "global" | "group";
  onToggleNotifications: () => void | Promise<void>;
  wallpapers: ChatWallpaperItem[];
  wallpapersLoading: boolean;
  wallpaperId: number | null;
  wallpaperCustomUrl: string | null;
  wallpaperSaving: boolean;
  onSelectWallpaper: (id: number) => void | Promise<void>;
  onResetWallpaper: () => void | Promise<void>;
  onUploadCustomWallpaper: (file: File) => void | Promise<void>;
  isAdmin: boolean;
  onAdminAddWallpaper?: (title: string, file: File) => void | Promise<void>;
}) {
  const customInputRef = useRef<HTMLInputElement | null>(null);
  const adminInputRef = useRef<HTMLInputElement | null>(null);
  const [adminTitle, setAdminTitle] = useState("");

  const hasWallpaper = wallpaperId != null || Boolean(wallpaperCustomUrl?.trim());

  return (
    <div className="space-y-3 px-4 py-4">
      <div>
        <div className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
          Отправка сообщения
        </div>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="sendMode"
              checked={sendMode === "enter"}
              onChange={() => {
                setSendMode("enter");
                setChatSendMode("enter");
              }}
              className="w-4 h-4"
            />
            <span className="text-sm" style={{ color: "var(--text-primary)" }}>
              Enter — отправить, Shift+Enter — новая строка
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="sendMode"
              checked={sendMode === "ctrl-enter"}
              onChange={() => {
                setSendMode("ctrl-enter");
                setChatSendMode("ctrl-enter");
              }}
              className="w-4 h-4"
            />
            <span className="text-sm" style={{ color: "var(--text-primary)" }}>
              Ctrl+Enter — отправить, Enter — новая строка
            </span>
          </label>
        </div>
      </div>
      <div className="pt-2 border-t" style={{ borderColor: "var(--border)" }}>
        <div className="text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
          {notificationsScope === "group" ? "Уведомления этой группы" : "Уведомления о сообщениях"}
        </div>
        <p className="text-xs mb-2 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
          {notificationsScope === "group"
            ? "Когда выключено: для этой группы не приходят push и её сообщения не учитываются в общем счётчике на кнопке чата. Остальные чаты не затрагиваются."
            : "Когда выключено: не приходят push на устройство, не показывается красный счётчик на кнопке чата на сайте."}
        </p>
        <button
          type="button"
          disabled={notifSaving}
          onClick={() => void onToggleNotifications()}
          className="text-sm font-medium px-3 py-2 rounded-xl border transition-opacity disabled:opacity-60"
          style={{
            borderColor: "var(--border)",
            backgroundColor: notifEnabled ? "var(--bg-secondary)" : "rgba(87,157,255,0.14)",
            color: "var(--text-primary)",
          }}
        >
          {notifSaving ? "Сохранение…" : notifEnabled ? "Отключить уведомления" : "Включить уведомления"}
        </button>
      </div>

      <div className="pt-2 border-t" style={{ borderColor: "var(--border)" }}>
        <div className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
          Обои чата
        </div>
        <p className="text-xs mb-3 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
          Фон области сообщений. Можно выбрать из библиотеки или загрузить своё изображение.
        </p>
        {wallpapersLoading ? (
          <div className="text-sm py-4" style={{ color: "var(--text-secondary)" }}>
            Загрузка библиотеки…
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {wallpapers.map((wp) => {
              const thumb = resolveChatMediaUrl(wp.thumb_url || wp.url);
              const selected = wallpaperId === wp.id;
              return (
                <button
                  key={wp.id}
                  type="button"
                  disabled={wallpaperSaving}
                  title={wp.title}
                  onClick={() => void onSelectWallpaper(wp.id)}
                  className="relative rounded-xl overflow-hidden aspect-[3/4] border-2 transition-opacity disabled:opacity-60"
                  style={{
                    borderColor: selected ? "var(--accent)" : "var(--border)",
                    boxShadow: selected ? "0 0 0 2px rgba(87,157,255,0.25)" : undefined,
                  }}
                >
                  <img src={thumb} alt={wp.title} className="w-full h-full object-cover" />
                  {selected ? (
                    <span
                      className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                      style={{ backgroundColor: "var(--accent)", color: "#fff" }}
                    >
                      ✓
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={wallpaperSaving}
            onClick={() => customInputRef.current?.click()}
            className="text-sm font-medium px-3 py-2 rounded-xl border transition-opacity disabled:opacity-60"
            style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--bg-secondary)" }}
          >
            {wallpaperSaving ? "Сохранение…" : "Своё изображение"}
          </button>
          {hasWallpaper ? (
            <button
              type="button"
              disabled={wallpaperSaving}
              onClick={() => void onResetWallpaper()}
              className="text-sm font-medium px-3 py-2 rounded-xl border transition-opacity disabled:opacity-60"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
            >
              По умолчанию
            </button>
          ) : null}
        </div>
        <input
          ref={customInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.gif,.svg,image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void onUploadCustomWallpaper(f);
          }}
        />
        {wallpaperCustomUrl ? (
          <p className="text-xs mt-2 truncate" style={{ color: "var(--text-tertiary)" }}>
            Своё изображение активно
          </p>
        ) : null}
        {isAdmin && onAdminAddWallpaper ? (
          <div className="mt-4 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
            <div className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              Добавить в библиотеку (админ)
            </div>
            <input
              type="text"
              value={adminTitle}
              onChange={(e) => setAdminTitle(e.target.value)}
              placeholder="Название"
              className="w-full mb-2 px-3 py-2 rounded-xl text-sm border"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)" }}
            />
            <button
              type="button"
              disabled={wallpaperSaving}
              onClick={() => adminInputRef.current?.click()}
              className="text-sm font-medium px-3 py-2 rounded-xl border w-full"
              style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
            >
              Загрузить в библиотеку
            </button>
            <input
              ref={adminInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.gif,.svg,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void onAdminAddWallpaper(adminTitle.trim() || f.name, f);
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function extFromMime(mime: string): { media: ChatMediaType; ext: string } | null {
  const t = (mime || "").toLowerCase();
  if (t === "image/png") return { media: "image", ext: ".png" };
  if (t === "image/jpeg") return { media: "image", ext: ".jpg" };
  if (t === "image/gif") return { media: "image", ext: ".gif" };
  if (t === "image/webp") return { media: "image", ext: ".webp" };
  if (t === "image/svg+xml") return { media: "image", ext: ".svg" };
  if (t === "video/mp4") return { media: "video", ext: ".mp4" };
  if (t === "video/webm") return { media: "video", ext: ".webm" };
  if (t === "audio/mpeg") return { media: "audio", ext: ".mp3" };
  if (t === "audio/wav" || t === "audio/x-wav") return { media: "audio", ext: ".wav" };
  if (t === "audio/ogg") return { media: "audio", ext: ".ogg" };
  if (t === "audio/mp4" || t === "audio/x-m4a") return { media: "audio", ext: ".m4a" };
  if (t === "audio/webm") return { media: "audio", ext: ".webm" };
  return null;
}

function audioExtFromMime(mime: string): string {
  const t = (mime || "").toLowerCase();
  if (t.includes("ogg")) return ".ogg";
  if (t.includes("wav")) return ".wav";
  if (t.includes("mp4") || t.includes("m4a")) return ".m4a";
  if (t.includes("mpeg") || t.includes("mp3")) return ".mp3";
  return ".webm";
}

function normalizeRecordedAudioMime(mime: string): string {
  const t = (mime || "").toLowerCase().trim();
  if (!t) return "audio/webm";
  if (t.startsWith("audio/")) return t;
  if (t === "video/webm") return "audio/webm";
  if (t === "video/mp4") return "audio/mp4";
  if (t.startsWith("video/")) return "audio/webm";
  return "audio/webm";
}

function pickVideoNoteRecorderMime(): string | undefined {
  const candidates = [
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4",
  ];
  for (const c of candidates) {
    try {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

async function acquireVideoNoteStream(): Promise<MediaStream> {
  const attempts: MediaStreamConstraints[] = [
    {
      audio: true,
      video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 480 } },
    },
    { audio: true, video: { facingMode: "user" } },
    { audio: true, video: true },
  ];
  let lastErr: unknown = null;
  for (const constraints of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error("no_video_track");
      }
      videoTrack.enabled = true;
      return stream;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("getUserMedia_failed");
}

function chatRemoteAssetOrigin(): string | null {
  if (typeof window === "undefined") return null;
  const v = (window as unknown as { __mosoptikaRemoteOrigin?: unknown }).__mosoptikaRemoteOrigin;
  if (typeof v === "string" && /^https?:\/\//.test(v)) return v.replace(/\/$/, "");
  try {
    const { hostname, protocol, port } = window.location;
    const h = hostname.toLowerCase();
    if ((h === "localhost" || h === "127.0.0.1") && protocol === "https:" && port !== "5173" && port !== "4173") {
      const fromEnv = (import.meta.env.VITE_REMOTE_ASSET_ORIGIN as string | undefined)?.trim();
      if (fromEnv && /^https?:\/\//.test(fromEnv)) return fromEnv.replace(/\/$/, "");
      return "https://mosoptika-study.ru";
    }
  } catch {
    /* ignore */
  }
  return null;
}

function resolveChatMediaUrl(url: string): string {
  const raw = (url || "").trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const u = new URL(raw);
      const h = u.hostname.toLowerCase();
      if ((h === "localhost" || h === "127.0.0.1") && u.pathname.startsWith("/uploads/")) {
        const remote = chatRemoteAssetOrigin();
        if (remote) return `${remote}${u.pathname}${u.search}`;
        if (typeof window !== "undefined") {
          return `${window.location.origin}${u.pathname}${u.search}`;
        }
      }
    } catch {
      /* ignore */
    }
    return raw;
  }
  if (raw.startsWith("//")) return `${window.location.protocol}${raw}`;
  if (raw.startsWith("/")) {
    const remote = chatRemoteAssetOrigin();
    if (remote && raw.startsWith("/uploads/")) return `${remote}${raw}`;
    return `${window.location.origin}${raw}`;
  }
  return raw;
}

function isVoiceOrAudioAttachment(a: ChatAttachment): boolean {
  const fn = (a.filename || "").toLowerCase();
  const mime = (a.mime_type || "").toLowerCase();
  if (a.media_type === "audio") return true;
  if (fn.startsWith("voice-")) return true;
  if (mime.startsWith("audio/")) return true;
  if (a.media_type === "video" && fn.endsWith(".webm") && fn.startsWith("voice-")) return true;
  return false;
}

function isVideoNoteAttachment(a: ChatAttachment): boolean {
  const fn = (a.filename || "").toLowerCase();
  return a.media_type === "video" && fn.startsWith("video-note-");
}

function isVideoNoteFile(file: File): boolean {
  return (file.name || "").toLowerCase().startsWith("video-note-");
}

function pauseOtherChatVideoNotes(current: HTMLVideoElement) {
  document.querySelectorAll("video[data-chat-video-note='1']").forEach((node) => {
    const el = node as HTMLVideoElement;
    if (el !== current && !el.paused) el.pause();
  });
}

function pauseChatVoiceEngine() {
  if (chatVoiceEngine && !chatVoiceEngine.paused) {
    try {
      chatVoiceEngine.pause();
    } catch {
      /* ignore */
    }
  }
}

/** Один общий <audio> на всё приложение — не ломается при poll/render списка сообщений. */
type VoicePlaybackState = {
  activeKey: string;
  isPlaying: boolean;
  isLoading: boolean;
  loadError: boolean;
  currentTime: number;
  duration: number;
};

let chatVoiceEngine: HTMLAudioElement | null = null;
let chatVoicePlayGen = 0;
let chatVoiceState: VoicePlaybackState = {
  activeKey: "",
  isPlaying: false,
  isLoading: false,
  loadError: false,
  currentTime: 0,
  duration: 0,
};
const chatVoiceListeners = new Set<() => void>();

function chatVoicePlaybackKey(attachmentId: number, src: string): string {
  return `${attachmentId}:${resolveChatMediaUrl(src)}`;
}

function notifyChatVoiceListeners() {
  for (const fn of chatVoiceListeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

function patchChatVoiceState(patch: Partial<VoicePlaybackState>) {
  chatVoiceState = { ...chatVoiceState, ...patch };
  notifyChatVoiceListeners();
}

function getChatVoiceEngine(): HTMLAudioElement {
  if (chatVoiceEngine) return chatVoiceEngine;
  const el = new Audio();
  el.preload = "auto";
  el.setAttribute("playsinline", "true");
  el.addEventListener("timeupdate", () => {
    if (chatVoiceState.activeKey) {
      patchChatVoiceState({ currentTime: Number(el.currentTime || 0) });
    }
  });
  el.addEventListener("loadedmetadata", () => {
    const d = Number(el.duration);
    if (Number.isFinite(d) && d > 0) patchChatVoiceState({ duration: d, loadError: false, isLoading: false });
  });
  el.addEventListener("durationchange", () => {
    const d = Number(el.duration);
    if (Number.isFinite(d) && d > 0) patchChatVoiceState({ duration: d });
  });
  el.addEventListener("canplay", () => patchChatVoiceState({ isLoading: false, loadError: false }));
  el.addEventListener("waiting", () => patchChatVoiceState({ isLoading: true }));
  el.addEventListener("playing", () => patchChatVoiceState({ isPlaying: true, isLoading: false, loadError: false }));
  el.addEventListener("pause", () => patchChatVoiceState({ isPlaying: false, isLoading: false }));
  el.addEventListener("ended", () => {
    patchChatVoiceState({
      isPlaying: false,
      isLoading: false,
      currentTime: 0,
      activeKey: "",
    });
  });
  el.addEventListener("error", () => {
    patchChatVoiceState({ isPlaying: false, isLoading: false, loadError: true, activeKey: "" });
  });
  chatVoiceEngine = el;
  return el;
}

function subscribeChatVoicePlayback(listener: () => void): () => void {
  chatVoiceListeners.add(listener);
  return () => chatVoiceListeners.delete(listener);
}

function getChatVoiceSnapshot(): VoicePlaybackState {
  return chatVoiceState;
}

function isChatVoicePlayingNow(): boolean {
  const el = chatVoiceEngine;
  return Boolean(el && !el.paused && !el.ended);
}

function isAnyChatVideoNotePlaying(): boolean {
  if (typeof document === "undefined") return false;
  for (const node of document.querySelectorAll("video[data-chat-video-note='1']")) {
    const el = node as HTMLVideoElement;
    if (!el.paused && !el.ended) return true;
  }
  return false;
}

async function toggleChatVoicePlayback(attachmentId: number, src: string): Promise<void> {
  const resolvedSrc = resolveChatMediaUrl(src);
  if (!resolvedSrc) return;
  const key = chatVoicePlaybackKey(attachmentId, src);
  const el = getChatVoiceEngine();

  if (chatVoiceState.activeKey === key && !el.paused) {
    el.pause();
    return;
  }

  const attemptId = ++chatVoicePlayGen;
  patchChatVoiceState({
    activeKey: key,
    isLoading: true,
    loadError: false,
    isPlaying: false,
    currentTime: 0,
  });

  if (el.src !== resolvedSrc) {
    el.src = resolvedSrc;
    try {
      el.load();
    } catch {
      /* ignore */
    }
  }

  if (el.ended) {
    try {
      el.currentTime = 0;
    } catch {
      /* ignore */
    }
  }

  try {
    await el.play();
    if (chatVoicePlayGen !== attemptId) return;
    const d = Number(el.duration);
    patchChatVoiceState({
      isPlaying: true,
      isLoading: false,
      loadError: false,
      duration: Number.isFinite(d) && d > 0 ? d : chatVoiceState.duration,
    });
  } catch {
    if (chatVoicePlayGen !== attemptId) return;
    if (el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
      await new Promise<void>((resolve, reject) => {
        const onReady = () => {
          cleanup();
          resolve();
        };
        const onErr = () => {
          cleanup();
          reject(new Error("load failed"));
        };
        const cleanup = () => {
          el.removeEventListener("canplay", onReady);
          el.removeEventListener("loadeddata", onReady);
          el.removeEventListener("error", onErr);
        };
        el.addEventListener("canplay", onReady, { once: true });
        el.addEventListener("loadeddata", onReady, { once: true });
        el.addEventListener("error", onErr, { once: true });
        try {
          el.load();
        } catch {
          /* ignore */
        }
      }).catch(() => undefined);
      if (chatVoicePlayGen === attemptId) {
        try {
          await el.play();
          if (chatVoicePlayGen === attemptId) {
            patchChatVoiceState({ isPlaying: true, isLoading: false, loadError: false });
            return;
          }
        } catch {
          /* fall through */
        }
      }
    }
    if (chatVoicePlayGen === attemptId) {
      patchChatVoiceState({ isPlaying: false, isLoading: false, loadError: true, activeKey: key });
    }
  }
}

function seekChatVoicePlayback(attachmentId: number, src: string, ratio: number) {
  const key = chatVoicePlaybackKey(attachmentId, src);
  const el = chatVoiceEngine;
  if (!el || chatVoiceState.activeKey !== key || chatVoiceState.duration <= 0) return;
  const t = Math.min(1, Math.max(0, ratio)) * chatVoiceState.duration;
  try {
    el.currentTime = t;
    patchChatVoiceState({ currentTime: t });
  } catch {
    /* ignore */
  }
}

type ActiveConversation =
  | { kind: "general" }
  | { kind: "private"; dialogId: number }
  | { kind: "group"; dialogId: number }
  | { kind: "bot"; threadUserId: number }
  | { kind: "gigachat" };

type ReplyTarget = {
  id: number;
  senderName: string;
  text: string;
  isDeleted: boolean;
};

function mediaFromFile(file: File): ChatMediaType | null {
  if (isStickerUploadFile(file)) return "sticker";
  const name = (file.name || "").toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  return "file";
}

function normalizeMediaFile(file: File): { file: File; media_type: ChatMediaType } | null {
  if (isStickerUploadFile(file)) {
    if (file.size > MAX_STICKER_SIZE_BYTES) return null;
    return { file, media_type: "sticker" };
  }
  // Backend determines type by filename extension, so we may need to adjust name.
  const byExt = mediaFromFile(file);
  if (byExt === "file") {
    if (file.size > MAX_FILE_SIZE_BYTES) return null;
    return { file, media_type: "file" };
  }
  if (byExt) {
    if (byExt === "image" && file.size > MAX_IMAGE_SIZE_BYTES) return null;
    if (byExt === "video" && file.size > MAX_VIDEO_SIZE_BYTES) return null;
    if (byExt === "audio" && file.size > MAX_AUDIO_SIZE_BYTES) return null;
    if (byExt === "sticker" && file.size > MAX_STICKER_SIZE_BYTES) return null;
    return { file, media_type: byExt };
  }

  const mimeInfo = extFromMime(file.type);
  if (mimeInfo) {
    const { media: media_type, ext } = mimeInfo;
    if (media_type === "image" && file.size > MAX_IMAGE_SIZE_BYTES) return null;
    if (media_type === "video" && file.size > MAX_VIDEO_SIZE_BYTES) return null;
    if (media_type === "audio" && file.size > MAX_AUDIO_SIZE_BYTES) return null;
    const originalName = file.name || "upload";
    const base = originalName.includes(".") ? originalName.slice(0, originalName.lastIndexOf(".")) : originalName;
    const normalizedName = `${base}${ext}`;
    const normalized = new File([file], normalizedName, { type: file.type });
    return { file: normalized, media_type };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) return null;
  return { file, media_type: "file" };
}

function fileAttachmentKey(file: File): string {
  return `${file.name}|${file.size}|${file.lastModified}|${file.type}`;
}

/** Картинки из буфера (Ctrl+V, скриншот). */
function clipboardImageFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  const out: File[] = [];
  const seen = new Set<string>();

  const push = (raw: File | null) => {
    if (!raw) return;
    const normalized = normalizeMediaFile(raw);
    if (!normalized || normalized.media_type !== "image") return;
    const key = fileAttachmentKey(normalized.file);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(normalized.file);
  };

  if (data.items?.length) {
    for (const item of Array.from(data.items)) {
      if (item.kind !== "file") continue;
      push(item.getAsFile());
    }
  }
  if (out.length === 0 && data.files?.length) {
    for (const f of Array.from(data.files)) {
      push(f);
    }
  }
  return out;
}

function avatarSeedColor(seed: number) {
  const colors = [
    "linear-gradient(135deg, rgba(87,157,255,1) 0%, rgba(0,82,204,1) 100%)",
    "linear-gradient(135deg, rgba(34,197,94,1) 0%, rgba(16,185,129,1) 100%)",
    "linear-gradient(135deg, rgba(168,85,247,1) 0%, rgba(236,72,153,1) 100%)",
    "linear-gradient(135deg, rgba(249,115,22,1) 0%, rgba(245,158,11,1) 100%)",
    "linear-gradient(135deg, rgba(20,184,166,1) 0%, rgba(59,130,246,1) 100%)",
  ];
  const idx = Math.abs(seed) % colors.length;
  return colors[idx];
}

function initials(name: string) {
  const t = (name || "").trim();
  if (!t) return "?";
  const parts = t.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "?";
  const b = parts.length > 1 ? parts[1]?.[0] : "";
  return (a + (b || "")).toUpperCase();
}

function Avatar({
  name,
  seed,
  imageUrl,
  size = 40,
  className = "",
}: {
  name: string;
  seed: number;
  imageUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const px = `${size}px`;
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name || "avatar"}
        className={`rounded-full object-cover flex-shrink-0 ${className}`}
        style={{ width: px, height: px }}
      />
    );
  }
  return (
    <div
      className={`rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${className}`}
      style={{
        width: px,
        height: px,
        background: avatarSeedColor(seed),
        boxShadow: "0 10px 22px rgba(0,0,0,0.10)",
      }}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}

const ChatAudioPlayer = React.memo(function ChatAudioPlayer({
  src,
  attachmentId,
  variant = "theirs",
}: {
  src: string;
  attachmentId: number;
  variant?: "mine" | "theirs";
}) {
  const resolvedSrc = useMemo(() => resolveChatMediaUrl(src), [src]);
  const playbackKey = chatVoicePlaybackKey(attachmentId, src);
  const voiceState = React.useSyncExternalStore(subscribeChatVoicePlayback, getChatVoiceSnapshot, getChatVoiceSnapshot);
  const isActive = voiceState.activeKey === playbackKey;
  const isPlaying = isActive && voiceState.isPlaying;
  const isLoading = isActive && voiceState.isLoading;
  const loadError = isActive && voiceState.loadError;
  const duration = isActive ? voiceState.duration : 0;
  const currentTime = isActive ? voiceState.currentTime : 0;

  const fmt = (seconds: number) => {
    const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const m = Math.floor(safe / 60);
    const s = Math.floor(safe % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const playBg = variant === "mine" ? "rgba(255,255,255,0.22)" : "var(--accent)";
  const playColor = "#fff";
  const trackColor = variant === "mine" ? "rgba(255,255,255,0.35)" : "rgba(87,157,255,0.35)";
  const textColor = variant === "mine" ? "rgba(255,255,255,0.88)" : "var(--text-secondary)";

  const stopBubble = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      className="w-full min-w-[220px] max-w-[min(100%,320px)]"
      onClick={stopBubble}
      onMouseDown={stopBubble}
      onPointerDown={stopBubble}
      onTouchStart={stopBubble}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            void toggleChatVoicePlayback(attachmentId, src);
          }}
          className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-full flex items-center justify-center flex-shrink-0 touch-manipulation"
          style={{ backgroundColor: playBg, color: playColor, border: variant === "mine" ? "1px solid rgba(255,255,255,0.28)" : "none" }}
          aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
          title={isPlaying ? "Пауза" : "Воспроизвести"}
          disabled={!resolvedSrc || (loadError && !isPlaying)}
        >
          {isLoading && !isPlaying ? (
            <span className="w-5 h-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
          ) : isPlaying ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <button
            type="button"
            className="w-full h-8 rounded-full relative overflow-hidden touch-manipulation"
            style={{ backgroundColor: trackColor }}
            disabled={!isActive || loadError || duration <= 0}
            onClick={(e) => {
              e.stopPropagation();
              if (!isActive || duration <= 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
              seekChatVoicePlayback(attachmentId, src, ratio);
            }}
            aria-label="Перемотка"
          >
            <span
              className="absolute left-0 top-0 bottom-0 rounded-full"
              style={{ width: `${progress}%`, backgroundColor: variant === "mine" ? "#fff" : "var(--accent)" }}
            />
          </button>
          <div className="flex items-center justify-between text-xs mt-1 tabular-nums" style={{ color: textColor }}>
            <span>{fmt(currentTime)}</span>
            <span>{duration > 0 ? fmt(duration) : isLoading ? "…" : "--:--"}</span>
          </div>
        </div>
      </div>

      {loadError ? (
        <div className="mt-2 flex flex-col gap-1.5">
          <span className="text-xs" style={{ color: "var(--error)" }}>
            Не удалось воспроизвести
          </span>
          <audio src={resolvedSrc} controls preload="metadata" playsInline className="w-full h-10" />
        </div>
      ) : null}
    </div>
  );
});

const ChatVideoNotePlayer = React.memo(function ChatVideoNotePlayer({
  src,
  variant = "theirs",
}: {
  src: string;
  variant?: "mine" | "theirs";
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const loadedSrcRef = useRef<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const resolvedSrc = resolveChatMediaUrl(src);
  const ringColor = variant === "mine" ? "rgba(255,255,255,0.35)" : "var(--border)";

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !resolvedSrc) return;
    if (loadedSrcRef.current === resolvedSrc) return;
    if (loadedSrcRef.current != null && !el.paused && !el.ended) return;
    loadedSrcRef.current = resolvedSrc;
    setLoadError(false);
    el.src = resolvedSrc;
    el.load();
  }, [resolvedSrc]);

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el || loadError || !resolvedSrc) return;
    if (!el.paused) {
      el.pause();
      return;
    }
    pauseOtherChatVideoNotes(el);
    pauseChatVoiceEngine();
    void el.play().catch(() => setLoadError(true));
  };

  const stopBubble = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      className="inline-flex flex-col items-center"
      onClick={stopBubble}
      onPointerDown={stopBubble}
    >
      <button
        type="button"
        className="relative rounded-full overflow-hidden flex-shrink-0 touch-manipulation"
        style={{
          width: VIDEO_NOTE_PREVIEW_PX,
          height: VIDEO_NOTE_PREVIEW_PX,
          border: `2px solid ${ringColor}`,
          boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
        }}
        onClick={togglePlay}
        aria-label={playing ? "Пауза" : "Воспроизвести видеосообщение"}
      >
        <video
          ref={videoRef}
          playsInline
          preload="metadata"
          data-chat-video-note="1"
          className="w-full h-full object-cover bg-black"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => {
            setLoadError(true);
            setPlaying(false);
          }}
        />
        {!playing && !loadError ? (
          <span
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ backgroundColor: "rgba(0,0,0,0.28)" }}
          >
            <span
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "rgba(255,255,255,0.92)", color: "var(--accent)" }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </span>
        ) : null}
      </button>
      {loadError ? (
        <span className="text-xs mt-1" style={{ color: "var(--error)" }}>
          Не удалось воспроизвести
        </span>
      ) : null}
    </div>
  );
});

function VideoNoteRecordingOverlay({
  stream,
  maxSeconds,
  onSecondsTick,
  onMaxDuration,
}: {
  stream: MediaStream;
  maxSeconds: number;
  onSecondsTick?: (seconds: number) => void;
  onMaxDuration?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamBoundRef = useRef(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || streamBoundRef.current) return;
    streamBoundRef.current = true;
    el.srcObject = stream;
    el.muted = true;
    el.playsInline = true;
    void el.play().catch(() => undefined);
    return () => {
      streamBoundRef.current = false;
      el.srcObject = null;
    };
  }, [stream]);

  useEffect(() => {
    setSeconds(0);
    onSecondsTick?.(0);
    const id = window.setInterval(() => {
      setSeconds((prev) => {
        const next = prev + 1;
        onSecondsTick?.(next);
        if (next >= maxSeconds) onMaxDuration?.();
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [stream, maxSeconds, onSecondsTick, onMaxDuration]);

  const formatRecordingTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
      aria-live="polite"
    >
      <div
        className="relative rounded-full overflow-hidden shrink-0"
        style={{
          width: VIDEO_NOTE_PREVIEW_PX,
          height: VIDEO_NOTE_PREVIEW_PX,
          border: "3px solid rgba(239,68,68,0.85)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
        }}
      >
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover bg-black scale-x-[-1]" />
      </div>
      <p className="mt-4 text-sm font-medium text-white tabular-nums">{formatRecordingTime(seconds)}</p>
      <p className="mt-1 text-xs text-center text-white/80 max-w-[280px]">
        Запись видеокружка · отпустите кнопку для отправки (до {maxSeconds} сек)
      </p>
    </div>
  );
}

function VoiceRecordingBadge({
  labelPrefix,
  onSecondsTick,
}: {
  labelPrefix: string;
  onSecondsTick?: (seconds: number) => void;
}) {
  const [seconds, setSeconds] = useState(0);
  const onSecondsTickRef = useRef(onSecondsTick);
  onSecondsTickRef.current = onSecondsTick;
  useEffect(() => {
    setSeconds(0);
    onSecondsTickRef.current?.(0);
    const id = window.setInterval(() => {
      setSeconds((prev) => {
        const next = prev + 1;
        onSecondsTickRef.current?.(next);
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const time = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return (
    <div
      className="absolute left-3 -top-8 text-[11px] px-2.5 py-1 rounded-full flex items-center gap-1.5 z-10"
      style={{ backgroundColor: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.22)" }}
    >
      <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#ef4444" }} />
      <span>
        {labelPrefix} {time} · отпустите
      </span>
    </div>
  );
}

export type ComposerSendPayload = {
  text: string | null;
  files: File[];
};

const ComposerBar = React.memo(function ComposerBar({
  sessionKey,
  placeholder,
  disabledSend,
  onSend,
  externalText,
  onExternalTextChange,
  editMode,
  replyTo,
  onClearReply,
  sendMode,
  showChannelAckOption,
  channelAckRequired,
  onChannelAckRequiredChange,
  mentionEnabled,
  mentionExcludeUserId,
  getMentionCandidates,
  onSendSticker,
  stickerSending,
  onOpenPoll,
}: {
  /** Смена чата — сброс черновика */
  sessionKey: string;
  placeholder: string;
  disabledSend: boolean;
  onSend: (payload: ComposerSendPayload) => void | Promise<void>;
  /** Управляемый текст композера (например для режима редактирования). */
  externalText?: string;
  onExternalTextChange?: (value: string) => void;
  /** Режим редактирования: показывает плашку и кнопку отмены. */
  editMode?: { label?: string; onCancel: () => void };
  replyTo: ReplyTarget | null;
  onClearReply: () => void;
  sendMode: ChatSendMode;
  showChannelAckOption?: boolean;
  channelAckRequired?: boolean;
  onChannelAckRequiredChange?: (v: boolean) => void;
  /** Подсказки @username (общий чат, группа, личка). */
  mentionEnabled?: boolean;
  mentionExcludeUserId?: number;
  getMentionCandidates?: (query: string) => ChatUserShortResponse[] | Promise<ChatUserShortResponse[]>;
  onSendSticker?: (file: File) => void | Promise<void>;
  stickerSending?: boolean;
  onOpenPoll?: () => void;
}) {
  const stickerUiEnabled = CHAT_UI.showStickers && Boolean(onSendSticker);
  const emojiUiEnabled = CHAT_UI.showEmojis;
  const composerTextareaPad =
    stickerUiEnabled && emojiUiEnabled ? "pr-20" : stickerUiEnabled || emojiUiEnabled ? "pr-12" : "";
  const [localText, setLocalText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const text = externalText ?? localText;
  const setText = (v: string) => {
    if (externalText != null) onExternalTextChange?.(v);
    else setLocalText(v);
  };

  useEffect(() => {
    setLocalText("");
    setFiles([]);
  }, [sessionKey]);

  const previews = useMemo(
    () => files.map((f) => ({ file: f, url: URL.createObjectURL(f), media_type: mediaFromFile(f) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [files],
  );

  useEffect(() => {
    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [previews]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaChunksRef = useRef<BlobPart[]>([]);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoChunksRef = useRef<BlobPart[]>([]);
  const videoNoteHoldCleanupRef = useRef<(() => void) | null>(null);
  const videoNoteStartingRef = useRef(false);
  const videoNoteCancelPendingRef = useRef(false);
  const recordingSecondsRef = useRef(0);
  const voiceRecordingStartedAtRef = useRef<number | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);
  const [recordingKind, setRecordingKind] = useState<null | "voice" | "videoNote">(null);
  const isVoiceRecording = recordingKind === "voice";
  const isVideoNoteRecording = recordingKind === "videoNote";
  const emojiToggleRef = useRef<HTMLButtonElement | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionRange, setMentionRange] = useState<{ start: number; end: number } | null>(null);
  const [mentionResults, setMentionResults] = useState<ChatUserShortResponse[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionLoading, setMentionLoading] = useState(false);
  const mentionFetchRef = useRef(0);
  const lastPasteAtRef = useRef(0);

  const EMOJIS = [
    "😀","😁","😂","🤣","😊","😍","😘","😎","🤔","😅","😇","🙂","😉","😋","😜","🤩",
    "👍","👎","👏","🙏","💪","🔥","❤️","💙","💚","💛","💜","🖤","💯","✅","❌","⚡",
    "🎉","🤝","👀","😴","🤯","😡","😭","🥳",
  ];

  const appendMediaFiles = (list: File[]): boolean => {
    const normalized = list
      .map((f) => normalizeMediaFile(f))
      .filter((x): x is { file: File; media_type: ChatMediaType } => Boolean(x))
      .map((x) => x.file);
    if (!normalized.length) {
      window.alert("Файл слишком большой или не поддерживается (фото до 15 МБ, видео до 80 МБ, документы до 100 МБ).");
      return false;
    }
    setFiles((prev) => [...prev, ...normalized]);
    return true;
  };

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    appendMediaFiles(list);
    if (e.currentTarget) e.currentTarget.value = "";
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const images = clipboardImageFiles(e.clipboardData);
    if (!images.length) return;
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    if (now - lastPasteAtRef.current < 250) return;
    lastPasteAtRef.current = now;
    appendMediaFiles(images);
  };

  const canSend = !disabledSend;
  const hasComposerContent = text.trim().length > 0 || files.length > 0;
  const showSendButton = hasComposerContent && canSend;

  const submitComposer = async () => {
    const allowedFiles = files.filter((f) => mediaFromFile(f) != null);
    const textTrimmed = text.trim();
    const textVal = textTrimmed.length > 0 ? textTrimmed : null;
    if (!textVal && allowedFiles.length === 0) {
      window.alert("Добавьте текст или вложение.");
      return;
    }
    setText("");
    setFiles([]);
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
    }
    await onSend({ text: textVal, files: allowedFiles });
  };

  useEffect(() => {
    if (!attachMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setAttachMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [attachMenuOpen]);

  const stopRecorderTracks = () => {
    const stream = mediaStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    const vStream = videoStreamRef.current;
    if (vStream) {
      vStream.getTracks().forEach((t) => t.stop());
      videoStreamRef.current = null;
    }
  };

  const startVoiceRecording = async () => {
    if (recordingKind) return;
    const hasMediaDevices = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
    const hasRecorder = typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined";
    if (!hasMediaDevices || !hasRecorder) {
      window.alert("Запись голоса не поддерживается в этом браузере.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ];
      const selectedMime = candidates.find((c) => {
        try {
          return typeof MediaRecorder.isTypeSupported === "function" ? MediaRecorder.isTypeSupported(c) : false;
        } catch {
          return false;
        }
      });
      const recorder = selectedMime ? new MediaRecorder(stream, { mimeType: selectedMime }) : new MediaRecorder(stream);

      mediaChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) mediaChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const rawType = recorder.mimeType || "audio/webm";
        const blobType = normalizeRecordedAudioMime(rawType);
        const blob = new Blob(mediaChunksRef.current, { type: blobType });
        mediaChunksRef.current = [];
        stopRecorderTracks();
        mediaRecorderRef.current = null;
        setRecordingKind(null);
        const startedAt = voiceRecordingStartedAtRef.current;
        voiceRecordingStartedAtRef.current = null;
        const elapsedSec =
          recordingSecondsRef.current > 0
            ? recordingSecondsRef.current
            : startedAt
              ? (Date.now() - startedAt) / 1000
              : 0;
        recordingSecondsRef.current = 0;
        if (!blob.size || blob.size < 400 || elapsedSec < 0.45) return;

        const ext = audioExtFromMime(blobType);
        const file = new File([blob], `voice-${Date.now()}${ext}`, { type: blobType });
        if (!disabledSend) {
          void onSend({ text: null, files: [file] });
        } else {
          setFiles((prev) => [...prev, file]);
        }
      };
      recorder.onerror = () => {
        stopRecorderTracks();
        mediaRecorderRef.current = null;
        mediaChunksRef.current = [];
        setRecordingKind(null);
        window.alert("Не удалось записать голосовое сообщение.");
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      recordingSecondsRef.current = 0;
      voiceRecordingStartedAtRef.current = Date.now();
      setRecordingKind("voice");
    } catch {
      stopRecorderTracks();
      mediaRecorderRef.current = null;
      mediaChunksRef.current = [];
      setRecordingKind(null);
      window.alert("Не удалось получить доступ к микрофону.");
    }
  };

  const stopVoiceRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      try {
        recorder.requestData();
      } catch {
        /* ignore */
      }
      recorder.stop();
    }
  };

  const stopVideoNoteRecording = () => {
    const recorder = videoRecorderRef.current;
    if (!recorder) return;
    if (recorder.state !== "inactive") recorder.stop();
  };

  const cleanupVideoNoteHoldListeners = () => {
    videoNoteHoldCleanupRef.current?.();
    videoNoteHoldCleanupRef.current = null;
  };

  const endVideoNoteHold = () => {
    cleanupVideoNoteHoldListeners();
    if (videoNoteStartingRef.current) {
      videoNoteCancelPendingRef.current = true;
      return;
    }
    if (videoRecorderRef.current) {
      stopVideoNoteRecording();
      return;
    }
    if (recordingKind === "videoNote") {
      stopRecorderTracks();
      videoChunksRef.current = [];
      setRecordingKind(null);
      return;
    }
    videoNoteCancelPendingRef.current = true;
  };

  const beginVideoNoteHold = () => {
    if (recordingKind) return;
    videoNoteCancelPendingRef.current = false;
    cleanupVideoNoteHoldListeners();

    const onRelease = () => endVideoNoteHold();
    window.addEventListener("pointerup", onRelease);
    window.addEventListener("pointercancel", onRelease);
    window.addEventListener("blur", onRelease);
    videoNoteHoldCleanupRef.current = () => {
      window.removeEventListener("pointerup", onRelease);
      window.removeEventListener("pointercancel", onRelease);
      window.removeEventListener("blur", onRelease);
    };

    void startVideoNoteRecording();
  };

  const startVideoNoteRecording = async () => {
    if (recordingKind || videoNoteStartingRef.current) return;
    const hasMediaDevices = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
    const hasRecorder = typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined";
    if (!hasMediaDevices || !hasRecorder) {
      cleanupVideoNoteHoldListeners();
      window.alert("Запись видеокружков не поддерживается в этом браузере.");
      return;
    }

    videoNoteStartingRef.current = true;
    try {
      const stream = await acquireVideoNoteStream();
      if (videoNoteCancelPendingRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        videoNoteCancelPendingRef.current = false;
        return;
      }

      videoStreamRef.current = stream;
      recordingSecondsRef.current = 0;
      setRecordingKind("videoNote");

      if (videoNoteCancelPendingRef.current) {
        stopRecorderTracks();
        videoRecorderRef.current = null;
        videoChunksRef.current = [];
        setRecordingKind(null);
        videoNoteCancelPendingRef.current = false;
        return;
      }

      const selectedMime = pickVideoNoteRecorderMime();
      const recorder = selectedMime
        ? new MediaRecorder(stream, { mimeType: selectedMime, videoBitsPerSecond: 1_200_000 })
        : new MediaRecorder(stream, { videoBitsPerSecond: 1_200_000 });

      videoChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) videoChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const rawType = recorder.mimeType || selectedMime || "video/webm";
        const blob = new Blob(videoChunksRef.current, { type: rawType });
        videoChunksRef.current = [];
        stopRecorderTracks();
        videoRecorderRef.current = null;
        setRecordingKind(null);
        const sec = recordingSecondsRef.current;
        recordingSecondsRef.current = 0;
        if (!blob.size || blob.size < 2000 || sec < 1) return;

        const ext = rawType.includes("mp4") ? ".mp4" : ".webm";
        const file = new File([blob], `video-note-${Date.now()}${ext}`, { type: rawType });
        setFiles((prev) => [...prev, file]);
      };
      recorder.onerror = () => {
        stopRecorderTracks();
        videoRecorderRef.current = null;
        videoChunksRef.current = [];
        setRecordingKind(null);
        window.alert("Не удалось записать видеокружок.");
      };

      videoRecorderRef.current = recorder;
      recorder.start(250);
    } catch {
      stopRecorderTracks();
      videoRecorderRef.current = null;
      videoChunksRef.current = [];
      setRecordingKind(null);
      cleanupVideoNoteHoldListeners();
      window.alert("Не удалось получить доступ к камере и микрофону.");
    } finally {
      videoNoteStartingRef.current = false;
      videoNoteCancelPendingRef.current = false;
    }
  };

  useEffect(() => {
    return () => {
      cleanupVideoNoteHoldListeners();
      const vr = videoRecorderRef.current;
      if (vr && vr.state !== "inactive") {
        try {
          vr.stop();
        } catch {
          /* ignore */
        }
      }
      const ar = mediaRecorderRef.current;
      if (ar && ar.state !== "inactive") {
        try {
          ar.stop();
        } catch {
          /* ignore */
        }
      }
      stopRecorderTracks();
    };
  }, []);

  useEffect(() => {
    if (!showEmoji) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowEmoji(false);
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (emojiToggleRef.current && target && emojiToggleRef.current.contains(target)) return;
      if (target && target.closest && target.closest("[data-emoji-picker]")) return;
      setShowEmoji(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
    };
  }, [showEmoji]);

  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // ignore cleanup errors
        }
      }
      stopRecorderTracks();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeMentionPicker = () => {
    setMentionOpen(false);
    setMentionQuery("");
    setMentionRange(null);
    setMentionResults([]);
    setMentionIndex(0);
    setMentionLoading(false);
  };

  const syncMentionPicker = (value: string, caret: number) => {
    if (!mentionEnabled || !getMentionCandidates) {
      closeMentionPicker();
      return;
    }
    const parsed = parseMentionAtCaret(value, caret);
    if (!parsed) {
      closeMentionPicker();
      return;
    }
    setMentionOpen(true);
    setMentionQuery(parsed.query);
    setMentionRange({ start: parsed.start, end: parsed.end });
    setMentionIndex(0);
  };

  useEffect(() => {
    if (!mentionOpen || !getMentionCandidates) return;
    const reqId = ++mentionFetchRef.current;
    setMentionLoading(true);
    const t = window.setTimeout(() => {
      void Promise.resolve(getMentionCandidates(mentionQuery))
        .then((list) => {
          if (mentionFetchRef.current !== reqId) return;
          setMentionResults(filterUsersForMention(list, mentionQuery, mentionExcludeUserId));
        })
        .catch(() => {
          if (mentionFetchRef.current !== reqId) return;
          setMentionResults([]);
        })
        .finally(() => {
          if (mentionFetchRef.current !== reqId) return;
          setMentionLoading(false);
        });
    }, 180);
    return () => window.clearTimeout(t);
  }, [mentionOpen, mentionQuery, getMentionCandidates, mentionExcludeUserId]);

  const applyMentionUser = (user: ChatUserShortResponse) => {
    const token = mentionInsertToken(user);
    if (!token || !mentionRange) return;
    const el = textareaRef.current;
    const start = mentionRange.start;
    const end = mentionRange.end;
    const next = text.slice(0, start) + token + text.slice(end);
    setText(next);
    closeMentionPicker();
    requestAnimationFrame(() => {
      if (!el) return;
      try {
        el.focus();
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
      } catch {
        /* ignore */
      }
    });
  };

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) {
      setText(text + emoji);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    // restore caret after state updates
    requestAnimationFrame(() => {
      try {
        el.focus();
        const pos = start + emoji.length;
        el.setSelectionRange(pos, pos);
      } catch {
        // ignore
      }
    });
  };

  return (
    <div className="flex flex-col gap-2" data-chat-composer>
      {editMode ? (
        <div
          className="rounded-2xl px-3 py-2.5 flex items-start justify-between gap-3 relative overflow-hidden"
          style={{ backgroundColor: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.24)" }}
        >
          <div className="min-w-0">
            <div className="text-[11px] font-semibold flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
              <span
                className="inline-flex items-center justify-center rounded-full"
                style={{ width: 16, height: 16, backgroundColor: "rgba(245,158,11,0.18)", color: "#f59e0b", fontSize: 10 }}
              >
                ✎
              </span>
              <span className="truncate">{editMode.label || "Редактирование сообщения"}</span>
            </div>
          </div>
          <button
            type="button"
            className="p-1.5 rounded-lg"
            style={{ color: "var(--text-tertiary)", border: "1px solid var(--border)", backgroundColor: "var(--bg-secondary)" }}
            onClick={editMode.onCancel}
            aria-label="Отменить редактирование"
            title="Отменить редактирование"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ) : null}
      {replyTo && (
        <div
          className="rounded-2xl px-3 py-2.5 flex items-start justify-between gap-3 relative overflow-hidden"
          style={{ backgroundColor: "rgba(87,157,255,0.10)", border: "1px solid rgba(87,157,255,0.24)" }}
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-1"
            style={{ background: "linear-gradient(180deg, var(--accent) 0%, rgba(87,157,255,0.55) 100%)" }}
          />
          <div className="min-w-0">
            <div className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
              <span
                className="inline-flex items-center justify-center rounded-full"
                style={{ width: 16, height: 16, backgroundColor: "rgba(87,157,255,0.18)", color: "var(--accent)", fontSize: 10 }}
              >
                ↩
              </span>
              <span>Ответ: {replyTo.senderName}</span>
            </div>
            <div className="text-xs truncate pl-[22px]" style={{ color: "var(--text-tertiary)" }}>
              {replyTo.isDeleted ? "Сообщение было удалено" : (replyTo.text || "Вложение")}
            </div>
          </div>
          <button
            type="button"
            className="p-1.5 rounded-lg"
            style={{ color: "var(--text-tertiary)", border: "1px solid var(--border)", backgroundColor: "var(--bg-secondary)" }}
            onClick={onClearReply}
            aria-label="Отменить ответ"
            title="Отменить ответ"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}
      {showStickers && stickerUiEnabled ? (
        <ChatStickerPicker
          sending={stickerSending}
          onClose={() => setShowStickers(false)}
          onPick={async (stickerId) => {
            const file = await chatStickerToFile(stickerId);
            if (!file || !onSendSticker) return;
            await onSendSticker(file);
            setShowStickers(false);
          }}
        />
      ) : null}

      {emojiUiEnabled && showEmoji && (
        <div
          data-emoji-picker
          className="fixed inset-0 z-[150]"
          style={{ backgroundColor: "rgba(0,0,0,0.25)" }}
          onClick={() => setShowEmoji(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute left-0 right-0 bottom-0 rounded-t-3xl p-3"
            style={{
              backgroundColor: "var(--bg-primary)",
              borderTop: "1px solid var(--border)",
              boxShadow: "0 -18px 60px rgba(0,0,0,0.28)",
              transform: "translateY(0)",
              transition: "transform 180ms ease-out",
              maxHeight: "52vh",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                Смайлики
              </div>
              <button
                type="button"
                className="p-2 rounded-xl"
                style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                onClick={() => setShowEmoji(false)}
                aria-label="Закрыть"
                title="Закрыть"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="overflow-auto" style={{ maxHeight: "44vh" }}>
              <div className="grid grid-cols-8 gap-1">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className="w-9 h-9 rounded-2xl hover:bg-black/5"
                    style={{ color: "var(--text-primary)" }}
                    onClick={() => {
                      insertEmoji(e);
                      setShowEmoji(false);
                    }}
                    aria-label={`Смайл ${e}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showChannelAckOption && onChannelAckRequiredChange ? (
        <label
          className="flex items-center gap-2.5 mb-2 px-1 cursor-pointer select-none text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          <input
            type="checkbox"
            className="rounded"
            checked={Boolean(channelAckRequired)}
            onChange={(e) => onChannelAckRequiredChange(e.target.checked)}
          />
          <span>
            Публикация с одной кнопкой «Ознакомиться» (можно отправить несколько сообщений подряд; снимите галочку, чтобы закончить)
          </span>
        </label>
      ) : null}

      <div className="flex items-end gap-2 min-w-0">
        <input
          ref={inputRef}
          type="file"
          accept="*/*"
          multiple
          className="hidden"
          onChange={onPickFiles}
        />

        <div className="relative flex-shrink-0" ref={attachMenuRef}>
          <button
            type="button"
            className="w-11 h-11 rounded-2xl flex items-center justify-center"
            style={{
              backgroundColor: attachMenuOpen ? "var(--accent-light)" : "var(--bg-secondary)",
              color: attachMenuOpen ? "var(--accent)" : "var(--text-secondary)",
              border: `1px solid ${attachMenuOpen ? "var(--accent)" : "var(--border)"}`,
            }}
            aria-label="Вложения и действия"
            aria-expanded={attachMenuOpen}
            title="Вложения"
            disabled={Boolean(recordingKind)}
            onClick={() => {
              setShowEmoji(false);
              setAttachMenuOpen((v) => !v);
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          {attachMenuOpen ? (
            <div
              className="absolute left-0 bottom-[calc(100%+6px)] z-[120] min-w-[220px] py-1.5 rounded-xl overflow-hidden"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
              }}
              role="menu"
            >
              <ChatListHeaderMenuItem
                label="Фото или файл"
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.19 9.19a2 2 0 0 1-2.83-2.83l8.49-8.49" />
                  </svg>
                }
                onClick={() => {
                  setAttachMenuOpen(false);
                  inputRef.current?.click();
                }}
              />
              {stickerUiEnabled ? (
                <ChatListHeaderMenuItem
                  label="Стикеры"
                  icon={
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="4" />
                      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                    </svg>
                  }
                  onClick={() => {
                    setAttachMenuOpen(false);
                    setShowEmoji(false);
                    setShowStickers((v) => !v);
                  }}
                />
              ) : null}
              {onOpenPoll ? (
                <ChatListHeaderMenuItem
                  label="Опрос"
                  icon={
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="16" rx="2" />
                      <path d="M8 12h8" />
                      <path d="M12 8v8" />
                    </svg>
                  }
                  onClick={() => {
                    setAttachMenuOpen(false);
                    onOpenPoll();
                  }}
                />
              ) : null}
              <button
                type="button"
                className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-[15px] touch-manipulation select-none"
                style={{ color: "var(--text-primary)", touchAction: "none" }}
                disabled={recordingKind === "voice"}
                onPointerDown={(e) => {
                  e.preventDefault();
                  if (e.button !== 0 || recordingKind) return;
                  setAttachMenuOpen(false);
                  beginVideoNoteHold();
                }}
                onContextMenu={(e) => e.preventDefault()}
              >
                <span className="w-5 h-5 flex items-center justify-center shrink-0" style={{ color: "var(--accent)" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" />
                    <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
                  </svg>
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate">Видеокружок</span>
                  <span className="block text-[11px] truncate" style={{ color: "var(--text-tertiary)" }}>
                    Удерживайте пункт
                  </span>
                </span>
              </button>
            </div>
          ) : null}
        </div>

        <div className="relative flex-1 min-w-0" onPaste={onPaste}>
          {mentionOpen && mentionEnabled ? (
            <div
              className="absolute left-0 right-0 bottom-[calc(100%+6px)] z-[130] max-h-48 overflow-y-auto rounded-xl py-1"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
              }}
            >
              {mentionLoading ? (
                <p className="px-3 py-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Поиск…
                </p>
              ) : mentionResults.length === 0 ? (
                <p className="px-3 py-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Никого не найдено
                </p>
              ) : (
                mentionResults.map((u, idx) => (
                  <button
                    key={u.id}
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm"
                    style={{
                      backgroundColor: idx === mentionIndex ? "rgba(87,157,255,0.12)" : "transparent",
                      color: "var(--text-primary)",
                    }}
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => applyMentionUser(u)}
                  >
                    <span className="font-medium truncate">{u.display_name || u.username || `#${u.id}`}</span>
                    {u.username ? (
                      <span className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>
                        @{u.username}
                      </span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          ) : null}
          <textarea
            ref={textareaRef}
            className={`w-full rounded-2xl border p-3 text-sm resize-none ${composerTextareaPad}`}
            placeholder={placeholder}
            title="Ctrl+V — вставить скриншот или картинку из буфера"
            value={text}
            rows={1}
            onChange={(e) => {
              const v = e.target.value;
              setText(v);
              syncMentionPicker(v, e.target.selectionStart ?? v.length);
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
            onKeyDown={(e) => {
              if (mentionOpen && mentionResults.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMentionIndex((i) => (i + 1) % mentionResults.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionIndex((i) => (i - 1 + mentionResults.length) % mentionResults.length);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  const pick = mentionResults[mentionIndex];
                  if (pick) applyMentionUser(pick);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  closeMentionPicker();
                  return;
                }
              }
              if (sendMode === "enter") {
                if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                  e.preventDefault();
                  if (!disabledSend) {
                    void submitComposer();
                  }
                }
              } else {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
                  e.preventDefault();
                  if (!disabledSend) {
                    void submitComposer();
                  }
                }
              }
            }}
            style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border)" }}
          />
          {isVoiceRecording ? (
            <VoiceRecordingBadge
              labelPrefix="Говорите…"
              onSecondsTick={(sec) => {
                recordingSecondsRef.current = sec;
              }}
            />
          ) : null}

          {stickerUiEnabled ? (
            <button
              type="button"
              className="absolute right-10 bottom-2 p-2 rounded-xl"
              style={{
                backgroundColor: showStickers ? "var(--accent-light)" : "transparent",
                color: showStickers ? "var(--accent)" : "var(--text-tertiary)",
              }}
              aria-label="Стикеры"
              title="Стикеры"
              disabled={Boolean(recordingKind) || stickerSending}
              onClick={() => {
                setAttachMenuOpen(false);
                setShowEmoji(false);
                setShowStickers((v) => !v);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="4" width="16" height="16" rx="3" />
                <path d="M8 13s1.5 2 4 2 4-2 4-2" />
              </svg>
            </button>
          ) : null}
          {emojiUiEnabled ? (
          <button
            type="button"
            className="absolute right-2 bottom-2 p-2 rounded-xl"
            style={{
              backgroundColor: showEmoji ? "var(--accent-light)" : "transparent",
              color: showEmoji ? "var(--accent)" : "var(--text-tertiary)",
            }}
            aria-label="Смайлики"
            title="Смайлики"
            onClick={() => {
              setShowStickers(false);
              setShowEmoji((v) => !v);
            }}
            ref={emojiToggleRef}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </button>
          ) : null}
        </div>

        {showSendButton ? (
          <button
            type="button"
            className="w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center transition-transform active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.18)",
              boxShadow: "0 10px 26px rgba(0, 82, 204, 0.25)",
            }}
            aria-label="Отправить"
            title="Отправить"
            onClick={async () => {
              await submitComposer();
              textareaRef.current?.focus();
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              className="w-11 h-11 rounded-2xl flex items-center justify-center touch-manipulation select-none"
              style={{
                backgroundColor: isVideoNoteRecording ? "rgba(239,68,68,0.14)" : "var(--bg-secondary)",
                color: isVideoNoteRecording ? "#ef4444" : "var(--text-secondary)",
                border: `1px solid ${isVideoNoteRecording ? "rgba(239,68,68,0.35)" : "var(--border)"}`,
                touchAction: "none",
              }}
              disabled={recordingKind === "voice" || disabledSend}
              aria-label={isVideoNoteRecording ? "Отпустите, чтобы отправить видеокружок" : "Удерживайте для видеокружка"}
              title={isVideoNoteRecording ? "Отпустите для отправки" : "Видеокружок"}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.button !== 0 || recordingKind) return;
                beginVideoNoteHold();
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
              </svg>
            </button>
            <button
              type="button"
              className="w-11 h-11 rounded-2xl flex items-center justify-center touch-manipulation select-none"
              style={{
                backgroundColor: isVoiceRecording ? "rgba(239,68,68,0.14)" : "var(--bg-secondary)",
                color: isVoiceRecording ? "#ef4444" : "var(--text-secondary)",
                border: `1px solid ${isVoiceRecording ? "rgba(239,68,68,0.35)" : "var(--border)"}`,
                touchAction: "none",
              }}
              disabled={recordingKind === "videoNote" || disabledSend}
              aria-label={isVoiceRecording ? "Отпустите, чтобы отправить" : "Удерживайте для голосового"}
              title={isVoiceRecording ? "Отпустите для отправки" : "Голосовое сообщение"}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.button !== 0 || recordingKind) return;
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {
                  /* ignore */
                }
                void startVoiceRecording();
              }}
              onPointerUp={(e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                } catch {
                  /* ignore */
                }
                if (isVoiceRecording) stopVoiceRecording();
              }}
              onPointerCancel={(e) => {
                e.preventDefault();
                if (isVoiceRecording) stopVoiceRecording();
              }}
              onPointerLeave={(e) => {
                if (!isVoiceRecording) return;
                if (e.currentTarget.hasPointerCapture?.(e.pointerId)) return;
                stopVoiceRecording();
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              {isVoiceRecording ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>

      {isVideoNoteRecording && videoStreamRef.current ? (
        <VideoNoteRecordingOverlay
          stream={videoStreamRef.current}
          maxSeconds={MAX_VIDEO_NOTE_SECONDS}
          onSecondsTick={(sec) => {
            recordingSecondsRef.current = sec;
          }}
          onMaxDuration={() => stopVideoNoteRecording()}
        />
      ) : null}

      {previews.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {previews.map((p) => (
            <div key={p.url} className="relative">
              {p.media_type === "sticker" ? (
                <img src={p.url} alt="sticker" className="w-20 h-20 object-contain rounded-xl" />
              ) : p.media_type === "image" ? (
                <img src={p.url} alt="preview" className="w-24 h-24 object-cover rounded-xl bg-black/5" />
              ) : p.media_type === "audio" ? (
                <div
                  className="w-28 h-24 rounded-xl flex flex-col items-center justify-center text-[11px] px-2 text-center gap-1"
                  style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                >
                  <span style={{ fontSize: 16, lineHeight: 1 }}>🎙️</span>
                  <span>Голосовое</span>
                </div>
              ) : p.media_type === "file" ? (
                <div
                  className="max-w-[200px] min-h-[4.5rem] rounded-xl flex flex-col items-center justify-center text-[11px] px-3 py-2 text-center gap-1"
                  style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                >
                  <span style={{ fontSize: 18, lineHeight: 1 }}>📎</span>
                  <span className="line-clamp-2 break-all">{p.file.name || "Файл"}</span>
                </div>
              ) : isVideoNoteFile(p.file) ? (
                <video
                  src={p.url}
                  className="rounded-full object-cover bg-black/5"
                  style={{ width: 88, height: 88 }}
                />
              ) : (
                <video src={p.url} className="w-28 h-24 object-cover rounded-xl bg-black/5" />
              )}
              <button
                type="button"
                className="absolute -top-2 -right-2 bg-[var(--bg-primary)] border border-[var(--border)] rounded-full w-7 h-7 flex items-center justify-center"
                onClick={() => setFiles(files.filter((f) => f !== p.file))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

function ChatListHeaderMenuItem({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-[15px] transition-opacity active:opacity-70"
      style={{ color: "var(--text-primary)" }}
      onClick={onClick}
    >
      <span className="w-5 h-5 flex items-center justify-center shrink-0" style={{ color: "var(--accent)" }}>
        {icon}
      </span>
      <span className="flex-1 min-w-0 truncate">{label}</span>
    </button>
  );
}

/** Шапка списка чатов — компактно, как в Telegram. */
function ChatListHeader({
  variant,
  showFullscreenToggle,
  chatFullscreenExpanded,
  chatFullscreenTitle,
  onToggleFullscreen,
  onNewGroup,
  onNewChannel,
  onFindUser,
  onNewFolder,
  onCloseWidget,
}: {
  variant: "page" | "widget";
  showFullscreenToggle?: boolean;
  chatFullscreenExpanded: boolean;
  chatFullscreenTitle: string;
  onToggleFullscreen: () => void;
  onNewGroup: () => void;
  onNewChannel: () => void;
  onFindUser: () => void;
  onNewFolder?: () => void;
  onCloseWidget?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div
      className="chat-dialog-mobile-header flex-shrink-0 px-3 sm:px-4 py-2 border-b border-[var(--border)] flex items-center justify-between gap-3 min-w-0 min-h-[52px] sm:sticky sm:top-0 sm:z-[20] sm:backdrop-blur"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <h1 className="text-[17px] sm:text-lg font-semibold truncate min-w-0" style={{ color: "var(--text-primary)" }}>
        Чаты
      </h1>
      <div className="relative flex items-center shrink-0 gap-0.5" ref={menuRef}>
        {variant === "widget" && onCloseWidget ? (
          <button
            type="button"
            className="w-10 h-10 flex items-center justify-center rounded-full transition-opacity active:opacity-60"
            style={{ color: "var(--text-secondary)" }}
            aria-label="Закрыть чат"
            title="Закрыть"
            onClick={onCloseWidget}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        ) : null}
        <button
          type="button"
          className="w-10 h-10 flex items-center justify-center rounded-full transition-opacity active:opacity-60"
          style={{ color: "var(--accent)" }}
          aria-label="Новый чат"
          aria-expanded={menuOpen}
          title="Новый чат"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </button>
        {menuOpen ? (
          <div
            className="absolute right-2 sm:right-3 top-[calc(100%-4px)] z-[120] min-w-[220px] py-1.5 rounded-xl overflow-hidden"
            style={{
              backgroundColor: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            }}
            role="menu"
          >
            <ChatListHeaderMenuItem
              label="Новая группа"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="22" y1="11" x2="16" y2="11" />
                </svg>
              }
              onClick={() => {
                closeMenu();
                onNewGroup();
              }}
            />
            <ChatListHeaderMenuItem
              label="Новый канал"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 11v2a4 4 0 0 0 4 4h10" />
                  <path d="M7 15l-4-4 4-4" />
                  <path d="M11 5h6a4 4 0 0 1 4 4v0" />
                </svg>
              }
              onClick={() => {
                closeMenu();
                onNewChannel();
              }}
            />
            <ChatListHeaderMenuItem
              label="Найти пользователя"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              }
              onClick={() => {
                closeMenu();
                onFindUser();
              }}
            />
            {onNewFolder ? (
              <ChatListHeaderMenuItem
                label="Новая папка"
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    <line x1="12" y1="11" x2="12" y2="17" />
                    <line x1="9" y1="14" x2="15" y2="14" />
                  </svg>
                }
                onClick={() => {
                  closeMenu();
                  onNewFolder();
                }}
              />
            ) : null}
            {showFullscreenToggle ? (
              <>
                <div className="my-1.5 mx-3" style={{ borderTop: "1px solid var(--border)" }} />
                <ChatListHeaderMenuItem
                  label={chatFullscreenTitle}
                  icon={
                    chatFullscreenExpanded ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 14h6v6M14 4h6v6M14 20h6v-6M4 10h6V4" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                      </svg>
                    )
                  }
                  onClick={() => {
                    closeMenu();
                    onToggleFullscreen();
                  }}
                />
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const CHAT_MESSAGES_PAGE_SIZE = 80;
const CHAT_SCROLL_LOAD_THRESHOLD_PX = 8;
const CHAT_LEFT_BOTTOM_PX = 160;
const CHAT_HISTORY_DEBUG = true;

function chatHistoryLog(...args: unknown[]) {
  if (!CHAT_HISTORY_DEBUG) return;
  console.warn("[chat-history]", ...args);
}

function chatHistoryMsgRange(msgs: ChatMessageItem[]): string {
  if (msgs.length === 0) return "empty";
  const first = msgs.find((m) => m.id > 0);
  const last = [...msgs].reverse().find((m) => m.id > 0);
  if (!first || !last) return `count=${msgs.length}, no real ids`;
  return `count=${msgs.length}, ids=${first.id}..${last.id}, dates=${first.created_at ?? "?"} .. ${last.created_at ?? "?"}`;
}

function getFirstRealMessageId(messages: ChatMessageItem[]): number | null {
  for (const m of messages) {
    if (m.id > 0) return m.id;
  }
  return null;
}

function getLastRealMessageId(messages: ChatMessageItem[]): number | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].id > 0) return messages[i].id;
  }
  return null;
}

export default function ChatMessenger({
  readVersion = 0,
  openChatTarget,
  /** @deprecated используйте openChatTarget */
  openPrivateTarget,
  variant = "page",
}: {
  readVersion?: number;
  openChatTarget?: ChatOpenTarget | null;
  openPrivateTarget?: { userId?: number; username?: string; nonce?: number } | null;
  variant?: "page" | "widget";
}) {
  useEffect(() => {
    console.warn("[chat-history] ChatMessenger mounted, debug=ON");
  }, []);

  const resolvedOpenTarget: ChatOpenTarget | null =
    openChatTarget ??
    (openPrivateTarget
      ? {
          kind: "private",
          userId: openPrivateTarget.userId,
          username: openPrivateTarget.username,
          nonce: openPrivateTarget.nonce ?? Date.now(),
        }
      : null);
  const [searchParams] = useSearchParams();
  const chatShellRef = useRef<HTMLDivElement | null>(null);
  const [browserFullscreen, setBrowserFullscreen] = useState(false);
  const [widgetExpanded, setWidgetExpanded] = useState(false);
  const { user, refreshUser } = useAuth();
  const { theme } = useTheme();
  const userId = user?.id ?? -1;
  const role = user?.role ?? (user?.is_admin ? "admin" : "user");
  const isAdmin = role === "admin";
  const isConsultant = user?.is_consultant === true || role === "consultant";

  const [sendMode, setSendMode] = useState<ChatSendMode>(getChatSendMode());

  const [notifSaving, setNotifSaving] = useState(false);
  const [callBusy, setCallBusy] = useState(() => chatCallClient.getState().status !== "idle");

  const [imageLightbox, setImageLightbox] = useState<{
    url: string;
    filename: string | null;
  } | null>(null);

  const [showUserFinder, setShowUserFinder] = useState(false);
  const [finderQuery, setFinderQuery] = useState("");
  const [finderResults, setFinderResults] = useState<ChatUserShortResponse[]>([]);
  const [finderLoading, setFinderLoading] = useState(false);

  const [listSearchQuery, setListSearchQuery] = useState("");
  const [listSearchLoading, setListSearchLoading] = useState(false);
  const [listSearchUsers, setListSearchUsers] = useState<ChatUserShortResponse[]>([]);
  const [listSearchMessages, setListSearchMessages] = useState<ChatSearchMessageHit[]>([]);

  const [showGroupCreateWizard, setShowGroupCreateWizard] = useState(false);
  const [groupWizardIsChannel, setGroupWizardIsChannel] = useState(false);
  const [groupWizardStep, setGroupWizardStep] = useState<1 | 2>(1);
  const [groupWizardName, setGroupWizardName] = useState("");
  const [groupWizardSelected, setGroupWizardSelected] = useState<Map<number, ChatUserShortResponse>>(new Map());
  const [groupWizardSelectAllLoading, setGroupWizardSelectAllLoading] = useState(false);
  const [groupWizardMembersSeeOwnOnly, setGroupWizardMembersSeeOwnOnly] = useState(false);
  const [addMemberPending, setAddMemberPending] = useState<Map<number, ChatUserShortResponse>>(new Map());
  const [addMemberSelectAllLoading, setAddMemberSelectAllLoading] = useState(false);
  const [addMemberSubmitting, setAddMemberSubmitting] = useState(false);
  const [forwardSourceMessages, setForwardSourceMessages] = useState<ChatMessageItem[] | null>(null);
  const [forwarding, setForwarding] = useState(false);
  const [deletingMessages, setDeletingMessages] = useState(false);
  const [messageSelectionMode, setMessageSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<number[]>([]);
  const messageLongPressTimerRef = useRef<number | null>(null);

  const [messageMenu, setMessageMenu] = useState<{
    x: number;
    y: number;
    message: ChatMessageItem;
  } | null>(null);
  // На мобильных после long-press часто прилетает "ghost click" (после touchend),
  // который сразу закрывает меню через window.click. Делаем короткое окно игнора.
  const messageMenuIgnoreClickUntilRef = useRef(0);
  const [messageReadsModal, setMessageReadsModal] = useState<{
    message: ChatMessageItem;
    kind: "reads" | "ack";
    data: ChatMessageReadsResponse | null;
    loading: boolean;
    error: string;
  } | null>(null);

  // localStorage keys are written by ChatWidget when the chat panel opens.
  const READ_PRIVATE_AT_PREFIX = "chat_read_private_at_";
  const READ_GROUP_AT_PREFIX = "chat_read_group_at_";

  // Helps satisfy TS `noUnusedLocals` / `noUnusedParameters` in different build configs.
  void READ_PRIVATE_AT_PREFIX;
  void READ_GROUP_AT_PREFIX;

  const safeSetTs = (key: string, value: number) => {
    try {
      const prev = Number(localStorage.getItem(key) || "0");
      const next = Math.max(Number.isFinite(prev) ? prev : 0, value);
      if (next <= prev) return false;
      localStorage.setItem(key, String(next));
      return true;
    } catch {
      // ignore storage errors
      return false;
    }
  };
  const [localReadVersion, setLocalReadVersion] = useState(0);
  const touchReadMark = () => setLocalReadVersion((v) => v + 1);

  const [active, setActive] = useState<ActiveConversation>({ kind: "private", dialogId: -1 });

  // General
  const [generalMessages, setGeneralMessages] = useState<ChatMessageItem[]>([]);
  const [generalLeft, setGeneralLeft] = useState(false);
  const [generalLoading, setGeneralLoading] = useState(false);
  const [generalSending, setGeneralSending] = useState(false);

  // Private
  const [privateDialogs, setPrivateDialogs] = useState<PrivateDialogItem[]>([]);
  const [selectedDialogId, setSelectedDialogId] = useState<number | null>(null);
  const [privateMessages, setPrivateMessages] = useState<ChatMessageItem[]>([]);
  const [dialogLoading, setDialogLoading] = useState(false);
  const [privateSending, setPrivateSending] = useState(false);

  // Group
  const [groupDialogs, setGroupDialogs] = useState<GroupDialogItem[]>([]);
  const [groupMessages, setGroupMessages] = useState<ChatMessageItem[]>([]);
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupSending, setGroupSending] = useState(false);
  const [stickerSending, setStickerSending] = useState(false);
  const [showPollCreate, setShowPollCreate] = useState(false);
  const [pollSending, setPollSending] = useState(false);
  const [pollVotingId, setPollVotingId] = useState<number | null>(null);
  const [reactionSavingId, setReactionSavingId] = useState<number | null>(null);
  const [reactionWho, setReactionWho] = useState<{
    messageId: number;
    emoji: string;
    loading: boolean;
    users: ChatUserShortResponse[];
    error: string;
  } | null>(null);
  const [chatFolders, setChatFolders] = useState<ChatFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<number | null>(null);
  const [showFolderCreate, setShowFolderCreate] = useState(false);
  const [folderCreateName, setFolderCreateName] = useState("");
  const [folderCreateSaving, setFolderCreateSaving] = useState(false);
  const [dialogFolderMenu, setDialogFolderMenu] = useState<{
    x: number;
    y: number;
    kind: "private" | "group";
    dialogId: number;
    title: string;
  } | null>(null);
  const [groupAckRequired, setGroupAckRequired] = useState(false);

  const [wallpaperResolvedUrl, setWallpaperResolvedUrl] = useState<string | null>(null);
  const [wallpaperId, setWallpaperId] = useState<number | null>(null);
  const [wallpaperCustomUrl, setWallpaperCustomUrl] = useState<string | null>(null);
  const [wallpaperSaving, setWallpaperSaving] = useState(false);
  const [chatWallpapers, setChatWallpapers] = useState<ChatWallpaperItem[]>([]);
  const [chatWallpapersLoading, setChatWallpapersLoading] = useState(false);

  const [botThreads, setBotThreads] = useState<ChatBotThreadItem[]>([]);
  const [botThreadsCollapsed, setBotThreadsCollapsed] = useState(() => {
    try {
      return localStorage.getItem("chat.botThreadsCollapsed") === "1";
    } catch {
      return false;
    }
  });
  const [botThreadClosing, setBotThreadClosing] = useState(false);
  const [botMessages, setBotMessages] = useState<ChatMessageItem[]>([]);
  const [botLoading, setBotLoading] = useState(false);
  const [botSending, setBotSending] = useState(false);
  const botSendLockRef = useRef(false);

  const [gigaChatVisible, setGigaChatVisible] = useState(false);
  const [gigaChatMessages, setGigaChatMessages] = useState<ChatMessageItem[]>([]);
  const [gigaChatLoading, setGigaChatLoading] = useState(false);
  const [gigaChatSending, setGigaChatSending] = useState(false);
  const gigaChatSendLockRef = useRef(false);
  const gigaChatAppliedIdsRef = useRef<Set<number>>(new Set());

  const [hasMoreOlderMessages, setHasMoreOlderMessages] = useState(true);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const generalMessagesRef = useRef(generalMessages);
  generalMessagesRef.current = generalMessages;
  const privateMessagesRef = useRef(privateMessages);
  privateMessagesRef.current = privateMessages;
  const groupMessagesRef = useRef(groupMessages);
  groupMessagesRef.current = groupMessages;
  const botMessagesRef = useRef(botMessages);
  botMessagesRef.current = botMessages;
  const gigaChatMessagesRef = useRef(gigaChatMessages);
  gigaChatMessagesRef.current = gigaChatMessages;
  const loadingOlderMessagesRef = useRef(false);
  loadingOlderMessagesRef.current = loadingOlderMessages;
  const hasMoreOlderMessagesRef = useRef(true);
  hasMoreOlderMessagesRef.current = hasMoreOlderMessages;
  const stickToBottomRef = useRef(true);
  const pendingInitialScrollKeyRef = useRef<string | null>(null);
  const loadOlderTopSentinelRef = useRef<HTMLDivElement | null>(null);
  const userScrollingRef = useRef(false);
  const userScrollEndTimerRef = useRef<number | null>(null);
  const touchActiveRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const userLeftBottomRef = useRef(false);
  const wasNearBottomRef = useRef(true);
  const loadOlderUserInitiatedRef = useRef(false);
  const prevLastMsgIdRef = useRef<number | null>(null);
  const [showLoadOlderAtTop, setShowLoadOlderAtTop] = useState(false);
  const [messagesScrollReady, setMessagesScrollReady] = useState(true);

  const generalSendLockRef = useRef(false);
  const privateSendLockRef = useRef(false);
  const groupSendLockRef = useRef(false);
  const tempMessageSeqRef = useRef(-1);

  // Group members modal
  const [showGroupMembers, setShowGroupMembers] = useState(false);
  const [groupMembersTab, setGroupMembersTab] = useState<"members" | "add" | "edit">("members");
  const [groupMembers, setGroupMembers] = useState<GroupMemberItem[]>([]);
  const [groupMembersLoading, setGroupMembersLoading] = useState(false);
  const [groupEditName, setGroupEditName] = useState("");
  const [groupEditImageUrl, setGroupEditImageUrl] = useState<string | null>(null);
  const [groupEditForbidExit, setGroupEditForbidExit] = useState(false);
  const [groupEditMembersSeeOwnOnly, setGroupEditMembersSeeOwnOnly] = useState(false);
  const [groupEditSaving, setGroupEditSaving] = useState(false);
  const [groupImageUploading, setGroupImageUploading] = useState(false);

  // Mobile: chat list overlay (на телефоне по умолчанию — список чатов)
  const [showChatList, setShowChatList] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(chatStackedLayoutMediaQuery(variant)).matches;
  });
  /** null = закрыто; main = профиль/группа; settings = настройки (как в Telegram) */
  const [chatInfoPanel, setChatInfoPanel] = useState<null | "main" | "settings" | "userProfile">(null);
  const [profileUserId, setProfileUserId] = useState<number | null>(null);
  const [chatUserProfile, setChatUserProfile] = useState<ChatUserProfileResponse | null>(null);
  const [chatUserProfileLoading, setChatUserProfileLoading] = useState(false);
  const [sharedMediaCategory, setSharedMediaCategory] = useState<ChatSharedMediaCategory | null>(null);
  const [highlightMessageId, setHighlightMessageId] = useState<number | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(chatStackedLayoutMediaQuery(variant)).matches;
  });
  const isMobileViewportRef = useRef(isMobileViewport);
  isMobileViewportRef.current = isMobileViewport;
  const openedByQueryRef = useRef<string>("");
  const openedByWidgetRef = useRef<string>("");
  const pendingOpenMessageIdRef = useRef<number | null>(null);

  // Group creation is available to everyone (member-add/remove is still restricted to group admins).

  const closeChatWidget = () => {
    window.dispatchEvent(new Event("chatwidget:close"));
  };

  useEffect(() => {
    const onFsChange = () => setBrowserFullscreen(document.fullscreenElement === chatShellRef.current);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    if (variant !== "widget") return;
    const onExpanded = (e: Event) => {
      const detail = (e as CustomEvent<{ expanded?: boolean }>).detail;
      setWidgetExpanded(Boolean(detail?.expanded));
    };
    window.addEventListener("chatwidget:expanded", onExpanded as EventListener);
    return () => window.removeEventListener("chatwidget:expanded", onExpanded as EventListener);
  }, [variant]);

  const toggleChatFullscreen = useCallback(async () => {
    if (variant === "widget") {
      window.dispatchEvent(new Event("chatwidget:toggle-expand"));
      return;
    }
    const el = chatShellRef.current;
    if (!el || typeof document === "undefined") return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      window.alert("Полноэкранный режим недоступен в этом браузере");
    }
  }, [variant]);

  const chatFullscreenExpanded = variant === "widget" ? widgetExpanded : browserFullscreen;
  const chatFullscreenTitle = chatFullscreenExpanded ? "Выйти из полноэкранного режима" : "На весь экран";

  const unreadPrivateById = useMemo(() => {
    const map = new Map<number, boolean>();
    for (const d of privateDialogs) {
      map.set(d.id, Boolean(d.has_unread));
    }
    return map;
  }, [privateDialogs, readVersion, localReadVersion]);

  const unreadGroupById = useMemo(() => {
    const map = new Map<number, boolean>();
    for (const d of groupDialogs) {
      map.set(d.id, Boolean(d.has_unread));
    }
    return map;
  }, [groupDialogs, readVersion, localReadVersion]);

  const activeDialogId = active.kind === "general" || active.kind === "bot" || active.kind === "gigachat" ? null : active.dialogId;
  const activeBotThreadId = active.kind === "bot" ? active.threadUserId : 0;
  const activeConversationKey = useMemo(() => {
    switch (active.kind) {
      case "general":
        return "general";
      case "bot":
        return `bot:${isAdmin ? activeBotThreadId : userId}`;
      case "gigachat":
        return "gigachat";
      case "private":
      case "group":
        return `${active.kind}:${active.dialogId}`;
      default:
        return "general";
    }
  }, [active, activeBotThreadId, isAdmin, userId]);

  const botComposerEnabled =
    active.kind === "bot" && (isAdmin ? activeBotThreadId > 0 : true);

  useEffect(() => {
    setChatInfoPanel(null);
    setSharedMediaCategory(null);
    setProfileUserId(null);
    setChatUserProfile(null);
  }, [active.kind, activeDialogId]);

  const profileTargetUserId = useMemo(() => {
    if (chatInfoPanel === "userProfile" && profileUserId != null) return profileUserId;
    if (chatInfoPanel === "main" && active.kind === "private") {
      const d = privateDialogs.find((x) => x.id === active.dialogId);
      return d?.other_user?.id ?? null;
    }
    return null;
  }, [chatInfoPanel, profileUserId, active, privateDialogs]);

  useEffect(() => {
    if (!chatInfoPanel || profileTargetUserId == null) {
      setChatUserProfile(null);
      return;
    }
    let cancelled = false;
    setChatUserProfileLoading(true);
    api.chat
      .userProfile(profileTargetUserId)
      .then((p) => {
        if (!cancelled) setChatUserProfile(p);
      })
      .catch(() => {
        if (!cancelled) setChatUserProfile(null);
      })
      .finally(() => {
        if (!cancelled) setChatUserProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chatInfoPanel, profileTargetUserId]);

  useEffect(() => {
    if (showGroupMembers) setChatInfoPanel(null);
  }, [showGroupMembers]);



  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const messagesContentRef = useRef<HTMLDivElement | null>(null);

  const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = "auto", force = false) => {
    const el = messagesScrollRef.current;
    if (!el) return;
    if (
      !force &&
      isMobileViewportRef.current &&
      (userScrollingRef.current || touchActiveRef.current)
    ) {
      return;
    }
    const top = Math.max(0, el.scrollHeight - el.clientHeight);
    programmaticScrollRef.current = true;
    if (behavior === "smooth") {
      el.scrollTo({ top, behavior: "smooth" });
    } else {
      el.scrollTop = top;
    }
    if (behavior === "auto" && !isMobileViewportRef.current) {
      requestAnimationFrame(() => {
        el.scrollTop = top;
        programmaticScrollRef.current = false;
      });
    } else {
      requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
      });
    }
  }, []);

  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const messageSearchInputRef = useRef<HTMLInputElement | null>(null);

  const searchNeedle = messageSearchQuery.trim().toLowerCase();
  const [activeSearchHitIdx, setActiveSearchHitIdx] = useState(0);

  const activeMessagesForSearch = useMemo(() => {
    if (active.kind === "general") return generalMessages;
    if (active.kind === "private") return privateMessages;
    if (active.kind === "bot") return botMessages;
    if (active.kind === "gigachat") return gigaChatMessages;
    return groupMessages;
  }, [active.kind, generalMessages, privateMessages, groupMessages, botMessages, gigaChatMessages]);

  useEffect(() => {
    chatHistoryLog("conversation", {
      key: activeConversationKey,
      hasMoreOlder: hasMoreOlderMessages,
      messages: chatHistoryMsgRange(activeMessagesForSearch),
    });
  }, [activeConversationKey, hasMoreOlderMessages, activeMessagesForSearch]);

  const searchHitIds = useMemo(() => {
    if (!searchNeedle) return [];
    const ids: number[] = [];
    for (const m of activeMessagesForSearch) {
      const t = (m.display_text || "").toLowerCase();
      if (t.includes(searchNeedle)) ids.push(m.id);
    }
    return ids;
  }, [activeMessagesForSearch, searchNeedle]);

  const searchHitIdSet = useMemo(() => new Set(searchHitIds), [searchHitIds]);

  const mergeMessagesById = (prev: ChatMessageItem[], incoming: ChatMessageItem[]) => {
    const byId = new Map<number, ChatMessageItem>();
    for (const m of prev) byId.set(m.id, m);
    for (const m of incoming) byId.set(m.id, m);
    return Array.from(byId.values()).sort((a, b) => a.id - b.id);
  };

  const jumpToMessage = useCallback(
    async (messageId: number) => {
      setChatInfoPanel(null);
      setSharedMediaCategory(null);
      setShowMessageSearch(false);

      const scrollAndHighlight = () => {
        const el = document.getElementById(`chat-msg-${messageId}`);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightMessageId(messageId);
        window.setTimeout(() => setHighlightMessageId((cur) => (cur === messageId ? null : cur)), 2800);
      };

      if (document.getElementById(`chat-msg-${messageId}`)) {
        requestAnimationFrame(() => requestAnimationFrame(scrollAndHighlight));
        return;
      }

      try {
        if (active.kind === "general") {
          const msgs = await api.chat.general.messages({ aroundId: messageId, limit: 120 });
          setGeneralMessages((prev) => mergeMessagesById(prev, msgs));
        } else if (active.kind === "private" && active.dialogId > 0) {
          const msgs = await api.chat.privateDialogs.messages(active.dialogId, {
            aroundId: messageId,
            limit: 120,
          });
          setPrivateMessages((prev) => mergeMessagesById(prev, msgs));
        } else if (active.kind === "group" && active.dialogId > 0) {
          const msgs = await api.chat.groupDialogs.messages(active.dialogId, {
            aroundId: messageId,
            limit: 120,
          });
          setGroupMessages((prev) => mergeMessagesById(prev, msgs));
        } else if (active.kind === "bot") {
          const tid = isAdmin ? active.threadUserId : userId;
          if (tid <= 0) return;
          const msgs = await api.chat.bot.messages(tid, { aroundId: messageId, limit: 120 });
          setBotMessages((prev) => mergeMessagesById(prev, msgs));
        } else {
          return;
        }
        setHasMoreOlderMessages(true);
        await new Promise<void>((r) => window.setTimeout(r, 80));
        requestAnimationFrame(() => requestAnimationFrame(scrollAndHighlight));
      } catch {
        /* ignore */
      }
    },
    [active],
  );

  const scrollToMessage = (messageId: number) => {
    void jumpToMessage(messageId);
  };

  const sharedMediaScope = useMemo((): ChatSharedMediaScope | null => {
    if (active.kind === "general") return { kind: "general" };
    if (active.kind === "private" && active.dialogId > 0) return { kind: "private", dialogId: active.dialogId };
    if (active.kind === "group" && active.dialogId > 0) return { kind: "group", dialogId: active.dialogId };
    return null;
  }, [active]);

  const messageJumpHighlightStyle = (messageId: number) => {
    const fromSearch = searchHitIdSet.has(messageId);
    const fromJump = highlightMessageId === messageId;
    const pending = messageId < 0;
    if (!fromSearch && !fromJump && !pending) return {};
    return {
      borderRadius: 16,
      outline: fromJump ? "2px solid rgba(87,157,255,0.55)" : "2px solid rgba(87,157,255,0.32)",
      backgroundColor: fromJump ? "rgba(87,157,255,0.12)" : "rgba(87,157,255,0.06)",
      padding: 6,
      marginBottom: 4,
      ...(pending ? { opacity: 0.72 } : {}),
    };
  };

  const composerSessionKey = useMemo(() => {
    if (active.kind === "general") return "general";
    if (active.kind === "bot") return `bot:${isAdmin ? activeBotThreadId : userId}`;
    return `${active.kind}:${activeDialogId ?? 0}`;
  }, [active.kind, activeDialogId, activeBotThreadId, isAdmin, userId]);

  const canEditMessage = (m: ChatMessageItem) => {
    if (!m.sender || m.sender.id !== userId) return false;
    if (m.is_deleted) return false;
    if (!m.created_at) return false;
    const d = new Date(m.created_at);
    if (Number.isNaN(d.getTime())) return false;
    return Date.now() <= d.getTime() + EDIT_WINDOW_MINUTES * 60_000;
  };

  const pollSnapshotKey = (p: ChatMessageItem["poll"]) => {
    if (!p) return "";
    return `${p.id}:${p.total_voters}:${p.my_option_ids.join(",")}:${p.options.map((o) => `${o.id}:${o.vote_count}`).join("|")}`;
  };

  const isSameMessage = (x: ChatMessageItem, y: ChatMessageItem) => {
    const norm = (v: string | null | undefined) => v ?? null;
    if (
      x.id !== y.id ||
      pollSnapshotKey(x.poll) !== pollSnapshotKey(y.poll) ||
      reactionsSnapshotKey(x.reactions) !== reactionsSnapshotKey(y.reactions) ||
      norm(x.display_text) !== norm(y.display_text) ||
      x.is_deleted !== y.is_deleted ||
      norm(x.edited_at) !== norm(y.edited_at) ||
      norm(x.created_at) !== norm(y.created_at) ||
      (x.is_read ?? false) !== (y.is_read ?? false) ||
      (x.read_count ?? 0) !== (y.read_count ?? 0) ||
      (x.recipient_count ?? 0) !== (y.recipient_count ?? 0) ||
      Boolean(x.ack_required) !== Boolean(y.ack_required) ||
      (x.ack_count ?? 0) !== (y.ack_count ?? 0) ||
      (x.ack_recipient_count ?? 0) !== (y.ack_recipient_count ?? 0) ||
      Boolean(x.user_acknowledged) !== Boolean(y.user_acknowledged) ||
      (x.sender?.id ?? null) !== (y.sender?.id ?? null) ||
      x.attachments.length !== y.attachments.length ||
      (x.reply_to_message_id ?? null) !== (y.reply_to_message_id ?? null) ||
      norm(x.reply_to_text) !== norm(y.reply_to_text) ||
      norm(x.reply_to_sender_name) !== norm(y.reply_to_sender_name) ||
      (x.reply_to_is_deleted ?? false) !== (y.reply_to_is_deleted ?? false)
    ) {
      return false;
    }
    for (let i = 0; i < x.attachments.length; i += 1) {
      const ax = x.attachments[i];
      const ay = y.attachments[i];
      if (
        ax.id !== ay.id ||
        ax.url !== ay.url ||
        ax.media_type !== ay.media_type ||
        (ax.filename ?? null) !== (ay.filename ?? null) ||
        (ax.mime_type ?? null) !== (ay.mime_type ?? null)
      ) {
        return false;
      }
    }
    return true;
  };

  const messageSendFingerprint = (m: ChatMessageItem): string => {
    const text = (m.display_text ?? "").trim();
    const att = m.attachments.map((a) => `${a.media_type}:${(a.filename ?? "").trim()}`).join(",");
    return `${m.sender?.id ?? 0}|${text}|${att}`;
  };

  const serverListHasPendingMatch = (pending: ChatMessageItem, server: ChatMessageItem[]): boolean => {
    const fp = messageSendFingerprint(pending);
    return server.some((n) => messageSendFingerprint(n) === fp);
  };

  const applySentChatMessage = (
    prev: ChatMessageItem[],
    tempId: number,
    sent: ChatMessageItem,
  ): ChatMessageItem[] => {
    const sentFp = messageSendFingerprint(sent);
    const next = prev
      .filter((m) => {
        if (m.id === tempId) return false;
        if (m.id < 0 && messageSendFingerprint(m) === sentFp) return false;
        return true;
      })
      .concat([sent]);
    return next.sort((a, b) => a.id - b.id);
  };

  const messageContentEqual = (x: ChatMessageItem, y: ChatMessageItem) => {
    const norm = (v: string | null | undefined) => v ?? null;
    if (
      x.id !== y.id ||
      pollSnapshotKey(x.poll) !== pollSnapshotKey(y.poll) ||
      norm(x.display_text) !== norm(y.display_text) ||
      x.is_deleted !== y.is_deleted ||
      norm(x.edited_at) !== norm(y.edited_at) ||
      norm(x.created_at) !== norm(y.created_at) ||
      (x.sender?.id ?? null) !== (y.sender?.id ?? null) ||
      x.attachments.length !== y.attachments.length ||
      (x.reply_to_message_id ?? null) !== (y.reply_to_message_id ?? null) ||
      norm(x.reply_to_text) !== norm(y.reply_to_text) ||
      norm(x.reply_to_sender_name) !== norm(y.reply_to_sender_name) ||
      (x.reply_to_is_deleted ?? false) !== (y.reply_to_is_deleted ?? false) ||
      Boolean(x.ack_required) !== Boolean(y.ack_required)
    ) {
      return false;
    }
    for (let i = 0; i < x.attachments.length; i += 1) {
      const ax = x.attachments[i];
      const ay = y.attachments[i];
      if (
        ax.id !== ay.id ||
        ax.url !== ay.url ||
        ax.media_type !== ay.media_type ||
        (ax.filename ?? null) !== (ay.filename ?? null) ||
        (ax.mime_type ?? null) !== (ay.mime_type ?? null)
      ) {
        return false;
      }
    }
    return true;
  };

  const mergeMessagesPreservingRefs = (prev: ChatMessageItem[], next: ChatMessageItem[]) => {
    if (prev.length === 0) return next;
    const prevById = new Map<number, ChatMessageItem>();
    for (const m of prev) prevById.set(m.id, m);

    let changed = prev.length !== next.length;
    const merged = next.map((m) => {
      const old = prevById.get(m.id);
      if (!old) {
        changed = true;
        return m;
      }
      if (messageContentEqual(old, m)) {
        return old;
      }
      if (isSameMessage(old, m)) return old;
      changed = true;
      return m;
    });

    const pending = prev.filter((m) => m.id < 0 && !serverListHasPendingMatch(m, next));
    if (pending.length === 0) {
      return changed ? merged : prev;
    }
    const combined = [...merged, ...pending].sort((a, b) => a.id - b.id);
    return combined;
  };

  const appendPolledMessages = (
    setMessages: React.Dispatch<React.SetStateAction<ChatMessageItem[]>>,
    incoming: ChatMessageItem[],
  ) => {
    if (incoming.length === 0) return;
    setMessages((prev) => mergeMessagesPreservingRefs(prev, mergeMessagesById(prev, incoming)));
  };

  const arePrivateDialogsEqual = (a: PrivateDialogItem[], b: PrivateDialogItem[]) => {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      const x = a[i];
      const y = b[i];
      if (
        x.id !== y.id ||
        x.last_message_at !== y.last_message_at ||
        x.last_message_text !== y.last_message_text ||
        x.other_user.id !== y.other_user.id ||
        x.other_user.display_name !== y.other_user.display_name ||
        x.other_user.username !== y.other_user.username ||
        x.other_user.avatar_url !== y.other_user.avatar_url
      ) {
        return false;
      }
    }
    return true;
  };

  const areGroupDialogsEqual = (a: GroupDialogItem[], b: GroupDialogItem[]) => {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      const x = a[i];
      const y = b[i];
      if (
        x.id !== y.id ||
        x.name !== y.name ||
        x.image_url !== y.image_url ||
        Boolean(x.forbid_exit) !== Boolean(y.forbid_exit) ||
        Boolean(x.is_channel) !== Boolean(y.is_channel) ||
        x.last_message_at !== y.last_message_at ||
        x.last_message_text !== y.last_message_text
      ) {
        return false;
      }
    }
    return true;
  };

  const loadGeneralMessages = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (silent) {
      const prev = generalMessagesRef.current;
      const lastId = getLastRealMessageId(prev);
      if (lastId == null) {
        if (prev.length > 0) return;
      } else {
        try {
          const newer = await api.chat.general.messages({
            afterId: lastId,
            limit: CHAT_MESSAGES_PAGE_SIZE,
          });
          appendPolledMessages(setGeneralMessages, newer);
        } catch {
          /* ignore poll errors */
        }
        return;
      }
    }
    if (!silent) setGeneralLoading(true);
    try {
      setGeneralLeft(false);
      const msgs = await api.chat.general.messages({ limit: CHAT_MESSAGES_PAGE_SIZE });
      setGeneralMessages(msgs);
      setHasMoreOlderMessages(msgs.length >= CHAT_MESSAGES_PAGE_SIZE);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка загрузки";
      if (msg.includes("вышли") || msg.includes("общего чата")) {
        setGeneralLeft(true);
        setGeneralMessages([]);
        setHasMoreOlderMessages(false);
      }
    } finally {
      if (!silent) setGeneralLoading(false);
    }
  };

  const loadGeneralStatus = async () => {
    try {
      const status = await api.chat.general.status();
      if (!status.is_member) setGeneralLeft(true);
    } catch {
      /* ignore */
    }
  };

  const requestSidebarUnreadRefresh = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("crm-chat-refresh-unread"));
  };

  const loadPrivateDialogs = async () => {
    const dialogs = await api.chat.privateDialogs.list();
    setPrivateDialogs((prev) => (arePrivateDialogsEqual(prev, dialogs) ? prev : dialogs));
    if (!isMobileViewport && selectedDialogId == null && dialogs.length > 0) {
      setSelectedDialogId(dialogs[0].id);
      if (active.kind !== "private") {
        setActive({ kind: "private", dialogId: dialogs[0].id });
      }
    }
  };

  const loadPrivateMessages = async (dialogId: number, opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (silent) {
      const prev = privateMessagesRef.current;
      const lastId = getLastRealMessageId(prev);
      if (lastId == null) {
        if (prev.length > 0) return;
      } else {
        try {
          const newer = await api.chat.privateDialogs.messages(dialogId, {
            afterId: lastId,
            limit: CHAT_MESSAGES_PAGE_SIZE,
          });
          appendPolledMessages(setPrivateMessages, newer);
          const lastIncomingTs = newer
            .filter((m) => (m.sender?.id ?? -1) !== userId)
            .reduce((acc, m) => {
              const ts = m.created_at ? Date.parse(m.created_at) : 0;
              return Number.isFinite(ts) ? Math.max(acc, ts) : acc;
            }, 0);
          if (lastIncomingTs > 0 && safeSetTs(`${READ_PRIVATE_AT_PREFIX}${dialogId}`, lastIncomingTs)) {
            touchReadMark();
          }
        } catch {
          /* ignore poll errors */
        }
        return;
      }
    }
    if (!silent) {
      setDialogLoading(true);
      setPrivateMessages([]);
    }
    try {
      const msgs = await api.chat.privateDialogs.messages(dialogId, { limit: CHAT_MESSAGES_PAGE_SIZE });
      setPrivateMessages(msgs);
      setHasMoreOlderMessages(msgs.length >= CHAT_MESSAGES_PAGE_SIZE);
      const lastIncomingTs = msgs
        .filter((m) => (m.sender?.id ?? -1) !== userId)
        .reduce((acc, m) => {
          const ts = m.created_at ? Date.parse(m.created_at) : 0;
          return Number.isFinite(ts) ? Math.max(acc, ts) : acc;
        }, 0);
      if (lastIncomingTs > 0 && safeSetTs(`${READ_PRIVATE_AT_PREFIX}${dialogId}`, lastIncomingTs)) {
        touchReadMark();
      }
    } finally {
      if (!silent) setDialogLoading(false);
    }
  };

  const loadGroupDialogs = async () => {
    const dialogs = await api.chat.groupDialogs.list();
    setGroupDialogs((prev) => (areGroupDialogsEqual(prev, dialogs) ? prev : dialogs));
  };

  const loadChatFolders = async () => {
    try {
      const list = await api.chat.folders.list();
      setChatFolders((prev) => {
        if (prev.length === list.length && prev.every((f, i) => f.id === list[i]?.id && f.name === list[i]?.name)) {
          return prev;
        }
        return list;
      });
      setActiveFolderId((cur) => (cur != null && !list.some((f) => f.id === cur) ? null : cur));
    } catch {
      /* ignore */
    }
  };

  const createChatFolder = async () => {
    const name = folderCreateName.trim();
    if (!name) {
      window.alert("Введите название папки");
      return;
    }
    setFolderCreateSaving(true);
    try {
      const folder = await api.chat.folders.create(name);
      setChatFolders((prev) => [...prev, folder]);
      setActiveFolderId(folder.id);
      setShowFolderCreate(false);
      setFolderCreateName("");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Не удалось создать папку");
    } finally {
      setFolderCreateSaving(false);
    }
  };

  const addDialogToFolder = async (folderId: number, kind: "private" | "group", dialogId: number) => {
    try {
      const item = await api.chat.folders.addItem(folderId, {
        chat_type: kind,
        private_dialog_id: kind === "private" ? dialogId : null,
        group_dialog_id: kind === "group" ? dialogId : null,
      });
      setChatFolders((prev) =>
        prev.map((f) =>
          f.id === folderId
            ? {
                ...f,
                items: f.items.some((it) => it.id === item.id)
                  ? f.items
                  : [...f.items, item],
              }
            : f,
        ),
      );
      setDialogFolderMenu(null);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Не удалось добавить в папку");
    }
  };

  const removeDialogFromFolder = async (folderId: number, itemId: number) => {
    try {
      await api.chat.folders.removeItem(folderId, itemId);
      setChatFolders((prev) =>
        prev.map((f) => (f.id === folderId ? { ...f, items: f.items.filter((it) => it.id !== itemId) } : f)),
      );
      setDialogFolderMenu(null);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Не удалось убрать из папки");
    }
  };

  const deleteChatFolder = async (folderId: number) => {
    if (!window.confirm("Удалить папку? Чаты останутся в общем списке.")) return;
    try {
      await api.chat.folders.delete(folderId);
      setChatFolders((prev) => prev.filter((f) => f.id !== folderId));
      if (activeFolderId === folderId) setActiveFolderId(null);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Не удалось удалить папку");
    }
  };

  const loadGroupMessages = async (dialogId: number, opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (silent) {
      const prev = groupMessagesRef.current;
      const lastId = getLastRealMessageId(prev);
      if (lastId == null) {
        if (prev.length > 0) return;
      } else {
        try {
          const newer = await api.chat.groupDialogs.messages(dialogId, {
            afterId: lastId,
            limit: CHAT_MESSAGES_PAGE_SIZE,
          });
          appendPolledMessages(setGroupMessages, newer);
          const lastIncomingTs = newer
            .filter((m) => (m.sender?.id ?? -1) !== userId)
            .reduce((acc, m) => {
              const ts = m.created_at ? Date.parse(m.created_at) : 0;
              return Number.isFinite(ts) ? Math.max(acc, ts) : acc;
            }, 0);
          if (lastIncomingTs > 0 && safeSetTs(`${READ_GROUP_AT_PREFIX}${dialogId}`, lastIncomingTs)) {
            touchReadMark();
          }
        } catch {
          /* ignore poll errors */
        }
        return;
      }
    }
    if (!silent) {
      setGroupLoading(true);
      setGroupMessages([]);
    }
    try {
      const msgs = await api.chat.groupDialogs.messages(dialogId, { limit: CHAT_MESSAGES_PAGE_SIZE });
      chatHistoryLog("group:initial load", {
        dialogId,
        range: chatHistoryMsgRange(msgs),
        hasMoreOlder: msgs.length >= CHAT_MESSAGES_PAGE_SIZE,
      });
      setGroupMessages(msgs);
      setHasMoreOlderMessages(msgs.length >= CHAT_MESSAGES_PAGE_SIZE);
      const lastIncomingTs = msgs
        .filter((m) => (m.sender?.id ?? -1) !== userId)
        .reduce((acc, m) => {
          const ts = m.created_at ? Date.parse(m.created_at) : 0;
          return Number.isFinite(ts) ? Math.max(acc, ts) : acc;
        }, 0);
      if (lastIncomingTs > 0 && safeSetTs(`${READ_GROUP_AT_PREFIX}${dialogId}`, lastIncomingTs)) {
        touchReadMark();
      }
    } finally {
      if (!silent) setGroupLoading(false);
    }
  };

  const loadBotThreads = async () => {
    if (!isAdmin) return;
    try {
      const threads = await api.chat.bot.threads();
      setBotThreads(threads);
    } catch {
      /* ignore */
    }
  };

  const toggleBotThreadsCollapsed = () => {
    setBotThreadsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("chat.botThreadsCollapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const openAdminBotThread = async (threadId: number) => {
    setActive({ kind: "bot", threadUserId: threadId });
    setShowChatList(false);
    setBotMessages([]);
    try {
      await loadBotMessages(threadId);
    } catch {
      /* loadBotMessages shows alert */
    }
  };

  const closeBotThread = async (threadId: number) => {
    if (!isAdmin || threadId <= 0) return;
    if (
      !window.confirm(
        "Закрыть обращение? Оно останется в списке как закрытое. Сотрудник сможет написать снова — обращение откроется автоматически.",
      )
    ) {
      return;
    }
    setBotThreadClosing(true);
    try {
      await api.chat.bot.closeThread(threadId);
      await loadBotThreads();
      if (active.kind === "bot" && activeBotThreadId === threadId) {
        setActive({ kind: "bot", threadUserId: 0 });
        setBotMessages([]);
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Не удалось закрыть обращение");
    } finally {
      setBotThreadClosing(false);
    }
  };

  const loadBotMessages = async (threadUserId: number, opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (threadUserId <= 0) return;
    const tid = isAdmin ? threadUserId : userId;
    if (silent) {
      const prev = botMessagesRef.current;
      const lastId = getLastRealMessageId(prev);
      if (lastId == null) {
        if (prev.length > 0) return;
      } else {
        try {
          const newer = await api.chat.bot.messages(tid, {
            afterId: lastId,
            limit: CHAT_MESSAGES_PAGE_SIZE,
          });
          appendPolledMessages(setBotMessages, newer);
          void api.chat.bot.markRead(tid).catch(() => undefined);
        } catch {
          /* ignore poll errors */
        }
        return;
      }
    }
    if (!silent) setBotLoading(true);
    try {
      const msgs = await api.chat.bot.messages(tid, { limit: CHAT_MESSAGES_PAGE_SIZE });
      setBotMessages(msgs);
      setHasMoreOlderMessages(msgs.length >= CHAT_MESSAGES_PAGE_SIZE);
      void api.chat.bot.markRead(tid).catch(() => undefined);
    } catch (e) {
      // Avoid silent "empty chat" when request fails.
      if (!silent) {
        console.error(e);
        window.alert(e instanceof Error ? e.message : "Не удалось загрузить обращения");
      }
    } finally {
      if (!silent) setBotLoading(false);
    }
  };

  const loadGigaChatVisibility = async () => {
    try {
      const cfg = await api.getGigaChatSettings();
      const enabled = Boolean(cfg.enabled);
      const visibleGroupIds = Array.isArray(cfg.visible_group_ids) ? cfg.visible_group_ids : [];
      const myGroups = Array.isArray(user?.group_ids) ? user!.group_ids! : [];
      const allowed = isAdmin || visibleGroupIds.some((id) => myGroups.includes(id));
      setGigaChatVisible(enabled && allowed);
      if (!enabled) return;
    } catch {
      setGigaChatVisible(false);
    }
  };

  const loadGigaChatMessages = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (silent) {
      const prev = gigaChatMessagesRef.current;
      const lastId = getLastRealMessageId(prev);
      if (lastId == null) {
        if (prev.length > 0) return;
      } else {
        try {
          const newer = await api.chat.gigachat.messages({
            afterId: lastId,
            limit: CHAT_MESSAGES_PAGE_SIZE,
          });
          appendPolledMessages(setGigaChatMessages, newer);
          void api.chat.gigachat.markRead().catch(() => undefined);
        } catch {
          /* ignore poll errors */
        }
        return;
      }
    }
    if (!silent) setGigaChatLoading(true);
    try {
      const msgs = await api.chat.gigachat.messages({ limit: CHAT_MESSAGES_PAGE_SIZE });
      setGigaChatMessages(msgs);
      setHasMoreOlderMessages(msgs.length >= CHAT_MESSAGES_PAGE_SIZE);
      void api.chat.gigachat.markRead().catch(() => undefined);
    } finally {
      if (!silent) setGigaChatLoading(false);
    }
  };

  useEffect(() => {
    if (active.kind !== "gigachat") return;
    if (gigaChatMessages.length === 0) return;
    const last = gigaChatMessages[gigaChatMessages.length - 1];
    if (!last || last.id <= 0) return;
    if (gigaChatAppliedIdsRef.current.has(last.id)) return;
    const text = (last.display_text || "").trim();
    const m = text.match(/^\[apply-training-article:([^\]]+)\]\s*\n([\s\S]*)$/);
    if (!m) return;
    const url = (m[1] || "").trim();
    const payloadText = (m[2] || "").trim();
    if (!url || !payloadText) return;
    gigaChatAppliedIdsRef.current.add(last.id);
    window.dispatchEvent(new CustomEvent("gigachat:apply-training-article", { detail: { url, text: payloadText } }));
  }, [active.kind, gigaChatMessages]);

  const loadOlderActiveMessages = useCallback(async () => {
    if (pendingInitialScrollKeyRef.current === activeConversationKey) {
      chatHistoryLog("loadOlder:skip initial scroll pending", { key: activeConversationKey });
      return;
    }

    const elBefore = messagesScrollRef.current;
    if (!elBefore || elBefore.scrollTop > CHAT_SCROLL_LOAD_THRESHOLD_PX) {
      chatHistoryLog("loadOlder:skip not at top", { scrollTop: elBefore?.scrollTop ?? null });
      return;
    }
    if (!userLeftBottomRef.current) {
      chatHistoryLog("loadOlder:skip user has not left bottom");
      return;
    }
    if (isMobileViewportRef.current && !loadOlderUserInitiatedRef.current) {
      chatHistoryLog("loadOlder:skip mobile without button");
      return;
    }

    chatHistoryLog("loadOlder:start", {
      kind: active.kind,
      dialogId: active.kind === "private" || active.kind === "group" ? active.dialogId : null,
      loading: loadingOlderMessagesRef.current,
      hasMoreOlder: hasMoreOlderMessagesRef.current,
    });

    if (loadingOlderMessagesRef.current) {
      chatHistoryLog("loadOlder:skip already loading");
      return;
    }

    let fetchOlder: ((beforeId: number) => Promise<ChatMessageItem[]>) | null = null;
    let setMessages: React.Dispatch<React.SetStateAction<ChatMessageItem[]>> | null = null;
    let getPrev: () => ChatMessageItem[] = () => [];
    let chatLabel: string = active.kind;

    if (active.kind === "general") {
      getPrev = () => generalMessagesRef.current;
      fetchOlder = (beforeId) => api.chat.general.messages({ beforeId, limit: CHAT_MESSAGES_PAGE_SIZE });
      setMessages = setGeneralMessages;
    } else if (active.kind === "private" && active.dialogId != null && active.dialogId > 0) {
      const dialogId = active.dialogId;
      chatLabel = `private:${dialogId}`;
      getPrev = () => privateMessagesRef.current;
      fetchOlder = (beforeId) =>
        api.chat.privateDialogs.messages(dialogId, { beforeId, limit: CHAT_MESSAGES_PAGE_SIZE });
      setMessages = setPrivateMessages;
    } else if (active.kind === "group" && active.dialogId != null && active.dialogId > 0) {
      const dialogId = active.dialogId;
      chatLabel = `group:${dialogId}`;
      getPrev = () => groupMessagesRef.current;
      fetchOlder = (beforeId) =>
        api.chat.groupDialogs.messages(dialogId, { beforeId, limit: CHAT_MESSAGES_PAGE_SIZE });
      setMessages = setGroupMessages;
    } else if (active.kind === "bot") {
      const tid = isAdmin ? activeBotThreadId : userId;
      if (tid <= 0) {
        chatHistoryLog("loadOlder:skip bot thread", { tid, isAdmin });
        return;
      }
      chatLabel = `bot:${tid}`;
      getPrev = () => botMessagesRef.current;
      fetchOlder = (beforeId) => api.chat.bot.messages(tid, { beforeId, limit: CHAT_MESSAGES_PAGE_SIZE });
      setMessages = setBotMessages;
    } else if (active.kind === "gigachat" && gigaChatVisible) {
      getPrev = () => gigaChatMessagesRef.current;
      fetchOlder = (beforeId) => api.chat.gigachat.messages({ beforeId, limit: CHAT_MESSAGES_PAGE_SIZE });
      setMessages = setGigaChatMessages;
    } else {
      chatHistoryLog("loadOlder:skip unsupported chat", {
        kind: active.kind,
        dialogId: active.kind === "private" || active.kind === "group" ? active.dialogId : null,
        gigaChatVisible,
      });
      return;
    }

    const prev = getPrev();
    const firstId = getFirstRealMessageId(prev);
    if (firstId == null || !fetchOlder || !setMessages) {
      chatHistoryLog("loadOlder:skip no firstId or fetcher", {
        chatLabel,
        prev: chatHistoryMsgRange(prev),
        firstId,
        hasFetcher: Boolean(fetchOlder),
        hasSetter: Boolean(setMessages),
      });
      return;
    }

    const el = messagesScrollRef.current;
    const prevScrollHeight = el?.scrollHeight ?? 0;
    const prevScrollTop = el?.scrollTop ?? 0;

    chatHistoryLog("loadOlder:fetch", {
      chatLabel,
      beforeId: firstId,
      prev: chatHistoryMsgRange(prev),
      scrollTop: prevScrollTop,
      scrollHeight: prevScrollHeight,
    });

    loadingOlderMessagesRef.current = true;
    setLoadingOlderMessages(true);
    try {
      const older = await fetchOlder(firstId);
      chatHistoryLog("loadOlder:response", {
        chatLabel,
        beforeId: firstId,
        received: older.length,
        range: chatHistoryMsgRange(older),
      });
      if (older.length === 0) {
        chatHistoryLog("loadOlder:done no more messages", { chatLabel, beforeId: firstId });
        setHasMoreOlderMessages(false);
        return;
      }
      setHasMoreOlderMessages(older.length >= CHAT_MESSAGES_PAGE_SIZE);
      setMessages((cur) => {
        const merged = mergeMessagesById(older, cur);
        chatHistoryLog("loadOlder:merged", {
          chatLabel,
          before: chatHistoryMsgRange(cur),
          after: chatHistoryMsgRange(merged),
        });
        return merged;
      });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const elAfter = messagesScrollRef.current;
          if (!elAfter) return;
          programmaticScrollRef.current = true;
          elAfter.scrollTop = Math.max(0, elAfter.scrollHeight - prevScrollHeight + prevScrollTop);
          requestAnimationFrame(() => {
            programmaticScrollRef.current = false;
          });
        });
      });
      chatHistoryLog("loadOlder:success", { chatLabel });
    } catch (e) {
      console.error("[chat-history] loadOlder:error", e);
    } finally {
      loadingOlderMessagesRef.current = false;
      setLoadingOlderMessages(false);
    }
  }, [active, activeBotThreadId, gigaChatVisible, isAdmin, userId, activeConversationKey]);

  const markUserScrolling = useCallback(() => {
    userScrollingRef.current = true;
    if (userScrollEndTimerRef.current != null) {
      window.clearTimeout(userScrollEndTimerRef.current);
    }
    userScrollEndTimerRef.current = window.setTimeout(() => {
      userScrollingRef.current = false;
      userScrollEndTimerRef.current = null;
    }, isMobileViewportRef.current ? 800 : 200);
  }, []);

  const onMessagesScroll = useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 120;
    if (!programmaticScrollRef.current) {
      markUserScrolling();
      if (nearBottom) {
        userLeftBottomRef.current = false;
        wasNearBottomRef.current = true;
      } else if (wasNearBottomRef.current && distanceFromBottom > CHAT_LEFT_BOTTOM_PX) {
        userLeftBottomRef.current = true;
        wasNearBottomRef.current = false;
      }
    }
    stickToBottomRef.current = nearBottom;
    const atTop =
      messagesScrollReady &&
      userLeftBottomRef.current &&
      el.scrollTop <= CHAT_SCROLL_LOAD_THRESHOLD_PX &&
      hasMoreOlderMessagesRef.current &&
      !loadingOlderMessagesRef.current;
    setShowLoadOlderAtTop(atTop);
  }, [markUserScrolling, messagesScrollReady]);

  const loadGroupMembers = async (dialogId: number) => {
    setGroupMembersLoading(true);
    try {
      const res = await api.chat.groupDialogs.members(dialogId);
      setGroupMembers(res);
    } finally {
      setGroupMembersLoading(false);
    }
  };

  useEffect(() => {
    if (
      isMobileViewport &&
      resolvedOpenTarget &&
      hasSpecificChatOpenTarget(resolvedOpenTarget)
    ) {
      setShowChatList(false);
    }
  }, [isMobileViewport, resolvedOpenTarget?.nonce, resolvedOpenTarget?.kind, resolvedOpenTarget?.dialogId, resolvedOpenTarget?.userId, resolvedOpenTarget?.messageId, resolvedOpenTarget?.threadUserId]);

  const prevMobileViewportRef = useRef<boolean | null>(null);
  useEffect(() => {
    const media = window.matchMedia(chatStackedLayoutMediaQuery(variant));
    const apply = () => setIsMobileViewport(media.matches);
    apply();
    const onChange = () => apply();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }
    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, [variant]);

  useEffect(() => {
    if (prevMobileViewportRef.current === null) {
      prevMobileViewportRef.current = isMobileViewport;
      return;
    }
    // При переходе desktop → mobile показываем список; не сбрасываем deep-link на конкретный чат.
    if (isMobileViewport && !prevMobileViewportRef.current) {
      setShowChatList(true);
    }
    prevMobileViewportRef.current = isMobileViewport;
  }, [isMobileViewport]);

  useEffect(() => {
    loadPrivateDialogs();
    loadGroupDialogs();
    void loadGeneralStatus();
    void loadChatFolders();
    void loadGigaChatVisibility();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return chatCallClient.subscribeState((s) => setCallBusy(s.status !== "idle"));
  }, []);

  useEffect(() => {
    const userIdRaw = searchParams.get("userId");
    const usernameRaw = searchParams.get("username");
    if (!userIdRaw && !usernameRaw) return;
    const targetKey = `${userIdRaw ?? ""}|${usernameRaw ?? ""}`;
    if (openedByQueryRef.current === targetKey) return;

    let cancelled = false;
    const openDialogFromQuery = async () => {
      try {
        let targetUserId: number | null = null;
        const parsedId = userIdRaw ? Number(userIdRaw) : NaN;
        if (Number.isFinite(parsedId) && parsedId > 0) {
          targetUserId = parsedId;
        } else if (usernameRaw) {
          const found = await api.chat.users(usernameRaw);
          const exact = found.find((u) => u.username.toLowerCase() === usernameRaw.toLowerCase());
          targetUserId = exact?.id ?? found[0]?.id ?? null;
        }
        if (!targetUserId) return;

        const res = await api.chat.privateDialogs.ensure(targetUserId);
        if (cancelled) return;
        setSelectedDialogId(res.id);
        setActive({ kind: "private", dialogId: res.id });
        await loadPrivateDialogs();
        await loadPrivateMessages(res.id);
        setShowChatList(false);
        openedByQueryRef.current = targetKey;
      } catch {
        // Ignore: user could be unavailable in chat.
      }
    };

    openDialogFromQuery();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileViewport, searchParams]);

  useEffect(() => {
    if (!resolvedOpenTarget) return;
    const t = resolvedOpenTarget;
    const targetKey = `${t.nonce}|${t.kind}|${t.dialogId ?? ""}|${t.messageId ?? ""}|${t.userId ?? ""}|${t.username ?? ""}|${t.threadUserId ?? ""}`;
    if (openedByWidgetRef.current === targetKey) return;

    let cancelled = false;
    const openFromTarget = async () => {
      try {
        if (isMobileViewport && !hasSpecificChatOpenTarget(t)) {
          setActive({ kind: "private", dialogId: -1 });
          setShowChatList(true);
          if (!cancelled) openedByWidgetRef.current = targetKey;
          return;
        }

        const messageId = t.messageId;
        if (messageId) pendingOpenMessageIdRef.current = messageId;
        if (t.kind === "general") {
          setActive({ kind: "general" });
          await loadGeneralMessages();
          if (isMobileViewport) setShowChatList(!messageId);
          else setShowChatList(false);
        } else if (t.kind === "group" && t.dialogId) {
          setActive({ kind: "group", dialogId: t.dialogId });
          await loadGroupDialogs();
          await loadGroupMessages(t.dialogId);
          setShowChatList(false);
        } else if (t.kind === "bot") {
          const threadId = t.threadUserId ?? (isAdmin ? 0 : userId);
          if (threadId > 0) {
            setActive({ kind: "bot", threadUserId: threadId });
            await loadBotMessages(threadId);
            if (isAdmin) await loadBotThreads();
            setShowChatList(false);
          }
        } else if (t.kind === "private") {
          let targetUserId: number | null = null;
          if (t.dialogId) {
            setSelectedDialogId(t.dialogId);
            setActive({ kind: "private", dialogId: t.dialogId });
            await loadPrivateDialogs();
            await loadPrivateMessages(t.dialogId);
            setShowChatList(false);
            if (!cancelled) openedByWidgetRef.current = targetKey;
            return;
          }
          const parsedId = t.userId ? Number(t.userId) : NaN;
          if (Number.isFinite(parsedId) && parsedId > 0) {
            targetUserId = parsedId;
          } else if (t.username) {
            const found = await api.chat.users(t.username);
            const exact = found.find((u) => u.username.toLowerCase() === t.username!.toLowerCase());
            targetUserId = exact?.id ?? found[0]?.id ?? null;
          }
          if (!targetUserId) return;

          const res = await api.chat.privateDialogs.ensure(targetUserId);
          if (cancelled) return;
          setSelectedDialogId(res.id);
          setActive({ kind: "private", dialogId: res.id });
          await loadPrivateDialogs();
          await loadPrivateMessages(res.id);
          setShowChatList(false);
        }
        if (!cancelled) openedByWidgetRef.current = targetKey;
      } catch {
        // Ignore: target could be unavailable.
      }
    };

    openFromTarget();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isMobileViewport,
    resolvedOpenTarget?.nonce,
    resolvedOpenTarget?.kind,
    resolvedOpenTarget?.dialogId,
    resolvedOpenTarget?.messageId,
    resolvedOpenTarget?.userId,
    resolvedOpenTarget?.username,
    resolvedOpenTarget?.threadUserId,
  ]);

  useEffect(() => {
    const messageId = pendingOpenMessageIdRef.current;
    if (!messageId) return;

    const activeLoading =
      active.kind === "general"
        ? generalLoading
        : active.kind === "private"
          ? dialogLoading
          : active.kind === "group"
            ? groupLoading
            : active.kind === "bot"
              ? botLoading
              : active.kind === "gigachat"
                ? gigaChatLoading
                : false;
    if (activeLoading) return;

    pendingOpenMessageIdRef.current = null;
    void jumpToMessage(messageId);
  }, [
    active.kind,
    activeDialogId,
    activeBotThreadId,
    generalLoading,
    dialogLoading,
    groupLoading,
    botLoading,
    gigaChatLoading,
    generalMessages.length,
    privateMessages.length,
    groupMessages.length,
    botMessages.length,
    gigaChatMessages.length,
    jumpToMessage,
  ]);

  useEffect(() => {
    if (active.kind === "private" && active.dialogId != null) {
      if (active.dialogId > 0) {
        loadPrivateMessages(active.dialogId);
      }
    }
    if (active.kind === "group" && active.dialogId != null) {
      if (active.dialogId > 0) {
        loadGroupMessages(active.dialogId);
      }
    }
    if (active.kind === "bot") {
      if (isAdmin) void loadBotThreads();
      const tid = isAdmin ? active.threadUserId : userId;
      if (tid > 0) {
        setBotMessages([]);
        void loadBotMessages(tid);
      } else setBotMessages([]);
    }
    if (active.kind === "gigachat") {
      if (!gigaChatVisible) return;
      setGigaChatMessages([]);
      void loadGigaChatMessages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.kind, activeDialogId, activeBotThreadId, isAdmin, userId, gigaChatVisible]);

  useEffect(() => {
    return chatCallClient.subscribeCallEnded(({ dialogId, kind }) => {
      if (kind !== "private" || dialogId <= 0) return;
      void loadPrivateDialogs();
      if (active.kind === "private" && active.dialogId === dialogId) {
        void loadPrivateMessages(dialogId, { silent: true });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.kind, active.kind === "private" ? active.dialogId : 0]);

  useEffect(() => {
    const pollMs = () => (typeof document !== "undefined" && document.hidden ? 30000 : 8000);
    const tick = () => {
      if (isChatVoicePlayingNow() || isAnyChatVideoNotePlaying()) return;
      // Новые диалоги и группы — без перезагрузки страницы.
      void loadPrivateDialogs();
      void loadGroupDialogs();
      void loadGeneralStatus();
      void loadChatFolders();

      // Поллинг всегда выполняем "тихо", чтобы не дёргать UI индикаторами загрузки.
      const silent = true;

      if (active.kind === "general") {
        if (!generalLeft) void loadGeneralMessages({ silent });
      } else if (active.kind === "private") {
        if (activeDialogId != null && activeDialogId > 0) void loadPrivateMessages(activeDialogId, { silent });
      } else if (active.kind === "group") {
        if (activeDialogId != null && activeDialogId > 0) void loadGroupMessages(activeDialogId, { silent });
      } else if (active.kind === "bot") {
        if (isAdmin) void loadBotThreads();
        const tid = isAdmin ? activeBotThreadId : userId;
        if (tid > 0) void loadBotMessages(tid, { silent });
      } else if (active.kind === "gigachat") {
        if (gigaChatVisible) void loadGigaChatMessages({ silent });
      }
    };
    tick();
    let id = window.setInterval(tick, pollMs());
    const onVisibility = () => {
      tick();
      window.clearInterval(id);
      id = window.setInterval(tick, pollMs());
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.kind, activeDialogId, activeBotThreadId, generalLeft, isAdmin, userId, gigaChatVisible]);

  // Mark messages as read when viewing a chat (whole dialog, not only loaded page)
  useEffect(() => {
    if (!userId) return;

    const markRead = async () => {
      try {
        if (active.kind === "general") {
          if (generalLeft) return;
          await api.chat.general.markRead();
        } else if (active.kind === "private" && activeDialogId != null && activeDialogId > 0) {
          await api.chat.privateDialogs.markRead(activeDialogId);
        } else if (active.kind === "group" && activeDialogId != null && activeDialogId > 0) {
          await api.chat.groupDialogs.markRead(activeDialogId);
        } else if (active.kind === "bot" && botComposerEnabled) {
          const tid = isAdmin ? activeBotThreadId : userId;
          if (tid > 0) await api.chat.bot.markRead(tid);
          else return;
        } else if (active.kind === "gigachat") {
          await api.chat.gigachat.markRead();
        } else {
          return;
        }
        requestSidebarUnreadRefresh();
        if (active.kind !== "general") void loadGeneralStatus();
      } catch {
        /* ignore mark-read errors */
      }
    };

    void markRead();
  }, [activeConversationKey, active.kind, activeDialogId, activeBotThreadId, botComposerEnabled, isAdmin, userId, generalLeft]);

  useLayoutEffect(() => {
    if (imageLightbox) return;
    const pendingKey = pendingInitialScrollKeyRef.current;
    if (!pendingKey || pendingKey !== activeConversationKey) return;

    const activeLoading =
      active.kind === "general"
        ? generalLoading
        : active.kind === "private"
          ? dialogLoading
          : active.kind === "bot"
            ? botLoading
            : active.kind === "gigachat"
              ? gigaChatLoading
              : groupLoading;

    const msgCount =
      active.kind === "general"
        ? generalMessages.length
        : active.kind === "private"
          ? privateMessages.length
          : active.kind === "bot"
            ? botMessages.length
            : active.kind === "gigachat"
              ? gigaChatMessages.length
              : groupMessages.length;

    if (activeLoading) return;

    if (msgCount === 0) {
      pendingInitialScrollKeyRef.current = null;
      setMessagesScrollReady(true);
      return;
    }

    const el = messagesScrollRef.current;
    if (!el) return;

    let finished = false;
    let timeoutId = 0;
    let rafId = 0;
    let lateTimeoutId = 0;
    let lateTimeoutId2 = 0;

    const finishInitialScroll = () => {
      if (finished) return;
      finished = true;
      pendingInitialScrollKeyRef.current = null;
      setMessagesScrollReady(true);
      observer?.disconnect();
      observer = null;
      stickToBottomRef.current = true;
      const elNow = messagesScrollRef.current;
      if (elNow) {
        const dist = elNow.scrollHeight - elNow.scrollTop - elNow.clientHeight;
        stickToBottomRef.current = dist < 120;
      }
      if (timeoutId) window.clearTimeout(timeoutId);
      if (lateTimeoutId) window.clearTimeout(lateTimeoutId);
      if (lateTimeoutId2) window.clearTimeout(lateTimeoutId2);
    };

    const tryScrollToBottom = () => {
      if (finished || pendingInitialScrollKeyRef.current !== activeConversationKey) return;
      if (userScrollingRef.current || touchActiveRef.current) return;
      scrollMessagesToBottom("auto", true);
      const elNow = messagesScrollRef.current;
      if (elNow && elNow.scrollHeight - elNow.scrollTop - elNow.clientHeight < 16) {
        finishInitialScroll();
      }
    };

    let observer: ResizeObserver | null = null;
    const observeTarget = isMobileViewportRef.current ? null : messagesContentRef.current;
    if (observeTarget && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => tryScrollToBottom());
      observer.observe(observeTarget);
    }

    tryScrollToBottom();
    rafId = requestAnimationFrame(() => {
      requestAnimationFrame(tryScrollToBottom);
    });
    lateTimeoutId = window.setTimeout(tryScrollToBottom, 80);
    lateTimeoutId2 = window.setTimeout(tryScrollToBottom, isMobileViewportRef.current ? 200 : 250);
    timeoutId = window.setTimeout(() => {
      if (!userScrollingRef.current && !touchActiveRef.current) tryScrollToBottom();
      finishInitialScroll();
    }, isMobileViewportRef.current ? 700 : 1200);

    return () => {
      observer?.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
      if (timeoutId) window.clearTimeout(timeoutId);
      if (lateTimeoutId) window.clearTimeout(lateTimeoutId);
      if (lateTimeoutId2) window.clearTimeout(lateTimeoutId2);
    };
  }, [
    activeConversationKey,
    active.kind,
    generalLoading,
    dialogLoading,
    groupLoading,
    botLoading,
    gigaChatLoading,
    generalMessages.length,
    privateMessages.length,
    groupMessages.length,
    botMessages.length,
    gigaChatMessages.length,
    scrollMessagesToBottom,
    imageLightbox,
  ]);

  useLayoutEffect(() => {
    if (imageLightbox) return;
    if (pendingInitialScrollKeyRef.current === activeConversationKey) return;
    if (userScrollingRef.current || touchActiveRef.current) return;
    if (isMobileViewportRef.current && userLeftBottomRef.current) return;
    if (isChatVoicePlayingNow() || isAnyChatVideoNotePlaying()) return;
    const activeEl = document.activeElement as HTMLElement | null;
    if (activeEl?.closest("[data-chat-composer]")) return;
    if (loadingOlderMessages) return;
    if (!stickToBottomRef.current) return;

    const activeLoading =
      active.kind === "general"
        ? generalLoading
        : active.kind === "private"
          ? dialogLoading
          : active.kind === "bot"
            ? botLoading
            : active.kind === "gigachat"
              ? gigaChatLoading
              : groupLoading;
    if (activeLoading) return;

    const lastId = getLastRealMessageId(activeMessagesForSearch);
    if (lastId == null) return;

    const prevLastId = prevLastMsgIdRef.current;
    prevLastMsgIdRef.current = lastId;
    if (prevLastId != null && lastId === prevLastId) return;

    scrollMessagesToBottom("auto");
  }, [
    activeConversationKey,
    active.kind,
    activeMessagesForSearch,
    generalLoading,
    dialogLoading,
    groupLoading,
    botLoading,
    gigaChatLoading,
    loadingOlderMessages,
    scrollMessagesToBottom,
    imageLightbox,
  ]);

  useEffect(() => {
    // Чтобы фильтр не применялся к другому диалогу/типу чата.
    setMessageSearchQuery("");
    setShowMessageSearch(false);
    setActiveSearchHitIdx(0);
    setMessageMenu(null);
    setReplyTo(null);
    setForwardSourceMessages(null);
    setMessageSelectionMode(false);
    setSelectedMessageIds([]);
    setHasMoreOlderMessages(true);
    setLoadingOlderMessages(false);
    stickToBottomRef.current = true;
    setShowLoadOlderAtTop(false);
    setMessagesScrollReady(false);
    userLeftBottomRef.current = false;
    wasNearBottomRef.current = false;
    prevLastMsgIdRef.current = null;
    pendingInitialScrollKeyRef.current = activeConversationKey;
  }, [active.kind, activeDialogId, activeBotThreadId, activeConversationKey]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!showUserFinder) return;
      const s = finderQuery.trim();
      if (s.length < 2) {
        setFinderResults([]);
        return;
      }
      setFinderLoading(true);
      try {
        const res = await api.chat.users(s);
        if (!cancelled) setFinderResults(res);
      } finally {
        if (!cancelled) setFinderLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [finderQuery, showUserFinder]);

  useEffect(() => {
    const lock = showUserFinder || showGroupCreateWizard || Boolean(forwardSourceMessages?.length);
    if (!lock) return;

    // Robust background scroll lock while keeping inner modal scroll working.
    const body = document.body;
    const scrollY = window.scrollY || 0;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      touchAction: body.style.touchAction,
    };

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    // NOTE: don't set touchAction="none" — it breaks scrolling inside iOS modals.

    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      body.style.touchAction = prev.touchAction;
      window.scrollTo(0, scrollY);
    };
  }, [showUserFinder, showGroupCreateWizard, forwardSourceMessages]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMessageMenu(null);
        if (messageSelectionMode) {
          setMessageSelectionMode(false);
          setSelectedMessageIds([]);
        }
      }
    };
    const onClick = (e: MouseEvent) => {
      if (Date.now() < messageMenuIgnoreClickUntilRef.current) return;
      const target = e.target as HTMLElement | null;
      if (target && target.closest && target.closest("[data-chat-message-menu]")) return;
      setMessageMenu(null);

    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
    };
  }, []);

  useEffect(() => {
    if (!showMessageSearch) return;
    const t = window.setTimeout(() => {
      messageSearchInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [showMessageSearch]);

  useEffect(() => {
    setActiveSearchHitIdx(0);
    if (!searchNeedle) return;
    if (searchHitIds.length === 0) return;
    scrollToMessage(searchHitIds[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchNeedle, searchHitIds.length, active.kind, activeDialogId]);

  // (removed canCreateGroup logic)

  useEffect(() => {
    if (active.kind !== "group") return;
    const dialogId = activeDialogId;
    if (dialogId == null || dialogId <= 0) return;
    void loadGroupMembers(dialogId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.kind, activeDialogId]);

  useEffect(() => {
    if (!showGroupMembers) return;
    if (active.kind !== "group") return;
    const dialogId = activeDialogId;
    if (dialogId == null || dialogId <= 0) return;
    loadGroupMembers(dialogId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGroupMembers, active.kind, activeDialogId]);

  useEffect(() => {
    if (!showGroupMembers || active.kind !== "group") return;
    const current = groupDialogs.find((d) => d.id === active.dialogId);
    setGroupEditName(current?.name || "");
    setGroupEditImageUrl(current?.image_url ?? null);
    setGroupEditForbidExit(Boolean(current?.forbid_exit));
    setGroupEditMembersSeeOwnOnly(Boolean(current?.members_see_own_only));
    // Важно: не зависим от groupDialogs, чтобы периодический авто-рефреш
    // не затирал локально выбранную (но ещё не сохранённую) картинку.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGroupMembers, active.kind, activeDialogId]);

  useEffect(() => {
    // Закрываем модалку, если пользователь ушёл из группового чата.
    if (active.kind !== "group") setShowGroupMembers(false);
  }, [active.kind]);

  useEffect(() => {
    if (!showGroupMembers) {
      setAddMemberPending(new Map());
      setAddMemberSubmitting(false);
    } else if (groupMembersTab !== "add") {
      setAddMemberPending(new Map());
    }
  }, [showGroupMembers, groupMembersTab]);

  const onSendGeneral = async ({ text, files: allowedFiles }: ComposerSendPayload) => {
    if (generalSendLockRef.current) return;

    const senderName =
      [user?.last_name, user?.first_name].filter((v) => typeof v === "string" && v.trim().length > 0).join(" ").trim() ||
      user?.username ||
      "Вы";
    const tempId = tempMessageSeqRef.current--;
    const tempMsg: ChatMessageItem = {
      id: tempId,
      private_dialog_id: null,
      group_dialog_id: null,
      sender: {
        id: userId,
        username: user?.username || "me",
        display_name: senderName,
        avatar_url: user?.avatar_url ?? null,
      },
      display_text: text,
      is_deleted: false,
      created_at: new Date().toISOString(),
      edited_at: null,
      attachments: allowedFiles.map((f, idx) => ({
        id: tempId * 1000 - idx - 1,
        url: URL.createObjectURL(f),
        media_type: mediaFromFile(f) || "image",
        filename: f.name,
        mime_type: f.type,
        created_at: new Date().toISOString(),
      })),
      reply_to_message_id: replyTo?.id ?? null,
      reply_to_text: replyTo?.text ?? null,
      reply_to_sender_name: replyTo?.senderName ?? null,
      reply_to_is_deleted: replyTo?.isDeleted ?? false,
      is_read: false,
    };
    setGeneralMessages((prev) => [...prev, tempMsg]);
    scrollMessagesToBottom("smooth", true);
    generalSendLockRef.current = true;
    setGeneralSending(true);
    try {
      const sent = await api.chat.general.send(text, allowedFiles, replyTo?.id ?? null);
      setReplyTo(null);
      setGeneralMessages((prev) => applySentChatMessage(prev, tempId, sent));
      scrollMessagesToBottom("smooth", true);
    } catch (e) {
      setGeneralMessages((prev) => prev.filter((m) => m.id !== tempId));
      const msg = e instanceof Error ? e.message : "Ошибка отправки сообщения";
      window.alert(msg);
    } finally {
      setGeneralSending(false);
      generalSendLockRef.current = false;
    }
  };

  const onSendPrivate = async ({ text, files: allowedFiles }: ComposerSendPayload) => {
    if (privateSendLockRef.current) return;
    const dialogId = selectedDialogId;
    if (dialogId == null) return;

    const senderName =
      [user?.last_name, user?.first_name].filter((v) => typeof v === "string" && v.trim().length > 0).join(" ").trim() ||
      user?.username ||
      "Вы";
    const tempId = tempMessageSeqRef.current--;
    const tempMsg: ChatMessageItem = {
      id: tempId,
      private_dialog_id: dialogId,
      group_dialog_id: null,
      sender: {
        id: userId,
        username: user?.username || "me",
        display_name: senderName,
        avatar_url: user?.avatar_url ?? null,
      },
      display_text: text,
      is_deleted: false,
      created_at: new Date().toISOString(),
      edited_at: null,
      attachments: allowedFiles.map((f, idx) => ({
        id: tempId * 1000 - idx - 1,
        url: URL.createObjectURL(f),
        media_type: mediaFromFile(f) || "image",
        filename: f.name,
        mime_type: f.type,
        created_at: new Date().toISOString(),
      })),
      reply_to_message_id: replyTo?.id ?? null,
      reply_to_text: replyTo?.text ?? null,
      reply_to_sender_name: replyTo?.senderName ?? null,
      reply_to_is_deleted: replyTo?.isDeleted ?? false,
      is_read: false,
    };
    setPrivateMessages((prev) => [...prev, tempMsg]);
    scrollMessagesToBottom("smooth", true);
    privateSendLockRef.current = true;
    setPrivateSending(true);
    try {
      const sent = await api.chat.privateDialogs.send(dialogId, text, allowedFiles, replyTo?.id ?? null);
      const sentTs = sent.created_at ? Date.parse(sent.created_at) : Date.now();
      if (Number.isFinite(sentTs) && safeSetTs(`${READ_PRIVATE_AT_PREFIX}${dialogId}`, sentTs)) {
        touchReadMark();
      }
      setReplyTo(null);
      setPrivateMessages((prev) => applySentChatMessage(prev, tempId, sent));
      void loadPrivateDialogs();
      scrollMessagesToBottom("smooth", true);
    } catch (e) {
      setPrivateMessages((prev) => prev.filter((m) => m.id !== tempId));
      const msg = e instanceof Error ? e.message : "Ошибка отправки сообщения";
      window.alert(msg);
    } finally {
      setPrivateSending(false);
      privateSendLockRef.current = false;
    }
  };

  const onSendGroup = async ({ text, files: allowedFiles }: ComposerSendPayload) => {
    if (groupSendLockRef.current) return;
    if (active.kind !== "group") return;
    const dialogId = active.dialogId;

    const senderName =
      [user?.last_name, user?.first_name].filter((v) => typeof v === "string" && v.trim().length > 0).join(" ").trim() ||
      user?.username ||
      "Вы";
    const tempId = tempMessageSeqRef.current--;
    const tempMsg: ChatMessageItem = {
      id: tempId,
      private_dialog_id: null,
      group_dialog_id: dialogId,
      sender: {
        id: userId,
        username: user?.username || "me",
        display_name: senderName,
        avatar_url: user?.avatar_url ?? null,
      },
      display_text: text,
      is_deleted: false,
      created_at: new Date().toISOString(),
      edited_at: null,
      attachments: allowedFiles.map((f, idx) => ({
        id: tempId * 1000 - idx - 1,
        url: URL.createObjectURL(f),
        media_type: mediaFromFile(f) || "image",
        filename: f.name,
        mime_type: f.type,
        created_at: new Date().toISOString(),
      })),
      reply_to_message_id: replyTo?.id ?? null,
      reply_to_text: replyTo?.text ?? null,
      reply_to_sender_name: replyTo?.senderName ?? null,
      reply_to_is_deleted: replyTo?.isDeleted ?? false,
      is_read: false,
      ack_required: groupAckRequired,
    };
    setGroupMessages((prev) => [...prev, tempMsg]);
    scrollMessagesToBottom("smooth", true);
    groupSendLockRef.current = true;
    setGroupSending(true);
    try {
      const sent = await api.chat.groupDialogs.send(
        dialogId,
        text,
        allowedFiles,
        replyTo?.id ?? null,
        groupAckRequired,
      );
      const sentTs = sent.created_at ? Date.parse(sent.created_at) : Date.now();
      if (Number.isFinite(sentTs) && safeSetTs(`${READ_GROUP_AT_PREFIX}${dialogId}`, sentTs)) {
        touchReadMark();
      }
      setReplyTo(null);
      setGroupMessages((prev) => applySentChatMessage(prev, tempId, sent));
      void loadGroupDialogs();
      scrollMessagesToBottom("smooth", true);
    } catch (e) {
      setGroupMessages((prev) => prev.filter((m) => m.id !== tempId));
      const msg = e instanceof Error ? e.message : "Ошибка отправки сообщения";
      window.alert(msg);
    } finally {
      setGroupSending(false);
      groupSendLockRef.current = false;
    }
  };

  const onSendBot = async ({ text, files: allowedFiles }: ComposerSendPayload) => {
    if (botSendLockRef.current || !botComposerEnabled) return;
    const threadId = isAdmin ? activeBotThreadId : userId;
    if (threadId <= 0) return;
    const senderName =
      [user?.last_name, user?.first_name].filter((v) => typeof v === "string" && v.trim().length > 0).join(" ").trim() ||
      user?.username ||
      "Вы";
    const tempId = tempMessageSeqRef.current--;
    const tempMsg: ChatMessageItem = {
      id: tempId,
      private_dialog_id: null,
      group_dialog_id: null,
      bot_thread_user_id: threadId,
      sender: {
        id: userId,
        username: user?.username || "me",
        display_name: senderName,
        avatar_url: user?.avatar_url ?? null,
      },
      display_text: text,
      is_deleted: false,
      created_at: new Date().toISOString(),
      edited_at: null,
      attachments: allowedFiles.map((f, idx) => ({
        id: tempId * 1000 - idx - 1,
        url: URL.createObjectURL(f),
        media_type: mediaFromFile(f) || "image",
        filename: f.name,
        mime_type: f.type,
        created_at: new Date().toISOString(),
      })),
      reply_to_message_id: replyTo?.id ?? null,
      reply_to_text: replyTo?.text ?? null,
      reply_to_sender_name: replyTo?.senderName ?? null,
      reply_to_is_deleted: replyTo?.isDeleted ?? false,
      is_read: false,
    };
    setBotMessages((prev) => [...prev, tempMsg]);
    scrollMessagesToBottom("smooth", true);
    botSendLockRef.current = true;
    setBotSending(true);
    try {
      const sent = await api.chat.bot.send(text, allowedFiles, {
        threadUserId: isAdmin ? threadId : undefined,
        replyToMessageId: replyTo?.id ?? null,
      });
      setReplyTo(null);
      setBotMessages((prev) => applySentChatMessage(prev, tempId, sent));
      if (isAdmin) void loadBotThreads();
      scrollMessagesToBottom("smooth", true);
    } catch (e) {
      setBotMessages((prev) => prev.filter((m) => m.id !== tempId));
      window.alert(e instanceof Error ? e.message : "Ошибка отправки сообщения");
    } finally {
      setBotSending(false);
      botSendLockRef.current = false;
    }
  };

  const onSendGigaChat = async ({ text, files: allowedFiles }: ComposerSendPayload) => {
    if (gigaChatSendLockRef.current || !gigaChatVisible) return;
    if (!text || !text.trim()) return;
    if (allowedFiles.length > 0) {
      window.alert("GigaChat: вложения пока не поддерживаются.");
      return;
    }
    const safeText = text;
    const senderName =
      [user?.last_name, user?.first_name].filter((v) => typeof v === "string" && v.trim().length > 0).join(" ").trim() ||
      user?.username ||
      "Вы";
    const tempId = tempMessageSeqRef.current--;
    const tempMsg: ChatMessageItem = {
      id: tempId,
      private_dialog_id: null,
      group_dialog_id: null,
      sender: {
        id: userId,
        username: user?.username || "me",
        display_name: senderName,
        avatar_url: user?.avatar_url ?? null,
      },
      display_text: safeText,
      is_deleted: false,
      created_at: new Date().toISOString(),
      edited_at: null,
      attachments: [],
      reply_to_message_id: null,
      reply_to_text: null,
      reply_to_sender_name: null,
      reply_to_is_deleted: false,
      is_read: false,
    };
    setGigaChatMessages((prev) => [...prev, tempMsg]);
    scrollMessagesToBottom("smooth", true);
    gigaChatSendLockRef.current = true;
    setGigaChatSending(true);
    try {
      const sent = await api.chat.gigachat.send({ text });
      setGigaChatMessages((prev) => applySentChatMessage(prev, tempId, sent));
      scrollMessagesToBottom("smooth", true);
    } catch (e) {
      setGigaChatMessages((prev) => prev.filter((m) => m.id !== tempId));
      window.alert(e instanceof Error ? e.message : "Ошибка отправки сообщения");
    } finally {
      setGigaChatSending(false);
      gigaChatSendLockRef.current = false;
    }
  };

  const applyPollToMessage = (messageId: number, poll: NonNullable<ChatMessageItem["poll"]>) => {
    const patch = (prev: ChatMessageItem[]) => prev.map((m) => (m.id === messageId ? { ...m, poll } : m));
    setGeneralMessages(patch);
    setPrivateMessages(patch);
    setGroupMessages(patch);
    setBotMessages(patch);
    setGigaChatMessages(patch);
  };

  const onPollVote = async (messageId: number, optionIds: number[]) => {
    setPollVotingId(messageId);
    try {
      const updated = await api.chat.votePoll(messageId, optionIds);
      applyPollToMessage(messageId, updated);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Не удалось проголосовать");
    } finally {
      setPollVotingId(null);
    }
  };

  const onToggleReaction = async (messageId: number, emoji: string) => {
    if (messageId < 1 || reactionSavingId === messageId) return;
    setReactionSavingId(messageId);
    setMessageMenu(null);
    try {
      const updated = await api.chat.setMessageReaction(messageId, emoji);
      patchMessageInLists(messageId, { reactions: updated.reactions ?? [] });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Не удалось поставить реакцию");
    } finally {
      setReactionSavingId(null);
    }
  };

  const openReactionWho = async (messageId: number, emoji: string) => {
    if (messageId < 1) return;
    setReactionWho({ messageId, emoji, loading: true, users: [], error: "" });
    try {
      const users = await api.chat.messageReactionUsers(messageId, emoji);
      setReactionWho({ messageId, emoji, loading: false, users, error: "" });
    } catch (e) {
      setReactionWho({
        messageId,
        emoji,
        loading: false,
        users: [],
        error: e instanceof Error ? e.message : "Не удалось загрузить список пользователей",
      });
    }
  };

  const onSubmitPoll = async (payload: ChatPollCreatePayload) => {
    if (pollSending) return;
    const pollReplyId =
      active.kind === "group" && activeGroup?.is_channel ? null : (replyTo?.id ?? null);
    const senderName =
      [user?.last_name, user?.first_name].filter((v) => typeof v === "string" && v.trim().length > 0).join(" ").trim() ||
      user?.username ||
      "Вы";
    const tempId = tempMessageSeqRef.current--;
    const tempPoll = {
      id: -1,
      question: payload.question,
      allows_multiple: payload.allows_multiple,
      total_voters: 0,
      my_option_ids: [] as number[],
      options: payload.options.map((text, i) => ({
        id: tempId * 10 - i - 1,
        text,
        position: i,
        vote_count: 0,
      })),
    };
    const baseMsg: ChatMessageItem = {
      id: tempId,
      private_dialog_id: null,
      group_dialog_id: null,
      sender: {
        id: userId,
        username: user?.username || "me",
        display_name: senderName,
        avatar_url: user?.avatar_url ?? null,
      },
      display_text: payload.question,
      is_deleted: false,
      created_at: new Date().toISOString(),
      edited_at: null,
      attachments: [],
      poll: tempPoll,
      reply_to_message_id: pollReplyId,
      reply_to_text: pollReplyId != null ? (replyTo?.text ?? null) : null,
      reply_to_sender_name: pollReplyId != null ? (replyTo?.senderName ?? null) : null,
      reply_to_is_deleted: pollReplyId != null ? (replyTo?.isDeleted ?? false) : false,
      is_read: false,
    };

    setPollSending(true);
    scrollMessagesToBottom("smooth", true);

    const finish = (sent: ChatMessageItem) => {
      setReplyTo(null);
      scrollMessagesToBottom("smooth", true);
      return sent;
    };

    try {
      if (active.kind === "general") {
        const msg = { ...baseMsg, private_dialog_id: null, group_dialog_id: null };
        setGeneralMessages((prev) => [...prev, msg]);
        const sent = finish(
          await api.chat.general.createPoll({
            ...payload,
            reply_to_message_id: pollReplyId,
          }),
        );
        setGeneralMessages((prev) => applySentChatMessage(prev, tempId, sent));
      } else if (active.kind === "private" && active.dialogId > 0) {
        const dialogId = active.dialogId;
        const msg = { ...baseMsg, private_dialog_id: dialogId, group_dialog_id: null };
        setPrivateMessages((prev) => [...prev, msg]);
        const sent = finish(
          await api.chat.privateDialogs.createPoll(dialogId, {
            ...payload,
            reply_to_message_id: pollReplyId,
          }),
        );
        const sentTs = sent.created_at ? Date.parse(sent.created_at) : Date.now();
        if (Number.isFinite(sentTs) && safeSetTs(`${READ_PRIVATE_AT_PREFIX}${dialogId}`, sentTs)) {
          touchReadMark();
        }
        setPrivateMessages((prev) => applySentChatMessage(prev, tempId, sent));
        void loadPrivateDialogs();
      } else if (active.kind === "group" && active.dialogId > 0) {
        const dialogId = active.dialogId;
        const msg = { ...baseMsg, private_dialog_id: null, group_dialog_id: dialogId };
        setGroupMessages((prev) => [...prev, msg]);
        const sent = finish(
          await api.chat.groupDialogs.createPoll(dialogId, {
            ...payload,
            reply_to_message_id: pollReplyId,
          }),
        );
        const sentTs = sent.created_at ? Date.parse(sent.created_at) : Date.now();
        if (Number.isFinite(sentTs) && safeSetTs(`${READ_GROUP_AT_PREFIX}${dialogId}`, sentTs)) {
          touchReadMark();
        }
        setGroupMessages((prev) => applySentChatMessage(prev, tempId, sent));
        void loadGroupDialogs();
      }
    } catch (e) {
      if (active.kind === "general") {
        setGeneralMessages((prev) => prev.filter((m) => m.id !== tempId));
      } else if (active.kind === "private") {
        setPrivateMessages((prev) => prev.filter((m) => m.id !== tempId));
      } else if (active.kind === "group") {
        setGroupMessages((prev) => prev.filter((m) => m.id !== tempId));
      }
      window.alert(e instanceof Error ? e.message : "Не удалось создать опрос");
    } finally {
      setPollSending(false);
    }
  };

  const sendStickerMessage = async (file: File) => {
    const mediaType = mediaFromFile(file);
    if (!mediaType || stickerSending) return;

    const senderName =
      [user?.last_name, user?.first_name].filter((v) => typeof v === "string" && v.trim().length > 0).join(" ").trim() ||
      user?.username ||
      "Вы";
    const tempId = tempMessageSeqRef.current--;
    const attachment = {
      id: tempId * 1000 - 1,
      url: URL.createObjectURL(file),
      media_type: mediaType,
      filename: file.name,
      mime_type: file.type,
      created_at: new Date().toISOString(),
    };
    const sender = {
      id: userId,
      username: user?.username || "me",
      display_name: senderName,
      avatar_url: user?.avatar_url ?? null,
    };

    setStickerSending(true);
    scrollMessagesToBottom("smooth", true);
    try {
      if (active.kind === "general") {
        const tempMsg: ChatMessageItem = {
          id: tempId,
          private_dialog_id: null,
          group_dialog_id: null,
          sender,
          display_text: null,
          is_deleted: false,
          created_at: new Date().toISOString(),
          edited_at: null,
          attachments: [attachment],
          reply_to_message_id: replyTo?.id ?? null,
          reply_to_text: replyTo?.text ?? null,
          reply_to_sender_name: replyTo?.senderName ?? null,
          reply_to_is_deleted: replyTo?.isDeleted ?? false,
          is_read: false,
        };
        setGeneralMessages((prev) => [...prev, tempMsg]);
        const sent = await api.chat.general.send(null, [file], replyTo?.id ?? null);
        setGeneralMessages((prev) => applySentChatMessage(prev, tempId, sent));
      } else if (active.kind === "private") {
        const dialogId = selectedDialogId;
        if (dialogId == null) return;
        const tempMsg: ChatMessageItem = {
          id: tempId,
          private_dialog_id: dialogId,
          group_dialog_id: null,
          sender,
          display_text: null,
          is_deleted: false,
          created_at: new Date().toISOString(),
          edited_at: null,
          attachments: [attachment],
          reply_to_message_id: replyTo?.id ?? null,
          reply_to_text: replyTo?.text ?? null,
          reply_to_sender_name: replyTo?.senderName ?? null,
          reply_to_is_deleted: replyTo?.isDeleted ?? false,
          is_read: false,
        };
        setPrivateMessages((prev) => [...prev, tempMsg]);
        const sent = await api.chat.privateDialogs.send(dialogId, null, [file], replyTo?.id ?? null);
        const sentTs = sent.created_at ? Date.parse(sent.created_at) : Date.now();
        if (Number.isFinite(sentTs) && safeSetTs(`${READ_PRIVATE_AT_PREFIX}${dialogId}`, sentTs)) {
          touchReadMark();
        }
        setPrivateMessages((prev) => applySentChatMessage(prev, tempId, sent));
        void loadPrivateDialogs();
      } else if (active.kind === "group") {
        const dialogId = active.dialogId;
        if (dialogId <= 0) return;
        const tempMsg: ChatMessageItem = {
          id: tempId,
          private_dialog_id: null,
          group_dialog_id: dialogId,
          sender,
          display_text: null,
          is_deleted: false,
          created_at: new Date().toISOString(),
          edited_at: null,
          attachments: [attachment],
          reply_to_message_id: replyTo?.id ?? null,
          reply_to_text: replyTo?.text ?? null,
          reply_to_sender_name: replyTo?.senderName ?? null,
          reply_to_is_deleted: replyTo?.isDeleted ?? false,
          is_read: false,
          ack_required: groupAckRequired,
        };
        setGroupMessages((prev) => [...prev, tempMsg]);
        const sent = await api.chat.groupDialogs.send(dialogId, null, [file], replyTo?.id ?? null, groupAckRequired);
        const sentTs = sent.created_at ? Date.parse(sent.created_at) : Date.now();
        if (Number.isFinite(sentTs) && safeSetTs(`${READ_GROUP_AT_PREFIX}${dialogId}`, sentTs)) {
          touchReadMark();
        }
        setGroupMessages((prev) => applySentChatMessage(prev, tempId, sent));
        void loadGroupDialogs();
      } else if (active.kind === "bot" && botComposerEnabled) {
        const threadId = isAdmin ? activeBotThreadId : userId;
        const tempMsg: ChatMessageItem = {
          id: tempId,
          private_dialog_id: null,
          group_dialog_id: null,
          bot_thread_user_id: threadId,
          sender,
          display_text: null,
          is_deleted: false,
          created_at: new Date().toISOString(),
          edited_at: null,
          attachments: [attachment],
          reply_to_message_id: replyTo?.id ?? null,
          reply_to_text: replyTo?.text ?? null,
          reply_to_sender_name: replyTo?.senderName ?? null,
          reply_to_is_deleted: replyTo?.isDeleted ?? false,
          is_read: false,
        };
        setBotMessages((prev) => [...prev, tempMsg]);
        const sent = await api.chat.bot.send(null, [file], {
          threadUserId: isAdmin ? threadId : undefined,
          replyToMessageId: replyTo?.id ?? null,
        });
        setBotMessages((prev) => applySentChatMessage(prev, tempId, sent));
        if (isAdmin) void loadBotThreads();
      }
      setReplyTo(null);
      scrollMessagesToBottom("smooth", true);
    } catch (e) {
      if (active.kind === "general") {
        setGeneralMessages((prev) => prev.filter((m) => m.id !== tempId));
      } else if (active.kind === "private") {
        setPrivateMessages((prev) => prev.filter((m) => m.id !== tempId));
      } else if (active.kind === "group") {
        setGroupMessages((prev) => prev.filter((m) => m.id !== tempId));
      } else if (active.kind === "bot") {
        setBotMessages((prev) => prev.filter((m) => m.id !== tempId));
      }
      window.alert(e instanceof Error ? e.message : "Не удалось отправить стикер");
    } finally {
      setStickerSending(false);
    }
  };

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);

  const startEdit = (m: ChatMessageItem) => {
    setEditingId(m.id);
    setEditingText(m.display_text || "");
    setReplyTo(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText("");
  };

  const startReply = (m: ChatMessageItem) => {
    const replyPreview =
      m.display_text?.trim() ||
      (m.poll ? m.poll.question : "") ||
      (m.attachments.length > 0 ? m.attachments.map(attachmentCopyLabel).join(", ") : "");
    setReplyTo({
      id: m.id,
      senderName: m.sender?.display_name || "Система",
      text: replyPreview,
      isDeleted: m.is_deleted,
    });
    setMessageMenu(null);
  };

  const isMessageSelectable = (m: ChatMessageItem) =>
    !m.is_deleted && m.id > 0 && !( !m.sender && isCallLogMessage(m.display_text));

  const exitMessageSelection = () => {
    setMessageSelectionMode(false);
    setSelectedMessageIds([]);
  };

  const startMessageSelection = (m: ChatMessageItem) => {
    if (!isMessageSelectable(m)) return;
    setMessageMenu(null);
    setMessageSelectionMode(true);
    setSelectedMessageIds([m.id]);
  };

  const toggleMessageSelection = (m: ChatMessageItem) => {
    if (!isMessageSelectable(m)) return;
    setSelectedMessageIds((prev) => {
      if (prev.includes(m.id)) return prev.filter((id) => id !== m.id);
      return [...prev, m.id];
    });
  };

  const selectedMessagesForForward = useMemo(() => {
    if (selectedMessageIds.length === 0) return [];
    const idSet = new Set(selectedMessageIds);
    return activeMessagesForSearch.filter((m) => idSet.has(m.id)).sort((a, b) => a.id - b.id);
  }, [activeMessagesForSearch, selectedMessageIds]);

  const canDeleteMessage = (m: ChatMessageItem) =>
    !m.is_deleted && (m.sender?.id === userId || isAdmin);

  const selectedDeletableMessages = useMemo(
    () => selectedMessagesForForward.filter(canDeleteMessage),
    [selectedMessagesForForward, userId, isAdmin],
  );

  const reloadActiveChatMessages = async () => {
    if (active.kind === "general") await loadGeneralMessages();
    else if (active.kind === "private") await loadPrivateMessages(active.dialogId);
    else if (active.kind === "bot") await loadBotMessages(isAdmin ? active.threadUserId : userId);
    else if (active.kind === "gigachat") await loadGigaChatMessages();
    else await loadGroupMessages(active.dialogId);
  };

  const startForward = (m: ChatMessageItem) => {
    setForwardSourceMessages([m]);
    setMessageMenu(null);
  };

  const startForwardSelected = () => {
    if (selectedMessagesForForward.length === 0) return;
    setForwardSourceMessages(selectedMessagesForForward);
    exitMessageSelection();
  };

  const deleteSelectedMessages = async () => {
    const toDelete = selectedDeletableMessages;
    if (toDelete.length === 0) {
      window.alert("Среди выбранных нет сообщений, которые можно удалить");
      return;
    }
    const skipped = selectedMessagesForForward.length - toDelete.length;
    const confirmText =
      skipped > 0
        ? `Удалить ${toDelete.length} сообщ. из ${selectedMessagesForForward.length}?\n\n${skipped} сообщ. нельзя удалить (чужие).`
        : toDelete.length === 1
          ? "Удалить выбранное сообщение?"
          : `Удалить ${toDelete.length} сообщ.?`;
    if (!window.confirm(confirmText)) return;
    setDeletingMessages(true);
    try {
      for (const msg of toDelete) {
        await api.chat.deleteMessage(msg.id);
      }
      exitMessageSelection();
      await reloadActiveChatMessages();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Не удалось удалить сообщения");
      await reloadActiveChatMessages();
    } finally {
      setDeletingMessages(false);
    }
  };

  const copyMessage = async (m: ChatMessageItem) => {
    const text = messageCopyText(m);
    if (!text) {
      setMessageMenu(null);
      window.alert("Нечего копировать");
      return;
    }
    const ok = await copyTextToClipboard(text);
    setMessageMenu(null);
    if (!ok) window.alert("Не удалось скопировать текст");
  };

  const forwardMessagesTo = async (target: { type: "general" | "private" | "group"; dialogId?: number }) => {
    if (!forwardSourceMessages?.length) return;
    setForwarding(true);
    try {
      for (const msg of forwardSourceMessages) {
        await api.chat.forwardMessage(msg.id, {
          target_chat_type: target.type,
          target_dialog_id: target.dialogId ?? null,
        });
      }
      setForwardSourceMessages(null);
      if (target.type === "general") {
        setActive({ kind: "general" });
        await loadGeneralMessages();
      } else if (target.type === "private" && target.dialogId) {
        setSelectedDialogId(target.dialogId);
        setActive({ kind: "private", dialogId: target.dialogId });
        await loadPrivateDialogs();
        await loadPrivateMessages(target.dialogId);
      } else if (target.type === "group" && target.dialogId) {
        setActive({ kind: "group", dialogId: target.dialogId });
        await loadGroupDialogs();
        await loadGroupMessages(target.dialogId);
      }
      if (isMobileViewport) setShowChatList(false);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Не удалось переслать сообщения");
    } finally {
      setForwarding(false);
    }
  };

  const saveEdit = async (textOverride?: string | null) => {
    if (editingId == null) return;
    const next = (textOverride ?? editingText).trim();
    if (!next) {
      window.alert("Введите текст сообщения");
      return;
    }
    await api.chat.editMessage(editingId, next);
    cancelEdit();
    if (active.kind === "general") await loadGeneralMessages();
    else if (active.kind === "private") await loadPrivateMessages(active.dialogId);
    else if (active.kind === "bot") await loadBotMessages(isAdmin ? active.threadUserId : userId);
    else if (active.kind === "gigachat") await loadGigaChatMessages();
    else await loadGroupMessages(active.dialogId);
  };

  const deleteMessage = async (m: ChatMessageItem) => {
    const isOwn = m.sender?.id === userId;
    const confirmText = isOwn
      ? "Удалить сообщение?"
      : `Удалить сообщение${m.sender?.display_name ? ` пользователя «${m.sender.display_name}»` : ""}?`;
    if (!window.confirm(confirmText)) return;
    try {
      await api.chat.deleteMessage(m.id);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Не удалось удалить сообщение");
      return;
    }
    await reloadActiveChatMessages();
  };

  const openMessageStats = async (m: ChatMessageItem, kind: "reads" | "ack") => {
    if (kind === "reads") {
      if (!m.sender || m.sender.id !== userId) return;
    } else if (!m.ack_required) {
      return;
    }
    setMessageReadsModal({ message: m, kind, data: null, loading: true, error: "" });
    setMessageMenu(null);
    try {
      const data =
        kind === "ack" ? await api.chat.messageAcknowledgments(m.id) : await api.chat.messageReads(m.id);
      setMessageReadsModal({ message: m, kind, data, loading: false, error: "" });
    } catch (e) {
      setMessageReadsModal({
        message: m,
        kind,
        data: null,
        loading: false,
        error:
          e instanceof Error
            ? e.message
            : kind === "ack"
              ? "Не удалось загрузить ознакомления"
              : "Не удалось загрузить прочтения",
      });
    }
  };

  const openMessageReads = (m: ChatMessageItem) => void openMessageStats(m, "reads");

  const removeCurrentChatFromList = async () => {
    if (active.kind === "private") {
      const id = active.dialogId;
      if (id <= 0) return;
      if (!window.confirm("Убрать чат из списка? У собеседника переписка останется.")) return;
      try {
        await api.chat.privateDialogs.delete(id);
        setPrivateMessages([]);
        setSelectedDialogId(null);
        setActive({ kind: "general" });
        await loadPrivateDialogs();
        if (isMobileViewport) setShowChatList(true);
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Не удалось убрать чат");
      }
      return;
    }
    if (active.kind === "group") {
      const id = active.dialogId;
      if (id <= 0) return;
      if (consultantGroupExitBlocked) {
        window.alert("Выход из этой группы запрещён. Обратитесь к администратору группы.");
        return;
      }
      if (!window.confirm("Покинуть группу? При необходимости вас смогут добавить снова.")) return;
      try {
        await api.chat.groupDialogs.removeMember(id, userId);
        setGroupMessages([]);
        setActive({ kind: "general" });
        await loadGroupDialogs();
        if (isMobileViewport) setShowChatList(true);
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Не удалось покинуть группу");
      }
    }
  };

  const renderAttachments = (atts: ChatAttachment[], isMine: boolean) => {
    if (!atts || atts.length === 0) return null;
    return (
      <div className="mt-2 flex flex-col gap-2">
        {atts.map((a) => {
          if (a.media_type === "sticker") {
            return (
              <div key={a.id} className="inline-flex items-center justify-center" style={{ width: 168, height: 168 }}>
                <img
                  src={resolveChatMediaUrl(a.url)}
                  alt=""
                  className="w-full h-full object-contain select-none"
                  draggable={false}
                />
              </div>
            );
          }
          if (a.media_type === "image") {
            const imageSrc = resolveChatMediaUrl(a.url);
            return (
              <div key={a.id} className="inline-flex flex-col items-start gap-1 max-w-full">
                <div
                  role="button"
                  tabIndex={0}
                  className="rounded-2xl overflow-hidden cursor-zoom-in max-w-full"
                  style={{ border: "1px solid var(--border)", minWidth: 120, minHeight: 80 }}
                  aria-label="Открыть фото"
                  title="Открыть фото"
                  onClick={(e) => {
                    e.stopPropagation();
                    setImageLightbox({ url: imageSrc, filename: a.filename ?? null });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      setImageLightbox({ url: imageSrc, filename: a.filename ?? null });
                    }
                  }}
                >
                  <img
                    src={imageSrc}
                    alt={a.filename || "Фото"}
                    className="block w-auto h-auto max-w-full object-contain"
                    style={{ maxWidth: "min(100%, 320px)", maxHeight: 360, minHeight: 48 }}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    onError={(e) => {
                      const el = e.currentTarget;
                      if (el.dataset.fallbackTried === "1") return;
                      el.dataset.fallbackTried = "1";
                      const fallback = resolveChatMediaUrl(a.url);
                      if (fallback && el.src !== fallback) el.src = fallback;
                    }}
                  />
                </div>
                <a
                  href={imageSrc}
                  download={a.filename || undefined}
                  className="text-[11px] px-2 py-1 rounded-xl"
                  style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  Скачать
                </a>
              </div>
            );
          }
          if (isVoiceOrAudioAttachment(a)) {
            return (
              <div
                key={a.id}
                className="mt-1.5"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <ChatAudioPlayer
                  src={a.url}
                  attachmentId={a.id}
                  variant={isMine ? "mine" : "theirs"}
                />
              </div>
            );
          }
          if (isVideoNoteAttachment(a)) {
            return (
              <div
                key={a.id}
                className="mt-1.5"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <ChatVideoNotePlayer src={a.url} variant={isMine ? "mine" : "theirs"} />
              </div>
            );
          }
          if (a.media_type === "file") {
            const label = a.filename?.trim() || "Файл";
            return (
              <a
                key={a.id}
                href={resolveChatMediaUrl(a.url)}
                download={label}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 max-w-full px-3 py-2.5 rounded-xl text-sm font-medium"
                style={{
                  backgroundColor: isMine ? "rgba(255,255,255,0.12)" : "var(--bg-secondary)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <span aria-hidden>📎</span>
                <span className="truncate">{label}</span>
              </a>
            );
          }
          return (
            <div key={a.id} className="inline-flex flex-col items-start gap-1" style={{ maxWidth: "100%" }}>
              <video
                src={resolveChatMediaUrl(a.url)}
                controls
                playsInline
                className="w-full rounded-2xl"
                style={{ maxWidth: "100%", maxHeight: 360 }}
              />
              <a
                href={a.url}
                download={a.filename || undefined}
                className="text-[11px] px-2 py-1 rounded-xl"
                style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
              >
                Скачать
              </a>
            </div>
          );
        })}
      </div>
    );
  };

  const patchMessageInLists = (messageId: number, patch: Partial<ChatMessageItem>) => {
    const apply = (list: ChatMessageItem[]) =>
      list.map((x) => (x.id === messageId ? { ...x, ...patch } : x));
    setGroupMessages((prev) => apply(prev));
    setGeneralMessages((prev) => apply(prev));
    setPrivateMessages((prev) => apply(prev));
    setBotMessages((prev) => apply(prev));
  };

  const acknowledgeAckGroup = async (messageIds: number[]) => {
    const byId = new Map(groupMessages.map((x) => [x.id, x]));
    const pending = messageIds
      .map((id) => byId.get(id))
      .filter((m): m is ChatMessageItem => Boolean(m && m.ack_required && !m.user_acknowledged));
    if (pending.length === 0) return;
    try {
      for (const m of pending) {
        await api.chat.messageAcknowledge(m.id);
        patchMessageInLists(m.id, {
          user_acknowledged: true,
          ack_count: (m.ack_count ?? 0) + 1,
        });
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Не удалось отметить ознакомление");
    }
  };

  const ReadStatusButton = ({ m }: { m: ChatMessageItem }) => {
    const rc = m.recipient_count ?? 0;
    const rd = m.read_count ?? 0;
    if (rc <= 0) return null;
    const allRead = rd >= rc;
    const hasAnyRead = rd > 0;
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 -mr-1 hover:opacity-80"
        title="Кто прочитал"
        aria-label="Кто прочитал"
        onClick={(e) => {
          e.stopPropagation();
          void openMessageReads(m);
        }}
      >
        {rc > 1 ? (
          <span className="text-[10px] font-semibold tabular-nums" style={{ opacity: 0.92 }}>
            {rd}/{rc}
          </span>
        ) : null}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: hasAnyRead ? 0.95 : 0.55 }}
        >
          <path d="M1 12l5 5L17 6" />
          {allRead ? <path d="M8 12l5 5L24 6" /> : null}
        </svg>
      </button>
    );
  };

  const AckStatusButton = ({ m }: { m: ChatMessageItem }) => {
    const rc = m.ack_recipient_count ?? 0;
    const ac = m.ack_count ?? 0;
    if (rc <= 0) return null;
    const allAck = ac >= rc;
    const hasAnyAck = ac > 0;
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 -mr-1 hover:opacity-80"
        title="Кто ознакомился"
        aria-label="Кто ознакомился"
        onClick={(e) => {
          e.stopPropagation();
          void openMessageStats(resolveAckStatsMessage(m), "ack");
        }}
      >
        {rc > 1 ? (
          <span className="text-[10px] font-semibold tabular-nums" style={{ opacity: 0.92 }}>
            {ac}/{rc}
          </span>
        ) : null}
        <span className="text-[10px] font-semibold" style={{ opacity: hasAnyAck ? 0.95 : 0.65 }}>
          {allAck ? "✓✓" : hasAnyAck ? "✓" : "○"}
        </span>
      </button>
    );
  };

  const MessageBubble = ({
    m,
    mentionUsersByUsername,
    onMentionClick,
    ackGroup,
  }: {
    m: ChatMessageItem;
    mentionUsersByUsername?: Map<string, ChatUserShortResponse>;
    onMentionClick?: (username: string) => void;
    ackGroup?: ChannelAckGroupInfo;
  }) => {
    const isCallLog = !m.sender && isCallLogMessage(m.display_text);
    const isMine = Boolean(m.sender && m.sender.id === userId);
    const canShowActions = !m.is_deleted && !isCallLog;
    const selectable = isMessageSelectable(m);
    const isSelected = selectedMessageIds.includes(m.id);
    const clearMessageLongPress = () => {
      if (messageLongPressTimerRef.current != null) {
        window.clearTimeout(messageLongPressTimerRef.current);
        messageLongPressTimerRef.current = null;
      }
    };
    const handleSelectionPointerDown = () => {
      if (messageSelectionMode || !selectable) return;
      clearMessageLongPress();
      messageLongPressTimerRef.current = window.setTimeout(() => {
        startMessageSelection(m);
      }, 480);
    };
    const ackGroupIds = ackGroup?.messageIds ?? [m.id];
    const showAckFooter =
      m.ack_required && !isMine && !m.is_deleted && (!ackGroup || ackGroup.isLast);
    const ackGroupAllDone =
      ackGroupIds.length > 0 &&
      ackGroupIds.every((id) => {
        const row = groupMessages.find((x) => x.id === id);
        return row?.user_acknowledged === true;
      });
    const hasPoll = Boolean(m.poll) && !m.is_deleted;
    const stickerOnly =
      !hasPoll &&
      !m.display_text &&
      !m.is_deleted &&
      m.attachments.length === 1 &&
      m.attachments[0].media_type === "sticker";
    const imageOnly =
      !hasPoll &&
      !m.display_text &&
      !m.is_deleted &&
      m.attachments.length > 0 &&
      m.attachments.every((a) => a.media_type === "image");
    const openMessageActionsMenu = (x: number, y: number) => {
      setMessageMenu({ x, y, message: m });
      messageMenuIgnoreClickUntilRef.current = Date.now() + 700;
    };

    const openMessageActionsMenuFromButton = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      openMessageActionsMenu(r.left, r.bottom + 4);
    };

    if (isCallLog && m.display_text) {
      const missed = callLogIsMissed(m.display_text);
      return (
        <div className="flex w-full justify-center mb-2 px-2">
          <div
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium max-w-[92%]"
            style={{
              backgroundColor: missed ? "rgba(239, 68, 68, 0.1)" : "var(--bg-primary)",
              color: missed ? "var(--error)" : "var(--text-secondary)",
              border: `1px solid ${missed ? "rgba(239, 68, 68, 0.25)" : "var(--border)"}`,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              {missed ? (
                <>
                  <line x1="23" y1="1" x2="17" y2="7" />
                  <line x1="17" y1="1" x2="23" y2="7" />
                </>
              ) : null}
            </svg>
            <span className="truncate">{m.display_text.replace(/^📞\s*/, "")}</span>
            {m.created_at ? (
              <span className="opacity-70 shrink-0">{formatChatTimestamp(m.created_at)}</span>
            ) : null}
          </div>
        </div>
      );
    }

    const messageReactions = m.reactions ?? [];
    const showReactions = !m.is_deleted && messageReactions.length > 0 && m.id > 0;

    return (
      <div
        className={`flex w-full flex-col ${isMine ? "items-end" : "items-start"} mb-2`}
        onClick={() => {
          if (!messageSelectionMode || !selectable) return;
          toggleMessageSelection(m);
        }}
        onPointerDown={handleSelectionPointerDown}
        onPointerUp={clearMessageLongPress}
        onPointerCancel={clearMessageLongPress}
        onPointerLeave={clearMessageLongPress}
      >
        <div
          className={`max-w-[78%] select-none relative ${stickerOnly || imageOnly ? "px-1 py-1" : "rounded-[18px] px-3 py-2 sm:rounded-[22px] sm:px-4 sm:py-3"} ${messageSelectionMode && selectable ? "cursor-pointer" : ""}`}
          style={
            stickerOnly || imageOnly
              ? {
                  backgroundColor: "transparent",
                  border: isSelected ? "2px solid var(--accent)" : "none",
                  boxShadow: "none",
                  borderRadius: isSelected ? 12 : undefined,
                }
              : {
                  backgroundColor: isMine ? "var(--accent)" : "var(--bg-primary)",
                  color: isMine ? "#fff" : "var(--text-primary)",
                  border: isSelected
                    ? "2px solid #fbbf24"
                    : isMine
                      ? "none"
                      : "1px solid var(--border)",
                  boxShadow: isMine ? "0 10px 26px rgba(0, 82, 204, 0.25)" : "none",
                }
          }
        >
          {messageSelectionMode && selectable ? (
            <span
              className="absolute z-20 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
              style={{
                top: 6,
                ...(isMine ? { left: 6 } : { left: 6 }),
                backgroundColor: isSelected ? "#fbbf24" : "rgba(255,255,255,0.15)",
                color: isSelected ? "#1e293b" : isMine ? "#fff" : "var(--text-tertiary)",
                border: `2px solid ${isSelected ? "#fbbf24" : isMine ? "rgba(255,255,255,0.35)" : "var(--border)"}`,
              }}
              aria-hidden
            >
              {isSelected ? "✓" : ""}
            </span>
          ) : null}
          {(
            <>
              {canShowActions && !messageSelectionMode ? (
                <button
                  type="button"
                  className="absolute z-10 w-8 h-8 rounded-full flex items-center justify-center text-lg leading-none shadow-md"
                  style={{
                    top: imageOnly || stickerOnly ? 2 : 6,
                    ...(isMine
                      ? { left: imageOnly || stickerOnly ? 2 : 6 }
                      : { right: imageOnly || stickerOnly ? 2 : 6 }),
                    backgroundColor: "rgba(15, 23, 42, 0.55)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.22)",
                  }}
                  aria-label="Действия с сообщением"
                  title="Меню сообщения"
                  onClick={(e) => {
                    e.stopPropagation();
                    openMessageActionsMenuFromButton(e.currentTarget);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  ⋮
                </button>
              ) : null}
              <div
                className={`text-[11px] opacity-90 flex items-center gap-2 ${isMine ? "justify-end" : "justify-start"}`}
                style={{
                  marginBottom: m.display_text ? 8 : stickerOnly || imageOnly ? 4 : 0,
                  ...(canShowActions
                    ? imageOnly || stickerOnly
                      ? { paddingRight: isMine ? 0 : 28, paddingLeft: isMine ? 28 : 0 }
                      : { paddingRight: isMine ? 0 : 30, paddingLeft: isMine ? 30 : 0 }
                    : {}),
                }}
              >
                {m.sender && (
                  <Avatar
                    name={m.sender.display_name || m.sender.username}
                    seed={m.sender.id}
                    imageUrl={m.sender.avatar_url}
                    size={20}
                  />
                )}
                <span>{isMine ? "Вы" : m.sender?.display_name || "Система"}</span>
                <span>•</span>
                <span>{formatChatTimestamp(m.created_at)}</span>
                {m.edited_at && (
                  <>
                    <span>•</span>
                    <span>отредактировано {formatChatTimestamp(m.edited_at)}</span>
                  </>
                )}
                {isMine ? (
                  m.ack_required && (!ackGroup || ackGroup.isLast) ? (
                    <AckStatusButton m={m} />
                  ) : !m.ack_required ? (
                    <ReadStatusButton m={m} />
                  ) : null
                ) : null}
              </div>
              {m.reply_to_message_id && (
                <button
                  type="button"
                  className="w-full text-left rounded-xl px-3 py-2.5 mb-2 relative overflow-hidden transition-all"
                  style={{
                    background: isMine
                      ? "linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.08) 100%)"
                      : "linear-gradient(180deg, rgba(87,157,255,0.12) 0%, rgba(87,157,255,0.06) 100%)",
                    border: `1px solid ${isMine ? "rgba(255,255,255,0.18)" : "rgba(87,157,255,0.18)"}`,
                  }}
                  onClick={() => scrollToMessage(m.reply_to_message_id as number)}
                  title="Перейти к исходному сообщению"
                >
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1"
                    style={{
                      backgroundColor: isMine ? "rgba(255,255,255,0.6)" : "var(--accent)",
                    }}
                  />
                  <div className="pl-2.5">
                    <div className="flex items-center gap-2 mb-0.5">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="flex-shrink-0"
                        style={{ opacity: 0.7 }}
                      >
                        <polyline points="9 10 4 15 9 20" />
                        <path d="M20 4v7a4 4 0 0 1-4 4H4" />
                      </svg>
                      <div className="text-[11px] font-semibold" style={{ opacity: 0.92 }}>
                        {m.reply_to_sender_name || "Сообщение"}
                      </div>
                    </div>
                    <div className="text-xs truncate pl-5" style={{ opacity: 0.82 }}>
                      {m.reply_to_is_deleted ? "Сообщение было удалено" : (m.reply_to_text || "Вложение")}
                    </div>
                  </div>
                </button>
              )}
              {hasPoll && m.poll ? (
                <ChatPollBubble
                  poll={m.poll}
                  isMine={isMine}
                  voting={pollVotingId === m.id}
                  onVote={(optionIds) => onPollVote(m.id, optionIds)}
                />
              ) : null}
              {m.display_text && !hasPoll ? (
                <div className="whitespace-pre-wrap break-words text-sm">
                  <ChatMentionText
                    text={m.display_text.replace(/^\[apply-training-article:[^\]]+\]\s*\n/, "")}
                    mentionColor={isMine ? "rgba(255,255,255,0.95)" : undefined}
                    linkColor={isMine ? "rgba(255,255,255,0.95)" : undefined}
                    knownUsersByUsername={mentionUsersByUsername}
                    onMentionClick={onMentionClick}
                  />
                </div>
              ) : null}
              {renderAttachments(m.attachments, isMine)}
              {showAckFooter ? (
                <div className="mt-3 pt-2 border-t" style={{ borderColor: isMine ? "rgba(255,255,255,0.2)" : "var(--border)" }}>
                  {ackGroupAllDone ? (
                    <div
                      className="text-xs font-medium inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                      style={{
                        backgroundColor: isMine ? "rgba(255,255,255,0.12)" : "var(--bg-secondary)",
                        color: isMine ? "rgba(255,255,255,0.95)" : "var(--text-secondary)",
                      }}
                    >
                      <span aria-hidden>✓</span>
                      Ознакомлено
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="w-full text-sm font-semibold py-2.5 rounded-xl transition-opacity hover:opacity-90"
                      style={{
                        backgroundColor: "var(--accent)",
                        color: "#fff",
                        boxShadow: "0 8px 20px rgba(0, 82, 204, 0.22)",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        void acknowledgeAckGroup(ackGroupIds);
                      }}
                    >
                      {ackGroupIds.length > 1 ? `Ознакомиться (${ackGroupIds.length} сообщ.)` : "Ознакомиться"}
                    </button>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>
        {showReactions ? (
          <div
            className={`flex flex-wrap gap-1 mt-1 max-w-[78%] ${isMine ? "justify-end" : "justify-start"}`}
          >
            {messageReactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                disabled={reactionSavingId === m.id}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm leading-none transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{
                  backgroundColor: r.reacted_by_me ? "rgba(87, 157, 255, 0.18)" : "var(--bg-primary)",
                  border: `1px solid ${r.reacted_by_me ? "rgba(87, 157, 255, 0.45)" : "var(--border)"}`,
                  color: "var(--text-primary)",
                }}
                title={r.reacted_by_me ? "Убрать реакцию" : "Поставить реакцию"}
                onClick={(e) => {
                  e.stopPropagation();
                  // Обычный клик/тап — показать «кто поставил».
                  // Быстро поставить/убрать — Shift/Alt/Ctrl/Meta+клик.
                  if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) {
                    void onToggleReaction(m.id, r.emoji);
                  } else {
                    void openReactionWho(m.id, r.emoji);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void openReactionWho(m.id, r.emoji);
                }}
              >
                <span>{r.emoji}</span>
                {r.count > 1 ? (
                  <span className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    {r.count}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}

        {reactionWho && reactionWho.messageId === m.id ? (
          <div
            className={`mt-2 max-w-[78%] rounded-2xl border px-3 py-2 ${isMine ? "ml-auto" : ""}`}
            style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                Реакция {reactionWho.emoji}
              </div>
              <button
                type="button"
                className="text-xs underline"
                style={{ color: "var(--text-tertiary)" }}
                onClick={() => setReactionWho(null)}
              >
                скрыть
              </button>
            </div>

            {reactionWho.loading ? (
              <div className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>
                Загрузка…
              </div>
            ) : reactionWho.error ? (
              <div className="text-xs mt-2" style={{ color: "var(--error)" }}>
                {reactionWho.error}
              </div>
            ) : reactionWho.users.length === 0 ? (
              <div className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>
                Никто не поставил эту реакцию
              </div>
            ) : (
              <div className="text-xs mt-2" style={{ color: "var(--text-primary)" }}>
                {reactionWho.users
                  .map((u) => u.display_name || u.username || `#${u.id}`)
                  .join(", ")}
              </div>
            )}

            {/* hint removed by request */}
          </div>
        ) : null}
      </div>
    );
  };

  const generalTitle = "Общий чат";
  const myGroupMember = groupMembers.find((m) => m.user.id === userId);
  const canManageGroupMembers = Boolean(myGroupMember?.is_admin || isAdmin);
  const activeGroup = active.kind === "group" ? groupDialogs.find((d) => d.id === active.dialogId) ?? null : null;
  const chatNotificationsScope: "global" | "group" =
    active.kind === "group" && active.dialogId > 0 ? "group" : "global";
  const notifEnabled =
    chatNotificationsScope === "group"
      ? activeGroup?.notifications_enabled !== false
      : user?.chat_notifications_enabled !== false;
  const consultantGroupExitBlocked =
    active.kind === "group" &&
    Boolean(activeGroup?.forbid_exit) &&
    isConsultant &&
    !isAdmin &&
    !myGroupMember?.is_admin;
  const activeIsChannel = active.kind === "group" && Boolean(activeGroup?.is_channel);
  const canPostInActiveChat =
    active.kind === "bot" ? botComposerEnabled : active.kind !== "group" || !activeIsChannel || canManageGroupMembers;

  const channelAckGroupMap = useMemo(
    () => (activeIsChannel ? buildChannelAckGroups(groupMessages) : new Map<number, ChannelAckGroupInfo>()),
    [activeIsChannel, groupMessages]
  );

  const resolveAckStatsMessage = (m: ChatMessageItem): ChatMessageItem => {
    const g = channelAckGroupMap.get(m.id);
    if (!g || g.isLast) return m;
    const last = groupMessages.find((x) => x.id === g.messageIds[g.messageIds.length - 1]);
    return last ?? m;
  };

  const openMessageAcknowledgments = (m: ChatMessageItem) => {
    if (!m.ack_required) return;
    const canSee = m.sender?.id === userId || canManageGroupMembers;
    if (!canSee) return;
    void openMessageStats(resolveAckStatsMessage(m), "ack");
  };
  const membersLabel = activeIsChannel ? "Подписчики" : "Участники";
  const editChatLabel = activeIsChannel ? "Редактировать канал" : "Редактировать группу";
  const infoTitle = activeIsChannel ? "Информация о канале" : "Информация о группе";

  const openGroupWizard = (asChannel: boolean) => {
    setGroupWizardIsChannel(asChannel);
    setShowGroupCreateWizard(true);
    setGroupWizardStep(1);
    setGroupWizardName("");
    setGroupWizardSelected(new Map());
    setGroupWizardMembersSeeOwnOnly(false);
  };

  const closeGroupWizard = () => {
    setShowGroupCreateWizard(false);
    setGroupWizardIsChannel(false);
    setGroupWizardStep(1);
    setGroupWizardName("");
    setGroupWizardSelected(new Map());
    setGroupWizardMembersSeeOwnOnly(false);
  };

  const groupMemberUserIds = useMemo(
    () => new Set(groupMembers.map((m) => m.user.id)),
    [groupMembers]
  );

  const CHAT_SELECT_ALL_USERS_LIMIT = 500;

  const mergeAllChatUsersIntoSelection = async (
    excludeIds: Iterable<number>,
    current: Map<number, ChatUserShortResponse>,
    onDone: (next: Map<number, ChatUserShortResponse>) => void,
    setLoading: (v: boolean) => void,
  ) => {
    setLoading(true);
    try {
      const users = await api.chat.users(undefined, CHAT_SELECT_ALL_USERS_LIMIT);
      const excluded = new Set(excludeIds);
      const next = new Map(current);
      for (const u of users) {
        if (u.is_active === false || excluded.has(u.id)) continue;
        next.set(u.id, u);
      }
      onDone(next);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Не удалось загрузить список пользователей");
    } finally {
      setLoading(false);
    }
  };

  const confirmAddMembersToGroup = async () => {
    if (activeDialogId == null || activeDialogId <= 0) return;
    const users = Array.from(addMemberPending.values());
    if (users.length === 0) return;
    const who = users.map((u) => `• ${u.display_name || u.username} (@${u.username})`).join("\n");
    const noun = activeIsChannel ? "подписчиков" : "участников";
    if (!window.confirm(`Добавить ${users.length} ${noun}?\n\n${who}`)) return;
    setAddMemberSubmitting(true);
    try {
      for (const u of users) {
        await api.chat.groupDialogs.addMember(activeDialogId, u.id);
      }
      setAddMemberPending(new Map());
      setGroupMembersTab("members");
      await loadGroupDialogs();
      await loadGroupMembers(activeDialogId);
      await loadGroupMessages(activeDialogId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка добавления";
      window.alert(msg);
    } finally {
      setAddMemberSubmitting(false);
    }
  };

  const activePrivateDialog =
    active.kind === "private" ? privateDialogs.find((d) => d.id === active.dialogId) ?? null : null;
  const activeBotThreadItem =
    active.kind === "bot" && activeBotThreadId > 0
      ? botThreads.find((t) => t.user.id === activeBotThreadId) ?? null
      : null;
  const activeBotThread = activeBotThreadItem?.user ?? null;
  const headerTitle =
    active.kind === "general"
      ? generalTitle
      : active.kind === "gigachat"
        ? "GigaChat"
      : active.kind === "bot"
        ? isAdmin
          ? activeBotThreadId > 0
            ? activeBotThread?.display_name || activeBotThread?.username || "Обращение"
            : "Поддержка"
          : "Поддержка"
        : active.kind === "private"
          ? activePrivateDialog?.other_user.display_name || "Диалог"
          : activeGroup?.name || "Группа";
  const headerSubtitle =
    active.kind === "general"
      ? "Системные и пользовательские сообщения"
      : active.kind === "gigachat"
        ? "диалог с нейросетью"
      : active.kind === "bot"
        ? isAdmin
          ? activeBotThreadId > 0
            ? `${activeBotThreadItem?.is_closed ? "Закрыто · " : ""}@${activeBotThread?.username || "user"}`
            : "Выберите обращение"
          : "чат с администратором"
        : active.kind === "private"
          ? "личный чат"
          : activeIsChannel
          ? groupMembers.length > 0
            ? `канал · ${groupMembers.length} подписчик${groupMembers.length === 1 ? "" : groupMembers.length < 5 ? "а" : "ов"}`
            : "информационный канал"
          : groupMembers.length > 0
            ? `${groupMembers.length} участник${groupMembers.length === 1 ? "" : groupMembers.length < 5 ? "а" : "ов"}`
            : "группа";
  const headerAvatarSeed =
    active.kind === "private"
      ? activePrivateDialog?.other_user.id || active.dialogId || 0
      : active.kind === "group"
        ? active.dialogId || 0
        : 0;
  const headerAvatarUrl =
    active.kind === "private" ? activePrivateDialog?.other_user.avatar_url : active.kind === "group" ? activeGroup?.image_url : null;

  const mentionUsersByUsername = useMemo(() => {
    const map = new Map<string, ChatUserShortResponse>();
    const add = (u: ChatUserShortResponse | ChatMessageItem["sender"] | null | undefined) => {
      if (!u) return;
      const un = (u.username || "").trim();
      if (!un) return;
      const entry: ChatUserShortResponse = {
        id: u.id,
        username: u.username,
        display_name: u.display_name,
        avatar_url: u.avatar_url,
        is_active: "is_active" in u ? Boolean(u.is_active) : true,
      };
      map.set(un.toLowerCase(), entry);
    };
    for (const gm of groupMembers) add(gm.user);
    add(activePrivateDialog?.other_user);
    const msgs =
      active.kind === "general"
        ? generalMessages
        : active.kind === "private"
          ? privateMessages
          : active.kind === "bot"
            ? botMessages
            : active.kind === "gigachat"
              ? gigaChatMessages
              : groupMessages;
    for (const msg of msgs) {
      if (msg.sender) add(msg.sender);
    }
    return map;
  }, [groupMembers, activePrivateDialog, active.kind, generalMessages, privateMessages, groupMessages, botMessages, gigaChatMessages]);

  const getGeneralMentionCandidates = useCallback(
    (q: string) => api.chat.users(q.trim() || undefined, 30),
    []
  );

  const getGroupMentionCandidates = useCallback(
    (q: string) => filterUsersForMention(groupMembers.map((m) => m.user), q, userId),
    [groupMembers, userId]
  );

  const getPrivateMentionCandidates = useCallback(
    (q: string) => {
      const other = activePrivateDialog?.other_user;
      if (!other) return [];
      return filterUsersForMention([other], q, userId);
    },
    [activePrivateDialog, userId]
  );

  const toggleChatNotifications = async () => {
    setNotifSaving(true);
    try {
      if (chatNotificationsScope === "group" && active.kind === "group" && active.dialogId > 0) {
        const updated = await api.chat.groupDialogs.patchNotificationSettings(active.dialogId, {
          enabled: !notifEnabled,
        });
        setGroupDialogs((prev) =>
          prev.map((d) => (d.id === active.dialogId ? { ...d, notifications_enabled: updated.notifications_enabled } : d))
        );
      } else {
        await api.chat.patchNotificationSettings({ enabled: !notifEnabled });
        await refreshUser();
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Не удалось сохранить настройку");
    } finally {
      setNotifSaving(false);
    }
  };

  useEffect(() => {
    if (!userId) return;
    void api.chat
      .wallpaperSettings()
      .then((s) => {
        setWallpaperResolvedUrl(s.resolved_url);
        setWallpaperId(s.wallpaper_id);
        setWallpaperCustomUrl(s.wallpaper_url);
      })
      .catch(() => undefined);
  }, [userId, user?.chat_wallpaper_id, user?.chat_wallpaper_url]);

  useEffect(() => {
    if (chatInfoPanel !== "settings") return;
    setChatWallpapersLoading(true);
    void api.chat
      .wallpapers()
      .then((rows) => setChatWallpapers(rows))
      .catch(() => setChatWallpapers([]))
      .finally(() => setChatWallpapersLoading(false));
  }, [chatInfoPanel]);

  const applyWallpaperPatch = async (patch: {
    wallpaper_id?: number | null;
    wallpaper_url?: string | null;
    reset?: boolean;
  }) => {
    setWallpaperSaving(true);
    try {
      const s = await api.chat.patchWallpaperSettings(patch);
      setWallpaperResolvedUrl(s.resolved_url);
      setWallpaperId(s.wallpaper_id);
      setWallpaperCustomUrl(s.wallpaper_url);
      await refreshUser();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Не удалось сохранить обои");
    } finally {
      setWallpaperSaving(false);
    }
  };

  const onSelectChatWallpaper = (id: number) => applyWallpaperPatch({ wallpaper_id: id });
  const onResetChatWallpaper = () => applyWallpaperPatch({ reset: true });
  const onUploadCustomChatWallpaper = async (file: File) => {
    setWallpaperSaving(true);
    try {
      const { url } = await api.upload.chatImage(file);
      await applyWallpaperPatch({ wallpaper_url: url });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Не удалось загрузить изображение");
      setWallpaperSaving(false);
    }
  };
  const onAdminAddChatWallpaper = async (title: string, file: File) => {
    setWallpaperSaving(true);
    try {
      const row = await api.chat.createWallpaperLibraryItem(title, file);
      setChatWallpapers((prev) => [...prev, row].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
      await applyWallpaperPatch({ wallpaper_id: row.id });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Не удалось добавить в библиотеку");
      setWallpaperSaving(false);
    }
  };

  /** Фон только в видимой области чата (не на всю высоту ленты сообщений). */
  const chatWallpaperLayerStyle = useMemo((): React.CSSProperties | null => {
    const url = wallpaperResolvedUrl ? resolveChatMediaUrl(wallpaperResolvedUrl) : "";
    if (!url) return null;
    const escaped = url.replace(/"/g, "%22");
    const isDark = theme === "dark";
    const backgroundImage = isDark
      ? `linear-gradient(rgba(15, 23, 42, 0.42), rgba(15, 23, 42, 0.42)), url("${escaped}")`
      : `url("${escaped}")`;
    return {
      backgroundColor: "var(--bg-secondary)",
      backgroundImage,
      backgroundSize: "cover",
      backgroundPosition: "center center",
      backgroundRepeat: "no-repeat",
    };
  }, [wallpaperResolvedUrl, theme]);

  const messagesScrollAreaStyle = useMemo(
    (): React.CSSProperties => ({
      backgroundColor: chatWallpaperLayerStyle ? "transparent" : "var(--bg-secondary)",
      WebkitOverflowScrolling: "touch",
      touchAction: "pan-y",
      overscrollBehavior: "contain",
    }),
    [chatWallpaperLayerStyle],
  );

  const closeChatInfoPanel = useCallback(() => {
    setChatInfoPanel(null);
    setProfileUserId(null);
    setSharedMediaCategory(null);
  }, []);

  const openPrivateChatByMention = useCallback(
    async (username: string) => {
      const un = username.trim().toLowerCase();
      if (!un) return;

      let targetUserId: number | null = mentionUsersByUsername.get(un)?.id ?? null;
      if (!targetUserId) {
        try {
          const found = await api.chat.users(username.trim());
          const exact = found.find((u) => (u.username || "").toLowerCase() === un);
          targetUserId = exact?.id ?? null;
        } catch {
          targetUserId = null;
        }
      }
      if (!targetUserId) {
        window.alert(`Пользователь @${username} не найден в чате`);
        return;
      }
      if (targetUserId === userId) return;

      try {
        const res = await api.chat.privateDialogs.ensure(targetUserId);
        setSelectedDialogId(res.id);
        setActive({ kind: "private", dialogId: res.id });
        setShowChatList(false);
        closeChatInfoPanel();
        setShowUserFinder(false);
        await loadPrivateDialogs();
        await loadPrivateMessages(res.id);
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Не удалось открыть личный чат");
      }
    },
    [mentionUsersByUsername, userId, closeChatInfoPanel]
  );

  const openUserProfile = useCallback((uid: number) => {
    setProfileUserId(uid);
    setChatInfoPanel("userProfile");
    setShowGroupMembers(false);
    setSharedMediaCategory(null);
  }, []);

  const infoPanelTitle =
    chatInfoPanel === "userProfile"
      ? chatUserProfile?.display_name || "Профиль"
      : chatInfoPanel === "settings"
        ? "Настройки"
        : active.kind === "group"
          ? infoTitle
          : active.kind === "private"
            ? "Профиль"
            : "Общий чат";

  const infoPanelAvatarName =
    chatInfoPanel === "userProfile" ? chatUserProfile?.display_name || "Профиль" : headerTitle;
  const infoPanelAvatarSeed = chatInfoPanel === "userProfile" ? profileUserId ?? 0 : headerAvatarSeed;
  const infoPanelAvatarUrl =
    chatInfoPanel === "userProfile" ? chatUserProfile?.avatar_url ?? null : headerAvatarUrl;

  const renderUserContactInfo = () => {
    if (chatUserProfileLoading) {
      return (
        <p className="px-4 py-4 text-sm text-center" style={{ color: "var(--text-tertiary)" }}>
          Загрузка…
        </p>
      );
    }
    const phone = (chatUserProfile?.phone || "").trim();
    const username = (chatUserProfile?.username || "").trim();
    return (
      <>
        <ChatProfileInfoRow
          label="имя пользователя"
          value={username ? `@${username}` : "не указано"}
          onCopy={
            username
              ? () => {
                  void navigator.clipboard?.writeText(`@${username}`);
                }
              : undefined
          }
        />
        <ChatProfileInfoRow
          label="мобильный"
          value={phone || "не указан"}
          href={phone ? formatPhoneTelHref(phone) : undefined}
        />
        <ChatProfileInfoRow label="день рождения" value={fmtProfileBirthDate(chatUserProfile?.birth_date)} />
      </>
    );
  };
  const listSearchNeedle = listSearchQuery.trim().toLowerCase();

  useEffect(() => {
    const q = listSearchQuery.trim();
    if (q.length < 2) {
      setListSearchUsers([]);
      setListSearchMessages([]);
      setListSearchLoading(false);
      return;
    }
    let cancelled = false;
    setListSearchLoading(true);
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await api.chat.search(q, 50);
          if (!cancelled) {
            setListSearchUsers(res.users);
            setListSearchMessages(res.messages);
          }
        } catch {
          if (!cancelled) {
            setListSearchUsers([]);
            setListSearchMessages([]);
          }
        } finally {
          if (!cancelled) setListSearchLoading(false);
        }
      })();
    }, 320);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [listSearchQuery]);

  const openSearchUser = useCallback(
    async (targetUserId: number) => {
      if (targetUserId === userId) return;
      try {
        const res = await api.chat.privateDialogs.ensure(targetUserId);
        setListSearchQuery("");
        setListSearchUsers([]);
        setListSearchMessages([]);
        setSelectedDialogId(res.id);
        setActive({ kind: "private", dialogId: res.id });
        setShowChatList(false);
        await loadPrivateDialogs();
        await loadPrivateMessages(res.id);
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Не удалось открыть чат");
      }
    },
    [userId],
  );

  const openSearchMessageHit = useCallback(
    async (hit: ChatSearchMessageHit) => {
      setListSearchQuery("");
      setListSearchUsers([]);
      setListSearchMessages([]);
      try {
        if (hit.chat_type === "general") {
          setActive({ kind: "general" });
          await loadGeneralMessages();
        } else if (hit.chat_type === "private" && hit.private_dialog_id) {
          setSelectedDialogId(hit.private_dialog_id);
          setActive({ kind: "private", dialogId: hit.private_dialog_id });
          await loadPrivateDialogs();
          await loadPrivateMessages(hit.private_dialog_id);
        } else if (hit.chat_type === "group" && hit.group_dialog_id) {
          setActive({ kind: "group", dialogId: hit.group_dialog_id });
          await loadGroupDialogs();
          await loadGroupMessages(hit.group_dialog_id);
        } else if (hit.chat_type === "bot" && hit.bot_thread_user_id) {
          setActive({ kind: "bot", threadUserId: hit.bot_thread_user_id });
          await loadBotMessages(hit.bot_thread_user_id);
          if (isAdmin) await loadBotThreads();
        } else {
          return;
        }
        setShowChatList(false);
        await jumpToMessage(hit.message_id);
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Не удалось открыть сообщение");
      }
    },
    [isAdmin, jumpToMessage],
  );

  const mergedDialogs = [
    ...privateDialogs.map((d) => ({
      key: `p-${d.id}`,
      kind: "private" as const,
      dialogId: d.id,
      title: d.other_user.display_name || d.other_user.username,
      searchExtra: `@${d.other_user.username}`,
      subtitle: d.last_message_text || "—",
      time: formatChatTimestamp(d.last_message_at || null),
      sortTs: d.last_message_at ? new Date(d.last_message_at).getTime() : 0,
      unread: unreadPrivateById.get(d.id) === true,
      seed: d.other_user.id || d.id,
      imageUrl: d.other_user.avatar_url ?? null,
    })),
    ...groupDialogs.map((d) => ({
      key: `g-${d.id}`,
      kind: "group" as const,
      dialogId: d.id,
      title: d.name,
      subtitle: d.is_channel ? `📢 ${d.last_message_text || "Канал"}` : d.last_message_text || "—",
      time: formatChatTimestamp(d.last_message_at || null),
      sortTs: d.last_message_at ? new Date(d.last_message_at).getTime() : 0,
      unread: unreadGroupById.get(d.id) === true,
      seed: d.id,
      imageUrl: d.image_url ?? null,
      isChannel: Boolean(d.is_channel),
    })),
  ].sort((a, b) => b.sortTs - a.sortTs);

  const activeFolderKeys = useMemo(() => {
    if (activeFolderId == null) return null;
    const folder = chatFolders.find((f) => f.id === activeFolderId);
    if (!folder) return new Set<string>();
    return new Set(
      folder.items.map((it) =>
        it.chat_type === "private" ? `p-${it.private_dialog_id}` : `g-${it.group_dialog_id}`,
      ),
    );
  }, [chatFolders, activeFolderId]);

  const visibleDialogs = useMemo(() => {
    if (!activeFolderKeys) return mergedDialogs;
    return mergedDialogs.filter((d) => activeFolderKeys.has(d.key));
  }, [mergedDialogs, activeFolderKeys]);

  const filteredDialogs = useMemo(() => {
    const list = !listSearchNeedle
      ? visibleDialogs
      : visibleDialogs.filter((d) => {
          const hay = `${d.title} ${d.subtitle} ${(d as { searchExtra?: string }).searchExtra || ""}`.toLowerCase();
          return hay.includes(listSearchNeedle);
        });
    return [...list].sort((a, b) => b.sortTs - a.sortTs);
  }, [visibleDialogs, listSearchNeedle]);

  const filteredBotThreads = useMemo(() => {
    if (!listSearchNeedle || !isAdmin) return botThreads;
    return botThreads.filter((t) => {
      const u = t.user;
      const hay = `${u.display_name || ""} ${u.username} ${t.last_message_text || ""}`.toLowerCase();
      return hay.includes(listSearchNeedle);
    });
  }, [botThreads, listSearchNeedle, isAdmin]);

  const openBotThreads = useMemo(
    () => filteredBotThreads.filter((t) => !t.is_closed),
    [filteredBotThreads],
  );
  const closedBotThreads = useMemo(
    () => filteredBotThreads.filter((t) => Boolean(t.is_closed)),
    [filteredBotThreads],
  );

  const renderListSearchBar = () => (
    <div className="flex-shrink-0 px-2 pb-2 pt-1">
      <div className="relative">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "var(--text-tertiary)" }}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          value={listSearchQuery}
          onChange={(e) => setListSearchQuery(e.target.value)}
          placeholder="Поиск чатов, людей и сообщений…"
          className="w-full rounded-2xl border py-2 pl-9 pr-9 text-sm"
          style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          aria-label="Поиск по чатам"
        />
        {listSearchQuery.trim().length > 0 ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-sm"
            style={{ color: "var(--text-tertiary)" }}
            aria-label="Очистить поиск"
            onClick={() => {
              setListSearchQuery("");
              setListSearchUsers([]);
              setListSearchMessages([]);
            }}
          >
            ×
          </button>
        ) : null}
      </div>
      {listSearchNeedle.length >= 2 && listSearchLoading ? (
        <div className="text-[11px] px-2 pt-1.5" style={{ color: "var(--text-tertiary)" }}>
          Поиск…
        </div>
      ) : null}
    </div>
  );

  const renderListSearchResults = () => {
    if (listSearchNeedle.length < 2) return null;
    const existingPrivateUserIds = new Set(privateDialogs.map((d) => d.other_user.id));
    const usersToShow = listSearchUsers.filter((u) => !existingPrivateUserIds.has(u.id));
    if (listSearchMessages.length === 0 && usersToShow.length === 0 && !listSearchLoading) {
      return (
        <div className="text-[11px] px-2 py-2" style={{ color: "var(--text-tertiary)" }}>
          Сообщений и новых контактов не найдено
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-3 mb-3">
        {listSearchMessages.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <div className="text-[11px] font-semibold px-1 uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
              Сообщения
            </div>
            {listSearchMessages.map((hit) => (
              <button
                key={`msg-${hit.message_id}`}
                type="button"
                className="w-full text-left rounded-2xl p-3 transition-all"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                onClick={() => void openSearchMessageHit(hit)}
              >
                <div className="text-xs font-semibold truncate" style={{ color: "var(--accent)" }}>
                  {hit.chat_title}
                </div>
                <div className="text-sm mt-0.5 line-clamp-2" style={{ color: "var(--text-primary)" }}>
                  {hit.preview_text || "—"}
                </div>
                <div className="text-[11px] mt-1 truncate" style={{ color: "var(--text-tertiary)" }}>
                  {hit.sender_name ? `${hit.sender_name} · ` : ""}
                  {formatChatTimestamp(hit.created_at)}
                </div>
              </button>
            ))}
          </div>
        ) : null}
        {usersToShow.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <div className="text-[11px] font-semibold px-1 uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
              Пользователи
            </div>
            {usersToShow.map((u) => (
              <button
                key={`u-${u.id}`}
                type="button"
                className="w-full text-left rounded-2xl p-3"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                onClick={() => void openSearchUser(u.id)}
              >
                <div className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                  {u.display_name || u.username}
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                  @{u.username}
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const renderFolderTabs = () => (
    <div
      className="flex-shrink-0 flex items-center gap-1.5 px-2 py-2 border-b overflow-x-auto"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-primary)" }}
    >
      <button
        type="button"
        className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0"
        style={{
          background: activeFolderId == null ? "var(--accent)" : "var(--bg-secondary)",
          color: activeFolderId == null ? "#fff" : "var(--text-secondary)",
          border: `1px solid ${activeFolderId == null ? "var(--accent)" : "var(--border)"}`,
        }}
        onClick={() => setActiveFolderId(null)}
      >
        Все
      </button>
      {chatFolders.map((f) => (
        <button
          key={f.id}
          type="button"
          className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 max-w-[140px] truncate"
          style={{
            background: activeFolderId === f.id ? "var(--accent)" : "var(--bg-secondary)",
            color: activeFolderId === f.id ? "#fff" : "var(--text-primary)",
            border: `1px solid ${activeFolderId === f.id ? "var(--accent)" : "var(--border)"}`,
          }}
          title={f.name}
          onClick={() => setActiveFolderId(f.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            if (window.confirm(`Удалить папку «${f.name}»?`)) void deleteChatFolder(f.id);
          }}
        >
          {f.name}
          {f.items.length > 0 ? ` (${f.items.length})` : ""}
        </button>
      ))}
      <button
        type="button"
        className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-lg font-semibold"
        style={{ background: "var(--bg-secondary)", color: "var(--accent)", border: "1px solid var(--border)" }}
        title="Новая папка"
        aria-label="Новая папка"
        onClick={() => setShowFolderCreate(true)}
      >
        +
      </button>
    </div>
  );

  const renderDialogList = () => {
    const openGigaChat = async () => {
      if (!gigaChatVisible) return;
      setActive({ kind: "gigachat" });
      setShowChatList(false);
      await loadGigaChatMessages();
    };
    const openUserBot = () => {
      setActive({ kind: "bot", threadUserId: userId });
      setShowChatList(false);
    };
    const openAdminBotHub = () => {
      setActive({ kind: "bot", threadUserId: 0 });
      setBotMessages([]);
      void loadBotThreads();
      setShowChatList(false);
    };
    const userBotUnread = botThreads.length === 0 ? false : botThreads.some((t) => t.unread_count > 0);
    const botListMatchesSearch =
      !listSearchNeedle ||
      listSearchNeedle.includes("поддерж") ||
      listSearchNeedle.includes("бот") ||
      listSearchNeedle.includes("служб");
    const showBotInList =
      activeFolderId == null &&
      botListMatchesSearch &&
      (!isAdmin || !listSearchNeedle || filteredBotThreads.length > 0);
    const botSection =
      showBotInList ? (
        <div className="flex flex-col gap-2">
          <div
            className="text-[11px] font-semibold px-1 uppercase tracking-wide"
            style={{ color: "var(--text-tertiary)" }}
          >
            Поддержка
          </div>
          {!isAdmin ? (
            <ChatRow
              title="Служба поддержки"
              subtitle="Написать администратору"
              time=""
              selected={active.kind === "bot"}
              unread={userBotUnread}
              seed={userId}
              onClick={openUserBot}
            />
          ) : (
            <>
              <div className="flex items-stretch gap-1">
                <div className="flex-1 min-w-0">
                  <ChatRow
                    title="Все обращения"
                    subtitle={
                      botThreadsCollapsed
                        ? `${filteredBotThreads.length} в списке (свёрнуто)`
                        : "Список пользователей"
                    }
                    time=""
                    selected={active.kind === "bot" && activeBotThreadId <= 0}
                    unread={botThreads.some((t) => t.unread_count > 0)}
                    seed={1}
                    onClick={openAdminBotHub}
                  />
                </div>
                {filteredBotThreads.length > 0 ? (
                  <button
                    type="button"
                    className="shrink-0 self-center text-[11px] font-semibold px-2 py-1 rounded-lg"
                    style={{ color: "var(--accent)", background: "var(--accent-light)" }}
                    title={botThreadsCollapsed ? "Показать обращения в списке" : "Свернуть обращения в списке"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleBotThreadsCollapsed();
                    }}
                  >
                    {botThreadsCollapsed ? "Развернуть" : "Свернуть"}
                  </button>
                ) : null}
              </div>
              {!botThreadsCollapsed ? (
                <>
                  {openBotThreads.map((t) => (
                    <ChatRow
                      key={`bot-${t.user.id}`}
                      title={t.user.display_name || t.user.username}
                      subtitle={t.last_message_text || "—"}
                      time={formatChatTimestamp(t.last_message_at || null)}
                      selected={active.kind === "bot" && activeBotThreadId === t.user.id}
                      unread={t.unread_count > 0}
                      seed={t.user.id}
                      imageUrl={t.user.avatar_url}
                      onClick={() => void openAdminBotThread(t.user.id)}
                    />
                  ))}
                  {closedBotThreads.length > 0 ? (
                    <div
                      className="text-[11px] font-semibold px-1 pt-2 uppercase tracking-wide"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      Закрытые ({closedBotThreads.length})
                    </div>
                  ) : null}
                  {closedBotThreads.map((t) => (
                    <div key={`bot-closed-${t.user.id}`} style={{ opacity: 0.78 }}>
                      <ChatRow
                        title={t.user.display_name || t.user.username}
                        subtitle={`Закрыто · ${t.last_message_text || "—"}`}
                        time={formatChatTimestamp(t.closed_at || t.last_message_at || null)}
                        selected={active.kind === "bot" && activeBotThreadId === t.user.id}
                        unread={t.unread_count > 0}
                        seed={t.user.id}
                        imageUrl={t.user.avatar_url}
                        onClick={() => void openAdminBotThread(t.user.id)}
                      />
                    </div>
                  ))}
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null;

    const gigaChatMatchesSearch =
      !listSearchNeedle || listSearchNeedle.includes("гига") || listSearchNeedle.includes("нейро") || listSearchNeedle.includes("giga");
    const showGigaChatInList = gigaChatVisible && activeFolderId == null && gigaChatMatchesSearch;
    const gigaChatSection = showGigaChatInList ? (
      <div className="flex flex-col gap-2">
        <div className="text-[11px] font-semibold px-1 uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
          Нейросеть
        </div>
        <ChatRow
          title="GigaChat"
          subtitle={gigaChatLoading ? "Загрузка…" : "Напишите задачу — бот уточнит ссылку/текст"}
          time=""
          selected={active.kind === "gigachat"}
          unread={false}
          seed={999}
          onClick={() => void openGigaChat()}
        />
      </div>
    ) : null;

    if (visibleDialogs.length === 0 && !listSearchNeedle) {
      return (
        <div className="flex flex-col gap-3">
          {gigaChatSection}
          {botSection}
          {renderListSearchResults()}
          <div className="text-[11px] px-1" style={{ color: "var(--text-tertiary)" }}>
            {activeFolderId != null
              ? "В этой папке пока нет чатов. ПКМ по чату в «Все» — добавить в папку."
              : "Чатов пока нет"}
          </div>
        </div>
      );
    }
    const row = (d: (typeof visibleDialogs)[number]) => (
      <div
        key={d.key}
        onContextMenu={(e) => {
          e.preventDefault();
          setDialogFolderMenu({
            x: e.clientX,
            y: e.clientY,
            kind: d.kind,
            dialogId: d.dialogId,
            title: d.title,
          });
        }}
      >
        <ChatRow
          title={d.title}
          subtitle={d.subtitle}
          time={d.time}
          selected={active.kind === d.kind && active.dialogId === d.dialogId}
          unread={d.unread}
          seed={d.seed}
          imageUrl={d.imageUrl}
          isChannel={d.kind === "group" ? Boolean((d as { isChannel?: boolean }).isChannel) : false}
          onClick={() => {
            if (d.kind === "private") setSelectedDialogId(d.dialogId);
            setActive({ kind: d.kind, dialogId: d.dialogId });
            setShowChatList(false);
          }}
        />
      </div>
    );
    const noChatMatches =
      listSearchNeedle.length > 0 &&
      filteredDialogs.length === 0 &&
      !gigaChatSection &&
      !botSection;

    return (
      <div className="flex flex-col gap-3">
        {gigaChatSection}
        {botSection}
        {renderListSearchResults()}
        {noChatMatches ? (
          <div className="text-[11px] px-1" style={{ color: "var(--text-tertiary)" }}>
            Нет совпадений в списке чатов
          </div>
        ) : null}
        {filteredDialogs.length > 0 ? (
          <div className="flex flex-col gap-2">{filteredDialogs.map(row)}</div>
        ) : null}
      </div>
    );
  };

  const ChatRow = ({
    title,
    subtitle,
    time,
    selected,
    unread,
    seed,
    imageUrl,
    isChannel,
    onClick,
  }: {
    title: string;
    subtitle: string;
    time: string;
    selected: boolean;
    unread: boolean;
    seed: number;
    imageUrl?: string | null;
    isChannel?: boolean;
    onClick: () => void;
  }) => {
    const bg = selected ? "rgba(87,157,255,0.14)" : unread ? "rgba(239,68,68,0.06)" : "transparent";
    const border = selected ? "1px solid rgba(87,157,255,0.28)" : "1px solid transparent";
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left rounded-2xl p-3 transition-all"
        style={{
          backgroundColor: bg,
          border,
        }}
      >
        <div className="flex items-center gap-3">
          <Avatar name={title} seed={seed} imageUrl={imageUrl} size={44} />

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-sm truncate flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
                {isChannel ? (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                    style={{ backgroundColor: "rgba(87,157,255,0.18)", color: "var(--accent)" }}
                  >
                    Канал
                  </span>
                ) : null}
                <span className="truncate">{title}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {time && (
                  <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                    {time}
                  </div>
                )}
                {unread && !selected && <span aria-hidden className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#ef4444" }} />}
              </div>
            </div>
            <div className="text-xs truncate mt-1" style={{ color: unread ? "var(--text-secondary)" : "var(--text-tertiary)" }}>
              {subtitle || "—"}
            </div>
          </div>
        </div>
      </button>
    );
  };

  const activeConvLoading =
    active.kind === "general"
      ? generalLoading
      : active.kind === "private"
        ? dialogLoading
        : active.kind === "group"
          ? groupLoading
          : active.kind === "bot"
            ? botLoading
            : active.kind === "gigachat"
              ? gigaChatLoading
              : false;

  return (
    <div
      ref={chatShellRef}
      className={`chat-messenger-shell relative flex-1 h-full min-h-0 w-full flex flex-col ${
        isMobileViewport ? "" : variant === "widget" ? "lg:flex-row" : "md:flex-row"
      } bg-[var(--bg-secondary)]`}
    >
      {showUserFinder && (
        <div
          className="fixed inset-0 z-[125] flex items-center justify-center p-0 sm:p-3"
          style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)", overscrollBehavior: "contain" }}
          onClick={() => setShowUserFinder(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full sm:max-w-[560px] overflow-hidden sm:rounded-3xl"
            style={{
              height: "100dvh",
              maxHeight: "100dvh",
              backgroundColor: "var(--bg-primary)",
              border: "1px solid var(--border)",
              boxShadow: "0 18px 60px rgba(0,0,0,0.28)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-full min-h-0 flex flex-col">
              <div className="p-3 flex items-center gap-2 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
                <button
                  type="button"
                  className="p-2 rounded-xl"
                  style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                  aria-label="Назад"
                  title="Назад"
                  onClick={() => setShowUserFinder(false)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <div className="font-bold" style={{ color: "var(--text-primary)" }}>
                  Контакты
                </div>
              </div>

              <div className="p-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="relative">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    value={finderQuery}
                    onChange={(e) => setFinderQuery(e.target.value)}
                    placeholder="Поиск по логину или имени…"
                    className="w-full rounded-2xl border p-3 pl-10 text-sm"
                    style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border)" }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                    {finderQuery.trim().length < 2 ? "Введите минимум 2 символа" : finderLoading ? "Поиск…" : finderResults.length > 0 ? `Найдено: ${finderResults.length}` : "Ничего не найдено"}
                  </div>
                  {finderQuery.trim().length > 0 && (
                    <button
                      type="button"
                      className="px-2 py-1 rounded-xl text-[11px] font-semibold"
                      style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                      onClick={() => {
                        setFinderQuery("");
                        setFinderResults([]);
                      }}
                    >
                      Очистить
                    </button>
                  )}
                </div>
              </div>

              <div
                className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3"
                data-allow-scroll
                style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", overscrollBehavior: "contain" }}
              >
                {finderQuery.trim().length < 2 && privateDialogs.length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                      Недавние
                    </div>
                    <div className="flex flex-col gap-2">
                      {privateDialogs.slice(0, 12).map((d) => {
                        const title = d.other_user.display_name || d.other_user.username;
                        return (
                          <button
                            key={`recent-${d.id}`}
                            type="button"
                            className="w-full text-left rounded-2xl p-3 transition-colors"
                            style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                            onClick={async () => {
                              setSelectedDialogId(d.id);
                              setActive({ kind: "private", dialogId: d.id });
                              setShowChatList(false);
                              await loadPrivateDialogs();
                              await loadPrivateMessages(d.id);
                              setShowUserFinder(false);
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <Avatar name={title} seed={d.other_user.id || d.id} imageUrl={d.other_user.avatar_url} />
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                                  {title}
                                </div>
                                <div className="text-xs truncate mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                                  {d.last_message_text || "—"}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {finderQuery.trim().length >= 2 && (
                  <div className="flex flex-col gap-2">
                    {finderResults.map((u) => {
                      const title = u.display_name || u.username;
                      return (
                        <button
                          key={u.id}
                          type="button"
                          className="w-full text-left rounded-2xl p-3 transition-colors"
                          style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                          onClick={async () => {
                            const res = await api.chat.privateDialogs.ensure(u.id);
                            setSelectedDialogId(res.id);
                            setActive({ kind: "private", dialogId: res.id });
                            setShowChatList(false);
                            await loadPrivateDialogs();
                            await loadPrivateMessages(res.id);
                            setShowUserFinder(false);
                            setFinderQuery("");
                            setFinderResults([]);
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <Avatar name={title} seed={u.id} imageUrl={u.avatar_url} />
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                                {title}
                              </div>
                              <div className="text-xs truncate mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                                {u.username}
                              </div>
                              <div className="text-[11px] mt-1" style={{ color: "var(--accent)" }}>
                                Открыть диалог
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showGroupCreateWizard && (
        <div
          className="fixed inset-0 z-[126] flex items-center justify-center p-0 sm:p-3"
          style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)", overscrollBehavior: "contain" }}
          onClick={() => closeGroupWizard()}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full h-[100dvh] max-h-[100dvh] sm:h-[min(90vh,880px)] sm:max-h-[min(90vh,880px)] sm:max-w-[min(760px,calc(100vw-1.5rem))] overflow-hidden sm:rounded-3xl"
            style={{
              backgroundColor: "var(--bg-primary)",
              border: "1px solid var(--border)",
              boxShadow: "0 18px 60px rgba(0,0,0,0.28)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-full min-h-0 flex flex-col">
              <div className="p-3 flex items-center gap-2 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
                <button
                  type="button"
                  className="p-2 rounded-xl"
                  style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                  aria-label="Назад"
                  title="Назад"
                  onClick={() => {
                    if (groupWizardStep === 2) {
                      setGroupWizardStep(1);
                      return;
                    }
                    closeGroupWizard();
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <div className="font-bold" style={{ color: "var(--text-primary)" }}>
                  {groupWizardStep === 1
                    ? groupWizardIsChannel
                      ? "Новый канал"
                      : "Новая группа"
                    : groupWizardIsChannel
                      ? "Подписчики"
                      : "Участники"}
                </div>
                <div className="ml-auto text-[11px] font-semibold" style={{ color: "var(--text-tertiary)" }}>
                  {groupWizardStep}/2
                </div>
              </div>

              {groupWizardStep === 1 ? (
                <div className="p-3 flex-1 min-h-0 flex flex-col gap-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold"
                      style={{
                        backgroundColor: !groupWizardIsChannel ? "var(--accent)" : "var(--bg-secondary)",
                        color: !groupWizardIsChannel ? "#fff" : "var(--text-secondary)",
                        border: `1px solid ${!groupWizardIsChannel ? "var(--accent)" : "var(--border)"}`,
                      }}
                      onClick={() => {
                        setGroupWizardIsChannel(false);
                      }}
                    >
                      Группа
                    </button>
                    <button
                      type="button"
                      className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold"
                      style={{
                        backgroundColor: groupWizardIsChannel ? "var(--accent)" : "var(--bg-secondary)",
                        color: groupWizardIsChannel ? "#fff" : "var(--text-secondary)",
                        border: `1px solid ${groupWizardIsChannel ? "var(--accent)" : "var(--border)"}`,
                      }}
                      onClick={() => {
                        setGroupWizardIsChannel(true);
                        setGroupWizardMembersSeeOwnOnly(false);
                      }}
                    >
                      Канал
                    </button>
                  </div>
                  {groupWizardIsChannel ? (
                    <p className="text-xs leading-relaxed m-0" style={{ color: "var(--text-tertiary)" }}>
                      Информационный канал: публиковать могут только администраторы, остальные только читают.
                    </p>
                  ) : (
                    <label
                      className="flex items-start gap-3 p-3 rounded-xl cursor-pointer"
                      style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 w-4 h-4 shrink-0"
                        checked={groupWizardMembersSeeOwnOnly}
                        onChange={(e) => setGroupWizardMembersSeeOwnOnly(e.target.checked)}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                          Личная переписка участников
                        </span>
                        <span className="block text-xs mt-0.5 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                          Каждый участник видит только свои сообщения. Администраторы группы и CRM видят всю историю.
                        </span>
                      </span>
                    </label>
                  )}
                  <div className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                    {groupWizardIsChannel ? "Название канала" : "Название группы"}
                  </div>
                  <input
                    value={groupWizardName}
                    onChange={(e) => setGroupWizardName(e.target.value)}
                    placeholder={groupWizardIsChannel ? "Например: Новости компании" : "Например: Отдел продаж"}
                    className="w-full rounded-2xl border p-3 text-sm"
                    style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border)" }}
                    autoFocus
                  />
                  <div className="flex-1" />
                  <button
                    type="button"
                    className="w-full px-4 py-3 rounded-2xl text-sm font-semibold"
                    style={{
                      background: groupWizardName.trim().length > 0 ? "linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)" : "rgba(87,157,255,0.25)",
                      color: "#fff",
                      border: "1px solid rgba(255,255,255,0.18)",
                      opacity: groupWizardName.trim().length > 0 ? 1 : 0.7,
                      cursor: groupWizardName.trim().length > 0 ? "pointer" : "not-allowed",
                    }}
                    disabled={groupWizardName.trim().length === 0}
                    onClick={() => {
                      if (groupWizardName.trim().length === 0) return;
                      setGroupWizardStep(2);
                    }}
                  >
                    Дальше
                  </button>
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-3">
                  <ChatUserAddPicker
                    className="flex-1"
                    selected={groupWizardSelected}
                    onSelectedChange={setGroupWizardSelected}
                    excludeUserIds={[userId]}
                    searchUsers={(q) => api.chat.users(q.trim(), CHAT_USERS_QUERY_LIMIT)}
                    placeholder="Имя или логин…"
                    hintTitle="Найдите участников по имени или нажмите «Добавить всех», чтобы выбрать всех активных пользователей CRM."
                    onSelectAll={() =>
                      mergeAllChatUsersIntoSelection(
                        [userId],
                        groupWizardSelected,
                        setGroupWizardSelected,
                        setGroupWizardSelectAllLoading,
                      )
                    }
                    selectAllLoading={groupWizardSelectAllLoading}
                    onClearSelected={() => setGroupWizardSelected(new Map())}
                    selectedTitle={groupWizardIsChannel ? "Подписчики" : "Участники"}
                    showPrimaryAction
                    primaryActionLabel={
                      groupWizardSelected.size > 0
                        ? groupWizardIsChannel
                          ? `Создать канал (${groupWizardSelected.size})`
                          : `Создать группу (${groupWizardSelected.size})`
                        : groupWizardIsChannel
                          ? "Создать канал"
                          : "Создать группу"
                    }
                    onPrimaryAction={async () => {
                      const name = groupWizardName.trim();
                      if (!name) return;
                      if (groupWizardSelected.size > 0) {
                        const who = Array.from(groupWizardSelected.values())
                          .map((u) => `• ${u.display_name || u.username} (@${u.username})`)
                          .join("\n");
                        const noun = groupWizardIsChannel ? "канал" : "группу";
                        if (!window.confirm(`Создать ${noun} «${name}» с ${groupWizardSelected.size} участниками?\n\n${who}`)) {
                          return;
                        }
                      }
                      const member_ids = Array.from(groupWizardSelected.keys());
                      const created = await api.chat.groupDialogs.create({
                        name,
                        member_ids,
                        is_channel: groupWizardIsChannel,
                        members_see_own_only: !groupWizardIsChannel && groupWizardMembersSeeOwnOnly,
                      });
                      await loadGroupDialogs();
                      setActive({ kind: "group", dialogId: created.id });
                      setShowChatList(false);
                      closeGroupWizard();
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {messageReadsModal && (
        <div
          className="fixed inset-0 z-[132] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}
          onClick={() => setMessageReadsModal(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full sm:max-w-md max-h-[min(85vh,520px)] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
            style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="px-4 py-3 flex items-center justify-between shrink-0 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="min-w-0">
                <div className="font-semibold text-base" style={{ color: "var(--text-primary)" }}>
                  {messageReadsModal.kind === "ack" ? "Ознакомления" : "Прочтения"}
                </div>
                <div className="text-xs truncate mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                  {messageReadsModal.data
                    ? messageReadsModal.kind === "ack"
                      ? `${messageReadsModal.data.read.length} из ${messageReadsModal.data.recipient_count} ознакомились`
                      : `${messageReadsModal.data.read.length} из ${messageReadsModal.data.recipient_count} прочитали`
                    : "Загрузка…"}
                </div>
              </div>
              <button
                type="button"
                className="px-3 py-1.5 rounded-xl text-sm font-medium shrink-0"
                style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                onClick={() => setMessageReadsModal(null)}
              >
                Закрыть
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-4">
              {messageReadsModal.loading ? (
                <p className="text-sm px-1" style={{ color: "var(--text-secondary)" }}>
                  Загрузка…
                </p>
              ) : messageReadsModal.error ? (
                <p className="text-sm px-1" style={{ color: "var(--error)" }}>
                  {messageReadsModal.error}
                </p>
              ) : messageReadsModal.data ? (
                <>
                  {messageReadsModal.data.read.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold mb-2 px-1" style={{ color: "var(--text-secondary)" }}>
                        {messageReadsModal.kind === "ack"
                          ? `Ознакомились (${messageReadsModal.data.read.length})`
                          : `Прочитали (${messageReadsModal.data.read.length})`}
                      </div>
                      <div className="space-y-1.5">
                        {messageReadsModal.data.read.map((row) => (
                          <div
                            key={row.user.id}
                            className="flex items-center gap-3 p-2.5 rounded-xl"
                            style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                          >
                            <Avatar
                              name={row.user.display_name || row.user.username}
                              seed={row.user.id}
                              imageUrl={row.user.avatar_url}
                              size={36}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-sm truncate" style={{ color: "var(--text-primary)" }}>
                                {row.user.display_name || row.user.username}
                              </div>
                              <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                                {formatChatTimestamp(row.read_at)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {messageReadsModal.data.unread.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold mb-2 px-1" style={{ color: "var(--text-secondary)" }}>
                        {messageReadsModal.kind === "ack"
                          ? `Не ознакомились (${messageReadsModal.data.unread.length})`
                          : `Не прочитали (${messageReadsModal.data.unread.length})`}
                      </div>
                      <div className="space-y-1.5">
                        {messageReadsModal.data.unread.map((row) => (
                          <div
                            key={row.user.id}
                            className="flex items-center gap-3 p-2.5 rounded-xl"
                            style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                          >
                            <Avatar
                              name={row.user.display_name || row.user.username}
                              seed={row.user.id}
                              imageUrl={row.user.avatar_url}
                              size={36}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-sm truncate" style={{ color: "var(--text-primary)" }}>
                                {row.user.display_name || row.user.username}
                              </div>
                              <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                                {messageReadsModal.kind === "ack" ? "Ещё не нажали «Ознакомиться»" : "Ещё не открывали"}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {messageReadsModal.data.read.length === 0 && messageReadsModal.data.unread.length === 0 && (
                    <p className="text-sm px-1" style={{ color: "var(--text-secondary)" }}>
                      {messageReadsModal.kind === "ack"
                        ? "Нет подписчиков для отслеживания ознакомления."
                        : "Нет получателей для отслеживания прочтения."}
                    </p>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {messageMenu && (
        <ChatMessageActionsMenu
          anchorX={messageMenu.x}
          anchorY={messageMenu.y}
          onClose={() => setMessageMenu(null)}
        >
            {(() => {
              const copyableText = messageCopyText(messageMenu.message);
              const canReact =
                !messageMenu.message.is_deleted && messageMenu.message.id > 0;
              return (
                <>
            {canReact ? (
              <div
                className="flex flex-wrap gap-1 px-2 py-2 mb-1 border-b"
                style={{ borderColor: "var(--border)" }}
              >
                {CHAT_QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="w-9 h-9 rounded-xl text-xl leading-none flex items-center justify-center transition-colors hover:opacity-90"
                    style={{
                      backgroundColor: messageMenu.message.reactions?.some(
                        (r) => r.emoji === emoji && r.reacted_by_me,
                      )
                        ? "rgba(87, 157, 255, 0.18)"
                        : "var(--bg-secondary)",
                    }}
                    title="Реакция"
                    disabled={reactionSavingId === messageMenu.message.id}
                    onClick={() => {
                      void onToggleReaction(messageMenu.message.id, emoji);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : null}
            {!(active.kind === "group" && activeIsChannel) ? (
              <button
                type="button"
                className="w-full text-left px-3 py-2 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: "transparent", color: "var(--text-primary)" }}
                onClick={() => {
                  startReply(messageMenu.message);
                }}
              >
                Ответить
              </button>
            ) : null}
            {messageMenu.message.sender?.id &&
            messageMenu.message.sender.id !== userId ? (
              <button
                type="button"
                className="w-full text-left px-3 py-2 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: "transparent", color: "var(--text-primary)" }}
                onClick={async () => {
                  const targetUserId = messageMenu.message.sender?.id ?? null;
                  if (!targetUserId || targetUserId === userId) return;
                  setMessageMenu(null);
                  try {
                    const res = await api.chat.privateDialogs.ensure(targetUserId);
                    setSelectedDialogId(res.id);
                    setActive({ kind: "private", dialogId: res.id });
                    setShowChatList(false);
                    closeChatInfoPanel();
                    setShowUserFinder(false);
                    await loadPrivateDialogs();
                    await loadPrivateMessages(res.id);
                  } catch (e) {
                    window.alert(e instanceof Error ? e.message : "Не удалось открыть личный чат");
                  }
                }}
              >
                Ответить лично
              </button>
            ) : null}
            <button
              type="button"
              className="w-full text-left px-3 py-2 rounded-xl text-sm font-semibold"
              style={{
                backgroundColor: "transparent",
                color: copyableText ? "var(--text-primary)" : "var(--text-tertiary)",
                cursor: copyableText ? "pointer" : "not-allowed",
              }}
              disabled={!copyableText}
              onClick={() => {
                void copyMessage(messageMenu.message);
              }}
            >
              Копировать
            </button>
            <button
              type="button"
              className="w-full text-left px-3 py-2 rounded-xl text-sm font-semibold"
              style={{ backgroundColor: "transparent", color: "var(--text-primary)" }}
              onClick={() => {
                startMessageSelection(messageMenu.message);
              }}
            >
              Выбрать
            </button>
            <button
              type="button"
              className="w-full text-left px-3 py-2 rounded-xl text-sm font-semibold"
              style={{ backgroundColor: "transparent", color: "var(--text-primary)" }}
              onClick={() => {
                startForward(messageMenu.message);
              }}
            >
              Переслать
            </button>
            {messageMenu.message.ack_required &&
            (messageMenu.message.sender?.id === userId || canManageGroupMembers) &&
            (() => {
              const ag = channelAckGroupMap.get(messageMenu.message.id);
              return !ag || ag.isLast;
            })() ? (
              <button
                type="button"
                className="w-full text-left px-3 py-2 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: "transparent", color: "var(--text-primary)" }}
                onClick={() => {
                  openMessageAcknowledgments(messageMenu.message);
                }}
              >
                Статистика ознакомления
              </button>
            ) : null}
            {messageMenu.message.sender?.id === userId && !messageMenu.message.ack_required ? (
              <button
                type="button"
                className="w-full text-left px-3 py-2 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: "transparent", color: "var(--text-primary)" }}
                onClick={() => {
                  void openMessageReads(messageMenu.message);
                }}
              >
                Кто прочитал
              </button>
            ) : null}
            {messageMenu.message.sender?.id === userId ? (
              <button
                type="button"
                className="w-full text-left px-3 py-2 rounded-xl text-sm font-semibold"
                style={{
                  backgroundColor: "transparent",
                  color: canEditMessage(messageMenu.message) ? "var(--text-primary)" : "var(--text-tertiary)",
                  cursor: canEditMessage(messageMenu.message) ? "pointer" : "not-allowed",
                }}
                disabled={!canEditMessage(messageMenu.message)}
                onClick={() => {
                  if (!canEditMessage(messageMenu.message)) return;
                  setMessageMenu(null);
                  startEdit(messageMenu.message);
                }}
              >
                Редактировать
              </button>
            ) : null}
            {(messageMenu.message.sender?.id === userId || isAdmin) && !messageMenu.message.is_deleted ? (
              <button
                type="button"
                className="w-full text-left px-3 py-2 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: "rgba(222,53,11,0.10)", color: "var(--error)" }}
                onClick={() => {
                  const m = messageMenu.message;
                  setMessageMenu(null);
                  void deleteMessage(m);
                }}
              >
                {messageMenu.message.sender?.id === userId ? "Удалить" : "Удалить сообщение"}
              </button>
            ) : null}
                </>
              );
            })()}
        </ChatMessageActionsMenu>
      )}
      {forwardSourceMessages && forwardSourceMessages.length > 0 && (
        <div
          className="fixed inset-0 z-[131] flex items-center justify-center p-3"
          style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}
          onClick={() => {
            if (forwarding) return;
            setForwardSourceMessages(null);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-[560px] max-h-[80vh] rounded-3xl overflow-hidden flex flex-col"
            style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)", boxShadow: "0 18px 60px rgba(0,0,0,0.28)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
              <div>
                <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  {forwardSourceMessages.length === 1 ? "Переслать сообщение" : `Переслать ${forwardSourceMessages.length} сообщ.`}
                </div>
                <div className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-tertiary)" }}>
                  {forwardSourceMessages.length === 1
                    ? forwardSourceMessages[0].display_text || "Вложение"
                    : forwardSourceMessages
                        .slice(0, 3)
                        .map((m) => m.display_text?.trim() || "Вложение")
                        .join(" · ")}
                </div>
              </div>
              <button
                type="button"
                className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                onClick={() => setForwardSourceMessages(null)}
                disabled={forwarding}
              >
                Закрыть
              </button>
            </div>
            <div className="p-3 overflow-auto flex flex-col gap-2">
              <button
                type="button"
                className="w-full text-left rounded-2xl p-3"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                onClick={() => void forwardMessagesTo({ type: "general" })}
                disabled={forwarding}
              >
                <div className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Общий чат</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>Переслать в общий чат</div>
              </button>
              {privateDialogs.map((d) => (
                <button
                  key={`fwd-p-${d.id}`}
                  type="button"
                  className="w-full text-left rounded-2xl p-3"
                  style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                  onClick={() => void forwardMessagesTo({ type: "private", dialogId: d.id })}
                  disabled={forwarding}
                >
                  <div className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                    {d.other_user.display_name || d.other_user.username}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>Личный чат</div>
                </button>
              ))}
              {groupDialogs.map((g) => (
                <button
                  key={`fwd-g-${g.id}`}
                  type="button"
                  className="w-full text-left rounded-2xl p-3"
                  style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                  onClick={() => void forwardMessagesTo({ type: "group", dialogId: g.id })}
                  disabled={forwarding}
                >
                  <div className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                    {g.name}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>Групповой чат</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {imageLightbox && (
        <ChatImageLightbox
          url={resolveChatMediaUrl(imageLightbox.url)}
          filename={imageLightbox.filename}
          onClose={() => setImageLightbox(null)}
        />
      )}
      {chatInfoPanel && (
        <>
          <div
            className="fixed inset-0 z-[95]"
            style={{ backgroundColor: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }}
            aria-hidden
            onClick={() => setChatInfoPanel(null)}
          />
          <div
            className="fixed inset-0 z-[96] flex flex-col chat-info-panel sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[min(420px,100vw)] sm:border-l sm:shadow-2xl"
            style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
          <div
            className="chat-dialog-mobile-header flex items-center gap-2 px-2 py-2 border-b shrink-0"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-primary)" }}
          >
            <button
              type="button"
              className="p-2 rounded-full shrink-0"
              style={{ color: "var(--accent)" }}
              aria-label="Назад"
              onClick={() => {
                if (sharedMediaCategory) {
                  setSharedMediaCategory(null);
                  return;
                }
                setChatInfoPanel(chatInfoPanel === "settings" ? "main" : null);
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className="font-semibold text-[17px] truncate" style={{ color: "var(--text-primary)" }}>
              {sharedMediaCategory && sharedMediaScope
                ? SHARED_MEDIA_CATEGORY_LABELS[sharedMediaCategory]
                : infoPanelTitle}
            </div>
          </div>

          {sharedMediaCategory && sharedMediaScope ? (
            <ChatSharedMediaPanel
              scope={sharedMediaScope}
              category={sharedMediaCategory}
              resolveMediaUrl={resolveChatMediaUrl}
              onBack={() => setSharedMediaCategory(null)}
              onJumpToMessage={(id) => void jumpToMessage(id)}
            />
          ) : chatInfoPanel === "settings" ? (
            <div className="flex-1 overflow-y-auto" style={{ backgroundColor: "var(--bg-primary)" }}>
              <ChatSettingsFields
                sendMode={sendMode}
                setSendMode={setSendMode}
                notifEnabled={notifEnabled}
                notifSaving={notifSaving}
                notificationsScope={chatNotificationsScope}
                onToggleNotifications={toggleChatNotifications}
                wallpapers={chatWallpapers}
                wallpapersLoading={chatWallpapersLoading}
                wallpaperId={wallpaperId}
                wallpaperCustomUrl={wallpaperCustomUrl}
                wallpaperSaving={wallpaperSaving}
                onSelectWallpaper={onSelectChatWallpaper}
                onResetWallpaper={onResetChatWallpaper}
                onUploadCustomWallpaper={onUploadCustomChatWallpaper}
                isAdmin={isAdmin}
                onAdminAddWallpaper={isAdmin ? onAdminAddChatWallpaper : undefined}
              />
            </div>
          ) : chatInfoPanel === "userProfile" ? (
            <div className="flex-1 overflow-y-auto overscroll-contain">
              <div
                className="flex flex-col items-center px-4 pt-8 pb-6"
                style={{ backgroundColor: "var(--bg-primary)", borderBottom: "1px solid var(--border)" }}
              >
                <Avatar name={infoPanelAvatarName} seed={infoPanelAvatarSeed} imageUrl={infoPanelAvatarUrl} size={88} />
                <h2 className="text-xl font-bold mt-4 mb-1 text-center" style={{ color: "var(--text-primary)" }}>
                  {infoPanelAvatarName}
                </h2>
              </div>
              <div className="mx-3 mt-3 rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                {renderUserContactInfo()}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto overscroll-contain">
              <div
                className="flex flex-col items-center px-4 pt-8 pb-6"
                style={{ backgroundColor: "var(--bg-primary)", borderBottom: "1px solid var(--border)" }}
              >
                {(active.kind === "private" || active.kind === "group") && (
                  <Avatar name={headerTitle} seed={headerAvatarSeed} imageUrl={headerAvatarUrl} size={88} />
                )}
                <h2 className="text-xl font-bold mt-4 mb-1 text-center" style={{ color: "var(--text-primary)" }}>
                  {headerTitle}
                </h2>
                <p className="text-sm text-center" style={{ color: "var(--text-tertiary)" }}>
                  {headerSubtitle}
                </p>
              </div>

              {sharedMediaScope ? (
                <div className="mx-3 mt-3 rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                  {SHARED_MEDIA_CATEGORIES.map((cat) => (
                    <MobileChatInfoRow
                      key={cat}
                      label={SHARED_MEDIA_CATEGORY_LABELS[cat]}
                      onClick={() => setSharedMediaCategory(cat)}
                      icon={
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <path d="M21 15l-5-5L5 21" />
                        </svg>
                      }
                    />
                  ))}
                </div>
              ) : null}

              <div className="mx-3 mt-3 rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                {active.kind === "group" && activeDialogId != null && activeDialogId > 0 && (
                  <>
                    <MobileChatInfoRow
                      label={membersLabel}
                      hint={
                        groupMembersLoading
                          ? "Загрузка…"
                          : groupMembers.length > 0
                            ? `${groupMembers.length} человек`
                            : undefined
                      }
                      onClick={() => {
                        setChatInfoPanel(null);
                        setGroupMembersTab("members");
                        setShowGroupMembers(true);
                      }}
                      icon={
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                      }
                    />
                    {canManageGroupMembers && (
                      <MobileChatInfoRow
                        label={editChatLabel}
                        onClick={() => {
                          setChatInfoPanel(null);
                          setGroupMembersTab("edit");
                          setShowGroupMembers(true);
                        }}
                        icon={
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        }
                      />
                    )}
                  </>
                )}
                <MobileChatInfoRow
                  label="Поиск по сообщениям"
                  onClick={() => {
                    setChatInfoPanel(null);
                    setShowMessageSearch(true);
                    window.setTimeout(() => messageSearchInputRef.current?.focus(), 120);
                  }}
                  icon={
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  }
                />
                <MobileChatInfoRow
                  label="Настройки чата"
                  onClick={() => setChatInfoPanel("settings")}
                  icon={
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 1v6m0 6v6m9-9h-6m-6 0H3" />
                    </svg>
                  }
                />
              </div>

              {active.kind === "group" && consultantGroupExitBlocked && (
                <p className="mx-4 mt-5 text-xs text-center leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                  Выход из этой группы запрещён администратором.
                </p>
              )}
              {((active.kind === "private") || (active.kind === "group" && !consultantGroupExitBlocked)) &&
                activeDialogId != null &&
                activeDialogId > 0 && (
                <div className="mx-3 mt-6 mb-8">
                  <button
                    type="button"
                    className="w-full py-3 rounded-xl text-[15px] font-semibold"
                    style={{
                      backgroundColor: "var(--bg-primary)",
                      color: "var(--error)",
                      border: "1px solid rgba(222,53,11,0.28)",
                    }}
                    onClick={() => {
                      setChatInfoPanel(null);
                      void removeCurrentChatFromList();
                    }}
                  >
                    {active.kind === "private" ? "Убрать чат из списка" : "Покинуть группу"}
                  </button>
                </div>
              )}
            </div>
          )}
          </div>
        </>
      )}

      {showGroupMembers && active.kind === "group" && (
        <>
          <div
            className="hidden sm:block fixed inset-0 z-[80]"
            style={{
              backgroundColor: "rgba(0,0,0,0.35)",
              backdropFilter: "blur(6px)",
            }}
            onClick={() => setShowGroupMembers(false)}
          />
          <div
            className="group-members-modal fixed z-[90] top-0 right-0 h-full overflow-hidden flex flex-col"
            style={{
              width: 360,
              backgroundColor: "var(--bg-secondary)",
              borderLeft: "1px solid var(--border)",
              boxShadow: "0 18px 60px rgba(0,0,0,0.28)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="chat-dialog-mobile-header p-2 sm:p-4 flex flex-col gap-2 shrink-0"
              style={{
                borderBottom: "1px solid var(--border)",
                backgroundColor: "var(--bg-primary)",
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  className="sm:hidden p-2 rounded-full shrink-0"
                  style={{ color: "var(--accent)" }}
                  aria-label="Назад к чату"
                  onClick={() => setShowGroupMembers(false)}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[17px] sm:text-base truncate" style={{ color: "var(--text-primary)" }}>
                    {groupMembersTab === "members"
                      ? membersLabel
                      : groupMembersTab === "add"
                        ? activeIsChannel ? "Добавить подписчика" : "Добавить участника"
                        : editChatLabel}
                  </div>
                  <div className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>
                    {activeGroup?.name || "Группа"}
                    {groupMembersTab === "members" && groupMembers.length > 0 ? ` · ${groupMembers.length}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  className="hidden sm:inline-flex px-2 py-1.5 rounded-xl text-xs sm:text-sm font-medium shrink-0"
                  style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                  onClick={() => setShowGroupMembers(false)}
                >
                  Закрыть
                </button>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-0.5">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0"
                  style={{
                    backgroundColor: groupMembersTab === "members" ? "var(--accent)" : "var(--bg-secondary)",
                    color: groupMembersTab === "members" ? "#fff" : "var(--text-secondary)",
                    border: `1px solid ${groupMembersTab === "members" ? "var(--accent)" : "var(--border)"}`,
                  }}
                  onClick={() => setGroupMembersTab("members")}
                >
                  {membersLabel}
                </button>
                {canManageGroupMembers && (
                  <>
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0"
                      style={{
                        backgroundColor: groupMembersTab === "add" ? "var(--accent)" : "var(--bg-secondary)",
                        color: groupMembersTab === "add" ? "#fff" : "var(--text-secondary)",
                        border: `1px solid ${groupMembersTab === "add" ? "var(--accent)" : "var(--border)"}`,
                      }}
                      onClick={() => {
                        setAddMemberPending(new Map());
                        setGroupMembersTab("add");
                      }}
                    >
                      Добавить
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0"
                      style={{
                        backgroundColor: groupMembersTab === "edit" ? "var(--accent)" : "var(--bg-secondary)",
                        color: groupMembersTab === "edit" ? "#fff" : "var(--text-secondary)",
                        border: `1px solid ${groupMembersTab === "edit" ? "var(--accent)" : "var(--border)"}`,
                      }}
                      onClick={() => setGroupMembersTab("edit")}
                    >
                      Редактировать
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="p-3 sm:p-4 overflow-auto flex-1 min-h-0">
              {groupMembersTab === "members" ? (
                groupMembersLoading ? (
                  <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    Загрузка…
                  </div>
                ) : groupMembers.length === 0 ? (
                  <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    В группе пока нет участников
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {groupMembers.map((m) => (
                      <div
                        key={m.user.id}
                        className="flex items-center gap-3 p-3 rounded-2xl"
                        style={{
                          backgroundColor: "rgba(0,0,0,0.02)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        <button
                          type="button"
                          className="flex items-center gap-3 min-w-0 flex-1 text-left active:opacity-80"
                          onClick={() => openUserProfile(m.user.id)}
                        >
                          <Avatar
                            name={m.user.display_name || m.user.username}
                            seed={m.user.id}
                            imageUrl={m.user.avatar_url}
                            size={40}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                              {m.user.display_name || m.user.username}
                            </div>
                            <div className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>
                              {m.user.username}
                              {m.is_admin && " • админ"}
                              {!m.user.is_active && " • учётная запись отключена"}
                            </div>
                          </div>
                        </button>

                        {canManageGroupMembers && m.user.id !== userId && (
                          <button
                            type="button"
                            className="ml-auto text-[11px] px-2 py-1 rounded-xl font-semibold"
                            style={{ backgroundColor: "rgba(222,53,11,0.15)", color: "var(--text-primary)" }}
                            onClick={async () => {
                              if (activeDialogId == null || activeDialogId <= 0) return;
                              if (!window.confirm(`Исключить ${m.user.display_name || m.user.username}?`)) return;
                              try {
                                await api.chat.groupDialogs.removeMember(activeDialogId, m.user.id);
                                setGroupMembersTab("members");
                                await loadGroupMembers(activeDialogId);
                                await loadGroupMessages(activeDialogId);
                              } catch (e) {
                                const msg = e instanceof Error ? e.message : "Ошибка удаления участника";
                                window.alert(msg);
                              }
                            }}
                          >
                            Исключить
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )
              ) : groupMembersTab === "add" ? (
                <ChatUserAddPicker
                  selected={addMemberPending}
                  onSelectedChange={setAddMemberPending}
                  excludeUserIds={groupMemberUserIds}
                  searchUsers={(q) => api.chat.users(q.trim())}
                  placeholder="Имя или логин…"
                  hintTitle={
                    activeIsChannel
                      ? "Найдите подписчика по имени или нажмите «Добавить всех» — в список попадут все, кто ещё не в канале."
                      : "Найдите участника по имени или нажмите «Добавить всех» — в список попадут все, кто ещё не в группе."
                  }
                  onSelectAll={() =>
                    mergeAllChatUsersIntoSelection(
                      groupMemberUserIds,
                      addMemberPending,
                      setAddMemberPending,
                      setAddMemberSelectAllLoading,
                    )
                  }
                  selectAllLoading={addMemberSelectAllLoading}
                  onClearSelected={() => setAddMemberPending(new Map())}
                  selectedTitle={activeIsChannel ? "Будут подписаны" : "Будут добавлены"}
                  showPrimaryAction
                  primaryActionLabel={
                    addMemberPending.size > 0
                      ? activeIsChannel
                        ? `Добавить подписчиков (${addMemberPending.size})`
                        : `Добавить участников (${addMemberPending.size})`
                      : activeIsChannel
                        ? "Добавить подписчиков"
                        : "Добавить участников"
                  }
                  onPrimaryAction={() => void confirmAddMembersToGroup()}
                  primaryActionLoading={addMemberSubmitting}
                />
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <Avatar
                      name={groupEditName || activeGroup?.name || "Группа"}
                      seed={activeDialogId || 0}
                      imageUrl={groupEditImageUrl}
                      size={56}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
                        Картинка группы
                      </div>
                      <label
                        className="inline-flex items-center px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                        style={{
                          backgroundColor: groupImageUploading ? "var(--bg-secondary)" : "var(--accent)",
                          color: groupImageUploading ? "var(--text-secondary)" : "#fff",
                          border: `1px solid ${groupImageUploading ? "var(--border)" : "var(--accent)"}`,
                        }}
                      >
                        {groupImageUploading ? "Загрузка..." : "Загрузить картинку"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={groupImageUploading || groupEditSaving}
                          onChange={async (e) => {
                            const f = e.target.files?.[0] ?? null;
                            e.currentTarget.value = "";
                            if (!f) return;
                            setGroupImageUploading(true);
                            try {
                              const uploaded = await api.upload.chatImage(f);
                              setGroupEditImageUrl(uploaded.url);
                            } catch (err) {
                              window.alert(err instanceof Error ? err.message : "Не удалось загрузить изображение");
                            } finally {
                              setGroupImageUploading(false);
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
                      Название группы
                    </div>
                    <input
                      value={groupEditName}
                      onChange={(e) => setGroupEditName(e.target.value)}
                      placeholder="Название группы"
                      className="w-full rounded-xl border p-2 text-sm"
                      style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border)" }}
                      disabled={groupEditSaving}
                    />
                  </div>
                  <label
                    className="flex items-start gap-3 p-3 rounded-xl cursor-pointer"
                    style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 w-4 h-4 shrink-0"
                      checked={groupEditForbidExit}
                      onChange={(e) => setGroupEditForbidExit(e.target.checked)}
                      disabled={groupEditSaving}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                        Запрет выхода
                      </span>
                      <span className="block text-xs mt-0.5 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                        Консультанты не смогут покинуть группу самостоятельно. Администраторы группы и CRM по-прежнему могут выйти.
                      </span>
                    </span>
                  </label>
                  {!activeIsChannel ? (
                    <label
                      className="flex items-start gap-3 p-3 rounded-xl cursor-pointer"
                      style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 w-4 h-4 shrink-0"
                        checked={groupEditMembersSeeOwnOnly}
                        onChange={(e) => setGroupEditMembersSeeOwnOnly(e.target.checked)}
                        disabled={groupEditSaving}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                          Личная переписка участников
                        </span>
                        <span className="block text-xs mt-0.5 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                          Участники видят только свои сообщения. Администраторы группы и CRM — всю переписку.
                        </span>
                      </span>
                    </label>
                  ) : null}
                  <button
                    type="button"
                    className="px-3 py-2.5 rounded-xl text-sm font-semibold"
                    style={{
                      backgroundColor: groupEditSaving ? "var(--bg-secondary)" : "var(--accent)",
                      color: groupEditSaving ? "var(--text-secondary)" : "#fff",
                      border: `1px solid ${groupEditSaving ? "var(--border)" : "var(--accent)"}`,
                    }}
                    disabled={groupEditSaving || groupImageUploading || !groupEditName.trim()}
                    onClick={async () => {
                      if (activeDialogId == null || activeDialogId <= 0) return;
                      if (!groupEditName.trim()) return;
                      setGroupEditSaving(true);
                      try {
                        await api.chat.groupDialogs.update(activeDialogId, {
                          name: groupEditName.trim(),
                          image_url: groupEditImageUrl || null,
                          forbid_exit: groupEditForbidExit,
                          members_see_own_only: activeIsChannel ? false : groupEditMembersSeeOwnOnly,
                        });
                        await loadGroupDialogs();
                        if (activeDialogId != null && activeDialogId > 0) {
                          await loadGroupMessages(activeDialogId);
                        }
                        setGroupMembersTab("members");
                      } catch (e) {
                        window.alert(e instanceof Error ? e.message : "Не удалось сохранить параметры группы");
                      } finally {
                        setGroupEditSaving(false);
                      }
                    }}
                  >
                    {groupEditSaving ? "Сохранение..." : "Сохранить группу"}
                  </button>
                </div>
              )}
            </div>
            {canManageGroupMembers && (
              <div
                className="p-3 sm:p-4 flex-shrink-0 border-t"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-primary)" }}
              >
                <button
                  type="button"
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-semibold"
                  style={{
                    backgroundColor: "rgba(222,53,11,0.12)",
                    color: "var(--error)",
                    border: "1px solid rgba(222,53,11,0.28)",
                  }}
                  onClick={async () => {
                    if (activeDialogId == null || activeDialogId <= 0) return;
                    const gname = groupDialogs.find((d) => d.id === activeDialogId)?.name || "группу";
                    if (
                      !window.confirm(
                        `Удалить группу «${gname}» навсегда?\n\nВсе сообщения и участники будут удалены без возможности восстановления. Это действие затронет всех участников.`,
                      )
                    )
                      return;
                    try {
                      await api.chat.groupDialogs.delete(activeDialogId);
                      setShowGroupMembers(false);
                      setGroupMessages([]);
                      setGroupMembers([]);
                      setActive({ kind: "general" });
                      await loadGroupDialogs();
                      if (isMobileViewport) setShowChatList(true);
                    } catch (e) {
                      window.alert(e instanceof Error ? e.message : "Не удалось удалить группу");
                    }
                  }}
                >
                  Удалить группу навсегда
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Mobile chat list (внутри shell, без fixed — не дёргает страницу) */}
      {isMobileViewport && showChatList && (
        <div
          className="absolute inset-0 z-[30] flex flex-col min-h-0 overflow-hidden bg-[var(--bg-primary)]"
          style={{ boxShadow: "0 18px 60px rgba(0,0,0,0.28)" }}
        >
            <ChatListHeader
              variant={variant}
              showFullscreenToggle={variant === "widget" && !isMobileViewport}
              chatFullscreenExpanded={chatFullscreenExpanded}
              chatFullscreenTitle={chatFullscreenTitle}
              onToggleFullscreen={() => void toggleChatFullscreen()}
              onNewGroup={() => openGroupWizard(false)}
              onNewChannel={() => openGroupWizard(true)}
              onFindUser={() => {
                setShowUserFinder(true);
                setFinderQuery("");
                setFinderResults([]);
              }}
              onNewFolder={() => setShowFolderCreate(true)}
              onCloseWidget={() => closeChatWidget()}
            />
            {renderFolderTabs()}
            {renderListSearchBar()}

            <div
              className="chat-list-mobile-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3"
              data-allow-scroll
              style={{
                WebkitOverflowScrolling: "touch",
                touchAction: "pan-y",
                overscrollBehavior: "contain",
              }}
            >
              {renderDialogList()}
            </div>
        </div>
      )}
      {/* Left column */}
      <div
        className={`${isMobileViewport ? "hidden" : "hidden sm:flex"} sm:flex-col sm:min-h-0 sm:h-full w-full md:w-[320px] lg:w-[360px] xl:w-[420px] md:border-r border-b md:border-b-0 border-[var(--border)] bg-[var(--bg-primary)]`}
      >
        <ChatListHeader
          variant={variant}
          showFullscreenToggle={variant === "widget" && !isMobileViewport}
          chatFullscreenExpanded={chatFullscreenExpanded}
          chatFullscreenTitle={chatFullscreenTitle}
          onToggleFullscreen={() => void toggleChatFullscreen()}
          onNewGroup={() => openGroupWizard(false)}
          onNewChannel={() => openGroupWizard(true)}
          onFindUser={() => {
            setShowUserFinder(true);
            setFinderQuery("");
            setFinderResults([]);
          }}
          onNewFolder={() => setShowFolderCreate(true)}
          onCloseWidget={variant === "widget" ? () => closeChatWidget() : undefined}
        />
        {renderFolderTabs()}
        {renderListSearchBar()}

        <div className="p-2 sm:p-3 flex flex-col gap-2 flex-1 min-h-0 min-w-0">
          <div
            className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
            style={{
              paddingTop: "10px",
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-y",
              overscrollBehavior: "contain",
            }}
            data-allow-scroll
          >
            {renderDialogList()}
          </div>
        </div>
      </div>

      {/* Right */}
      <div
        className={`flex-1 flex flex-col min-h-0 min-w-0 ${
          isMobileViewport && showChatList ? "hidden" : ""
        }`}
      >
        {/* Header */}
        {messageSelectionMode ? (
          <div
            className="chat-dialog-mobile-header p-2 sm:p-3 border-b border-[var(--border)] flex items-center gap-2 sm:sticky sm:top-0 sm:z-[20] sm:backdrop-blur"
            style={{ backgroundColor: "var(--bg-primary)" }}
          >
            <button
              type="button"
              className="px-3 py-2 rounded-xl text-sm font-semibold shrink-0"
              style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)" }}
              onClick={exitMessageSelection}
            >
              Отмена
            </button>
            <div className="flex-1 min-w-0 text-center">
              <div className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
                {selectedMessageIds.length === 0
                  ? "Выберите сообщения"
                  : `Выбрано: ${selectedMessageIds.length}`}
              </div>
              <div className="text-[11px] truncate mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                Нажмите на сообщение, чтобы добавить или убрать
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                className="px-2.5 sm:px-3 py-2 rounded-xl text-sm font-semibold"
                style={{
                  backgroundColor:
                    selectedDeletableMessages.length > 0 ? "rgba(222,53,11,0.12)" : "var(--bg-secondary)",
                  color: selectedDeletableMessages.length > 0 ? "var(--error)" : "var(--text-tertiary)",
                }}
                disabled={selectedDeletableMessages.length === 0 || deletingMessages || forwarding}
                onClick={() => {
                  void deleteSelectedMessages();
                }}
              >
                {deletingMessages ? "…" : "Удалить"}
              </button>
              <button
                type="button"
                className="px-2.5 sm:px-3 py-2 rounded-xl text-sm font-semibold"
                style={{
                  backgroundColor: selectedMessageIds.length > 0 ? "var(--accent)" : "var(--bg-secondary)",
                  color: selectedMessageIds.length > 0 ? "#fff" : "var(--text-tertiary)",
                }}
                disabled={selectedMessageIds.length === 0 || deletingMessages || forwarding}
                onClick={startForwardSelected}
              >
                Переслать
              </button>
            </div>
          </div>
        ) : (
        <div className="chat-dialog-mobile-header p-2 sm:p-3 border-b border-[var(--border)] flex items-center gap-2 sm:sticky sm:top-0 sm:z-[20] sm:backdrop-blur" style={{ backgroundColor: "var(--bg-primary)" }}>
          <button
            type="button"
            className={`${isMobileViewport ? "flex" : "hidden"} p-2 rounded-full shrink-0`}
            style={{ color: "var(--accent)" }}
            aria-label="Меню чатов"
            title="Меню чатов"
            onClick={() => {
              setShowGroupMembers(false);
              setChatInfoPanel(null);
              setShowChatList(true);
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <button
            type="button"
            className="min-w-0 flex-1 flex items-center gap-2.5 text-left rounded-lg py-1 sm:py-0.5 sm:cursor-pointer sm:hover:bg-[var(--bg-secondary)] active:opacity-85 transition-colors"
            aria-label="Информация о чате"
            title="Информация о чате"
            onClick={() => setChatInfoPanel("main")}
          >
            {(active.kind === "private" || active.kind === "group") && (
              <Avatar name={headerTitle} seed={headerAvatarSeed} imageUrl={headerAvatarUrl} size={isMobileViewport ? 40 : 32} />
            )}
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-[15px] sm:text-base truncate leading-tight" style={{ color: "var(--text-primary)" }}>
                {headerTitle}
              </span>
              <span className="block text-xs truncate mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                {headerSubtitle}
              </span>
            </span>
            <span className="shrink-0" style={{ color: "var(--text-tertiary)" }}>
              <ChevronRightIcon />
            </span>
          </button>

          {active.kind === "general" && isAdmin && generalLeft && (
            <button
              type="button"
              className="px-3 py-2 rounded-xl text-sm font-medium shrink-0"
              style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)" }}
              onClick={async () => {
                await api.chat.general.join();
                await loadGeneralMessages();
                setGeneralLeft(false);
                await loadGeneralStatus();
                requestSidebarUnreadRefresh();
              }}
            >
              Вернуться
            </button>
          )}

          {CHAT_UI.showCalls && active.kind === "private" && activePrivateDialog && active.dialogId > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                className="p-2.5 rounded-xl disabled:opacity-50"
                style={{ backgroundColor: "var(--bg-secondary)", color: "var(--accent)", border: "1px solid var(--border)" }}
                title="Аудиозвонок"
                aria-label="Аудиозвонок"
                disabled={callBusy}
                onClick={() => {
                  const other = activePrivateDialog.other_user;
                  void chatCallClient.startPrivateCall(
                    active.dialogId,
                    other.id,
                    other.display_name || other.username,
                    false,
                  );
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </button>
              <button
                type="button"
                className="p-2.5 rounded-xl disabled:opacity-50"
                style={{ backgroundColor: "var(--bg-secondary)", color: "var(--accent)", border: "1px solid var(--border)" }}
                title="Видеозвонок"
                aria-label="Видеозвонок"
                disabled={callBusy}
                onClick={() => {
                  const other = activePrivateDialog.other_user;
                  void chatCallClient.startPrivateCall(
                    active.dialogId,
                    other.id,
                    other.display_name || other.username,
                    true,
                  );
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 7l-7 5 7 5V7z" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
              </button>
            </div>
          )}

          {active.kind === "bot" && isAdmin && activeBotThreadId > 0 && !activeBotThreadItem?.is_closed && (
            <button
              type="button"
              className="px-3 py-2 rounded-xl text-sm font-medium shrink-0 disabled:opacity-50"
              style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
              disabled={botThreadClosing}
              onClick={() => void closeBotThread(activeBotThreadId)}
            >
              {botThreadClosing ? "…" : "Закрыть обращение"}
            </button>
          )}

          {CHAT_UI.showCalls && active.kind === "group" && active.dialogId > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                className="p-2.5 rounded-xl disabled:opacity-50"
                style={{ backgroundColor: "var(--bg-secondary)", color: "var(--accent)", border: "1px solid var(--border)" }}
                title={activeIsChannel ? "Аудиозвонок в канале" : "Групповой аудиозвонок"}
                aria-label="Групповой аудиозвонок"
                disabled={callBusy}
                onClick={() => {
                  void chatCallClient.startGroupCall(active.dialogId, activeGroup?.name || headerTitle, false);
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </button>
              <button
                type="button"
                className="p-2.5 rounded-xl disabled:opacity-50"
                style={{ backgroundColor: "var(--bg-secondary)", color: "var(--accent)", border: "1px solid var(--border)" }}
                title={activeIsChannel ? "Групповой видеозвонок в канале" : "Групповой видеозвонок"}
                aria-label="Групповой видеозвонок"
                disabled={callBusy}
                onClick={() => {
                  void chatCallClient.startGroupCall(active.dialogId, activeGroup?.name || headerTitle, true);
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 7l-7 5 7 5V7z" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  <path d="M17 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M7 4v2a4 4 0 0 0 4 4h0" />
                </svg>
              </button>
            </div>
          )}

        </div>
        )}

        {/* Messages */}
        <div className="flex-1 min-h-0 relative flex flex-col">
          {activeConvLoading ? (
            <div
              className="absolute inset-0 z-[4] flex items-center justify-center"
              style={{ backgroundColor: "var(--bg-secondary)" }}
              aria-busy="true"
              aria-live="polite"
            >
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Загрузка…
              </span>
            </div>
          ) : null}
          {chatWallpaperLayerStyle ? (
            <div
              className="absolute inset-0 z-0 pointer-events-none"
              style={chatWallpaperLayerStyle}
              aria-hidden
            />
          ) : null}
          <div
            ref={messagesScrollRef}
            onScroll={onMessagesScroll}
            onTouchStart={() => {
              touchActiveRef.current = true;
              markUserScrolling();
            }}
            onTouchMove={markUserScrolling}
            onTouchEnd={() => {
              window.setTimeout(() => {
                touchActiveRef.current = false;
              }, 120);
            }}
            onTouchCancel={() => {
              touchActiveRef.current = false;
            }}
            onWheel={markUserScrolling}
            data-allow-scroll
            className="chat-messages-scroll relative z-[1] flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-5"
            style={messagesScrollAreaStyle}
          >
          <div ref={messagesContentRef}>
          <div ref={loadOlderTopSentinelRef} className="h-px w-full shrink-0" aria-hidden />
          {showLoadOlderAtTop ? (
            <div className="sticky top-0 z-[2] flex justify-center py-2 mb-2">
              <button
                type="button"
                className="px-4 py-2 rounded-full text-xs font-semibold shadow-md touch-manipulation"
                style={{
                  backgroundColor: "var(--bg-primary)",
                  color: "var(--accent)",
                  border: "1px solid var(--border)",
                }}
                disabled={loadingOlderMessages}
                onClick={() => {
                  loadOlderUserInitiatedRef.current = true;
                  void loadOlderActiveMessages().finally(() => {
                    loadOlderUserInitiatedRef.current = false;
                  });
                }}
              >
                {loadingOlderMessages ? "Загрузка…" : "Загрузить более ранние сообщения"}
              </button>
            </div>
          ) : null}
          {loadingOlderMessages && !showLoadOlderAtTop ? (
            <div className="text-center text-xs py-2 mb-2" style={{ color: "var(--text-secondary)" }}>
              Загрузка истории…
            </div>
          ) : null}
          {active.kind === "general" && generalLeft ? (
            <div className="rounded-2xl border p-6 text-sm" style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border)" }}>
              Вы вышли из общего чата. {isAdmin ? "Нажмите «Вернуться» вверху, чтобы продолжить." : "Доступ будет восстановлен администратором."}
            </div>
          ) : (
            <>
              {active.kind === "general" && generalLoading && generalMessages.length === 0 && (
                <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Загрузка…
                </div>
              )}
              {active.kind === "general" && generalMessages.length === 0 && !generalLoading && (
                <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Сообщений пока нет
                </div>
              )}

              {showMessageSearch && (
                <div className="mb-3 hidden sm:block">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="absolute left-3 top-1/2 -translate-y-1/2"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <input
                        ref={messageSearchInputRef}
                        value={messageSearchQuery}
                        onChange={(e) => setMessageSearchQuery(e.target.value)}
                        placeholder="Поиск по сообщениям…"
                        className="w-full rounded-2xl border p-2 pl-10 text-sm"
                        style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border)" }}
                      />
                    </div>
                    {searchNeedle && (
                      <button
                        type="button"
                        className="px-3 py-2 rounded-xl text-sm font-medium"
                        style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)" }}
                        onClick={() => setMessageSearchQuery("")}
                      >
                        Очистить
                      </button>
                    )}
                  </div>
                </div>
              )}

              {active.kind === "general" && searchNeedle && searchHitIds.length === 0 && generalMessages.length > 0 && (
                <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Ничего не найдено
                </div>
              )}
              {active.kind === "general" &&
                generalMessages.map((m) => (
                  <div
                    key={m.id}
                    id={`chat-msg-${m.id}`}
                    style={messageJumpHighlightStyle(m.id)}
                  >
                    <MessageBubble
                      m={m}
                      mentionUsersByUsername={mentionUsersByUsername}
                      onMentionClick={openPrivateChatByMention}
                    />
                  </div>
                ))}

              {active.kind === "private" && dialogLoading && privateMessages.length === 0 && (
                  <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    Загрузка…
                  </div>
                )}
                {active.kind === "private" && privateMessages.length === 0 && !dialogLoading && (
                  <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    Сообщений пока нет
                  </div>
                )}
                {active.kind === "private" && searchNeedle && searchHitIds.length === 0 && privateMessages.length > 0 && (
                  <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    Ничего не найдено
                  </div>
                )}
                {active.kind === "private" &&
                  privateMessages.map((m) => (
                    <div
                      key={m.id}
                      id={`chat-msg-${m.id}`}
                      style={messageJumpHighlightStyle(m.id)}
                    >
                      <MessageBubble m={m} />
                    </div>
                  ))}

              {active.kind === "bot" && isAdmin && activeBotThreadId <= 0 && (
                <div className="flex flex-col gap-3 max-w-lg">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      Обращения
                      {filteredBotThreads.length > 0
                        ? ` (${openBotThreads.length} открыт${openBotThreads.length === 1 ? "о" : openBotThreads.length < 5 ? "ы" : "о"}, ${closedBotThreads.length} закрыт${closedBotThreads.length === 1 ? "о" : closedBotThreads.length < 5 ? "ы" : "о"})`
                        : ""}
                    </div>
                    {filteredBotThreads.length > 0 ? (
                      <button
                        type="button"
                        className="text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                        style={{ color: "var(--accent)", background: "var(--accent-light)" }}
                        onClick={toggleBotThreadsCollapsed}
                      >
                        {botThreadsCollapsed ? "Развернуть список" : "Свернуть список"}
                      </button>
                    ) : null}
                  </div>
                  {filteredBotThreads.length === 0 ? (
                    <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      Обращений пока нет.
                    </div>
                  ) : botThreadsCollapsed ? (
                    <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      Список свёрнут. Нажмите «Развернуть список» или выберите обращение в меню слева.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {openBotThreads.length > 0 ? (
                        <div className="flex flex-col gap-2">
                          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
                            Открытые ({openBotThreads.length})
                          </div>
                          {openBotThreads.map((t) => (
                            <div
                              key={`bot-hub-open-${t.user.id}`}
                              className="flex items-stretch gap-2 rounded-2xl overflow-hidden"
                              style={{ border: "1px solid var(--border)", background: "var(--bg-secondary)" }}
                            >
                              <button
                                type="button"
                                className="flex-1 min-w-0 text-left p-3"
                                onClick={() => void openAdminBotThread(t.user.id)}
                              >
                                <div className="font-semibold text-sm truncate" style={{ color: "var(--text-primary)" }}>
                                  {t.user.display_name || t.user.username}
                                  {t.unread_count > 0 ? (
                                    <span
                                      className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white"
                                      style={{ background: "var(--accent)", verticalAlign: "middle" }}
                                    >
                                      {t.unread_count > 99 ? "99+" : t.unread_count}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="text-xs mt-0.5 truncate" style={{ color: "var(--text-tertiary)" }}>
                                  @{t.user.username}
                                  {t.last_message_at ? ` · ${formatChatTimestamp(t.last_message_at)}` : ""}
                                </div>
                                <div className="text-sm mt-1 line-clamp-2" style={{ color: "var(--text-secondary)" }}>
                                  {t.last_message_text || "—"}
                                </div>
                              </button>
                              <button
                                type="button"
                                className="shrink-0 px-3 text-xs font-semibold border-l disabled:opacity-50"
                                style={{
                                  borderColor: "var(--border)",
                                  color: "var(--text-secondary)",
                                  background: "var(--bg-primary)",
                                }}
                                disabled={botThreadClosing}
                                onClick={() => void closeBotThread(t.user.id)}
                              >
                                Закрыть
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {closedBotThreads.length > 0 ? (
                        <div className="flex flex-col gap-2">
                          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
                            Закрытые ({closedBotThreads.length})
                          </div>
                          {closedBotThreads.map((t) => (
                            <div
                              key={`bot-hub-closed-${t.user.id}`}
                              className="flex items-stretch gap-2 rounded-2xl overflow-hidden"
                              style={{ border: "1px solid var(--border)", background: "var(--bg-secondary)", opacity: 0.82 }}
                            >
                              <button
                                type="button"
                                className="flex-1 min-w-0 text-left p-3"
                                onClick={() => void openAdminBotThread(t.user.id)}
                              >
                                <div className="font-semibold text-sm truncate" style={{ color: "var(--text-primary)" }}>
                                  {t.user.display_name || t.user.username}
                                  <span
                                    className="ml-2 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded"
                                    style={{ color: "var(--text-tertiary)", background: "var(--bg-primary)" }}
                                  >
                                    Закрыто
                                  </span>
                                  {t.unread_count > 0 ? (
                                    <span
                                      className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white"
                                      style={{ background: "var(--accent)", verticalAlign: "middle" }}
                                    >
                                      {t.unread_count > 99 ? "99+" : t.unread_count}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="text-xs mt-0.5 truncate" style={{ color: "var(--text-tertiary)" }}>
                                  @{t.user.username}
                                  {t.closed_at || t.last_message_at
                                    ? ` · ${formatChatTimestamp(t.closed_at || t.last_message_at)}`
                                    : ""}
                                </div>
                                <div className="text-sm mt-1 line-clamp-2" style={{ color: "var(--text-secondary)" }}>
                                  {t.last_message_text || "—"}
                                </div>
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
              {active.kind === "bot" && (!isAdmin || activeBotThreadId > 0) && botLoading && botMessages.length === 0 && (
                <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Загрузка…
                </div>
              )}
              {active.kind === "bot" && (!isAdmin || activeBotThreadId > 0) && botMessages.length === 0 && !botLoading && (
                <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Сообщений пока нет
                </div>
              )}
              {active.kind === "bot" && searchNeedle && searchHitIds.length === 0 && botMessages.length > 0 && (
                <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Ничего не найдено
                </div>
              )}
              {active.kind === "bot" &&
                botMessages.map((m) => (
                  <div
                    key={m.id}
                    id={`chat-msg-${m.id}`}
                    style={messageJumpHighlightStyle(m.id)}
                  >
                    <MessageBubble m={m} />
                  </div>
                ))}

              {active.kind === "gigachat" && gigaChatLoading && gigaChatMessages.length === 0 && (
                <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Загрузка…
                </div>
              )}
              {active.kind === "gigachat" && gigaChatMessages.length === 0 && !gigaChatLoading && (
                <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Сообщений пока нет
                </div>
              )}
              {active.kind === "gigachat" && searchNeedle && searchHitIds.length === 0 && gigaChatMessages.length > 0 && (
                <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Ничего не найдено
                </div>
              )}
              {active.kind === "gigachat" &&
                gigaChatMessages.map((m) => (
                  <div
                    key={m.id}
                    id={`chat-msg-${m.id}`}
                    style={{
                      borderRadius: 16,
                      outline: searchHitIdSet.has(m.id) ? "2px solid rgba(87,157,255,0.32)" : "none",
                      backgroundColor: searchHitIdSet.has(m.id) ? "rgba(87,157,255,0.06)" : "transparent",
                      padding: searchHitIdSet.has(m.id) ? 6 : 0,
                      marginBottom: searchHitIdSet.has(m.id) ? 4 : 0,
                    }}
                  >
                    <MessageBubble m={m} />
                  </div>
                ))}

              {active.kind === "group" && groupLoading && groupMessages.length === 0 && (
                <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Загрузка…
                </div>
              )}
              {active.kind === "group" && groupMessages.length === 0 && !groupLoading && (
                <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Сообщений пока нет
                </div>
              )}
              {active.kind === "group" && searchNeedle && searchHitIds.length === 0 && groupMessages.length > 0 && (
                <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Ничего не найдено
                </div>
              )}
              {active.kind === "group" &&
              activeGroup?.members_see_own_only &&
              !canManageGroupMembers ? (
                <div
                  className="mb-3 rounded-xl px-3 py-2.5 text-xs leading-relaxed"
                  style={{
                    backgroundColor: "rgba(87, 157, 255, 0.1)",
                    border: "1px solid rgba(87, 157, 255, 0.22)",
                    color: "var(--text-secondary)",
                  }}
                >
                  В этой группе вы видите только свои сообщения. Администраторы группы видят всю переписку.
                </div>
              ) : null}
              {active.kind === "group" &&
                groupMessages.map((m) => (
                  <div
                    key={m.id}
                    id={`chat-msg-${m.id}`}
                    style={{
                      borderRadius: 16,
                      outline: searchHitIdSet.has(m.id) ? "2px solid rgba(87,157,255,0.32)" : "none",
                      backgroundColor: searchHitIdSet.has(m.id) ? "rgba(87,157,255,0.06)" : "transparent",
                      padding: searchHitIdSet.has(m.id) ? 6 : 0,
                      marginBottom: searchHitIdSet.has(m.id) ? 4 : 0,
                    }}
                  >
                    <MessageBubble m={m} />
                  </div>
                ))}

              {showMessageSearch && (
                <div
                  className="sticky bottom-0 mt-3"
                  style={{
                    paddingTop: 10,
                    background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, var(--bg-secondary) 45%)",
                  }}
                >
                  <div
                    className="w-full rounded-2xl px-3 py-2 flex items-center justify-between gap-2"
                    style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)", boxShadow: "0 14px 34px rgba(0,0,0,0.10)" }}
                  >
                    <div className="hidden sm:block text-[11px] font-semibold" style={{ color: "var(--text-tertiary)" }}>
                      {searchNeedle ? (searchHitIds.length > 0 ? `${Math.min(activeSearchHitIdx + 1, searchHitIds.length)}/${searchHitIds.length}` : "0/0") : ""}
                    </div>

                    {/* Mobile: search input + actions at bottom */}
                    <div className="sm:hidden flex items-center gap-2 w-full">
                      <div className="relative flex-1">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="absolute left-3 top-1/2 -translate-y-1/2"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                          ref={messageSearchInputRef}
                          value={messageSearchQuery}
                          onChange={(e) => setMessageSearchQuery(e.target.value)}
                          placeholder="Поиск…"
                          className="w-full rounded-2xl border p-2 pl-10 text-sm"
                          style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border)" }}
                        />
                      </div>

                      {searchNeedle && (
                        <button
                          type="button"
                          className="px-3 py-2 rounded-xl text-sm font-medium"
                          style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                          onClick={() => setMessageSearchQuery("")}
                        >
                          Очистить
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {searchNeedle && (
                        <div className="sm:hidden text-[11px] font-semibold px-1" style={{ color: "var(--text-tertiary)" }}>
                          {searchHitIds.length > 0 ? `${Math.min(activeSearchHitIdx + 1, searchHitIds.length)}/${searchHitIds.length}` : "0/0"}
                        </div>
                      )}
                      <button
                        type="button"
                        className="p-2 rounded-xl"
                        style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                        aria-label="Предыдущее совпадение"
                        title="Предыдущее"
                        disabled={!searchNeedle || searchHitIds.length === 0}
                        onClick={() => {
                          if (searchHitIds.length === 0) return;
                          const next = (activeSearchHitIdx - 1 + searchHitIds.length) % searchHitIds.length;
                          setActiveSearchHitIdx(next);
                          scrollToMessage(searchHitIds[next]);
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="18 15 12 9 6 15" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="p-2 rounded-xl"
                        style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                        aria-label="Следующее совпадение"
                        title="Следующее"
                        disabled={!searchNeedle || searchHitIds.length === 0}
                        onClick={() => {
                          if (searchHitIds.length === 0) return;
                          const next = (activeSearchHitIdx + 1) % searchHitIds.length;
                          setActiveSearchHitIdx(next);
                          scrollToMessage(searchHitIds[next]);
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={bottomRef} />
          </div>
          </div>
        </div>

        {/* Composer */}
        {/* В режиме редактирования используем то же поле ввода, что и для отправки. */}
        {!messageSelectionMode && editingId != null ? (
          <div className="px-3 pb-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
            Редактирование сообщения · Enter — сохранить
          </div>
        ) : null}
        {!messageSelectionMode && active.kind === "general" ? (
          generalLeft ? null : (
            <div
              className="border-t p-3"
              style={{ backgroundColor: "var(--bg-primary)", boxShadow: "0 -12px 34px rgba(0,0,0,0.03)" }}
            >
              <ComposerBar
                sessionKey={composerSessionKey}
                placeholder="Сообщение…"
                disabledSend={generalSending}
                onSend={async ({ text, files }) => {
                  if (editingId != null) {
                    if (files.length > 0) window.alert("Нельзя добавлять вложения при редактировании сообщения.");
                    await saveEdit(text);
                    return;
                  }
                  await onSendGeneral({ text, files });
                }}
                externalText={editingId != null ? editingText : undefined}
                onExternalTextChange={editingId != null ? setEditingText : undefined}
                editMode={editingId != null ? { onCancel: cancelEdit } : undefined}
                replyTo={editingId != null ? null : replyTo}
                onClearReply={() => setReplyTo(null)}
                sendMode={sendMode}
                mentionEnabled
                mentionExcludeUserId={userId}
                getMentionCandidates={getGeneralMentionCandidates}
                onSendSticker={CHAT_UI.showStickers ? sendStickerMessage : undefined}
                stickerSending={stickerSending}
                onOpenPoll={() => setShowPollCreate(true)}
              />
            </div>
          )
        ) : !messageSelectionMode && active.kind === "private" ? (
          <div className="border-t p-3" style={{ backgroundColor: "var(--bg-primary)", boxShadow: "0 -12px 34px rgba(0,0,0,0.03)" }}>
            <ComposerBar
              sessionKey={composerSessionKey}
              placeholder="Сообщение…"
              disabledSend={privateSending || active.kind !== "private"}
              onSend={async ({ text, files }) => {
                if (editingId != null) {
                  if (files.length > 0) window.alert("Нельзя добавлять вложения при редактировании сообщения.");
                  await saveEdit(text);
                  return;
                }
                await onSendPrivate({ text, files });
              }}
              externalText={editingId != null ? editingText : undefined}
              onExternalTextChange={editingId != null ? setEditingText : undefined}
              editMode={editingId != null ? { onCancel: cancelEdit } : undefined}
              replyTo={editingId != null ? null : replyTo}
              onClearReply={() => setReplyTo(null)}
              sendMode={sendMode}
              mentionEnabled
              mentionExcludeUserId={userId}
              getMentionCandidates={getPrivateMentionCandidates}
              onSendSticker={CHAT_UI.showStickers ? sendStickerMessage : undefined}
              stickerSending={stickerSending}
              onOpenPoll={() => setShowPollCreate(true)}
            />
          </div>
        ) : !messageSelectionMode && active.kind === "gigachat" ? (
          <div className="border-t p-3" style={{ backgroundColor: "var(--bg-primary)", boxShadow: "0 -12px 34px rgba(0,0,0,0.03)" }}>
            <ComposerBar
              sessionKey={composerSessionKey}
              placeholder="Сообщение для GigaChat…"
              disabledSend={gigaChatSending || !gigaChatVisible}
              onSend={async ({ text, files }) => {
                if (editingId != null) {
                  if (files.length > 0) window.alert("Нельзя добавлять вложения при редактировании сообщения.");
                  await saveEdit(text);
                  return;
                }
                await onSendGigaChat({ text, files });
              }}
              externalText={editingId != null ? editingText : undefined}
              onExternalTextChange={editingId != null ? setEditingText : undefined}
              editMode={editingId != null ? { onCancel: cancelEdit } : undefined}
              replyTo={null}
              onClearReply={() => setReplyTo(null)}
              sendMode={sendMode}
            />
          </div>
        ) : !messageSelectionMode && active.kind === "bot" && botComposerEnabled ? (
          <div className="border-t p-3" style={{ backgroundColor: "var(--bg-primary)", boxShadow: "0 -12px 34px rgba(0,0,0,0.03)" }}>
            <ComposerBar
              sessionKey={composerSessionKey}
              placeholder={isAdmin ? "Ответ пользователю…" : "Сообщение в поддержку…"}
              disabledSend={botSending}
              onSend={async ({ text, files }) => {
                if (editingId != null) {
                  if (files.length > 0) window.alert("Нельзя добавлять вложения при редактировании сообщения.");
                  await saveEdit(text);
                  return;
                }
                await onSendBot({ text, files });
              }}
              externalText={editingId != null ? editingText : undefined}
              onExternalTextChange={editingId != null ? setEditingText : undefined}
              editMode={editingId != null ? { onCancel: cancelEdit } : undefined}
              replyTo={editingId != null ? null : replyTo}
              onClearReply={() => setReplyTo(null)}
              sendMode={sendMode}
              onSendSticker={CHAT_UI.showStickers ? sendStickerMessage : undefined}
              stickerSending={stickerSending}
            />
          </div>
        ) : !messageSelectionMode && active.kind === "bot" ? (
          <div
            className="border-t px-4 py-4 text-center text-sm"
            style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-secondary)", borderTop: "1px solid var(--border)" }}
          >
            {isAdmin ? "Выберите обращение в списке слева или выше" : "Чат поддержки"}
          </div>
        ) : !messageSelectionMode && canPostInActiveChat ? (
          <div className="border-t p-3" style={{ backgroundColor: "var(--bg-primary)", boxShadow: "0 -12px 34px rgba(0,0,0,0.03)" }}>
            <ComposerBar
              sessionKey={composerSessionKey}
              placeholder={activeIsChannel ? "Публикация в канале…" : "Сообщение…"}
              disabledSend={groupSending}
              onSend={async ({ text, files }) => {
                if (editingId != null) {
                  if (files.length > 0) window.alert("Нельзя добавлять вложения при редактировании сообщения.");
                  await saveEdit(text);
                  return;
                }
                await onSendGroup({ text, files });
              }}
              externalText={editingId != null ? editingText : undefined}
              onExternalTextChange={editingId != null ? setEditingText : undefined}
              editMode={editingId != null ? { onCancel: cancelEdit } : undefined}
              replyTo={editingId != null ? null : activeIsChannel ? null : replyTo}
              onClearReply={() => setReplyTo(null)}
              sendMode={sendMode}
              mentionEnabled
              mentionExcludeUserId={userId}
              getMentionCandidates={getGroupMentionCandidates}
              showChannelAckOption={activeIsChannel}
              channelAckRequired={groupAckRequired}
              onChannelAckRequiredChange={setGroupAckRequired}
              onSendSticker={CHAT_UI.showStickers ? sendStickerMessage : undefined}
              stickerSending={stickerSending}
              onOpenPoll={() => setShowPollCreate(true)}
            />
          </div>
        ) : (
          <div
            className="border-t px-4 py-4 text-center text-sm"
            style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-secondary)", borderTop: "1px solid var(--border)" }}
          >
            Информационный канал — публиковать могут только администраторы.
          </div>
        )}
      </div>

      <ChatPollCreateModal
        open={showPollCreate}
        onClose={() => setShowPollCreate(false)}
        onSubmit={onSubmitPoll}
        submitting={pollSending}
      />

      {showFolderCreate ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onClick={() => !folderCreateSaving && setShowFolderCreate(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-4"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold m-0 mb-3" style={{ color: "var(--text-primary)" }}>
              Новая папка
            </h3>
            <input
              type="text"
              value={folderCreateName}
              onChange={(e) => setFolderCreateName(e.target.value)}
              maxLength={64}
              placeholder="Название папки"
              className="w-full px-3 py-2 rounded-xl text-sm mb-4"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
              disabled={folderCreateSaving}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createChatFolder();
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm"
                style={{ border: "1px solid var(--border)", color: "var(--text-primary)" }}
                disabled={folderCreateSaving}
                onClick={() => setShowFolderCreate(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ background: "var(--accent)", opacity: folderCreateSaving ? 0.7 : 1 }}
                disabled={folderCreateSaving}
                onClick={() => void createChatFolder()}
              >
                {folderCreateSaving ? "Создание…" : "Создать"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {dialogFolderMenu ? (
        <>
          <div className="fixed inset-0 z-[125]" onClick={() => setDialogFolderMenu(null)} />
          <div
            className="fixed z-[126] min-w-[200px] py-1.5 rounded-xl overflow-hidden"
            style={{
              left: Math.min(dialogFolderMenu.x, window.innerWidth - 220),
              top: Math.min(dialogFolderMenu.y, window.innerHeight - 280),
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            }}
            role="menu"
          >
            <div
              className="px-3 py-2 text-xs font-semibold truncate border-b"
              style={{ color: "var(--text-secondary)", borderColor: "var(--border)" }}
            >
              {dialogFolderMenu.title}
            </div>
            {chatFolders.length === 0 ? (
              <div className="px-3 py-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
                Создайте папку в меню «Новый чат»
              </div>
            ) : (
              chatFolders.map((f) => {
                const existing = f.items.find((it) =>
                  dialogFolderMenu.kind === "private"
                    ? it.chat_type === "private" && it.private_dialog_id === dialogFolderMenu.dialogId
                    : it.chat_type === "group" && it.group_dialog_id === dialogFolderMenu.dialogId,
                );
                return (
                  <button
                    key={f.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm"
                    style={{ color: "var(--text-primary)" }}
                    onClick={() => {
                      if (existing) {
                        void removeDialogFromFolder(f.id, existing.id);
                      } else {
                        void addDialogToFolder(f.id, dialogFolderMenu.kind, dialogFolderMenu.dialogId);
                      }
                    }}
                  >
                    {existing ? "✓ " : ""}
                    {existing ? "Убрать из" : "Добавить в"} «{f.name}»
                  </button>
                );
              })
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

