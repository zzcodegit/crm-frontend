import { useCallback, useEffect, useState } from "react";
import {
  api,
  CHAT_USERS_QUERY_LIMIT,
  type ChatBirthdayReminderRuleInput,
  type ChatUserShortResponse,
} from "../api";
import { BIRTHDAY_DAYS_BEFORE_OPTIONS as DAYS_BEFORE_OPTIONS } from "../utils/birthdayReminderOptions";

export type BirthdayReminderRuleDraft = ChatBirthdayReminderRuleInput & {
  _key: string;
  recipientUsers: ChatUserShortResponse[];
};

function newRuleDraft(): BirthdayReminderRuleDraft {
  return {
    _key: `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    enabled: true,
    days_before: 0,
    notify_time: "09:00",
    recipient_user_ids: [],
    recipientUsers: [],
  };
}

const inputStyle: React.CSSProperties = {
  backgroundColor: "var(--bg-primary)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
  borderRadius: "12px",
  padding: "10px 14px",
  width: "100%",
};

type Props = {
  userId: number;
  birthDate: string;
  onRulesChange: (rules: ChatBirthdayReminderRuleInput[]) => void;
};

export default function UserBirthdayChatReminders({ userId, birthDate, onRulesChange }: Props) {
  const [rules, setRules] = useState<BirthdayReminderRuleDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pickerRuleKey, setPickerRuleKey] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<ChatUserShortResponse[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);

  const syncParent = useCallback(
    (next: BirthdayReminderRuleDraft[]) => {
      onRulesChange(
        next.map((r) => ({
          enabled: r.enabled,
          days_before: r.days_before,
          notify_time: r.notify_time,
          recipient_user_ids: r.recipient_user_ids,
        })),
      );
    },
    [onRulesChange],
  );

  const updateRules = useCallback(
    (fn: (prev: BirthdayReminderRuleDraft[]) => BirthdayReminderRuleDraft[]) => {
      setRules((prev) => {
        const next = fn(prev);
        syncParent(next);
        return next;
      });
    },
    [syncParent],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    api
      .getBirthdayChatReminders(userId)
      .then((data) => {
        if (cancelled) return;
        const mapped: BirthdayReminderRuleDraft[] = data.rules.map((r) => ({
          _key: `r-${r.id}`,
          enabled: r.enabled,
          days_before: r.days_before,
          notify_time: r.notify_time,
          recipient_user_ids: r.recipient_users.map((u) => u.id),
          recipientUsers: r.recipient_users,
        }));
        setRules(mapped);
        syncParent(mapped);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Не удалось загрузить настройки");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, syncParent]);

  useEffect(() => {
    const q = userQuery.trim();
    if (q.length < 2) {
      setUserResults([]);
      return;
    }
    let cancelled = false;
    setUserSearchLoading(true);
    const t = window.setTimeout(() => {
      api.chat
        .users(q, CHAT_USERS_QUERY_LIMIT)
        .then((list) => {
          if (!cancelled) {
            setUserResults(list.filter((u) => u.id !== userId && u.is_active !== false));
          }
        })
        .catch(() => {
          if (!cancelled) setUserResults([]);
        })
        .finally(() => {
          if (!cancelled) setUserSearchLoading(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [userQuery, userId]);

  const addRecipientToRule = (ruleKey: string, u: ChatUserShortResponse) => {
    updateRules((prev) =>
      prev.map((r) => {
        if (r._key !== ruleKey) return r;
        if (r.recipient_user_ids.includes(u.id)) return r;
        return {
          ...r,
          recipient_user_ids: [...r.recipient_user_ids, u.id],
          recipientUsers: [...r.recipientUsers, u],
        };
      }),
    );
    setUserQuery("");
    setUserResults([]);
  };

  if (loading) {
    return <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Загрузка настроек чата…</p>;
  }

  return (
    <div className="space-y-4">
      {loadError ? (
        <p className="text-sm" style={{ color: "var(--error)" }}>{loadError}</p>
      ) : null}

      {!birthDate ? (
        <p className="text-sm rounded-xl p-3" style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
          Укажите дату рождения в блоке «Данные» выше — без неё напоминания не отправляются.
        </p>
      ) : (
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          В указанное время (Москва) получатели получат личное сообщение в чате от «CRM Уведомления».
        </p>
      )}

      {rules.map((rule, index) => (
        <div
          key={rule._key}
          className="rounded-xl p-4 space-y-3"
          style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Правило {index + 1}
            </span>
            <button
              type="button"
              className="text-xs font-semibold px-2 py-1 rounded-lg"
              style={{ color: "var(--error)" }}
              onClick={() => updateRules((prev) => prev.filter((x) => x._key !== rule._key))}
            >
              Удалить
            </button>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={rule.enabled}
              onChange={(e) =>
                updateRules((prev) =>
                  prev.map((r) => (r._key === rule._key ? { ...r, enabled: e.target.checked } : r)),
                )
              }
              style={{ accentColor: "var(--accent)" }}
            />
            <span className="text-sm" style={{ color: "var(--text-primary)" }}>Включено</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                Когда напоминать
              </label>
              <select
                value={rule.days_before}
                onChange={(e) =>
                  updateRules((prev) =>
                    prev.map((r) =>
                      r._key === rule._key ? { ...r, days_before: Number(e.target.value) } : r,
                    ),
                  )
                }
                className="w-full rounded-xl border text-sm"
                style={inputStyle}
              >
                {DAYS_BEFORE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                Время отправки (МСК)
              </label>
              <input
                type="time"
                value={rule.notify_time}
                onChange={(e) =>
                  updateRules((prev) =>
                    prev.map((r) => (r._key === rule._key ? { ...r, notify_time: e.target.value } : r)),
                  )
                }
                className="w-full rounded-xl border text-sm"
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Кому отправить в чат
            </label>
            {rule.recipientUsers.length > 0 ? (
              <div className="flex flex-wrap gap-2 mb-2">
                {rule.recipientUsers.map((u) => (
                  <span
                    key={u.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium"
                    style={{ backgroundColor: "var(--accent-light)", color: "var(--text-primary)" }}
                  >
                    {u.display_name || u.username}
                    <button
                      type="button"
                      className="opacity-70 hover:opacity-100"
                      aria-label="Убрать"
                      onClick={() =>
                        updateRules((prev) =>
                          prev.map((r) => {
                            if (r._key !== rule._key) return r;
                            return {
                              ...r,
                              recipient_user_ids: r.recipient_user_ids.filter((id) => id !== u.id),
                              recipientUsers: r.recipientUsers.filter((x) => x.id !== u.id),
                            };
                          }),
                        )
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>
                Получатели не выбраны
              </p>
            )}
            {pickerRuleKey === rule._key ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  placeholder="Поиск по имени или логину…"
                  className="w-full rounded-xl border text-sm"
                  style={inputStyle}
                  autoComplete="off"
                />
                <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  {userQuery.trim().length < 2
                    ? "Минимум 2 символа"
                    : userSearchLoading
                      ? "Поиск…"
                      : userResults.length
                        ? `Найдено: ${userResults.length}`
                        : "Ничего не найдено"}
                </div>
                <div className="max-h-40 overflow-y-auto flex flex-col gap-1">
                  {userResults.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="w-full text-left px-3 py-2 rounded-lg text-sm"
                      style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)" }}
                      onClick={() => addRecipientToRule(rule._key, u)}
                    >
                      {u.display_name} <span style={{ color: "var(--text-tertiary)" }}>@{u.username}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="text-xs font-medium"
                  style={{ color: "var(--text-secondary)" }}
                  onClick={() => {
                    setPickerRuleKey(null);
                    setUserQuery("");
                    setUserResults([]);
                  }}
                >
                  Скрыть поиск
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="text-sm font-semibold px-3 py-2 rounded-xl"
                style={{ backgroundColor: "var(--bg-primary)", color: "var(--accent)", border: "1px solid var(--border)" }}
                onClick={() => setPickerRuleKey(rule._key)}
              >
                + Добавить получателя
              </button>
            )}
          </div>
        </div>
      ))}

      <button
        type="button"
        className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold"
        style={{ backgroundColor: "var(--bg-secondary)", color: "var(--accent)", border: "1px solid var(--border)" }}
        onClick={() => updateRules((prev) => [...prev, newRuleDraft()])}
      >
        + Добавить правило напоминания
      </button>
    </div>
  );
}
