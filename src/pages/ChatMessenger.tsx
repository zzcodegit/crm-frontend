import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  api,
  CHAT_USERS_QUERY_LIMIT,
  type ChatAttachment,
  type ChatMediaType,
  type ChatMessageItem,
  type ChatUserShortResponse,
  type PrivateDialogItem,
  type GroupDialogItem,
  type GroupMemberItem,
} from "../api";
import { useAuth } from "../contexts/AuthContext";
import { formatChatTimestamp } from "../utils/chatTimestamp";

const EDIT_WINDOW_MINUTES = 15;

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".webm"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".webm"]);
const MAX_IMAGE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB (must match backend)
const MAX_VIDEO_SIZE_BYTES = 80 * 1024 * 1024; // 80MB (must match backend)
const MAX_AUDIO_SIZE_BYTES = 20 * 1024 * 1024; // 20MB (must match backend)

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

type ActiveConversation =
  | { kind: "general" }
  | { kind: "private"; dialogId: number }
  | { kind: "group"; dialogId: number };

type ReplyTarget = {
  id: number;
  senderName: string;
  text: string;
  isDeleted: boolean;
};

function mediaFromFile(file: File): ChatMediaType | null {
  const name = (file.name || "").toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  return null;
}

function normalizeMediaFile(file: File): { file: File; media_type: ChatMediaType } | null {
  // Backend determines type by filename extension, so we may need to adjust name.
  const byExt = mediaFromFile(file);
  if (byExt) {
    if (byExt === "image" && file.size > MAX_IMAGE_SIZE_BYTES) return null;
    if (byExt === "video" && file.size > MAX_VIDEO_SIZE_BYTES) return null;
    if (byExt === "audio" && file.size > MAX_AUDIO_SIZE_BYTES) return null;
    return { file, media_type: byExt };
  }

  const mimeInfo = extFromMime(file.type);
  if (!mimeInfo) return null;

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

function ChatAudioPlayer({
  src,
  onPlayStateChange,
}: {
  src: string;
  onPlayStateChange: (playing: boolean) => void;
}) {
  const mediaRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [useNativeFallback, setUseNativeFallback] = useState(false);

  const fmt = (seconds: number) => {
    const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const m = Math.floor(safe / 60);
    const s = Math.floor(safe % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const togglePlay = async () => {
    const el = mediaRef.current;
    if (!el) return;
    try {
      if (el.paused) {
        if (el.ended) {
          try {
            el.currentTime = 0;
          } catch {
            // ignore
          }
        }
        await el.play();
      } else {
        el.pause();
      }
    } catch {
      // If custom control fails in a specific browser, expose native controls fallback.
      setUseNativeFallback(true);
    }
  };

  const reliableDuration = duration && duration > 1.5 ? duration : null;
  const canSeek = Boolean(reliableDuration);

  return (
    <div
      className="w-full"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <audio
        ref={mediaRef}
        src={src}
        preload="metadata"
        data-chat-audio="1"
        onLoadedMetadata={(e) => {
          const d = Number(e.currentTarget.duration || 0);
          if (Number.isFinite(d) && d > 1.5) setDuration(d);
        }}
        onDurationChange={(e) => {
          const d = Number(e.currentTarget.duration || 0);
          if (Number.isFinite(d) && d > 1.5) setDuration(d);
        }}
        onTimeUpdate={(e) => {
          const t = Number(e.currentTarget.currentTime || 0);
          setCurrentTime(t);
        }}
        onPlay={() => {
          setIsPlaying(true);
          onPlayStateChange(true);
        }}
        onPause={() => {
          setIsPlaying(false);
          onPlayStateChange(false);
        }}
        onEnded={() => {
          setIsPlaying(false);
          onPlayStateChange(false);
        }}
        className="hidden"
      />

      {useNativeFallback ? (
        <audio
          src={src}
          data-chat-audio="1"
          controls
          className="w-full"
          onPlay={() => onPlayStateChange(true)}
          onPause={() => onPlayStateChange(false)}
          onEnded={() => onPlayStateChange(false)}
        />
      ) : (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void togglePlay();
          }}
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: "var(--accent)", color: "#fff" }}
          aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
          title={isPlaying ? "Пауза" : "Воспроизвести"}
        >
          {isPlaying ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <input
            type="range"
            min={0}
            max={Math.max(reliableDuration ?? 0, 1)}
            step={0.01}
            value={Math.min(currentTime, Math.max(reliableDuration ?? 0, 1))}
            disabled={!canSeek}
            onChange={(e) => {
              if (!canSeek) return;
              const next = Number(e.target.value);
              setCurrentTime(next);
              if (mediaRef.current) mediaRef.current.currentTime = next;
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="w-full"
          />
          <div className="flex items-center justify-between text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
            <span>{fmt(currentTime)}</span>
            <span>{reliableDuration ? fmt(reliableDuration) : "--:--"}</span>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

function ComposerBar({
  text,
  setText,
  files,
  setFiles,
  previews,
  placeholder,
  disabledSend,
  onSend,
  replyTo,
  onClearReply,
  sendMode,
}: {
  text: string;
  setText: (v: string) => void;
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  previews: { file: File; url: string; media_type: ChatMediaType | null }[];
  placeholder: string;
  disabledSend: boolean;
  onSend: () => void | Promise<void>;
  replyTo: ReplyTarget | null;
  onClearReply: () => void;
  sendMode: ChatSendMode;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaChunksRef = useRef<BlobPart[]>([]);
  const [showEmoji, setShowEmoji] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const emojiToggleRef = useRef<HTMLButtonElement | null>(null);

  const EMOJIS = [
    "😀","😁","😂","🤣","😊","😍","😘","😎","🤔","😅","😇","🙂","😉","😋","😜","🤩",
    "👍","👎","👏","🙏","💪","🔥","❤️","💙","💚","💛","💜","🖤","💯","✅","❌","⚡",
    "🎉","🤝","👀","😴","🤯","😡","😭","🥳",
  ];

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    const normalized = list
      .map((f) => normalizeMediaFile(f))
      .filter((x): x is { file: File; media_type: ChatMediaType } => Boolean(x))
      .map((x) => x.file);
    setFiles(normalized);
    if (e.currentTarget) e.currentTarget.value = "";
  };

  const canSend = !disabledSend;

  const stopRecorderTracks = () => {
    const stream = mediaStreamRef.current;
    if (!stream) return;
    stream.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
  };
  const formatRecordingTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const startVoiceRecording = async () => {
    if (isRecording) return;
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
        setIsRecording(false);
        if (!blob.size) return;

        const ext = audioExtFromMime(blobType);
        const file = new File([blob], `voice-${Date.now()}${ext}`, { type: blobType });
        setFiles((prev) => [...prev, file]);
      };
      recorder.onerror = () => {
        stopRecorderTracks();
        mediaRecorderRef.current = null;
        mediaChunksRef.current = [];
        setIsRecording(false);
        window.alert("Не удалось записать голосовое сообщение.");
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingSeconds(0);
      setIsRecording(true);
    } catch {
      stopRecorderTracks();
      mediaRecorderRef.current = null;
      mediaChunksRef.current = [];
      setIsRecording(false);
      window.alert("Не удалось получить доступ к микрофону.");
    }
  };

  const stopVoiceRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (recorder.state !== "inactive") recorder.stop();
  };

  useEffect(() => {
    if (!isRecording) return;
    const id = window.setInterval(() => setRecordingSeconds((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, [isRecording]);

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
    <div className="flex flex-col gap-2">
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
      {showEmoji && (
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

      <div className="flex items-end gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.gif,.webp,.svg,.mp4,.webm,.mp3,.wav,.ogg,.m4a,audio/*"
          multiple
          className="hidden"
          onChange={onPickFiles}
        />

        <button
          type="button"
          className="p-3 rounded-2xl flex-shrink-0"
          style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
          aria-label="Прикрепить файл"
          title="Прикрепить файл"
          onClick={() => inputRef.current?.click()}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.19 9.19a2 2 0 0 1-2.83-2.83l8.49-8.49" />
          </svg>
        </button>

        <button
          type="button"
          className="p-3 rounded-2xl flex-shrink-0"
          style={{
            backgroundColor: isRecording ? "rgba(239,68,68,0.14)" : "var(--bg-secondary)",
            color: isRecording ? "#ef4444" : "var(--text-secondary)",
            border: "1px solid var(--border)",
          }}
          aria-label={isRecording ? "Остановить запись" : "Записать голосовое"}
          title={isRecording ? "Остановить запись" : "Записать голосовое"}
          onClick={isRecording ? stopVoiceRecording : () => void startVoiceRecording()}
        >
          {isRecording ? (
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

        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            className="w-full rounded-2xl border p-3 pr-12 text-sm resize-none"
            placeholder={placeholder}
            value={text}
            rows={1}
            onChange={(e) => {
              setText(e.target.value);
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
            onKeyDown={(e) => {
              if (sendMode === "enter") {
                if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                  e.preventDefault();
                  if (!disabledSend) {
                    onSend();
                  }
                }
              } else {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
                  e.preventDefault();
                  if (!disabledSend) {
                    onSend();
                  }
                }
              }
            }}
            style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border)" }}
          />
          {isRecording && (
            <div
              className="absolute left-3 -top-7 text-[11px] px-2 py-1 rounded-full flex items-center gap-1.5"
              style={{ backgroundColor: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.22)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#ef4444" }} />
              <span>Запись {formatRecordingTime(recordingSeconds)}</span>
            </div>
          )}

          <button
            type="button"
            className="absolute right-2 bottom-2 p-2 rounded-xl"
            style={{ backgroundColor: "transparent", color: "var(--text-tertiary)" }}
            aria-label="Смайлики"
            title="Смайлики"
            onClick={() => setShowEmoji((v) => !v)}
            ref={emojiToggleRef}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </button>
        </div>

        <button
          type="button"
          className="p-3 rounded-2xl flex-shrink-0 transition-transform active:scale-[0.98]"
          style={{
            background: canSend ? "linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)" : "rgba(87,157,255,0.25)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.18)",
            boxShadow: canSend ? "0 10px 26px rgba(0, 82, 204, 0.25)" : "none",
            opacity: canSend ? 1 : 0.7,
            cursor: canSend ? "pointer" : "not-allowed",
          }}
          disabled={!canSend}
          aria-label="Отправить"
          title="Отправить"
          onClick={async () => {
            await onSend();
            textareaRef.current?.focus();
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>

      {previews.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {previews.map((p) => (
            <div key={p.url} className="relative">
              {p.media_type === "image" ? (
                <img src={p.url} alt="preview" className="w-24 h-24 object-cover rounded-xl bg-black/5" />
              ) : p.media_type === "audio" ? (
                <div
                  className="w-28 h-24 rounded-xl flex flex-col items-center justify-center text-[11px] px-2 text-center gap-1"
                  style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                >
                  <span style={{ fontSize: 16, lineHeight: 1 }}>🎙️</span>
                  <span>Голосовое</span>
                </div>
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
}

export default function ChatMessenger({
  readVersion = 0,
  openPrivateTarget,
}: {
  readVersion?: number;
  openPrivateTarget?: { userId?: number; username?: string; nonce?: number } | null;
}) {
  const [searchParams] = useSearchParams();
  const { user, refreshUser } = useAuth();
  const userId = user?.id ?? -1;
  const role = user?.role ?? (user?.is_admin ? "admin" : "user");
  const isAdmin = role === "admin";

  const [sendMode, setSendMode] = useState<ChatSendMode>(getChatSendMode());
  const [showSettings, setShowSettings] = useState(false);
  const [notifSaving, setNotifSaving] = useState(false);
  const notifEnabled = user?.chat_notifications_enabled !== false;

  const [imageLightbox, setImageLightbox] = useState<{
    url: string;
    filename: string | null;
  } | null>(null);

  const [showUserFinder, setShowUserFinder] = useState(false);
  const [finderQuery, setFinderQuery] = useState("");
  const [finderResults, setFinderResults] = useState<ChatUserShortResponse[]>([]);
  const [finderLoading, setFinderLoading] = useState(false);

  const [showGroupCreateWizard, setShowGroupCreateWizard] = useState(false);
  const [groupWizardStep, setGroupWizardStep] = useState<1 | 2>(1);
  const [groupWizardName, setGroupWizardName] = useState("");
  const [groupWizardQuery, setGroupWizardQuery] = useState("");
  const [groupWizardResults, setGroupWizardResults] = useState<ChatUserShortResponse[]>([]);
  const [groupWizardLoading, setGroupWizardLoading] = useState(false);
  const [groupWizardSelected, setGroupWizardSelected] = useState<Map<number, ChatUserShortResponse>>(new Map());
  const [isAnyAudioPlaying, setIsAnyAudioPlaying] = useState(false);
  const [forwardSourceMessage, setForwardSourceMessage] = useState<ChatMessageItem | null>(null);
  const [forwarding, setForwarding] = useState(false);

  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);
  const [messageMenu, setMessageMenu] = useState<{
    x: number;
    y: number;
    message: ChatMessageItem;
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
  const [generalText, setGeneralText] = useState("");
  const [generalFiles, setGeneralFiles] = useState<File[]>([]);

  // Private
  const [privateDialogs, setPrivateDialogs] = useState<PrivateDialogItem[]>([]);
  const [selectedDialogId, setSelectedDialogId] = useState<number | null>(null);
  const [privateMessages, setPrivateMessages] = useState<ChatMessageItem[]>([]);
  const [dialogLoading, setDialogLoading] = useState(false);
  const [privateSending, setPrivateSending] = useState(false);
  const [privateText, setPrivateText] = useState("");
  const [privateFiles, setPrivateFiles] = useState<File[]>([]);

  // Group
  const [groupDialogs, setGroupDialogs] = useState<GroupDialogItem[]>([]);
  const [groupMessages, setGroupMessages] = useState<ChatMessageItem[]>([]);
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupSending, setGroupSending] = useState(false);
  const [groupText, setGroupText] = useState("");
  const [groupFiles, setGroupFiles] = useState<File[]>([]);
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
  const [groupEditSaving, setGroupEditSaving] = useState(false);
  const [groupImageUploading, setGroupImageUploading] = useState(false);

  // Mobile: chat list overlay
  const [showChatList, setShowChatList] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 639px)").matches;
  });
  const openedByQueryRef = useRef<string>("");
  const openedByWidgetRef = useRef<string>("");

  // Group creation is available to everyone (member-add/remove is still restricted to group admins).

  const closeChatWidget = () => {
    window.dispatchEvent(new Event("chatwidget:close"));
  };

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

  const activeDialogId = active.kind === "general" ? null : active.dialogId;

  const [userSearch, setUserSearch] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<ChatUserShortResponse[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const messageSearchInputRef = useRef<HTMLInputElement | null>(null);

  const searchNeedle = messageSearchQuery.trim().toLowerCase();
  const [activeSearchHitIdx, setActiveSearchHitIdx] = useState(0);

  const activeMessagesForSearch = useMemo(() => {
    if (active.kind === "general") return generalMessages;
    if (active.kind === "private") return privateMessages;
    return groupMessages;
  }, [active.kind, generalMessages, privateMessages, groupMessages]);

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

  const scrollToMessage = (messageId: number) => {
    const el = document.getElementById(`chat-msg-${messageId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const generalAttachmentPreviews = useMemo(() => {
    return generalFiles.map((f) => ({ file: f, url: URL.createObjectURL(f), media_type: mediaFromFile(f) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generalFiles]);

  const privateAttachmentPreviews = useMemo(() => {
    return privateFiles.map((f) => ({ file: f, url: URL.createObjectURL(f), media_type: mediaFromFile(f) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [privateFiles]);

  const groupAttachmentPreviews = useMemo(() => {
    return groupFiles.map((f) => ({ file: f, url: URL.createObjectURL(f), media_type: mediaFromFile(f) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupFiles]);

  useEffect(() => {
    return () => {
      generalAttachmentPreviews.forEach((p) => URL.revokeObjectURL(p.url));
      privateAttachmentPreviews.forEach((p) => URL.revokeObjectURL(p.url));
      groupAttachmentPreviews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [generalAttachmentPreviews, privateAttachmentPreviews, groupAttachmentPreviews]);

  const canEditMessage = (m: ChatMessageItem) => {
    if (!m.sender || m.sender.id !== userId) return false;
    if (m.is_deleted) return false;
    if (!m.created_at) return false;
    const d = new Date(m.created_at);
    if (Number.isNaN(d.getTime())) return false;
    return Date.now() <= d.getTime() + EDIT_WINDOW_MINUTES * 60_000;
  };

  const isChatAudioPlayingNow = () => {
    if (typeof document === "undefined") return false;
    const audios = Array.from(document.querySelectorAll("audio[data-chat-audio='1']")) as HTMLAudioElement[];
    return audios.some((a) => !a.paused && !a.ended && a.readyState > 2);
  };

  const isSameMessage = (x: ChatMessageItem, y: ChatMessageItem) => {
    const norm = (v: string | null | undefined) => v ?? null;
    if (
      x.id !== y.id ||
      norm(x.display_text) !== norm(y.display_text) ||
      x.is_deleted !== y.is_deleted ||
      norm(x.edited_at) !== norm(y.edited_at) ||
      norm(x.created_at) !== norm(y.created_at) ||
      (x.is_read ?? false) !== (y.is_read ?? false) ||
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
      if (isSameMessage(old, m)) return old;
      changed = true;
      return m;
    });

    return changed ? merged : prev;
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
    if (!silent) setGeneralLoading(true);
    try {
      setGeneralLeft(false);
      const msgs = await api.chat.general.messages(undefined, 80);
      setGeneralMessages((prev) => mergeMessagesPreservingRefs(prev, msgs));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка загрузки";
      if (msg.includes("вышли") || msg.includes("общего чата")) {
        setGeneralLeft(true);
        setGeneralMessages([]);
      }
    } finally {
      if (!silent) setGeneralLoading(false);
    }
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
    if (!silent) setDialogLoading(true);
    try {
      const msgs = await api.chat.privateDialogs.messages(dialogId, undefined, 80);
      setPrivateMessages((prev) => mergeMessagesPreservingRefs(prev, msgs));
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

  const loadGroupMessages = async (dialogId: number, opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setGroupLoading(true);
    try {
      const msgs = await api.chat.groupDialogs.messages(dialogId, undefined, 80);
      setGroupMessages((prev) => mergeMessagesPreservingRefs(prev, msgs));
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
    const media = window.matchMedia("(max-width: 639px)");
    const apply = () => setIsMobileViewport(media.matches);
    apply();
    const onChange = () => apply();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }
    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, []);

  useEffect(() => {
    if (isMobileViewport) {
      setShowChatList(true);
    }
  }, [isMobileViewport]);

  useEffect(() => {
    loadPrivateDialogs();
    loadGroupDialogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        if (isMobileViewport) {
          setShowChatList(true);
        } else {
          setActive({ kind: "private", dialogId: res.id });
          setShowChatList(false);
        }
        await loadPrivateDialogs();
        if (!isMobileViewport) {
          await loadPrivateMessages(res.id);
        }
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
    if (!openPrivateTarget) return;
    const userIdRaw = openPrivateTarget.userId;
    const usernameRaw = openPrivateTarget.username;
    if (!userIdRaw && !usernameRaw) return;
    const targetKey = `${openPrivateTarget.nonce ?? ""}|${userIdRaw ?? ""}|${usernameRaw ?? ""}`;
    if (openedByWidgetRef.current === targetKey) return;

    let cancelled = false;
    const openDialogFromTarget = async () => {
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
        if (isMobileViewport) {
          setShowChatList(true);
        } else {
          setActive({ kind: "private", dialogId: res.id });
          setShowChatList(false);
        }
        await loadPrivateDialogs();
        if (!isMobileViewport) {
          await loadPrivateMessages(res.id);
        }
        openedByWidgetRef.current = targetKey;
      } catch {
        // Ignore: user could be unavailable in chat.
      }
    };

    openDialogFromTarget();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileViewport, openPrivateTarget?.nonce, openPrivateTarget?.userId, openPrivateTarget?.username]);

  useEffect(() => {
    if (active.kind === "private" && active.dialogId != null) {
      if (active.dialogId > 0) loadPrivateMessages(active.dialogId);
    }
    if (active.kind === "group" && active.dialogId != null) {
      if (active.dialogId > 0) loadGroupMessages(active.dialogId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.kind, activeDialogId]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (isAnyAudioPlaying || isChatAudioPlayingNow()) return;
      // Новые диалоги и группы — без перезагрузки страницы.
      void loadPrivateDialogs();
      void loadGroupDialogs();

      // Поллинг всегда выполняем "тихо", чтобы не дёргать UI индикаторами загрузки.
      const silent = true;

      if (active.kind === "general") {
        if (!generalLeft) void loadGeneralMessages({ silent });
      } else if (active.kind === "private") {
        if (activeDialogId != null && activeDialogId > 0) void loadPrivateMessages(activeDialogId, { silent });
      } else if (active.kind === "group") {
        if (activeDialogId != null && activeDialogId > 0) void loadGroupMessages(activeDialogId, { silent });
      }
    }, 4000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.kind, activeDialogId, generalLeft, generalText, privateText, groupText, isAnyAudioPlaying]);

  // Mark messages as read when viewing them
  useEffect(() => {
    if (!userId) return;
    
    let messagesToMark: number[] = [];
    
    if (active.kind === "general" && generalMessages.length > 0) {
      messagesToMark = generalMessages
        .filter((m) => m.sender?.id !== userId)
        .map((m) => m.id);
    } else if (active.kind === "private" && privateMessages.length > 0) {
      // `is_read` in API is a delivery/read indicator for MY outgoing messages.
      // For incoming messages, always mark all from other users as read.
      messagesToMark = privateMessages
        .filter((m) => m.sender?.id !== userId)
        .map((m) => m.id);
    } else if (active.kind === "group" && groupMessages.length > 0) {
      // For groups, mark all incoming messages in opened chat as read.
      messagesToMark = groupMessages
        .filter((m) => m.sender?.id !== userId)
        .map((m) => m.id);
    }
    
    if (messagesToMark.length > 0) {
      api.chat.markMessagesRead(messagesToMark).catch(() => {
        // Ignore errors for read receipts
      });
    }
  }, [generalMessages, privateMessages, groupMessages, active.kind, userId]);

  useEffect(() => {
    if (isAnyAudioPlaying || isChatAudioPlayingNow()) return;
    // On mobile, auto-scroll can steal focus from the composer and "reset" typing.
    const activeEl = document.activeElement as HTMLElement | null;
    const isTyping =
      (active.kind === "general" && generalText.trim().length > 0) ||
      (active.kind === "private" && privateText.trim().length > 0) ||
      (active.kind === "group" && groupText.trim().length > 0);
    const isComposerFocused = Boolean(activeEl && (activeEl.tagName === "TEXTAREA" || activeEl.getAttribute("contenteditable") === "true"));
    if (isTyping || isComposerFocused) return;

    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [active.kind, generalText, privateText, groupText, generalMessages.length, privateMessages.length, groupMessages.length, isAnyAudioPlaying]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const playing = isChatAudioPlayingNow();
      setIsAnyAudioPlaying((prev) => (prev === playing ? prev : playing));
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    // Чтобы фильтр не применялся к другому диалогу/типу чата.
    setMessageSearchQuery("");
    setShowMessageSearch(false);
    setActiveSearchHitIdx(0);
    setSelectedMessageId(null);
    setMessageMenu(null);
    setReplyTo(null);
    setForwardSourceMessage(null);
  }, [active.kind, activeDialogId]);

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
    let cancelled = false;
    const run = async () => {
      if (!showGroupCreateWizard) return;
      if (groupWizardStep !== 2) return;
      const s = groupWizardQuery.trim();
      // If empty, show default list of users (first page).
      if (s.length === 0) {
        setGroupWizardLoading(true);
        try {
          const res = await api.chat.users(undefined, CHAT_USERS_QUERY_LIMIT);
          if (!cancelled) setGroupWizardResults(res);
        } finally {
          if (!cancelled) setGroupWizardLoading(false);
        }
        return;
      }
      if (s.length < 2) {
        setGroupWizardResults([]);
        return;
      }
      setGroupWizardLoading(true);
      try {
        const res = await api.chat.users(s, CHAT_USERS_QUERY_LIMIT);
        if (!cancelled) setGroupWizardResults(res);
      } finally {
        if (!cancelled) setGroupWizardLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [groupWizardQuery, groupWizardStep, showGroupCreateWizard]);

  useEffect(() => {
    const lock = showUserFinder || showGroupCreateWizard || Boolean(forwardSourceMessage);
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
  }, [showUserFinder, showGroupCreateWizard, forwardSourceMessage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMessageMenu(null);
        setSelectedMessageId(null);
      }
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest && target.closest("[data-chat-message-menu]")) return;
      setMessageMenu(null);
      setSelectedMessageId(null);
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
    // Важно: не зависим от groupDialogs, чтобы периодический авто-рефреш
    // не затирал локально выбранную (но ещё не сохранённую) картинку.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGroupMembers, active.kind, activeDialogId]);

  useEffect(() => {
    // Закрываем модалку, если пользователь ушёл из группового чата.
    if (active.kind !== "group") setShowGroupMembers(false);
  }, [active.kind]);

  const onSendGeneral = async () => {
    if (generalSendLockRef.current) return;
    const files = generalFiles;
    const allowedFiles = files.filter((f) => mediaFromFile(f) != null);
    const textTrimmed = generalText.trim();
    const text = textTrimmed.length > 0 ? textTrimmed : null;

    if (!text && allowedFiles.length === 0) {
      window.alert("Выберите текст или вложение: разрешены фото, видео и аудио (.mp3/.wav/.ogg/.m4a/.webm).");
      return;
    }

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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    generalSendLockRef.current = true;
    setGeneralSending(true);
    try {
      const sent = await api.chat.general.send(text, allowedFiles, replyTo?.id ?? null);
      setGeneralText("");
      setGeneralFiles([]);
      setReplyTo(null);
      setGeneralMessages((prev) => prev.map((m) => (m.id === tempId ? sent : m)));
      void loadGeneralMessages({ silent: true });
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (e) {
      setGeneralMessages((prev) => prev.filter((m) => m.id !== tempId));
      const msg = e instanceof Error ? e.message : "Ошибка отправки сообщения";
      window.alert(msg);
    } finally {
      setGeneralSending(false);
      generalSendLockRef.current = false;
    }
  };

  const onSendPrivate = async () => {
    if (privateSendLockRef.current) return;
    const dialogId = selectedDialogId;
    if (dialogId == null) return;
    const files = privateFiles;
    const allowedFiles = files.filter((f) => mediaFromFile(f) != null);
    const textTrimmed = privateText.trim();
    const text = textTrimmed.length > 0 ? textTrimmed : null;

    if (!text && allowedFiles.length === 0) {
      window.alert("Выберите текст или вложение: разрешены фото, видео и аудио (.mp3/.wav/.ogg/.m4a/.webm).");
      return;
    }

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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    privateSendLockRef.current = true;
    setPrivateSending(true);
    try {
      const sent = await api.chat.privateDialogs.send(dialogId, text, allowedFiles, replyTo?.id ?? null);
      const sentTs = sent.created_at ? Date.parse(sent.created_at) : Date.now();
      if (Number.isFinite(sentTs) && safeSetTs(`${READ_PRIVATE_AT_PREFIX}${dialogId}`, sentTs)) {
        touchReadMark();
      }
      setPrivateText("");
      setPrivateFiles([]);
      setReplyTo(null);
      setPrivateMessages((prev) => prev.map((m) => (m.id === tempId ? sent : m)));
      void loadPrivateMessages(dialogId, { silent: true });
      void loadPrivateDialogs();
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (e) {
      setPrivateMessages((prev) => prev.filter((m) => m.id !== tempId));
      const msg = e instanceof Error ? e.message : "Ошибка отправки сообщения";
      window.alert(msg);
    } finally {
      setPrivateSending(false);
      privateSendLockRef.current = false;
    }
  };

  const onSendGroup = async () => {
    if (groupSendLockRef.current) return;
    if (active.kind !== "group") return;
    const dialogId = active.dialogId;
    const files = groupFiles;
    const allowedFiles = files.filter((f) => mediaFromFile(f) != null);
    const textTrimmed = groupText.trim();
    const text = textTrimmed.length > 0 ? textTrimmed : null;

    if (!text && allowedFiles.length === 0) {
      window.alert("Выберите текст или вложение: разрешены фото, видео и аудио (.mp3/.wav/.ogg/.m4a/.webm).");
      return;
    }

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
    };
    setGroupMessages((prev) => [...prev, tempMsg]);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    groupSendLockRef.current = true;
    setGroupSending(true);
    try {
      const sent = await api.chat.groupDialogs.send(dialogId, text, allowedFiles, replyTo?.id ?? null);
      const sentTs = sent.created_at ? Date.parse(sent.created_at) : Date.now();
      if (Number.isFinite(sentTs) && safeSetTs(`${READ_GROUP_AT_PREFIX}${dialogId}`, sentTs)) {
        touchReadMark();
      }
      setGroupText("");
      setGroupFiles([]);
      setReplyTo(null);
      setGroupMessages((prev) => prev.map((m) => (m.id === tempId ? sent : m)));
      void loadGroupMessages(dialogId, { silent: true });
      void loadGroupDialogs();
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (e) {
      setGroupMessages((prev) => prev.filter((m) => m.id !== tempId));
      const msg = e instanceof Error ? e.message : "Ошибка отправки сообщения";
      window.alert(msg);
    } finally {
      setGroupSending(false);
      groupSendLockRef.current = false;
    }
  };

  // Search users for private dialog
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (active.kind !== "private" && active.kind !== "group") return;
      const s = userSearch.trim();
      if (s.length < 2) {
        setUserSearchResults([]);
        return;
      }
      setUserSearchLoading(true);
      try {
        const res = await api.chat.users(s);
        if (!cancelled) setUserSearchResults(res);
      } finally {
        if (!cancelled) setUserSearchLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [userSearch, active.kind]);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);

  const startEdit = (m: ChatMessageItem) => {
    setEditingId(m.id);
    setEditingText(m.display_text || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText("");
  };

  const startReply = (m: ChatMessageItem) => {
    setReplyTo({
      id: m.id,
      senderName: m.sender?.display_name || "Система",
      text: m.display_text || "",
      isDeleted: m.is_deleted,
    });
    setMessageMenu(null);
    setSelectedMessageId(null);
  };

  const startForward = (m: ChatMessageItem) => {
    setForwardSourceMessage(m);
    setMessageMenu(null);
    setSelectedMessageId(null);
  };

  const forwardMessageTo = async (target: { type: "general" | "private" | "group"; dialogId?: number }) => {
    if (!forwardSourceMessage) return;
    setForwarding(true);
    try {
      await api.chat.forwardMessage(forwardSourceMessage.id, {
        target_chat_type: target.type,
        target_dialog_id: target.dialogId ?? null,
      });
      setForwardSourceMessage(null);
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
      window.alert(e instanceof Error ? e.message : "Не удалось переслать сообщение");
    } finally {
      setForwarding(false);
    }
  };

  const saveEdit = async () => {
    if (editingId == null) return;
    await api.chat.editMessage(editingId, editingText);
    cancelEdit();
    if (active.kind === "general") await loadGeneralMessages();
    else if (active.kind === "private") await loadPrivateMessages(active.dialogId);
    else await loadGroupMessages(active.dialogId);
  };

  const deleteMessage = async (m: ChatMessageItem) => {
    if (!window.confirm("Удалить сообщение?")) return;
    await api.chat.deleteMessage(m.id);
    if (active.kind === "general") await loadGeneralMessages();
    else if (active.kind === "private") await loadPrivateMessages(active.dialogId);
    else await loadGroupMessages(active.dialogId);
  };

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

  const renderAttachments = (atts: ChatAttachment[]) => {
    if (!atts || atts.length === 0) return null;
    return (
      <div className="mt-2 flex flex-col gap-2">
        {atts.map((a) => {
          if (a.media_type === "image") {
            return (
              <div key={a.id} className="inline-flex flex-col items-start gap-1" style={{ maxWidth: "100%" }}>
                <button
                  type="button"
                  className="rounded-2xl overflow-hidden"
                  style={{ border: "1px solid var(--border)", maxWidth: "100%" }}
                  onClick={() => setImageLightbox({ url: a.url, filename: a.filename ?? null })}
                  aria-label="Открыть фото"
                  title="Открыть"
                >
                  <img
                    src={a.url}
                    alt={a.filename || "image"}
                    className="w-full h-auto object-contain"
                    style={{ maxWidth: "100%", maxHeight: 360 }}
                  />
                </button>
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
          }
          if (a.media_type === "audio") {
            return (
              <div key={a.id} className="inline-flex flex-col items-start gap-1.5" style={{ maxWidth: "100%" }}>
                <div
                  className="rounded-2xl px-2.5 py-2.5"
                  style={{
                    background: "linear-gradient(180deg, rgba(87,157,255,0.14) 0%, rgba(87,157,255,0.06) 100%)",
                    border: "1px solid rgba(87,157,255,0.24)",
                    boxShadow: "0 8px 22px rgba(0, 82, 204, 0.08)",
                    maxWidth: 336,
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5 px-0.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex items-center justify-center rounded-full"
                        style={{
                          width: 22,
                          height: 22,
                          background: "linear-gradient(135deg, rgba(87,157,255,0.24) 0%, rgba(87,157,255,0.14) 100%)",
                          color: "var(--accent)",
                          fontSize: 12,
                          border: "1px solid rgba(87,157,255,0.26)",
                        }}
                      >
                        🎙
                      </span>
                      <span className="text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                        Голосовое сообщение
                      </span>
                    </div>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: "rgba(87,157,255,0.16)",
                        color: "var(--text-tertiary)",
                        border: "1px solid rgba(87,157,255,0.18)",
                        lineHeight: 1.2,
                      }}
                    >
                      {a.filename ? "файл" : "аудио"}
                    </span>
                  </div>
                  <ChatAudioPlayer
                    src={a.url}
                    onPlayStateChange={(playing) => setIsAnyAudioPlaying(playing)}
                  />
                </div>
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
          }
          return (
            <div key={a.id} className="inline-flex flex-col items-start gap-1" style={{ maxWidth: "100%" }}>
              <video
                src={a.url}
                controls
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

  const MessageBubble = ({ m }: { m: ChatMessageItem }) => {
    const isMine = Boolean(m.sender && m.sender.id === userId);
    const isEditing = editingId === m.id;
    const withinEdit = canEditMessage(m);
    const isSelected = selectedMessageId === m.id;
    const canShowActions = !m.is_deleted && !isEditing;

    return (
      <div
        className={`flex w-full ${isMine ? "justify-end" : "justify-start"} mb-2`}
        onContextMenu={(e) => {
          if (!canShowActions) return;
          e.preventDefault();
          e.stopPropagation();
          setSelectedMessageId(m.id);
          setMessageMenu({ x: e.clientX, y: e.clientY, message: m });
        }}
      >
        <div
          className="max-w-[78%] rounded-[18px] px-3 py-2 sm:rounded-[22px] sm:px-4 sm:py-3"
          style={{
            backgroundColor: isMine ? "var(--accent)" : "var(--bg-primary)",
            color: isMine ? "#fff" : "var(--text-primary)",
            border: isMine ? "none" : "1px solid var(--border)",
            boxShadow: isMine ? "0 10px 26px rgba(0, 82, 204, 0.25)" : "none",
          }}
          onClick={(e) => {
            if (!canShowActions) return;
            e.stopPropagation();
            setMessageMenu(null);
            setSelectedMessageId((prev) => (prev === m.id ? null : m.id));
          }}
        >
          {!isEditing ? (
            <>
              <div
                className={`text-[11px] opacity-90 flex items-center gap-2 ${isMine ? "justify-end" : "justify-start"}`}
                style={{ marginBottom: m.display_text ? 8 : 0 }}
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
                {isMine && m.is_read && (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ opacity: 0.9 }}
                  >
                    <path d="M1 12l5 5L17 6" />
                    <path d="M8 12l5 5L24 6" />
                  </svg>
                )}
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
              {m.display_text && <div className="whitespace-pre-wrap break-words text-sm">{m.display_text}</div>}
              {renderAttachments(m.attachments)}
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <textarea
                className="w-full rounded-xl border p-2 text-sm"
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  className="px-3 py-2 rounded-xl text-sm font-medium"
                  style={{ backgroundColor: "var(--accent)", color: "#fff" }}
                  onClick={saveEdit}
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  className="px-3 py-2 rounded-xl text-sm font-medium"
                  style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)" }}
                  onClick={cancelEdit}
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          {canShowActions && isSelected && (
            <div className="mt-2 flex items-center gap-2 justify-end">
              <button
                type="button"
                className="text-[12px] px-2 py-1 rounded-xl"
                style={{ backgroundColor: "rgba(255,255,255,0.18)", color: "#fff" }}
                onClick={() => startReply(m)}
              >
                Ответить
              </button>
              <button
                type="button"
                className="text-[12px] px-2 py-1 rounded-xl"
                style={{ backgroundColor: "rgba(255,255,255,0.18)", color: "#fff" }}
                onClick={() => startForward(m)}
              >
                Переслать
              </button>
              {isMine && (
                <>
                  <button
                    type="button"
                    className="text-[12px] px-2 py-1 rounded-xl"
                    disabled={!withinEdit}
                    title={!withinEdit ? `Редактирование доступно в течение ${EDIT_WINDOW_MINUTES} минут` : undefined}
                    style={{
                      backgroundColor: withinEdit ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)",
                      color: withinEdit ? "#fff" : "#e6edf5",
                      cursor: withinEdit ? "pointer" : "not-allowed",
                    }}
                    onClick={() => {
                      if (!withinEdit) return;
                      setSelectedMessageId(null);
                      startEdit(m);
                    }}
                  >
                    Редактировать
                  </button>
                  <button
                    type="button"
                    className="text-[12px] px-2 py-1 rounded-xl"
                    style={{ backgroundColor: "rgba(222,53,11,0.15)", color: "#fff" }}
                    onClick={() => {
                      setSelectedMessageId(null);
                      deleteMessage(m);
                    }}
                  >
                    Удалить
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const generalTitle = "Общий чат";
  const myGroupMember = groupMembers.find((m) => m.user.id === userId);
  const canManageGroupMembers = Boolean(myGroupMember?.is_admin || isAdmin);
  const activeGroup = active.kind === "group" ? groupDialogs.find((d) => d.id === active.dialogId) ?? null : null;
  const mergedDialogs = [
    ...privateDialogs.map((d) => ({
      key: `p-${d.id}`,
      kind: "private" as const,
      dialogId: d.id,
      title: d.other_user.display_name || d.other_user.username,
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
      subtitle: d.last_message_text || "—",
      time: formatChatTimestamp(d.last_message_at || null),
      sortTs: d.last_message_at ? new Date(d.last_message_at).getTime() : 0,
      unread: unreadGroupById.get(d.id) === true,
      seed: d.id,
      imageUrl: d.image_url ?? null,
    })),
  ].sort((a, b) => b.sortTs - a.sortTs);

  const ChatRow = ({
    title,
    subtitle,
    time,
    selected,
    unread,
    seed,
    imageUrl,
    onClick,
  }: {
    title: string;
    subtitle: string;
    time: string;
    selected: boolean;
    unread: boolean;
    seed: number;
    imageUrl?: string | null;
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
              <div className="font-semibold text-sm truncate" style={{ color: "var(--text-primary)" }}>
                {title}
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

  return (
    <div className="chat-messenger-shell h-full min-h-0 flex flex-col md:flex-row bg-[var(--bg-secondary)]">
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
          onClick={() => {
            setShowGroupCreateWizard(false);
            setGroupWizardStep(1);
            setGroupWizardName("");
            setGroupWizardQuery("");
            setGroupWizardResults([]);
            setGroupWizardSelected(new Map());
          }}
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
                  onClick={() => {
                    if (groupWizardStep === 2) {
                      setGroupWizardStep(1);
                      return;
                    }
                    setShowGroupCreateWizard(false);
                    setGroupWizardStep(1);
                    setGroupWizardName("");
                    setGroupWizardQuery("");
                    setGroupWizardResults([]);
                    setGroupWizardSelected(new Map());
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <div className="font-bold" style={{ color: "var(--text-primary)" }}>
                  {groupWizardStep === 1 ? "Новая группа" : "Участники"}
                </div>
                <div className="ml-auto text-[11px] font-semibold" style={{ color: "var(--text-tertiary)" }}>
                  {groupWizardStep}/2
                </div>
              </div>

              {groupWizardStep === 1 ? (
                <div className="p-3 flex-1 min-h-0 flex flex-col">
                  <div className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                    Название группы
                  </div>
                  <input
                    value={groupWizardName}
                    onChange={(e) => setGroupWizardName(e.target.value)}
                    placeholder="Например: Отдел продаж"
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
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
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
                        value={groupWizardQuery}
                        onChange={(e) => setGroupWizardQuery(e.target.value)}
                        placeholder="Найти пользователя…"
                        className="w-full rounded-2xl border p-3 pl-10 text-sm"
                        style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border)" }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-[11px] min-w-0" style={{ color: "var(--text-tertiary)" }}>
                        {groupWizardQuery.trim().length === 0
                          ? groupWizardLoading
                            ? "Загрузка…"
                            : `Пользователи: ${groupWizardResults.length}`
                          : groupWizardQuery.trim().length < 2
                            ? "Введите минимум 2 символа"
                            : groupWizardLoading
                              ? "Поиск…"
                              : groupWizardResults.length > 0
                                ? `Найдено: ${groupWizardResults.length}`
                                : "Ничего не найдено"}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {groupWizardResults.length > 0 && !groupWizardLoading && (
                          <button
                            type="button"
                            className="px-2.5 py-1 rounded-xl text-[11px] font-semibold"
                            style={{ backgroundColor: "var(--bg-secondary)", color: "var(--accent)", border: "1px solid rgba(87,157,255,0.35)" }}
                            onClick={() => {
                              setGroupWizardSelected((prev) => {
                                const next = new Map(prev);
                                for (const u of groupWizardResults) {
                                  next.set(u.id, u);
                                }
                                return next;
                              });
                            }}
                          >
                            Выбрать всех
                          </button>
                        )}
                        {groupWizardSelected.size > 0 && (
                          <div className="text-[11px] font-semibold whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                            Выбрано: {groupWizardSelected.size}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div
                    className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3"
                    data-allow-scroll
                    style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", overscrollBehavior: "contain" }}
                  >
                    {groupWizardSelected.size > 0 && (
                      <div className="mb-3">
                        <div className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                          Выбранные
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {Array.from(groupWizardSelected.values()).map((u) => (
                            <button
                              key={`sel-${u.id}`}
                              type="button"
                              className="px-3 py-2 rounded-2xl text-xs font-semibold"
                              style={{ backgroundColor: "rgba(87,157,255,0.14)", color: "var(--text-primary)", border: "1px solid rgba(87,157,255,0.22)" }}
                              onClick={() => {
                                setGroupWizardSelected((prev) => {
                                  const next = new Map(prev);
                                  next.delete(u.id);
                                  return next;
                                });
                              }}
                            >
                              {u.display_name || u.username} ×
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-2">
                      {groupWizardResults.map((u) => {
                        const title = u.display_name || u.username;
                        const checked = groupWizardSelected.has(u.id);
                        return (
                          <button
                            key={u.id}
                            type="button"
                            className="w-full text-left rounded-2xl p-3 transition-colors"
                            style={{
                              backgroundColor: checked ? "rgba(87,157,255,0.12)" : "var(--bg-secondary)",
                              border: checked ? "1px solid rgba(87,157,255,0.26)" : "1px solid var(--border)",
                            }}
                            onClick={() => {
                              setGroupWizardSelected((prev) => {
                                const next = new Map(prev);
                                if (next.has(u.id)) next.delete(u.id);
                                else next.set(u.id, u);
                                return next;
                              });
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                                style={{ background: avatarSeedColor(u.id) }}
                                aria-hidden
                              >
                                {initials(title)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                                  {title}
                                </div>
                                <div className="text-xs truncate mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                                  {u.username}
                                </div>
                              </div>
                              <div
                                className="w-5 h-5 rounded-md flex items-center justify-center"
                                style={{
                                  border: `1px solid ${checked ? "rgba(87,157,255,0.45)" : "var(--border)"}`,
                                  backgroundColor: checked ? "rgba(87,157,255,0.18)" : "transparent",
                                }}
                                aria-hidden
                              >
                                {checked && (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="p-3 flex-shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
                    {groupWizardSelected.size > 0 && (
                      <button
                        type="button"
                        className="w-full px-4 py-3 rounded-2xl text-sm font-semibold"
                        style={{
                          background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)",
                          color: "#fff",
                          border: "1px solid rgba(255,255,255,0.18)",
                        }}
                        onClick={async () => {
                          const name = groupWizardName.trim();
                          if (!name) return;
                          const member_ids = Array.from(groupWizardSelected.keys());
                          const created = await api.chat.groupDialogs.create({ name, member_ids });
                          await loadGroupDialogs();
                          setActive({ kind: "group", dialogId: created.id });
                          setShowChatList(false);
                          setShowGroupCreateWizard(false);
                          setGroupWizardStep(1);
                          setGroupWizardName("");
                          setGroupWizardQuery("");
                          setGroupWizardResults([]);
                          setGroupWizardSelected(new Map());
                        }}
                      >
                        Создать группу
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {messageMenu && (
        <div
          className="fixed inset-0 z-[130]"
          onClick={() => setMessageMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMessageMenu(null);
          }}
        >
          <div
            data-chat-message-menu
            className="fixed rounded-2xl overflow-hidden"
            style={{
              left: Math.min(messageMenu.x, window.innerWidth - 220),
              top: Math.min(messageMenu.y, window.innerHeight - 140),
              width: 220,
              backgroundColor: "var(--bg-primary)",
              border: "1px solid var(--border)",
              boxShadow: "0 18px 60px rgba(0,0,0,0.28)",
              padding: 6,
            }}
            onClick={(e) => e.stopPropagation()}
          >
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
            {messageMenu.message.sender?.id === userId && (
              <>
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
                    setSelectedMessageId(null);
                    startEdit(messageMenu.message);
                  }}
                >
                  Редактировать
                </button>

                <button
                  type="button"
                  className="w-full text-left px-3 py-2 rounded-xl text-sm font-semibold"
                  style={{ backgroundColor: "rgba(222,53,11,0.10)", color: "var(--error)" }}
                  onClick={() => {
                    const m = messageMenu.message;
                    setMessageMenu(null);
                    setSelectedMessageId(null);
                    deleteMessage(m);
                  }}
                >
                  Удалить
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {forwardSourceMessage && (
        <div
          className="fixed inset-0 z-[131] flex items-center justify-center p-3"
          style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}
          onClick={() => {
            if (forwarding) return;
            setForwardSourceMessage(null);
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
                <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Переслать сообщение</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                  {forwardSourceMessage.display_text || "Вложение"}
                </div>
              </div>
              <button
                type="button"
                className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                onClick={() => setForwardSourceMessage(null)}
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
                onClick={() => void forwardMessageTo({ type: "general" })}
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
                  onClick={() => void forwardMessageTo({ type: "private", dialogId: d.id })}
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
                  onClick={() => void forwardMessageTo({ type: "group", dialogId: g.id })}
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
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-3"
          style={{ backgroundColor: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)" }}
          onClick={() => setImageLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-[980px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm truncate" style={{ color: "#fff" }}>
                {imageLightbox.filename || "Фото"}
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={imageLightbox.url}
                  download={imageLightbox.filename || undefined}
                  className="px-3 py-2 rounded-xl text-sm font-medium"
                  style={{ backgroundColor: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  Скачать
                </a>
                <button
                  type="button"
                  className="px-3 py-2 rounded-xl text-sm font-medium"
                  style={{ backgroundColor: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)" }}
                  onClick={() => setImageLightbox(null)}
                >
                  Закрыть
                </button>
              </div>
            </div>
            <div
              className="w-full rounded-2xl overflow-hidden"
              style={{ backgroundColor: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              <img src={imageLightbox.url} alt={imageLightbox.filename || "Фото"} className="w-full h-auto max-h-[82vh] object-contain" />
            </div>
          </div>
        </div>
      )}
      {showGroupMembers && active.kind === "group" && (
        <>
          <div
            className="fixed inset-0 z-[80]"
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
              className="p-3 sm:p-4 flex items-center justify-between"
              style={{
                borderBottom: "1px solid var(--border)",
                backgroundColor: "var(--bg-primary)",
              }}
            >
            <div className="min-w-0">
              <div className="font-bold text-sm sm:text-base truncate" style={{ color: "var(--text-primary)" }}>
                Участники
              </div>
              <div className="text-[11px] sm:text-xs truncate" style={{ color: "var(--text-tertiary)" }}>
                {groupMembersLoading
                  ? "Загрузка…"
                  : groupMembersTab === "members"
                    ? `${groupMembers.length} человек`
                    : groupMembersTab === "add"
                      ? "Добавление пользователя"
                      : "Параметры группы"}
              </div>

              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="px-2 py-1 rounded-xl text-[11px] font-semibold"
                  style={{
                    backgroundColor: groupMembersTab === "members" ? "rgba(87,157,255,0.16)" : "var(--bg-secondary)",
                    color: groupMembersTab === "members" ? "var(--text-primary)" : "var(--text-tertiary)",
                    border: "1px solid var(--border)",
                  }}
                  onClick={() => setGroupMembersTab("members")}
                >
                  Участники
                </button>
                {canManageGroupMembers && (
                  <>
                    <button
                      type="button"
                      className="px-2 py-1 rounded-xl text-[11px] font-semibold"
                      style={{
                        backgroundColor: groupMembersTab === "add" ? "rgba(87,157,255,0.16)" : "var(--bg-secondary)",
                        color: groupMembersTab === "add" ? "var(--text-primary)" : "var(--text-tertiary)",
                        border: "1px solid var(--border)",
                      }}
                      onClick={() => setGroupMembersTab("add")}
                    >
                      Добавить
                    </button>
                    <button
                      type="button"
                      className="px-2 py-1 rounded-xl text-[11px] font-semibold"
                      style={{
                        backgroundColor: groupMembersTab === "edit" ? "rgba(87,157,255,0.16)" : "var(--bg-secondary)",
                        color: groupMembersTab === "edit" ? "var(--text-primary)" : "var(--text-tertiary)",
                        border: "1px solid var(--border)",
                      }}
                      onClick={() => setGroupMembersTab("edit")}
                    >
                      Редактировать
                    </button>
                  </>
                )}
              </div>
            </div>
              <button
                type="button"
                className="px-2 py-1.5 rounded-xl text-xs sm:text-sm font-medium"
                style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                onClick={() => setShowGroupMembers(false)}
              >
                Закрыть
              </button>

            <button
              type="button"
              className="sm:hidden ml-2 px-2 py-1.5 rounded-xl text-xs font-semibold"
              style={{ backgroundColor: "rgba(222,53,11,0.12)", color: "var(--error)", border: "1px solid rgba(222,53,11,0.22)" }}
              onClick={() => closeChatWidget()}
            >
              Чат
            </button>
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
                <div className="flex flex-col gap-3">
                  <div>
                    <div className="text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
                      Добавить пользователя в группу
                    </div>
                    <input
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Логин или имя…"
                      className="w-full rounded-xl border p-2 text-sm"
                      style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border)" }}
                      disabled={userSearchLoading}
                    />
                  </div>
                  {userSearchLoading && (
                    <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      Поиск…
                    </div>
                  )}
                  {userSearchResults.length === 0 && !userSearchLoading && userSearch.trim().length > 1 && (
                    <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      Ничего не найдено
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    {userSearchResults.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        className="text-left rounded-xl p-3 transition-colors"
                        style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                        onClick={async () => {
                          try {
                            if (activeDialogId == null || activeDialogId <= 0) return;
                            await api.chat.groupDialogs.addMember(activeDialogId, u.id);
                            setGroupMembersTab("members");
                            setUserSearch("");
                            await loadGroupDialogs();
                            await loadGroupMembers(activeDialogId);
                            await loadGroupMessages(activeDialogId);
                          } catch (e) {
                            const msg = e instanceof Error ? e.message : "Ошибка добавления";
                            window.alert(msg);
                          }
                        }}
                      >
                        <div className="font-semibold" style={{ color: "var(--text-primary)" }}>
                          {u.display_name || u.username}
                        </div>
                        <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                          {u.username}
                        </div>
                        <div className="text-[11px] mt-1" style={{ color: "var(--accent)" }}>
                          Добавить
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
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
                        });
                        await loadGroupDialogs();
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

      {/* Mobile chat list overlay */}
      {showChatList && (
        <div className="fixed inset-0 z-[95] sm:hidden" style={{ backgroundColor: "rgba(0,0,0,0.35)", backdropFilter: "blur(6px)" }} onClick={() => setShowChatList(false)}>
          <div
            className="absolute inset-0 bg-[var(--bg-primary)] flex flex-col min-h-0 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            style={{ boxShadow: "0 18px 60px rgba(0,0,0,0.28)" }}
          >
            <div
              className="chat-list-mobile-header chat-dialog-mobile-header flex-shrink-0 p-2 sm:p-3 border-b border-[var(--border)] flex items-center justify-between gap-2 min-w-0 sm:sticky sm:top-0 sm:z-[20] sm:backdrop-blur"
              style={{ backgroundColor: "var(--bg-primary)" }}
            >
              <div className="min-w-0 flex items-center gap-2 flex-1">
                <div className="min-w-0">
                  <div className="font-bold text-sm sm:text-base truncate" style={{ color: "var(--text-primary)" }}>
                    Чаты
                  </div>
                  <div className="text-[11px] sm:text-xs truncate" style={{ color: "var(--text-tertiary)" }}>
                    Группы и личные сообщения
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  className="p-2 rounded-xl"
                  style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                  aria-label="Создать группу"
                  title="Создать группу"
                  onClick={() => {
                    setShowGroupCreateWizard(true);
                    setGroupWizardStep(1);
                    setGroupWizardName("");
                    setGroupWizardQuery("");
                    setGroupWizardResults([]);
                    setGroupWizardSelected(new Map());
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="p-2 rounded-xl"
                  style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                  aria-label="Найти пользователя"
                  title="Найти пользователя"
                  onClick={() => {
                    setShowUserFinder(true);
                    setFinderQuery("");
                    setFinderResults([]);
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                    <line x1="21" y1="8" x2="21" y2="14" />
                    <line x1="18" y1="11" x2="24" y2="11" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="p-2 rounded-xl"
                  style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                  aria-label="Закрыть чат"
                  title="Закрыть чат"
                  onClick={() => closeChatWidget()}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            <div
              className="chat-list-mobile-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3"
              data-allow-scroll
              style={{
                WebkitOverflowScrolling: "touch",
                touchAction: "pan-y",
                overscrollBehavior: "contain",
              }}
            >
              {mergedDialogs.length === 0 ? (
                <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                  Чатов пока нет
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {mergedDialogs.map((d) => (
                    <div key={d.key}>
                      <ChatRow
                        title={d.title}
                        subtitle={d.subtitle}
                        time={d.time}
                        selected={active.kind === d.kind && active.dialogId === d.dialogId}
                        unread={d.unread}
                        seed={d.seed}
                        imageUrl={d.imageUrl}
                        onClick={() => {
                          if (d.kind === "private") setSelectedDialogId(d.dialogId);
                          setActive({ kind: d.kind, dialogId: d.dialogId });
                          setShowChatList(false);
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Left column */}
      <div className="hidden sm:flex sm:flex-col sm:min-h-0 sm:h-full w-full md:w-[320px] lg:w-[360px] xl:w-[420px] md:border-r border-b md:border-b-0 border-[var(--border)] bg-[var(--bg-primary)]">
        <div
          className="chat-dialog-mobile-header p-2 sm:p-3 border-b border-[var(--border)] flex-shrink-0 flex items-center justify-between gap-2 min-w-0 sm:sticky sm:top-0 sm:z-[20] sm:backdrop-blur"
          style={{ backgroundColor: "var(--bg-primary)" }}
        >
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm sm:text-base truncate" style={{ color: "var(--text-primary)" }}>
              Чаты
            </div>
            <div className="text-[11px] sm:text-xs truncate" style={{ color: "var(--text-tertiary)" }}>
              Группы и личные сообщения
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              className="p-2 rounded-xl"
              style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
              aria-label="Создать группу"
              title="Создать группу"
              onClick={() => {
                setShowGroupCreateWizard(true);
                setGroupWizardStep(1);
                setGroupWizardName("");
                setGroupWizardQuery("");
                setGroupWizardResults([]);
                setGroupWizardSelected(new Map());
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button
              type="button"
              className="p-2 rounded-xl"
              style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
              aria-label="Найти пользователя"
              title="Найти пользователя"
              onClick={() => {
                setShowUserFinder(true);
                setFinderQuery("");
                setFinderResults([]);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
                <line x1="21" y1="8" x2="21" y2="14" />
                <line x1="18" y1="11" x2="24" y2="11" />
              </svg>
            </button>
            <button
              type="button"
              className="p-2 rounded-xl"
              style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
              aria-label="Закрыть чат"
              title="Закрыть чат"
              onClick={() => closeChatWidget()}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

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
            {mergedDialogs.length === 0 ? (
              <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                Чатов пока нет
              </div>
            ) : (
              mergedDialogs.map((d) => (
                <div key={d.key}>
                  <ChatRow
                    title={d.title}
                    subtitle={d.subtitle}
                    time={d.time}
                    selected={active.kind === d.kind && active.dialogId === d.dialogId}
                    unread={d.unread}
                    seed={d.seed}
                    imageUrl={d.imageUrl}
                    onClick={() => {
                      if (d.kind === "private") setSelectedDialogId(d.dialogId);
                      setActive({ kind: d.kind, dialogId: d.dialogId });
                    }}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Right */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="chat-dialog-mobile-header p-2 sm:p-3 border-b border-[var(--border)] flex items-center justify-between sm:sticky sm:top-0 sm:z-[20] sm:backdrop-blur" style={{ backgroundColor: "var(--bg-primary)" }}>
          <div className="min-w-0 flex items-center gap-2">
            {active.kind === "private" && (
              <Avatar
                name={privateDialogs.find((d) => d.id === active.dialogId)?.other_user.display_name || "Диалог"}
                seed={privateDialogs.find((d) => d.id === active.dialogId)?.other_user.id || active.dialogId || 0}
                imageUrl={privateDialogs.find((d) => d.id === active.dialogId)?.other_user.avatar_url}
                size={32}
              />
            )}
            {active.kind === "group" && (
              <Avatar
                name={groupDialogs.find((d) => d.id === active.dialogId)?.name || "Группа"}
                seed={active.dialogId || 0}
                imageUrl={groupDialogs.find((d) => d.id === active.dialogId)?.image_url}
                size={32}
              />
            )}
            <button
              type="button"
              className="sm:hidden p-2 rounded-xl"
              style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
              aria-label="Меню чатов"
              title="Меню чатов"
              onClick={() => {
                setShowGroupMembers(false);
                setShowChatList(true);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </svg>
            </button>
            <div className="font-bold text-sm sm:text-base" style={{ color: "var(--text-primary)" }}>
              {active.kind === "general"
                ? generalTitle
                : active.kind === "private"
                  ? privateDialogs.find((d) => d.id === active.dialogId)?.other_user.display_name || "Диалог"
                  : groupDialogs.find((d) => d.id === active.dialogId)?.name || "Группа"}
            </div>
            <div className="text-[11px] sm:text-xs truncate" style={{ color: "var(--text-tertiary)" }}>
              {active.kind === "general"
                ? "Системные и пользовательские сообщения"
                : active.kind === "private"
                  ? "История переписки"
                  : "История группы"}
            </div>
          </div>

          {active.kind === "general" && isAdmin && generalLeft && (
            <button
              type="button"
              className="px-3 py-2 rounded-xl text-sm font-medium"
              style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)" }}
              onClick={async () => {
                await api.chat.general.join();
                await loadGeneralMessages();
                setGeneralLeft(false);
              }}
            >
              Вернуться
            </button>
          )}

          <div className="flex items-center gap-2">
            {(active.kind === "private" || active.kind === "group") && activeDialogId != null && activeDialogId > 0 && (
              <button
                type="button"
                className="p-2 rounded-xl shrink-0"
                style={{
                  backgroundColor: "rgba(222,53,11,0.10)",
                  color: "var(--error)",
                  border: "1px solid rgba(222,53,11,0.28)",
                }}
                aria-label={active.kind === "private" ? "Убрать чат из списка" : "Покинуть группу"}
                title={active.kind === "private" ? "Убрать чат из списка" : "Покинуть группу"}
                onClick={() => void removeCurrentChatFromList()}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            )}
            <button
              type="button"
              className="p-2 rounded-xl"
              style={{
                backgroundColor: showSettings ? "rgba(87,157,255,0.18)" : "var(--bg-secondary)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}
              aria-label="Настройки чата"
              title="Настройки чата"
              onClick={() => setShowSettings((v) => !v)}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v6m0 6v6m9-9h-6m-6 0H3" />
              </svg>
            </button>
            <button
              type="button"
              className="p-2 rounded-xl"
              style={{
                backgroundColor: showMessageSearch ? "rgba(87,157,255,0.18)" : "var(--bg-secondary)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}
              aria-label="Поиск по сообщениям"
              title="Поиск по сообщениям"
              onClick={() => {
                setShowMessageSearch((v) => {
                  const nv = !v;
                  if (!nv) setMessageSearchQuery("");
                  return nv;
                });
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            {active.kind === "group" && (
              <>
                <button
                  type="button"
                  className="px-2 py-1.5 rounded-xl text-xs font-semibold hidden sm:inline-flex"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border)",
                  }}
                  onClick={() => {
                    if (activeDialogId == null || activeDialogId <= 0) return;
                    setGroupMembersTab("members");
                    setShowGroupMembers(true);
                  }}
                >
                  Участники
                </button>
                <button
                  type="button"
                  className="px-2 py-1.5 rounded-xl text-xs font-semibold sm:hidden"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border)",
                  }}
                  onClick={() => {
                    if (activeDialogId == null || activeDialogId <= 0) return;
                    setGroupMembersTab("members");
                    setShowGroupMembers(true);
                  }}
                >
                  Участники{groupMembersLoading ? "…" : groupMembers.length > 0 ? ` (${groupMembers.length})` : ""}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Под шапкой диалога, вне прокрутки ленты — не нужно листать сообщения вверх */}
        {showSettings && (
          <div
            className="shrink-0 border-b z-[15]"
            style={{
              borderColor: "var(--border)",
              backgroundColor: "var(--bg-primary)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
            }}
          >
            <div className="max-h-[min(42vh,300px)] overflow-y-auto px-4 py-3 sm:px-5 overscroll-contain">
              <div className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                Настройки чата
              </div>
              <div className="space-y-3">
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
                    Уведомления о сообщениях
                  </div>
                  <p className="text-xs mb-2 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                    Когда выключено: не приходят push на устройство, не показывается красный счётчик на кнопке чата на сайте.
                  </p>
                  <button
                    type="button"
                    disabled={notifSaving}
                    onClick={async () => {
                      setNotifSaving(true);
                      try {
                        await api.chat.patchNotificationSettings({ enabled: !notifEnabled });
                        await refreshUser();
                      } catch (e) {
                        window.alert(e instanceof Error ? e.message : "Не удалось сохранить настройку");
                      } finally {
                        setNotifSaving(false);
                      }
                    }}
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
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-auto p-4 sm:p-5" style={{ backgroundColor: "var(--bg-secondary)" }}>
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

        {/* Composer */}
        {active.kind === "general" ? (
          generalLeft ? null : (
            <div
              className="border-t p-3"
              style={{ backgroundColor: "var(--bg-primary)", boxShadow: "0 -12px 34px rgba(0,0,0,0.03)" }}
            >
              <ComposerBar
                text={generalText}
                setText={setGeneralText}
                files={generalFiles}
                setFiles={setGeneralFiles}
                previews={generalAttachmentPreviews}
                placeholder="Сообщение…"
                disabledSend={generalSending}
                onSend={onSendGeneral}
                replyTo={replyTo}
                onClearReply={() => setReplyTo(null)}
                sendMode={sendMode}
              />
            </div>
          )
        ) : active.kind === "private" ? (
          <div className="border-t p-3" style={{ backgroundColor: "var(--bg-primary)", boxShadow: "0 -12px 34px rgba(0,0,0,0.03)" }}>
            <ComposerBar
              text={privateText}
              setText={setPrivateText}
              files={privateFiles}
              setFiles={setPrivateFiles}
              previews={privateAttachmentPreviews}
              placeholder="Сообщение…"
              disabledSend={privateSending || active.kind !== "private"}
              onSend={onSendPrivate}
              replyTo={replyTo}
              onClearReply={() => setReplyTo(null)}
              sendMode={sendMode}
            />
          </div>
        ) : (
          <div className="border-t p-3" style={{ backgroundColor: "var(--bg-primary)", boxShadow: "0 -12px 34px rgba(0,0,0,0.03)" }}>
            <ComposerBar
              text={groupText}
              setText={setGroupText}
              files={groupFiles}
              setFiles={setGroupFiles}
              previews={groupAttachmentPreviews}
              placeholder="Сообщение…"
              disabledSend={groupSending}
              onSend={onSendGroup}
              replyTo={replyTo}
              onClearReply={() => setReplyTo(null)}
              sendMode={sendMode}
            />
          </div>
        )}
      </div>
    </div>
  );
}

