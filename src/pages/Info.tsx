import { useEffect, useMemo, useRef, useState } from "react";
import { api, type ChatUserShortResponse } from "../api";
import { useAuth } from "../contexts/AuthContext";

const LS_KEY = "crm-info-page-text-v1";

type MentionHit = ChatUserShortResponse;

function findMentionQuery(value: string, caret: number): { at: number; query: string } | null {
  const left = Math.max(0, Math.min(caret, value.length));
  // Find nearest '@' before caret
  const at = value.lastIndexOf("@", left - 1);
  if (at < 0) return null;
  // Must be start or whitespace before '@'
  const prev = at === 0 ? "" : value[at - 1];
  if (prev && !/\s/.test(prev)) return null;
  const q = value.slice(at + 1, left);
  if (q.length > 40) return null;
  // Query must be "wordish" (no spaces/newlines)
  for (const ch of q) {
    if (ch === "\n" || ch === "\r" || ch === "\t" || ch === " ") return null;
  }
  return { at, query: q };
}

function renderInfoWithMentions(
  raw: string,
  onOpenUser: (userId: number, username?: string) => void,
): React.ReactNode {
  const text = (raw ?? "").toString();
  if (!text.trim()) return "—";

  // Stored mention format: @[Display Name](user:123)
  const re = /@\[(.*?)\]\(user:(\d+)\)/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const idx = m.index;
    if (idx > last) out.push(text.slice(last, idx));
    const label = (m[1] || "").trim() || "пользователь";
    const uid = Number(m[2] || "0");
    if (Number.isFinite(uid) && uid > 0) {
      out.push(
        <button
          key={`m-${idx}-${uid}`}
          type="button"
          onClick={() => onOpenUser(uid, label)}
          className="underline font-medium"
          style={{ color: "var(--accent)" }}
          title={`Открыть чат с ${label}`}
        >
          @{label}
        </button>,
      );
    } else {
      out.push(m[0]);
    }
    last = idx + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <span className="whitespace-pre-wrap break-words">{out}</span>;
}

