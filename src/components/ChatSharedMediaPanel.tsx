import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  type ChatSharedMediaCategory,
  type ChatSharedMediaItem,
} from "../api";

export type ChatSharedMediaScope =
  | { kind: "general" }
  | { kind: "private"; dialogId: number }
  | { kind: "group"; dialogId: number };

const CATEGORY_TITLES: Record<ChatSharedMediaCategory, string> = {
  photos: "Фото",
  videos: "Видео",
  voice: "Голосовые",
  files: "Файлы",
  links: "Ссылки",
};

function formatMediaDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

function fileIcon(mediaType: string | null | undefined) {
  if (mediaType === "image") return "🖼";
  if (mediaType === "video") return "🎬";
  if (mediaType === "audio") return "🎤";
  return "📎";
}

export function ChatSharedMediaPanel({
  scope,
  category,
  resolveMediaUrl,
  onBack,
  onJumpToMessage,
}: {
  scope: ChatSharedMediaScope;
  category: ChatSharedMediaCategory;
  resolveMediaUrl: (url: string) => string;
  onBack: () => void;
  onJumpToMessage: (messageId: number) => void;
}) {
  const [items, setItems] = useState<ChatSharedMediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      const limit = 60;
      let res;
      if (scope.kind === "general") {
        res = await api.chat.general.sharedMedia(category, offset, limit);
      } else if (scope.kind === "private") {
        res = await api.chat.privateDialogs.sharedMedia(scope.dialogId, category, offset, limit);
      } else {
        res = await api.chat.groupDialogs.sharedMedia(scope.dialogId, category, offset, limit);
      }
      setTotal(res.total);
      setItems((prev) => (append ? [...prev, ...res.items] : res.items));
    },
    [scope, category],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setItems([]);
    void fetchPage(0, false)
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ошибка загрузки");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const loadMore = async () => {
    if (loadingMore || items.length >= total) return;
    setLoadingMore(true);
    try {
      await fetchPage(items.length, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoadingMore(false);
    }
  };

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || loading || loadingMore || items.length >= total) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) {
      void loadMore();
    }
  };

  const title = CATEGORY_TITLES[category];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div
        className="chat-dialog-mobile-header flex items-center gap-2 px-2 py-2 border-b shrink-0"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-primary)" }}
      >
        <button
          type="button"
          className="p-2 rounded-full shrink-0"
          style={{ color: "var(--accent)" }}
          aria-label="Назад"
          onClick={onBack}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[17px] truncate" style={{ color: "var(--text-primary)" }}>
            {title}
          </div>
          {!loading && total > 0 ? (
            <div className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>
              {total} {total === 1 ? "элемент" : total < 5 ? "элемента" : "элементов"}
            </div>
          ) : null}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain" onScroll={onScroll}>
        {loading ? (
          <p className="p-6 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
            Загрузка…
          </p>
        ) : error ? (
          <p className="p-6 text-center text-sm" style={{ color: "var(--error)" }}>
            {error}
          </p>
        ) : items.length === 0 ? (
          <p className="p-6 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
            Пока ничего нет
          </p>
        ) : category === "photos" ? (
          <div className="grid grid-cols-3 gap-0.5 p-0.5">
            {items.map((item) => {
              const url = item.url ? resolveMediaUrl(item.url) : "";
              return (
                <button
                  key={`${item.message_id}-${item.attachment_id}`}
                  type="button"
                  className="aspect-square overflow-hidden bg-black/5 active:opacity-80"
                  onClick={() => onJumpToMessage(item.message_id)}
                  title="Открыть"
                >
                  {url ? (
                    <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <span className="text-xs p-2">Фото</span>
                  )}
                </button>
              );
            })}
          </div>
        ) : category === "videos" ? (
          <div className="grid grid-cols-2 gap-2 p-3">
            {items.map((item) => {
              const url = item.url ? resolveMediaUrl(item.url) : "";
              return (
                <button
                  key={`${item.message_id}-${item.attachment_id}`}
                  type="button"
                  className="rounded-xl overflow-hidden text-left active:opacity-80"
                  style={{ border: "1px solid var(--border)", backgroundColor: "var(--bg-primary)" }}
                  onClick={() => onJumpToMessage(item.message_id)}
                >
                  {url ? (
                    <video src={url} className="w-full aspect-video object-cover bg-black" muted playsInline preload="metadata" />
                  ) : (
                    <div className="aspect-video flex items-center justify-center text-2xl">🎬</div>
                  )}
                  <div className="px-2 py-1.5 text-[11px] truncate" style={{ color: "var(--text-tertiary)" }}>
                    {formatMediaDate(item.created_at)}
                    {item.sender_name ? ` · ${item.sender_name}` : ""}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <ul className="py-2">
            {items.map((item, idx) => {
              const key =
                category === "links"
                  ? `${item.message_id}-${item.link_url}-${idx}`
                  : `${item.message_id}-${item.attachment_id}`;
              const isLink = category === "links";
              const url = item.url ? resolveMediaUrl(item.url) : item.link_url || "";
              const label = isLink
                ? item.link_url || ""
                : item.filename || (category === "voice" ? "Голосовое" : "Файл");
              return (
                <li key={key}>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-4 py-3 text-left active:opacity-80"
                    style={{
                      backgroundColor: "var(--bg-primary)",
                      borderBottom: "1px solid var(--border)",
                    }}
                    onClick={() => onJumpToMessage(item.message_id)}
                  >
                    <span
                      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-lg"
                      style={{ backgroundColor: "rgba(87,157,255,0.12)" }}
                    >
                      {isLink ? "🔗" : category === "voice" ? "🎤" : fileIcon(item.media_type)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span
                        className="block text-[14px] font-medium truncate"
                        style={{ color: "var(--text-primary)" }}
                        title={label}
                      >
                        {label}
                      </span>
                      <span className="block text-xs mt-0.5 truncate" style={{ color: "var(--text-tertiary)" }}>
                        {formatMediaDate(item.created_at)}
                        {item.sender_name ? ` · ${item.sender_name}` : ""}
                      </span>
                      {isLink && item.preview_text ? (
                        <span className="block text-xs mt-1 line-clamp-2" style={{ color: "var(--text-secondary)" }}>
                          {item.preview_text}
                        </span>
                      ) : null}
                    </span>
                    {!isLink && url && category === "files" && item.media_type === "image" ? (
                      <img
                        src={url}
                        alt=""
                        className="w-11 h-11 rounded-lg object-cover shrink-0"
                        loading="lazy"
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {loadingMore ? (
          <p className="py-3 text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
            Загрузка…
          </p>
        ) : null}
      </div>
    </div>
  );
}

export const SHARED_MEDIA_CATEGORIES: ChatSharedMediaCategory[] = [
  "photos",
  "videos",
  "voice",
  "files",
  "links",
];

export const SHARED_MEDIA_CATEGORY_LABELS: Record<ChatSharedMediaCategory, string> = CATEGORY_TITLES;
