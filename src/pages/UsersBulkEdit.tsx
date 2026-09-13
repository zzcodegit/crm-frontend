import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ChatBirthdayReminderRuleInput, type GroupItem, type UserItem } from "../api";
import {
  birthDateMonthLabel,
  birthDateToApi,
  daysInBirthMonth,
  parseBirthDateFromApi,
} from "../utils/birthDate";
import { BIRTHDAY_DAYS_BEFORE_OPTIONS } from "../utils/birthdayReminderOptions";

type UserRowDraft = {
  id: number;
  username: string;
  last_name: string;
  first_name: string;
  patronymic: string;
  phone: string;
  telegram_id: string;
  birthMonth: number | "";
  birthDay: number | "";
  schedule_color: string;
  is_active: boolean;
  group_ids: number[];
};

function rowFromUser(u: UserItem): UserRowDraft {
  const bd = parseBirthDateFromApi(u.birth_date);
  return {
    id: u.id,
    username: u.username,
    last_name: u.last_name ?? "",
    first_name: u.first_name ?? "",
    patronymic: u.patronymic ?? "",
    phone: u.phone ?? "",
    telegram_id: u.telegram_id ?? "",
    birthMonth: bd?.month ?? "",
    birthDay: bd?.day ?? "",
    schedule_color: u.schedule_color ?? "",
    is_active: u.is_active,
    group_ids: [...(u.group_ids ?? [])],
  };
}

function rowSignature(r: UserRowDraft): string {
  const iso = r.birthMonth !== "" && r.birthDay !== "" ? birthDateToApi(Number(r.birthMonth), Number(r.birthDay)) ?? "" : "";
  return JSON.stringify({
    username: r.username.trim(),
    last_name: r.last_name.trim(),
    first_name: r.first_name.trim(),
    patronymic: r.patronymic.trim(),
    phone: r.phone.trim(),
    telegram_id: r.telegram_id.trim(),
    birth: iso,
    schedule_color: r.schedule_color.trim(),
    is_active: r.is_active,
    group_ids: [...r.group_ids].sort((a, b) => a - b),
  });
}

const cellInputClass =
  "w-full min-w-[88px] px-2 py-1.5 rounded-lg border text-sm outline-none focus:border-[var(--accent)]";
const cellInputStyle: React.CSSProperties = {
  backgroundColor: "var(--bg-primary)",
  borderColor: "var(--border)",
  color: "var(--text-primary)",
};