export default function Info() {
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || Boolean(user?.is_admin);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [savedText, setSavedText] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionHits, setMentionHits] = useState<MentionHit[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionActiveIdx, setMentionActiveIdx] = useState(0);
  const mentionTimerRef = useRef<number | null>(null);

  const title = useMemo(() => "Информация", []);

  const openChatWithUser = (userId: number, username?: string) => {
    window.dispatchEvent(
      new CustomEvent("chatwidget:open", {
        detail: {
          kind: "private" as const,
          userId,
          username: username?.trim() || undefined,
        },
      }),
    );
  };

  const scheduleMentionSearch = (q: string) => {
    if (mentionTimerRef.current != null) window.clearTimeout(mentionTimerRef.current);
    mentionTimerRef.current = window.setTimeout(async () => {
      const needle = q.trim();
      if (!needle && needle !== "") return;
      setMentionLoading(true);
      try {
        const list = await api.chat.users(needle, 30);
        setMentionHits(list);
        setMentionActiveIdx(0);
      } catch {
        setMentionHits([]);
      } finally {
        setMentionLoading(false);
      }
    }, 160);
  };

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");
    api.settings
      .getInfoPage()
      .then((res) => {
        if (!mounted) return;
        const loaded = (res.text ?? "").toString();
        setText(loaded);
        setSavedText(loaded);
        setSavedAt(res.updated_at ?? null);
        try {
          localStorage.setItem(LS_KEY, (res.text ?? "").toString());
        } catch {
          // ignore
        }
      })
      .catch(() => {
        if (!mounted) return;
        // fallback: last cached local value
        try {
          const cached = localStorage.getItem(LS_KEY);
          if (cached != null) {
            setText(cached);
            setSavedText(cached);
          }
        } catch {
          // ignore
        }
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (mentionTimerRef.current != null) window.clearTimeout(mentionTimerRef.current);
    };
  }, []);

  const save = async () => {
    if (!canEdit) return;
    setSaving(true);
    setError("");
    try {
      const res = await api.settings.updateInfoPage({ text: text.trim() ? text : "" });
      const next = (res.text ?? "").toString();
      setText(next);
      setSavedText(next);
      setSavedAt(res.updated_at ?? new Date().toISOString());
      setIsEditing(false);
      try {
        localStorage.setItem(LS_KEY, next);
      } catch {
        // ignore
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ color: "var(--text-secondary)" }}>Загрузка…</div>;
  }

  return (
    <div className="max-w-4xl animate-slide-in space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            {title}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            {savedAt ? `Обновлено: ${new Date(savedAt).toLocaleString("ru-RU")}` : " "}
          </p>
        </div>
        {canEdit && !isEditing ? (
          <button
            type="button"
            onClick={() => {
              setError("");
              setText(savedText);
              setIsEditing(true);
            }}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white shrink-0"
            style={{ background: "var(--accent)" }}
          >
            Изменить
          </button>
        ) : null}
      </div>

      {error ? (
        <div
          className="p-4 rounded-xl text-sm"
          style={{ backgroundColor: "var(--error-light)", color: "var(--error)", border: "1px solid var(--error)" }}
        >
          {error}
        </div>
      ) : null}

      {canEdit && isEditing ? (
        <div className="rounded-2xl border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
          <label className="block text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            Редактирование
          </label>
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => {
                const v = e.target.value;
                setText(v);
                const caret = e.target.selectionStart ?? v.length;
                const mq = findMentionQuery(v, caret);
                if (!mq) {
                  setMentionOpen(false);
                  return;
                }
                setMentionOpen(true);
                setMentionQuery(mq.query);
                scheduleMentionSearch(mq.query);
              }}
              onKeyDown={(e) => {
                if (!mentionOpen) return;
                if (e.key === "Escape") {
                  e.preventDefault();
                  setMentionOpen(false);
                  return;
                }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMentionActiveIdx((i) => Math.min(i + 1, Math.max(0, mentionHits.length - 1)));
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionActiveIdx((i) => Math.max(0, i - 1));
                  return;
                }
                if (e.key === "Enter") {
                  if (mentionHits.length === 0) return;
                  e.preventDefault();
                  const hit = mentionHits[Math.max(0, Math.min(mentionActiveIdx, mentionHits.length - 1))];
                  if (!hit) return;
                  const el = textareaRef.current;
                  if (!el) return;
                  const caret = el.selectionStart ?? text.length;
                  const mq = findMentionQuery(el.value, caret);
                  if (!mq) return;
                  const token = `@[${hit.display_name || hit.username}](user:${hit.id}) `;
                  const replaced = el.value.slice(0, mq.at) + token + el.value.slice(caret);
                  setText(replaced);
                  setMentionOpen(false);
                  requestAnimationFrame(() => {
                    try {
                      el.focus();
                      const pos = mq.at + token.length;
                      el.setSelectionRange(pos, pos);
                    } catch {
                      // ignore
                    }
                  });
                }
              }}
              rows={14}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
              placeholder="Введите текст для вкладки «Информация»… (упоминание: @ + имя)"
            />

            {mentionOpen ? (
              <div
                className="absolute left-0 right-0 mt-2 rounded-xl border overflow-hidden"
                style={{ background: "var(--bg-primary)", borderColor: "var(--border)", boxShadow: "0 18px 50px rgba(0,0,0,0.10)" }}
              >
                <div className="px-3 py-2 text-xs" style={{ color: "var(--text-tertiary)", background: "var(--bg-secondary)" }}>
                  @{mentionQuery || ""} {mentionLoading ? "— поиск…" : ""}
                </div>
                <div className="max-h-[240px] overflow-auto">
                  {mentionHits.length === 0 && !mentionLoading ? (
                    <div className="px-3 py-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                      Нет пользователей
                    </div>
                  ) : (
                    mentionHits.map((u, idx) => (
                      <button
                        key={u.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm"
                        style={{
                          background: idx === mentionActiveIdx ? "rgba(87,157,255,0.14)" : "transparent",
                          color: "var(--text-primary)",
                        }}
                        onMouseEnter={() => setMentionActiveIdx(idx)}
                        onMouseDown={(e) => {
                          // prevent textarea blur
                          e.preventDefault();
                        }}
                        onClick={() => {
                          const el = textareaRef.current;
                          if (!el) return;
                          const caret = el.selectionStart ?? el.value.length;
                          const mq = findMentionQuery(el.value, caret);
                          if (!mq) return;
                          const token = `@[${u.display_name || u.username}](user:${u.id}) `;
                          const next = el.value.slice(0, mq.at) + token + el.value.slice(caret);
                          setText(next);
                          setMentionOpen(false);
                          requestAnimationFrame(() => {
                            try {
                              el.focus();
                              const pos = mq.at + token.length;
                              el.setSelectionRange(pos, pos);
                            } catch {
                              // ignore
                            }
                          });
                        }}
                      >
                        <div className="font-medium">{u.display_name || u.username}</div>
                        <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                          @{u.username}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setText(savedText);
                setError("");
                setMentionOpen(false);
                setIsEditing(false);
              }}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {saving ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
          <div className="whitespace-pre-wrap break-words text-sm" style={{ color: "var(--text-primary)" }}>
            {renderInfoWithMentions(savedText, openChatWithUser)}
          </div>
        </div>
      )}
    </div>
  );
}

