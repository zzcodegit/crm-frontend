import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatUserShortResponse } from "../api";

function avatarSeedColor(seed: number) {
  const colors = [
    "linear-gradient(135deg, rgba(87,157,255,1) 0%, rgba(0,82,204,1) 100%)",
    "linear-gradient(135deg, rgba(34,197,94,1) 0%, rgba(16,185,129,1) 100%)",
    "linear-gradient(135deg, rgba(168,85,247,1) 0%, rgba(236,72,153,1) 100%)",
    "linear-gradient(135deg, rgba(249,115,22,1) 0%, rgba(245,158,11,1) 100%)",
    "linear-gradient(135deg, rgba(20,184,166,1) 0%, rgba(59,130,246,1) 100%)",
  ];
  return colors[Math.abs(seed) % colors.length];
}

function initials(name: string) {
  const t = (name || "").trim();
  if (!t) return "?";
  const parts = t.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "?";
  const b = parts.length > 1 ? parts[1]?.[0] : "";
  return (a + (b || "")).toUpperCase();
}

function userTitle(u: ChatUserShortResponse) {
  return u.display_name || u.username;
}

export default function ChatUserAddPicker({
  selected,
  onSelectedChange,
  excludeUserIds,
  searchUsers,
  minSearchLength = 2,
  placeholder = "Имя или логин…",
  hintTitle,
  selectedTitle = "Будут добавлены",
  primaryActionLabel,
  onPrimaryAction,
  primaryActionDisabled,
  primaryActionLoading,
  showPrimaryAction = false,
  onSelectAll,
  selectAllLoading = false,
  selectAllLabel = "Добавить всех",
  onClearSelected,
  clearSelectedLabel = "Очистить",
  className = "",
}: {
  selected: Map<number, ChatUserShortResponse>;
  onSelectedChange: (next: Map<number, ChatUserShortResponse>) => void;
  excludeUserIds?: Iterable<number>;
  searchUsers: (query: string) => Promise<ChatUserShortResponse[]>;
  minSearchLength?: number;
  placeholder?: string;
  hintTitle?: string;
  selectedTitle?: string;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void | Promise<void>;
  primaryActionDisabled?: boolean;
  primaryActionLoading?: boolean;
  showPrimaryAction?: boolean;
  onSelectAll?: () => void | Promise<void>;
  selectAllLoading?: boolean;
  selectAllLabel?: string;
  onClearSelected?: () => void;
  clearSelectedLabel?: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ChatUserShortResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchRef = useRef(0);

  const excluded = useMemo(() => new Set(excludeUserIds ?? []), [excludeUserIds]);

  const toggleUser = (u: ChatUserShortResponse) => {
    const next = new Map(selected);
    if (next.has(u.id)) next.delete(u.id);
    else next.set(u.id, u);
    onSelectedChange(next);
  };

  const removeUser = (id: number) => {
    const next = new Map(selected);
    next.delete(id);
    onSelectedChange(next);
  };

  useEffect(() => {
    const s = query.trim();
    if (s.length < minSearchLength) {
      setResults([]);
      setLoading(false);
      return;
    }
    const reqId = ++fetchRef.current;
    setLoading(true);
    const t = window.setTimeout(() => {
      void searchUsers(s)
        .then((list) => {
          if (fetchRef.current !== reqId) return;
          setResults(list.filter((u) => u.is_active !== false));
        })
        .catch(() => {
          if (fetchRef.current !== reqId) return;
          setResults([]);
        })
        .finally(() => {
          if (fetchRef.current !== reqId) return;
          setLoading(false);
        });
    }, 220);
    return () => window.clearTimeout(t);
  }, [query, minSearchLength, searchUsers]);

  const trimmed = query.trim();
  const statusText =
    trimmed.length < minSearchLength
      ? `Введите минимум ${minSearchLength} символа для поиска`
      : loading
        ? "Поиск…"
        : results.length > 0
          ? `Найдено: ${results.length}`
          : "Ничего не найдено";

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <div className="flex-shrink-0">
        {hintTitle ? (
          <p className="text-xs mb-2 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            {hintTitle}
          </p>
        ) : null}
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
            aria-hidden
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-2xl border p-3 pl-10 text-sm"
            style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border)" }}
            autoComplete="off"
          />
        </div>
        <div className="mt-2 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          {statusText}
        </div>
        {onSelectAll || onClearSelected ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {onSelectAll ? (
              <button
                type="button"
                className="px-3 py-1.5 rounded-xl text-xs font-semibold disabled:opacity-60"
                style={{
                  backgroundColor: "rgba(87,157,255,0.14)",
                  color: "var(--accent)",
                  border: "1px solid rgba(87,157,255,0.35)",
                }}
                disabled={selectAllLoading}
                onClick={() => void onSelectAll()}
              >
                {selectAllLoading ? "Загрузка…" : selectAllLabel}
              </button>
            ) : null}
            {onClearSelected && selected.size > 0 ? (
              <button
                type="button"
                className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                }}
                onClick={onClearSelected}
              >
                {clearSelectedLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        className={`mt-3 flex-1 min-h-[10rem] sm:min-h-[14rem] flex flex-col gap-3 min-h-0 ${
          selected.size > 0 ? "sm:flex-row sm:items-stretch" : ""
        }`}
      >
        {selected.size > 0 && (
          <div
            className="flex flex-col min-h-0 flex-shrink-0 max-h-44 sm:max-h-none sm:flex-1 sm:min-w-[min(100%,280px)] sm:max-w-[46%] sm:border-r sm:pr-3"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="text-xs font-semibold mb-2 shrink-0" style={{ color: "var(--text-secondary)" }}>
              {selectedTitle} ({selected.size})
            </div>
            <div
              className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2"
              data-allow-scroll
              style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", overscrollBehavior: "contain" }}
            >
              {Array.from(selected.values()).map((u) => (
                <div
                  key={`pending-${u.id}`}
                  className="flex items-center gap-2 rounded-2xl px-3 py-2 shrink-0"
                  style={{ backgroundColor: "rgba(87,157,255,0.1)", border: "1px solid rgba(87,157,255,0.22)" }}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ background: avatarSeedColor(u.id) }}
                    aria-hidden
                  >
                    {initials(userTitle(u))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{userTitle(u)}</div>
                    <div className="text-[11px] truncate" style={{ color: "var(--text-tertiary)" }}>
                      @{u.username}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="px-2.5 py-1 rounded-xl text-[11px] font-semibold shrink-0"
                    style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                    onClick={() => removeUser(u.id)}
                  >
                    Убрать
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col gap-2"
          data-allow-scroll
          style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", overscrollBehavior: "contain" }}
        >
        {trimmed.length >= minSearchLength &&
          results.map((u) => {
            const title = userTitle(u);
            const inGroup = excluded.has(u.id);
            const picked = selected.has(u.id);
            const disabled = inGroup;

            return (
              <div
                key={u.id}
                className="flex items-center gap-3 rounded-2xl p-3"
                style={{
                  backgroundColor: picked ? "rgba(87,157,255,0.08)" : "var(--bg-secondary)",
                  border: picked ? "1px solid rgba(87,157,255,0.22)" : "1px solid var(--border)",
                  opacity: disabled ? 0.55 : 1,
                }}
              >
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
                    @{u.username}
                    {inGroup ? " · уже в группе" : ""}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  className="px-3 py-2 rounded-xl text-xs font-semibold shrink-0 disabled:opacity-50"
                  style={{
                    backgroundColor: picked ? "var(--bg-secondary)" : "rgba(87,157,255,0.14)",
                    color: picked ? "var(--text-secondary)" : "var(--accent)",
                    border: `1px solid ${picked ? "var(--border)" : "rgba(87,157,255,0.35)"}`,
                  }}
                  onClick={() => {
                    if (disabled) return;
                    toggleUser(u);
                  }}
                >
                  {inGroup ? "В группе" : picked ? "Убрать" : "В список"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {showPrimaryAction && primaryActionLabel ? (
        <div className="pt-3 flex-shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
          <button
            type="button"
            className="w-full px-4 py-3 rounded-2xl text-sm font-semibold disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.18)",
            }}
            disabled={primaryActionDisabled || primaryActionLoading || selected.size === 0}
            onClick={() => void onPrimaryAction?.()}
          >
            {primaryActionLoading ? "Подождите…" : primaryActionLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