export default function UsersBulkEdit() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<UserItem[]>([]);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [rows, setRows] = useState<UserRowDraft[]>([]);
  const [initialSig, setInitialSig] = useState<Map<number, string>>(new Map());
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [bulkField, setBulkField] = useState<
    | "username"
    | "last_name"
    | "first_name"
    | "patronymic"
    | "phone"
    | "telegram_id"
    | "schedule_color"
    | "is_active"
    | "birth_clear"
  >("last_name");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkGroupId, setBulkGroupId] = useState<number | "">("");
  const [bulkGroupMode, setBulkGroupMode] = useState<"add" | "remove">("add");

  const [groupsModalUserId, setGroupsModalUserId] = useState<number | null>(null);

  const [bulkBirthdayDays, setBulkBirthdayDays] = useState<Set<number>>(() => new Set([0]));
  const [bulkBirthdayEnabled, setBulkBirthdayEnabled] = useState(true);
  const [bulkBirthdayTime, setBulkBirthdayTime] = useState("09:00");
  const [bulkBirthdayRecipients, setBulkBirthdayRecipients] = useState<Set<number>>(() => new Set());
  const [bulkBirthdayMode, setBulkBirthdayMode] = useState<"replace" | "append">("replace");
  const [bulkBirthdayRecipientSearch, setBulkBirthdayRecipientSearch] = useState("");
  const [bulkBirthdayApplying, setBulkBirthdayApplying] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([api.getUsers(), api.getGroups()])
      .then(([u, g]) => {
        setUsers(u);
        setGroups(g);
        const drafts = u.map(rowFromUser);
        setRows(drafts);
        setInitialSig(new Map(drafts.map((r) => [r.id, rowSignature(r)])));
        setSelected(new Set());
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [r.username, r.last_name, r.first_name, r.patronymic, r.phone, r.telegram_id]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const dirtyRows = useMemo(
    () => rows.filter((r) => initialSig.get(r.id) !== rowSignature(r)),
    [rows, initialSig],
  );

  const patchRow = (id: number, patch: Partial<UserRowDraft>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    const ids = filteredRows.map((r) => r.id);
    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const applyBulkField = () => {
    if (selected.size === 0) return;
    if (bulkField === "username" && !bulkValue.trim()) {
      setError("Укажите логин для массовой подстановки");
      return;
    }
    setRows((prev) =>
      prev.map((r) => {
        if (!selected.has(r.id)) return r;
        if (bulkField === "is_active") {
          const v = bulkValue === "false" ? false : true;
          return { ...r, is_active: v };
        }
        if (bulkField === "birth_clear") {
          return { ...r, birthMonth: "", birthDay: "" };
        }
        return { ...r, [bulkField]: bulkValue };
      }),
    );
  };

  const applyBulkGroups = () => {
    if (selected.size === 0 || bulkGroupId === "") return;
    const gid = Number(bulkGroupId);
    setRows((prev) =>
      prev.map((r) => {
        if (!selected.has(r.id)) return r;
        const set = new Set(r.group_ids);
        if (bulkGroupMode === "add") set.add(gid);
        else set.delete(gid);
        return { ...r, group_ids: [...set] };
      }),
    );
  };

  const rowHasBirthDate = useCallback(
    (r: UserRowDraft) => {
      if (r.birthMonth !== "" && r.birthDay !== "") return true;
      const u = users.find((x) => x.id === r.id);
      return Boolean(u?.birth_date && String(u.birth_date).trim());
    },
    [users],
  );

  const recipientPickerUsers = useMemo(() => {
    const q = bulkBirthdayRecipientSearch.trim().toLowerCase();
    let list = users.filter((u) => u.is_active !== false);
    if (q) {
      list = list.filter((u) => {
        const hay = [u.username, u.first_name, u.last_name, u.patronymic].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });
    }
    return list.sort((a, b) => (a.username || "").localeCompare(b.username || "", "ru"));
  }, [users, bulkBirthdayRecipientSearch]);

  const toggleBirthdayDay = (day: number) => {
    setBulkBirthdayDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const toggleBirthdayRecipient = (userId: number) => {
    setBulkBirthdayRecipients((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const buildBirthdayRulesForSubject = (subjectUserId: number): ChatBirthdayReminderRuleInput[] => {
    const recipientIds = [...bulkBirthdayRecipients].filter((id) => id !== subjectUserId);
    return [...bulkBirthdayDays]
      .sort((a, b) => a - b)
      .map((days_before) => ({
        enabled: bulkBirthdayEnabled,
        days_before,
        notify_time: bulkBirthdayTime,
        recipient_user_ids: recipientIds,
      }));
  };

  const applyBulkBirthdayReminders = async () => {
    if (selected.size === 0) return;
    if (bulkBirthdayDays.size === 0) {
      setError("Выберите хотя бы один вариант «когда напоминать»");
      return;
    }
    if (bulkBirthdayRecipients.size === 0) {
      setError("Выберите хотя бы одного получателя напоминания в чате");
      return;
    }

    const selectedRows = rows.filter((r) => selected.has(r.id));
    const withBirth = selectedRows.filter((r) => rowHasBirthDate(r));
    const withoutBirth = selectedRows.length - withBirth.length;

    if (withBirth.length === 0) {
      setError("У выбранных пользователей нет дня рождения — укажите его в таблице и сохраните.");
      return;
    }

    if (
      !window.confirm(
        `Применить напоминания о дне рождения к ${withBirth.length} пользователю(ям)?` +
          (withoutBirth > 0 ? `\n\nПропущено без дня рождения: ${withoutBirth}` : ""),
      )
    ) {
      return;
    }

    setBulkBirthdayApplying(true);
    setError("");
    setSuccess("");

    let ok = 0;
    const failures: string[] = [];
    const skippedNoBirth: string[] = [];

    for (const r of selectedRows) {
      if (!rowHasBirthDate(r)) {
        skippedNoBirth.push(r.username);
        continue;
      }
      try {
        const templateRules = buildBirthdayRulesForSubject(r.id);
        if (templateRules.some((rule) => rule.recipient_user_ids.length === 0)) {
          failures.push(`${r.username}: нет получателей (кроме самого сотрудника)`);
          continue;
        }
        if (bulkBirthdayMode === "append") {
          const existing = await api.getBirthdayChatReminders(r.id);
          const existingRules: ChatBirthdayReminderRuleInput[] = existing.rules.map((rule) => ({
            enabled: rule.enabled,
            days_before: rule.days_before,
            notify_time: rule.notify_time,
            recipient_user_ids: rule.recipient_users.map((u) => u.id),
          }));
          const byDay = new Map(existingRules.map((rule) => [rule.days_before, rule]));
          for (const rule of templateRules) {
            byDay.set(rule.days_before, rule);
          }
          await api.putBirthdayChatReminders(r.id, [...byDay.values()].sort((a, b) => a.days_before - b.days_before));
        } else {
          await api.putBirthdayChatReminders(r.id, templateRules);
        }
        ok += 1;
      } catch (e) {
        failures.push(`${r.username}: ${e instanceof Error ? e.message : "ошибка"}`);
      }
    }

    const parts: string[] = [`Напоминания применены: ${ok}`];
    if (skippedNoBirth.length) parts.push(`без дня рождения: ${skippedNoBirth.length}`);
    if (failures.length) {
      setError(
        `${parts.join(", ")}. Ошибки:\n${failures.slice(0, 8).join("\n")}${failures.length > 8 ? "\n…" : ""}`,
      );
    } else {
      setSuccess(parts.join(", "));
    }
    setBulkBirthdayApplying(false);
  };

  const saveOne = async (r: UserRowDraft, orig: UserItem) => {
    const birthIso =
      r.birthMonth !== "" && r.birthDay !== "" ? birthDateToApi(Number(r.birthMonth), Number(r.birthDay)) : null;
    const login = r.username.trim();
    if (!login) {
      throw new Error("Логин не может быть пустым");
    }
    await api.updateUser(r.id, {
      username: login !== orig.username ? login : undefined,
      last_name: r.last_name.trim() || undefined,
      first_name: r.first_name.trim() || undefined,
      patronymic: r.patronymic.trim() || undefined,
      phone: r.phone.trim() || undefined,
      telegram_id: r.telegram_id.trim() || undefined,
      birth_date: birthIso,
      schedule_color: r.schedule_color.trim() ? r.schedule_color.trim() : null,
      is_active: r.is_active,
    });
    const prev = new Set(orig.group_ids ?? []);
    const next = new Set(r.group_ids);
    const add = [...next].filter((gid) => !prev.has(gid));
    const remove = [...prev].filter((gid) => !next.has(gid));
    await Promise.all([
      ...add.map((gid) => api.addGroupMember(gid, r.id)),
      ...remove.map((gid) => api.removeGroupMember(gid, r.id)),
    ]);
  };

  const handleSave = async () => {
    if (dirtyRows.length === 0) return;
    const loginCounts = new Map<string, number[]>();
    for (const r of rows) {
      const login = r.username.trim().toLowerCase();
      if (!login) {
        setError("Логин не может быть пустым");
        return;
      }
      const ids = loginCounts.get(login) ?? [];
      ids.push(r.id);
      loginCounts.set(login, ids);
    }
    const dupes = [...loginCounts.entries()].filter(([, ids]) => ids.length > 1);
    if (dupes.length) {
      const names = dupes.map(([login]) => login).slice(0, 5).join(", ");
      setError(`Повторяющиеся логины в таблице: ${names}${dupes.length > 5 ? "…" : ""}`);
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    const byId = new Map(users.map((u) => [u.id, u]));
    let ok = 0;
    const failures: string[] = [];
    for (const r of dirtyRows) {
      const orig = byId.get(r.id);
      if (!orig) continue;
      try {
        await saveOne(r, orig);
        ok += 1;
      } catch (e) {
        failures.push(`${r.username}: ${e instanceof Error ? e.message : "ошибка"}`);
      }
    }
    if (failures.length) {
      setError(`Сохранено ${ok} из ${dirtyRows.length}. Ошибки:\n${failures.slice(0, 8).join("\n")}${failures.length > 8 ? "\n…" : ""}`);
    } else {
      setSuccess(`Сохранено пользователей: ${ok}`);
    }
    load();
    setSaving(false);
  };

  const groupsModalRow = groupsModalUserId != null ? rows.find((r) => r.id === groupsModalUserId) : null;

  if (loading) {
    return (
      <div className="py-12 text-sm" style={{ color: "var(--text-secondary)" }}>
        Загрузка…
      </div>
    );
  }

  return (
    <div className="max-w-[100%] animate-slide-in space-y-5 pb-10">
      <div>
        <Link to="/settings" className="text-sm hover:underline" style={{ color: "var(--text-secondary)" }}>
          ← Настройки
        </Link>
        <div className="flex flex-wrap items-center gap-2 mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          <Link to="/settings/users" className="hover:underline">
            Пользователи
          </Link>
          <span>/</span>
          <span style={{ color: "var(--text-primary)" }}>Массовое редактирование</span>
        </div>
        <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--text-primary)" }}>
          Массовое редактирование пользователей
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Изменяйте данные в таблице (включая колонку «Логин») и нажмите «Сохранить изменения». Сохраняются только
          изменённые строки. Логины должны быть уникальными.
        </p>
      </div>

      {error ? (
        <div className="p-4 rounded-xl text-sm whitespace-pre-wrap" style={{ background: "var(--error-light)", color: "var(--error)", border: "1px solid var(--error)" }}>
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="p-4 rounded-xl text-sm" style={{ background: "rgba(0,135,90,0.1)", color: "var(--success)", border: "1px solid var(--border)" }}>
          {success}
        </div>
      ) : null}

      <div
        className="rounded-2xl p-4 space-y-3"
        style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
      >
        <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Массовые действия для выбранных ({selected.size})
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Поле
            <select
              value={bulkField}
              onChange={(e) => setBulkField(e.target.value as typeof bulkField)}
              className={`${cellInputClass} mt-1 min-w-[140px]`}
              style={cellInputStyle}
            >
              <option value="username">Логин</option>
              <option value="last_name">Фамилия</option>
              <option value="first_name">Имя</option>
              <option value="patronymic">Отчество</option>
              <option value="phone">Телефон</option>
              <option value="telegram_id">Telegram ID</option>
              <option value="schedule_color">Цвет (расписание)</option>
              <option value="is_active">Активен</option>
              <option value="birth_clear">Очистить день рождения</option>
            </select>
          </label>
          {bulkField === "is_active" ? (
            <select
              value={bulkValue || "true"}
              onChange={(e) => setBulkValue(e.target.value)}
              className={cellInputClass}
              style={cellInputStyle}
            >
              <option value="true">Да</option>
              <option value="false">Нет (заблокировать)</option>
            </select>
          ) : bulkField !== "birth_clear" ? (
            <input
              type="text"
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
              placeholder="Значение"
              className={cellInputClass}
              style={cellInputStyle}
            />
          ) : null}
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={applyBulkField}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            Применить к выбранным
          </button>
        </div>
        <div className="flex flex-wrap gap-2 items-end pt-1 border-t" style={{ borderColor: "var(--border)" }}>
          <select
            value={bulkGroupMode}
            onChange={(e) => setBulkGroupMode(e.target.value as "add" | "remove")}
            className={cellInputClass}
            style={cellInputStyle}
          >
            <option value="add">Добавить в группу</option>
            <option value="remove">Убрать из группы</option>
          </select>
          <select
            value={bulkGroupId === "" ? "" : String(bulkGroupId)}
            onChange={(e) => setBulkGroupId(e.target.value === "" ? "" : Number(e.target.value))}
            className={`${cellInputClass} min-w-[180px]`}
            style={cellInputStyle}
          >
            <option value="">Группа…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={selected.size === 0 || bulkGroupId === ""}
            onClick={applyBulkGroups}
            className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          >
            Применить к группам
          </button>
        </div>

        <div className="pt-3 border-t space-y-3" style={{ borderColor: "var(--border)" }}>
          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Напоминания о дне рождения в чате
          </div>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Отметьте галочками, когда напоминать и кому писать в чат. Применяется к выбранным пользователям с указанным днём рождения.
          </p>

          <div>
            <div className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              Когда напоминать
            </div>
            <div className="flex flex-wrap gap-3">
              {BIRTHDAY_DAYS_BEFORE_OPTIONS.map((o) => (
                <label key={o.value} className="inline-flex items-center gap-2 cursor-pointer text-sm" style={{ color: "var(--text-primary)" }}>
                  <input
                    type="checkbox"
                    checked={bulkBirthdayDays.has(o.value)}
                    onChange={() => toggleBirthdayDay(o.value)}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 items-end">
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm" style={{ color: "var(--text-primary)" }}>
              <input
                type="checkbox"
                checked={bulkBirthdayEnabled}
                onChange={(e) => setBulkBirthdayEnabled(e.target.checked)}
                style={{ accentColor: "var(--accent)" }}
              />
              Правила включены
            </label>
            <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Время (МСК)
              <input
                type="time"
                value={bulkBirthdayTime}
                onChange={(e) => setBulkBirthdayTime(e.target.value)}
                className={`${cellInputClass} mt-1 block`}
                style={cellInputStyle}
              />
            </label>
            <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Режим
              <select
                value={bulkBirthdayMode}
                onChange={(e) => setBulkBirthdayMode(e.target.value as "replace" | "append")}
                className={`${cellInputClass} mt-1 min-w-[200px]`}
                style={cellInputStyle}
              >
                <option value="replace">Заменить все правила</option>
                <option value="append">Добавить / обновить по сроку</option>
              </select>
            </label>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                Кому отправить в чат ({bulkBirthdayRecipients.size} выбрано)
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-xs font-medium px-2 py-1 rounded-lg"
                  style={{ color: "var(--accent)", background: "var(--accent-light)" }}
                  onClick={() => setBulkBirthdayRecipients(new Set(recipientPickerUsers.map((u) => u.id)))}
                >
                  Выбрать всех в списке
                </button>
                <button
                  type="button"
                  className="text-xs font-medium px-2 py-1 rounded-lg"
                  style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                  onClick={() => setBulkBirthdayRecipients(new Set())}
                >
                  Снять все
                </button>
              </div>
            </div>
            <input
              type="search"
              value={bulkBirthdayRecipientSearch}
              onChange={(e) => setBulkBirthdayRecipientSearch(e.target.value)}
              placeholder="Поиск получателя…"
              className={`${cellInputClass} mb-2 max-w-md`}
              style={cellInputStyle}
            />
            <div
              className="max-h-44 overflow-auto rounded-xl border p-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1"
              style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
            >
              {recipientPickerUsers.map((u) => (
                <label
                  key={u.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-sm hover:opacity-90"
                  style={{ color: "var(--text-primary)" }}
                >
                  <input
                    type="checkbox"
                    checked={bulkBirthdayRecipients.has(u.id)}
                    onChange={() => toggleBirthdayRecipient(u.id)}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <span className="truncate" title={`${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username}>
                    {(u.first_name || u.last_name
                      ? `${u.last_name || ""} ${u.first_name || ""}`.trim()
                      : u.username) || `ID ${u.id}`}
                  </span>
                </label>
              ))}
              {recipientPickerUsers.length === 0 ? (
                <div className="col-span-full text-xs p-2" style={{ color: "var(--text-tertiary)" }}>
                  Нет пользователей
                </div>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            disabled={selected.size === 0 || bulkBirthdayApplying}
            onClick={() => void applyBulkBirthdayReminders()}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
            style={{ background: "var(--purple)" }}
          >
            {bulkBirthdayApplying ? "Применение…" : "Применить напоминания к выбранным"}
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по логину, ФИО, телефону…"
          className="flex-1 max-w-md px-4 py-2.5 rounded-xl border text-sm outline-none"
          style={cellInputStyle}
        />
        <div className="flex flex-wrap gap-2">
          <span className="text-sm self-center px-2" style={{ color: "var(--text-secondary)" }}>
            Изменено: <strong style={{ color: "var(--text-primary)" }}>{dirtyRows.length}</strong>
          </span>
          <button
            type="button"
            disabled={saving || dirtyRows.length === 0}
            onClick={() => void handleSave()}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            {saving ? "Сохранение…" : "Сохранить изменения"}
          </button>
          <Link
            to="/settings/users"
            className="px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            К списку
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[1200px]">
            <thead>
              <tr style={{ background: "var(--bg-secondary)" }}>
                <th className="p-2 w-10 sticky left-0 z-10" style={{ background: "var(--bg-secondary)" }}>
                  <input
                    type="checkbox"
                    checked={filteredRows.length > 0 && filteredRows.every((r) => selected.has(r.id))}
                    onChange={toggleSelectAllVisible}
                    aria-label="Выбрать все"
                  />
                </th>
                <th className="p-2 text-left font-semibold sticky left-10 z-10 min-w-[100px]" style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
                  Логин
                </th>
                <th className="p-2 text-left font-semibold" style={{ color: "var(--text-secondary)" }}>Фамилия</th>
                <th className="p-2 text-left font-semibold" style={{ color: "var(--text-secondary)" }}>Имя</th>
                <th className="p-2 text-left font-semibold" style={{ color: "var(--text-secondary)" }}>Отчество</th>
                <th className="p-2 text-left font-semibold" style={{ color: "var(--text-secondary)" }}>Телефон</th>
                <th className="p-2 text-left font-semibold" style={{ color: "var(--text-secondary)" }}>Telegram</th>
                <th className="p-2 text-left font-semibold" style={{ color: "var(--text-secondary)" }}>День рожд.</th>
                <th className="p-2 text-left font-semibold" style={{ color: "var(--text-secondary)" }}>Цвет</th>
                <th className="p-2 text-center font-semibold" style={{ color: "var(--text-secondary)" }}>Акт.</th>
                <th className="p-2 text-left font-semibold" style={{ color: "var(--text-secondary)" }}>Группы</th>
                <th className="p-2 w-16" />
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => {
                const dirty = initialSig.get(r.id) !== rowSignature(r);
                const maxDay = r.birthMonth === "" ? 31 : daysInBirthMonth(Number(r.birthMonth));
                const groupLabels = groups
                  .filter((g) => r.group_ids.includes(g.id))
                  .map((g) => g.name)
                  .join(", ");
                return (
                  <tr
                    key={r.id}
                    style={{
                      background: dirty ? "rgba(87, 157, 255, 0.06)" : "transparent",
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    <td className="p-1 sticky left-0 z-10" style={{ background: dirty ? "rgba(87,157,255,0.06)" : "var(--bg-primary)" }}>
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} />
                    </td>
                    <td
                      className="p-1 sticky left-10 z-10"
                      style={{ background: dirty ? "rgba(87,157,255,0.06)" : "var(--bg-primary)" }}
                    >
                      <input
                        type="text"
                        value={r.username}
                        onChange={(e) => patchRow(r.id, { username: e.target.value })}
                        className={`${cellInputClass} min-w-[100px] font-medium`}
                        style={cellInputStyle}
                        autoComplete="off"
                        spellCheck={false}
                        title="Логин для входа в систему"
                        aria-label={`Логин пользователя ${r.id}`}
                      />
                    </td>
                    {(["last_name", "first_name", "patronymic", "phone", "telegram_id"] as const).map((field) => (
                      <td key={field} className="p-1">
                        <input
                          type="text"
                          value={r[field]}
                          onChange={(e) => patchRow(r.id, { [field]: e.target.value })}
                          className={cellInputClass}
                          style={cellInputStyle}
                        />
                      </td>
                    ))}
                    <td className="p-1">
                      <div className="flex gap-1">
                        <select
                          value={r.birthMonth === "" ? "" : String(r.birthMonth)}
                          onChange={(e) => {
                            const v = e.target.value;
                            patchRow(r.id, { birthMonth: v === "" ? "" : Number(v) });
                          }}
                          className={`${cellInputClass} min-w-[72px]`}
                          style={cellInputStyle}
                        >
                          <option value="">—</option>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                            <option key={m} value={m}>
                              {birthDateMonthLabel(m).slice(0, 3)}
                            </option>
                          ))}
                        </select>
                        <select
                          value={r.birthDay === "" ? "" : String(r.birthDay)}
                          disabled={r.birthMonth === ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            patchRow(r.id, { birthDay: v === "" ? "" : Number(v) });
                          }}
                          className={`${cellInputClass} min-w-[52px]`}
                          style={cellInputStyle}
                        >
                          <option value="">—</option>
                          {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="p-1">
                      <input
                        type="text"
                        value={r.schedule_color}
                        onChange={(e) => patchRow(r.id, { schedule_color: e.target.value })}
                        placeholder="#rrggbb"
                        className={`${cellInputClass} min-w-[88px]`}
                        style={cellInputStyle}
                      />
                    </td>
                    <td className="p-1 text-center">
                      <input
                        type="checkbox"
                        checked={r.is_active}
                        onChange={(e) => patchRow(r.id, { is_active: e.target.checked })}
                        style={{ accentColor: "var(--accent)" }}
                      />
                    </td>
                    <td className="p-1 max-w-[200px]">
                      <button
                        type="button"
                        onClick={() => setGroupsModalUserId(r.id)}
                        className="w-full text-left px-2 py-1.5 rounded-lg text-xs truncate border"
                        style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                        title={groupLabels || "Нет групп"}
                      >
                        {groupLabels || "—"}
                      </button>
                    </td>
                    <td className="p-1">
                      <Link
                        to={`/settings/users/${r.id}`}
                        className="text-xs whitespace-nowrap hover:underline"
                        style={{ color: "var(--accent)" }}
                      >
                        Карточка
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredRows.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
            Ничего не найдено
          </div>
        ) : null}
      </div>

      {groupsModalRow ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setGroupsModalUserId(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-5 max-h-[80vh] overflow-auto"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
              Группы: {groupsModalRow.username}
            </h3>
            <div className="space-y-2">
              {groups.map((g) => (
                <label key={g.id} className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: "var(--text-primary)" }}>
                  <input
                    type="checkbox"
                    checked={groupsModalRow.group_ids.includes(g.id)}
                    onChange={() => {
                      const set = new Set(groupsModalRow.group_ids);
                      if (set.has(g.id)) set.delete(g.id);
                      else set.add(g.id);
                      patchRow(groupsModalRow.id, { group_ids: [...set] });
                    }}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  {g.name}
                </label>
              ))}
            </div>
            <button
              type="button"
              className="mt-4 w-full py-2 rounded-xl text-sm font-medium"
              style={{ background: "var(--accent)", color: "#fff" }}
              onClick={() => setGroupsModalUserId(null)}
            >
              Готово
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
