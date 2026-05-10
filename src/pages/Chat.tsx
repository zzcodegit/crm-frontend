import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, type ChatMessageItem, type ChatMediaType, type ChatAttachment, type PrivateDialogItem, type ChatUserShortResponse } from "../api";
import { useAuth } from "../contexts/AuthContext";
import { formatChatTimestamp } from "../utils/chatTimestamp";

type TabKey = "general" | "private";

const EDIT_WINDOW_MINUTES = 15;

function mediaFromFile(file: File): ChatMediaType | null {
  const type = (file.type || "").toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  const name = (file.name || "").toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"].includes(ext)) return "image";
  if ([".mp4", ".webm"].includes(ext)) return "video";
  if ([".mp3", ".wav", ".ogg", ".m4a", ".webm"].includes(ext)) return "audio";
  return null;
}

function ChatAudioPlayer({ src }: { src: string }) {
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
      setUseNativeFallback(true);
    }
  };

  const reliableDuration = duration && duration > 1.5 ? duration : null;
  const canSeek = Boolean(reliableDuration);

  return (
    <div
      className="w-full max-w-[320px] rounded-xl px-2 py-2 border"
      style={{ backgroundColor: "var(--bg-secondary)" }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <audio
        ref={mediaRef}
        src={src}
        preload="metadata"
        className="hidden"
        onLoadedMetadata={(e) => {
          const d = Number(e.currentTarget.duration || 0);
          if (Number.isFinite(d) && d > 1.5) setDuration(d);
        }}
        onDurationChange={(e) => {
          const d = Number(e.currentTarget.duration || 0);
          if (Number.isFinite(d) && d > 1.5) setDuration(d);
        }}
        onTimeUpdate={(e) => {
          setCurrentTime(Number(e.currentTarget.currentTime || 0));
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />

      {useNativeFallback ? (
        <audio src={src} controls className="w-full" />
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

export default function Chat() {
  const { user } = useAuth();
  const userId = user?.id ?? -1;
  const role = user?.role ?? (user?.is_admin ? "admin" : "user");
  const isAdmin = role === "admin";

  const [tab, setTab] = useState<TabKey>("general");

  // General chat
  const [generalMessages, setGeneralMessages] = useState<ChatMessageItem[]>([]);
  const [generalLeft, setGeneralLeft] = useState(false);
  const [generalLoading, setGeneralLoading] = useState(false);
  const [generalText, setGeneralText] = useState("");
  const [generalFiles, setGeneralFiles] = useState<File[]>([]);

  // Private chat
  const [privateDialogs, setPrivateDialogs] = useState<PrivateDialogItem[]>([]);
  const [selectedDialogId, setSelectedDialogId] = useState<number | null>(null);
  const [privateMessages, setPrivateMessages] = useState<ChatMessageItem[]>([]);
  const [dialogLoading, setDialogLoading] = useState(false);
  const [privateText, setPrivateText] = useState("");
  const [privateFiles, setPrivateFiles] = useState<File[]>([]);

  const [userSearch, setUserSearch] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<ChatUserShortResponse[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const generalAttachmentPreviews = useMemo(() => {
    return generalFiles.map((f) => ({ file: f, url: URL.createObjectURL(f), media_type: mediaFromFile(f) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generalFiles]);

  const privateAttachmentPreviews = useMemo(() => {
    return privateFiles.map((f) => ({ file: f, url: URL.createObjectURL(f), media_type: mediaFromFile(f) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [privateFiles]);

  useEffect(() => {
    // revoke object URLs
    return () => {
      generalAttachmentPreviews.forEach((p) => URL.revokeObjectURL(p.url));
      privateAttachmentPreviews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [generalAttachmentPreviews, privateAttachmentPreviews]);

  const loadGeneralMessages = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setGeneralLoading(true);
    try {
      setGeneralLeft(false);
      const msgs = await api.chat.general.messages(undefined, 80);
      setGeneralMessages(msgs);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка загрузки сообщений";
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
    setPrivateDialogs(dialogs);
    if (selectedDialogId == null && dialogs.length > 0) {
      setSelectedDialogId(dialogs[0].id);
    }
  };

  const loadPrivateMessages = async (dialogId: number, opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setDialogLoading(true);
    try {
      const msgs = await api.chat.privateDialogs.messages(dialogId, undefined, 80);
      setPrivateMessages(msgs);
    } finally {
      if (!silent) setDialogLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "general") loadGeneralMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (tab !== "private") return;
    loadPrivateDialogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (tab !== "private") return;
    if (selectedDialogId == null) return;
    loadPrivateMessages(selectedDialogId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDialogId]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (tab === "private") void loadPrivateDialogs();

      const activeEl = document.activeElement as HTMLElement | null;
      const composerFocused = Boolean(activeEl && activeEl.tagName === "TEXTAREA");
      const typing =
        (tab === "general" && generalText.trim().length > 0) ||
        (tab === "private" && privateText.trim().length > 0);
      const silent = composerFocused || typing;

      if (tab === "general" && !generalLeft) void loadGeneralMessages({ silent });
      if (tab === "private" && selectedDialogId != null) void loadPrivateMessages(selectedDialogId, { silent });
    }, 4000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedDialogId, generalLeft, generalText, privateText]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [generalMessages.length, privateMessages.length]);

  const onSendGeneral = async () => {
    const files = generalFiles;
    const text = generalText.trim() || null;
    const anyAllowed = files.length === 0 ? true : files.some((f) => mediaFromFile(f) != null);
    if (!anyAllowed) return;

    await api.chat.general.send(text, files);
    setGeneralText("");
    setGeneralFiles([]);
    await loadGeneralMessages();
  };

  const onSendPrivate = async () => {
    if (selectedDialogId == null) return;
    const files = privateFiles;
    const text = privateText.trim() || null;
    const anyAllowed = files.length === 0 ? true : files.some((f) => mediaFromFile(f) != null);
    if (!anyAllowed) return;

    await api.chat.privateDialogs.send(selectedDialogId, text, files);
    setPrivateText("");
    setPrivateFiles([]);
    await loadPrivateMessages(selectedDialogId);
    await loadPrivateDialogs();
  };

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");

  const startEdit = (m: ChatMessageItem) => {
    setEditingId(m.id);
    setEditingText(m.display_text || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText("");
  };

  const saveEdit = async () => {
    if (editingId == null) return;
    await api.chat.editMessage(editingId, editingText);
    cancelEdit();
    if (tab === "general") await loadGeneralMessages();
    if (tab === "private" && selectedDialogId != null) await loadPrivateMessages(selectedDialogId);
  };

  const deleteMessage = async (m: ChatMessageItem) => {
    if (!window.confirm("Удалить сообщение?")) return;
    await api.chat.deleteMessage(m.id);
    if (tab === "general") await loadGeneralMessages();
    if (tab === "private" && selectedDialogId != null) await loadPrivateMessages(selectedDialogId);
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const s = userSearch.trim();
      if (tab !== "private") return;
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
  }, [userSearch, tab]);

  const renderAttachments = (atts: ChatAttachment[]) => {
    if (!atts || atts.length === 0) return null;
    return (
      <div className="mt-2 flex flex-col gap-2">
        {atts.map((a) => {
          if (a.media_type === "image") {
            return (
              <img
                key={a.id}
                src={a.url}
                alt={a.filename || "image"}
                className="max-w-[240px] max-h-[240px] rounded-lg border"
              />
            );
          }
          if (a.media_type === "audio") {
            return (
              <ChatAudioPlayer key={a.id} src={a.url} />
            );
          }
          return (
            <video
              key={a.id}
              src={a.url}
              controls
              className="max-w-[280px] max-h-[240px] rounded-lg border"
            />
          );
        })}
      </div>
    );
  };

  const AttachmentPicker = ({
    files,
    setFiles,
    previews,
  }: {
    files: File[];
    setFiles: (v: File[]) => void;
    previews: { file: File; url: string; media_type: ChatMediaType | null }[];
  }) => {
    const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files ? Array.from(e.target.files) : [];
      const allowed = list.filter((f) => mediaFromFile(f) != null);
      setFiles(allowed);
    };

    return (
      <div className="flex flex-col gap-2">
        <input
          type="file"
          accept="image/*,video/*,audio/*,.mp3,.wav,.ogg,.m4a"
          multiple
          onChange={onChange}
          className="text-sm"
        />
        {previews.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {previews.map((p) => (
              <div key={p.url} className="relative">
                {p.media_type === "image" ? (
                  <img src={p.url} alt="preview" className="w-24 h-24 object-cover rounded-lg border" />
                ) : p.media_type === "audio" ? (
                  <div className="w-28 h-24 object-cover rounded-lg border flex items-center justify-center text-xs">
                    Голосовое
                  </div>
                ) : (
                  <video src={p.url} className="w-28 h-24 object-cover rounded-lg border" />
                )}
                <button
                  type="button"
                  className="absolute -top-2 -right-2 bg-white/90 border rounded-full w-7 h-7 flex items-center justify-center"
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
  };

  const MessageBubble = ({ m }: { m: ChatMessageItem }) => {
    const isMine = Boolean(m.sender && m.sender.id === userId);
    const isEditing = editingId === m.id;
    const isWithinEditWindow = (() => {
      if (!m.created_at) return false;
      const d = new Date(m.created_at);
      if (Number.isNaN(d.getTime())) return false;
      return Date.now() <= d.getTime() + EDIT_WINDOW_MINUTES * 60_000;
    })();

    return (
      <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
        <div
          className="max-w-[85%] rounded-2xl px-4 py-3 border"
          style={{
            backgroundColor: isMine ? "var(--accent-light)" : "var(--bg-primary)",
            borderColor: isMine ? "rgba(0, 82, 204, 0.18)" : "var(--border)",
          }}
        >
          {!isEditing ? (
            <>
              <div className="text-xs text-[var(--text-tertiary)] flex items-center gap-2">
                <span>{isMine ? "Вы" : m.sender?.display_name || "Система"}</span>
                <span>•</span>
                <span>{formatChatTimestamp(m.created_at)}</span>
                {m.edited_at && (
                  <>
                    <span>•</span>
                    <span>отредактировано {formatChatTimestamp(m.edited_at)}</span>
                  </>
                )}
              </div>
              {m.display_text && <div className="mt-2 whitespace-pre-wrap break-words">{m.display_text}</div>}
              {renderAttachments(m.attachments)}
            </>
          ) : (
            <div className="mt-1 flex flex-col gap-2">
              <textarea
                className="w-full rounded-lg border p-2 text-sm"
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: "var(--accent)", color: "#fff" }}
                  onClick={saveEdit}
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)" }}
                  onClick={cancelEdit}
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          <div className="mt-2 flex items-center gap-2">
            {isMine && !m.is_deleted && !isEditing && (
              <button
                type="button"
                className="text-xs px-2 py-1 rounded-lg"
                disabled={!isWithinEditWindow}
                style={{
                  backgroundColor: !isWithinEditWindow ? "var(--bg-tertiary)" : "var(--bg-secondary)",
                  color: !isWithinEditWindow ? "var(--text-tertiary)" : "var(--text-secondary)",
                  cursor: !isWithinEditWindow ? "not-allowed" : "pointer",
                  opacity: !isWithinEditWindow ? 0.9 : 1,
                }}
                onClick={() => {
                  if (!isWithinEditWindow) return;
                  startEdit(m);
                }}
              >
                Редактировать
              </button>
            )}
            {!m.is_deleted && isMine && !isEditing && (
              <button
                type="button"
                className="text-xs px-2 py-1 rounded-lg"
                style={{ backgroundColor: "rgba(222, 53, 11, 0.08)", color: "var(--error)" }}
                onClick={() => deleteMessage(m)}
              >
                Удалить
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full">
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setTab("general")}
          className="px-3 py-2 rounded-lg text-sm font-medium"
          style={{
            backgroundColor: tab === "general" ? "var(--accent-light)" : "var(--bg-secondary)",
            color: tab === "general" ? "var(--accent)" : "var(--text-secondary)",
            border: `1px solid ${tab === "general" ? "rgba(0, 82, 204, 0.22)" : "var(--border)"}`,
          }}
        >
          Общий чат
        </button>
        <button
          type="button"
          onClick={() => setTab("private")}
          className="px-3 py-2 rounded-lg text-sm font-medium"
          style={{
            backgroundColor: tab === "private" ? "var(--accent-light)" : "var(--bg-secondary)",
            color: tab === "private" ? "var(--accent)" : "var(--text-secondary)",
            border: `1px solid ${tab === "private" ? "rgba(0, 82, 204, 0.22)" : "var(--border)"}`,
          }}
        >
          Личные сообщения
        </button>
      </div>

      {tab === "general" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Общий чат
            </div>
            {isAdmin && (
              <div className="flex gap-2">
                {generalLeft ? (
                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg text-sm font-medium"
                    style={{ backgroundColor: "var(--accent)", color: "#fff" }}
                    onClick={async () => {
                      await api.chat.general.join();
                      setGeneralLeft(false);
                      await loadGeneralMessages();
                    }}
                  >
                    Вернуться в чат
                  </button>
                ) : null}
              </div>
            )}
          </div>

          {generalLeft ? (
            <div
              className="rounded-xl p-6 border"
              style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border)" }}
            >
              Вы вышли из общего чата.
            </div>
          ) : (
            <>
              <div className="rounded-xl border p-3" style={{ backgroundColor: "var(--bg-primary)" }}>
                <div className="flex flex-col gap-3 max-h-[60vh] overflow-auto pr-1">
                  {generalLoading && generalMessages.length === 0 ? (
                    <div className="text-sm text-[var(--text-secondary)]">Загрузка…</div>
                  ) : generalMessages.length === 0 ? (
                    <div className="text-sm text-[var(--text-secondary)]">Сообщений пока нет</div>
                  ) : (
                    generalMessages.map((m) => <MessageBubble key={m.id} m={m} />)
                  )}
                  <div ref={bottomRef} />
                </div>
              </div>

              <div
                className="rounded-xl border p-3"
                style={{ backgroundColor: "var(--bg-primary)" }}
              >
                <div className="flex flex-col gap-3">
                  <textarea
                    className="w-full rounded-lg border p-2 text-sm"
                    placeholder="Сообщение…"
                    value={generalText}
                    onChange={(e) => setGeneralText(e.target.value)}
                  />
                  <AttachmentPicker
                    files={generalFiles}
                    setFiles={setGeneralFiles}
                    previews={generalAttachmentPreviews}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="px-4 py-2 rounded-lg text-sm font-medium"
                      style={{ backgroundColor: "var(--accent)", color: "#fff" }}
                      disabled={generalLoading}
                      onClick={onSendGeneral}
                    >
                      Отправить
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "private" && (
        <div className="grid grid-cols-1 lg:grid-cols-[320px,1fr] gap-3">
          <div className="rounded-xl border p-3" style={{ backgroundColor: "var(--bg-primary)" }}>
            <div className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
              Диалоги
            </div>
            <div className="flex flex-col gap-2 max-h-[65vh] overflow-auto">
              {privateDialogs.length === 0 ? (
                <div className="text-sm text-[var(--text-secondary)]">Диалогов пока нет</div>
              ) : (
                privateDialogs.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedDialogId(d.id)}
                    className="text-left rounded-lg p-2 border transition-all"
                    style={{
                      backgroundColor: selectedDialogId === d.id ? "var(--accent-light)" : "var(--bg-secondary)",
                      borderColor: selectedDialogId === d.id ? "rgba(0,82,204,0.2)" : "var(--border)",
                    }}
                  >
                    <div className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                      {d.other_user.display_name || d.other_user.username}
                    </div>
                    <div className="text-xs truncate mt-1" style={{ color: "var(--text-secondary)" }}>
                      {d.last_message_text || "—"}
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="mt-4">
              <div className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                Новый диалог
              </div>
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Поиск пользователя…"
                className="w-full rounded-lg border p-2 text-sm"
              />
              {userSearchLoading ? (
                <div className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
                  Поиск…
                </div>
              ) : userSearchResults.length > 0 ? (
                <div className="mt-2 flex flex-col gap-2">
                  {userSearchResults.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="text-left rounded-lg p-2 border"
                      style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border)" }}
                      onClick={async () => {
                        const res = await api.chat.privateDialogs.ensure(u.id);
                        setSelectedDialogId(res.id);
                        await loadPrivateDialogs();
                        setUserSearch("");
                      }}
                    >
                      <div className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                        {u.display_name || u.username}
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                        {u.username}
                      </div>
                    </button>
                  ))}
                </div>
              ) : userSearch.trim().length >= 2 ? (
                <div className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
                  Ничего не найдено
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border p-3" style={{ backgroundColor: "var(--bg-primary)" }}>
            {!selectedDialogId ? (
              <div className="text-sm text-[var(--text-secondary)]">Выберите диалог слева</div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    Диалог
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {dialogLoading ? "Загрузка…" : ""}
                  </div>
                </div>

                <div className="flex flex-col gap-3 max-h-[60vh] overflow-auto pr-1">
                  {privateMessages.length === 0 ? (
                    <div className="text-sm text-[var(--text-secondary)]">Сообщений пока нет</div>
                  ) : (
                    privateMessages.map((m) => <MessageBubble key={m.id} m={m} />)
                  )}
                  <div ref={bottomRef} />
                </div>

                <div className="mt-4">
                  <div className="rounded-xl border p-3" style={{ backgroundColor: "var(--bg-primary)" }}>
                    <div className="flex flex-col gap-3">
                      <textarea
                        className="w-full rounded-lg border p-2 text-sm"
                        placeholder="Сообщение…"
                        value={privateText}
                        onChange={(e) => setPrivateText(e.target.value)}
                      />
                      <AttachmentPicker
                        files={privateFiles}
                        setFiles={setPrivateFiles}
                        previews={privateAttachmentPreviews}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="px-4 py-2 rounded-lg text-sm font-medium"
                          style={{ backgroundColor: "var(--accent)", color: "#fff" }}
                          disabled={dialogLoading}
                          onClick={onSendPrivate}
                        >
                          Отправить
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

