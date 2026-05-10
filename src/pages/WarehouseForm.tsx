import { useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  type WarehouseHolidayHours,
  type WarehouseOpeningHours,
  type WarehouseWeeklyHours,
} from "../api";

type ManagerOption = { id: number; username: string; first_name?: string; last_name?: string; display_name: string };
type OrganizationOption = { id: number; name: string };

type WeekdayKey = keyof WarehouseWeeklyHours;

const WEEKDAY_ORDER: { key: WeekdayKey; label: string }[] = [
  { key: "mon", label: "Понедельник" },
  { key: "tue", label: "Вторник" },
  { key: "wed", label: "Среда" },
  { key: "thu", label: "Четверг" },
  { key: "fri", label: "Пятница" },
  { key: "sat", label: "Суббота" },
  { key: "sun", label: "Воскресенье" },
];

type DayRow = { key: WeekdayKey; label: string; enabled: boolean; open: string; close: string };

type HolidayRow = { id: string; date: string; closed: boolean; open: string; close: string };

function defaultDayRows(): DayRow[] {
  return WEEKDAY_ORDER.map(({ key, label }) => ({
    key,
    label,
    enabled: false,
    open: "10:00",
    close: "20:00",
  }));
}

function daysFromWeekly(weekly: WarehouseWeeklyHours | null | undefined): DayRow[] {
  return WEEKDAY_ORDER.map(({ key, label }) => {
    const s = weekly?.[key];
    if (s?.open && s?.close) {
      return { key, label, enabled: true, open: s.open, close: s.close };
    }
    return { key, label, enabled: false, open: "10:00", close: "20:00" };
  });
}

function holidaysFromApi(h: WarehouseHolidayHours[] | undefined): HolidayRow[] {
  if (!h?.length) return [];
  return h.map((x, i) => ({
    id: `h-${i}-${x.date}`,
    date: x.date,
    closed: x.closed,
    open: x.open ?? "10:00",
    close: x.close ?? "20:00",
  }));
}

/** Бэкенд ждёт HH:MM; браузер может отдать HH:MM:SS */
function hhmm(t: string): string {
  const s = t.trim();
  return s.length >= 5 ? s.slice(0, 5) : s;
}

function buildOpeningHours(dayRows: DayRow[], holidayRows: HolidayRow[]): WarehouseOpeningHours | null {
  const weekly: WarehouseWeeklyHours = {};
  let hasAnyDay = false;
  for (const d of dayRows) {
    if (d.enabled && d.open && d.close) {
      weekly[d.key] = { open: hhmm(d.open), close: hhmm(d.close) };
      hasAnyDay = true;
    } else {
      weekly[d.key] = null;
    }
  }
  const holidays: WarehouseHolidayHours[] = [];
  for (const h of holidayRows) {
    const date = h.date.trim();
    if (!date) continue;
    if (h.closed) {
      holidays.push({ date, closed: true });
    } else {
      if (!h.open || !h.close) {
        throw new Error(`Для даты ${date} укажите время работы или отметьте «Выходной»`);
      }
      holidays.push({ date, closed: false, open: hhmm(h.open), close: hhmm(h.close) });
    }
  }
  if (!hasAnyDay && holidays.length === 0) return null;
  const out: WarehouseOpeningHours = { holidays };
  if (hasAnyDay) out.weekly = weekly;
  return out;
}

export default function WarehouseForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [managerId, setManagerId] = useState<number | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [dayRows, setDayRows] = useState<DayRow[]>(() => defaultDayRows());
  const [holidayRows, setHolidayRows] = useState<HolidayRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [error, setError] = useState("");
  const isEdit = id && id !== "new";

  useEffect(() => {
    api.ref.organizations.list().then(setOrganizations).catch(() => setOrganizations([]));
    api.ref.managers().then(setManagers).catch(() => setManagers([]));
  }, []);

  useEffect(() => {
    if (isEdit) {
      setInitialLoading(true);
      api.ref.warehouses
        .get(Number(id))
        .then((w) => {
          setName(w.name);
          setOrganizationId(w.organization_id ?? null);
          setManagerId(w.manager_id ?? null);
          const oh = w.opening_hours;
          setDayRows(daysFromWeekly(oh?.weekly));
          setHolidayRows(holidaysFromApi(oh?.holidays));
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Ошибка загрузки"))
        .finally(() => setInitialLoading(false));
    }
  }, [id, isEdit]);

  function updateDay(key: WeekdayKey, patch: Partial<DayRow>) {
    setDayRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addHoliday() {
    setHolidayRows((rows) => [
      ...rows,
      {
        id: `h-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        date: "",
        closed: true,
        open: "10:00",
        close: "20:00",
      },
    ]);
  }

  function updateHoliday(id: string, patch: Partial<HolidayRow>) {
    setHolidayRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeHoliday(id: string) {
    setHolidayRows((rows) => rows.filter((r) => r.id !== id));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Введите название склада");
      return;
    }
    let opening: WarehouseOpeningHours | null;
    try {
      opening = buildOpeningHours(dayRows, holidayRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Проверьте время работы");
      return;
    }
    setError("");
    setLoading(true);
    try {
      if (isEdit) {
        await api.ref.warehouses.update(Number(id), {
          name: trimmed,
          organization_id: organizationId,
          manager_id: managerId,
          opening_hours: opening,
        });
        navigate("/settings/references/warehouses");
      } else {
        await api.ref.warehouses.create({
          name: trimmed,
          organization_id: organizationId,
          manager_id: managerId,
          opening_hours: opening,
        });
        navigate("/settings/references/warehouses");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setLoading(false);
    }
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-4">
          <svg
            className="animate-spin"
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: "var(--accent)" }}
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span style={{ color: "var(--text-secondary)" }}>Загрузка...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-2 text-sm">
        <Link to="/settings" className="transition-colors hover:underline" style={{ color: "var(--text-secondary)" }}>
          Настройки
        </Link>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--text-tertiary)" }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <Link
          to="/settings/references"
          className="transition-colors hover:underline"
          style={{ color: "var(--text-secondary)" }}
        >
          Справочники
        </Link>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--text-tertiary)" }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <Link
          to="/settings/references/warehouses"
          className="transition-colors hover:underline"
          style={{ color: "var(--text-secondary)" }}
        >
          Склады
        </Link>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--text-tertiary)" }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span style={{ color: "var(--text-primary)" }}>{isEdit ? "Редактирование" : "Новый склад"}</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
          {isEdit ? "Редактировать склад" : "Новый склад"}
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {isEdit
            ? "Название, организация, менеджер и время работы точки."
            : "Добавьте склад. Организация и менеджер выбираются из справочников."}
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {error && (
          <div
            className="mb-4 p-4 rounded-xl text-sm"
            style={{ backgroundColor: "var(--error-light)", color: "var(--error)", border: "1px solid var(--error)" }}
          >
            {error}
          </div>
        )}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            Название склада
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Кузьминки (Волгоградский пр., д.94, к1)"
            className="w-full px-4 py-3 rounded-xl border transition-colors"
            style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            autoFocus
          />
        </div>
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            Организация
          </label>
          <select
            value={organizationId ?? ""}
            onChange={(e) => setOrganizationId(e.target.value ? Number(e.target.value) : null)}
            className="w-full px-4 py-3 rounded-xl border transition-colors"
            style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          >
            <option value="">— Не выбрана —</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            Менеджер
          </label>
          <select
            value={managerId ?? ""}
            onChange={(e) => setManagerId(e.target.value ? Number(e.target.value) : null)}
            className="w-full px-4 py-3 rounded-xl border transition-colors"
            style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          >
            <option value="">— Не выбран —</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name || m.username}
              </option>
            ))}
          </select>
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
            При обмене с 1С менеджер заполняется автоматически из warehouse_manager
          </p>
        </div>

        <div
          className="mb-8 p-4 sm:p-5 rounded-xl border space-y-4"
          style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
        >
          <div>
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Время работы точки
            </h2>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
              По дням недели и отдельные даты (праздники): можно указать сокращённый день или полный выходной.
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
              Будни и выходные
            </div>
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
              {dayRows.map((row) => (
                <div
                  key={row.key}
                  className="flex flex-wrap items-center gap-3 px-3 py-2.5 border-b last:border-b-0"
                  style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}
                >
                  <label className="flex items-center gap-2 min-w-[140px] sm:min-w-[160px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={(e) => updateDay(row.key, { enabled: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                      {row.label}
                    </span>
                  </label>
                  {row.enabled ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                        с
                      </span>
                      <input
                        type="time"
                        value={row.open}
                        onChange={(e) => updateDay(row.key, { open: e.target.value })}
                        className="px-2 py-1.5 rounded-lg border text-sm"
                        style={{
                          background: "var(--bg-secondary)",
                          borderColor: "var(--border)",
                          color: "var(--text-primary)",
                        }}
                      />
                      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                        до
                      </span>
                      <input
                        type="time"
                        value={row.close}
                        onChange={(e) => updateDay(row.key, { close: e.target.value })}
                        className="px-2 py-1.5 rounded-lg border text-sm"
                        style={{
                          background: "var(--bg-secondary)",
                          borderColor: "var(--border)",
                          color: "var(--text-primary)",
                        }}
                      />
                    </div>
                  ) : (
                    <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      выходной
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
                Праздники и особые дни
              </div>
              <button
                type="button"
                onClick={addHoliday}
                className="text-xs font-medium px-2 py-1 rounded-lg"
                style={{ background: "var(--accent-light)", color: "var(--accent)" }}
              >
                + Добавить дату
              </button>
            </div>
            {holidayRows.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                Нет записей. Добавьте дату для отличного от недели режима (например, 1 января — выходной).
              </p>
            ) : (
              <ul className="space-y-2">
                {holidayRows.map((h) => (
                  <li
                    key={h.id}
                    className="flex flex-wrap items-end gap-2 p-3 rounded-lg border"
                    style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}
                  >
                    <div className="min-w-0">
                      <label className="block text-xs mb-1" style={{ color: "var(--text-tertiary)" }}>
                        Дата
                      </label>
                      <input
                        type="date"
                        value={h.date}
                        onChange={(e) => updateHoliday(h.id, { date: e.target.value })}
                        className="px-2 py-1.5 rounded-lg border text-sm"
                        style={{
                          background: "var(--bg-secondary)",
                          borderColor: "var(--border)",
                          color: "var(--text-primary)",
                        }}
                      />
                    </div>
                    <label className="flex items-center gap-2 pb-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={h.closed}
                        onChange={(e) => updateHoliday(h.id, { closed: e.target.checked })}
                      />
                      <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                        Выходной
                      </span>
                    </label>
                    {!h.closed && (
                      <>
                        <input
                          type="time"
                          value={h.open}
                          onChange={(e) => updateHoliday(h.id, { open: e.target.value })}
                          className="px-2 py-1.5 rounded-lg border text-sm"
                          style={{
                            background: "var(--bg-secondary)",
                            borderColor: "var(--border)",
                            color: "var(--text-primary)",
                          }}
                        />
                        <span className="text-xs pb-2" style={{ color: "var(--text-tertiary)" }}>
                          —
                        </span>
                        <input
                          type="time"
                          value={h.close}
                          onChange={(e) => updateHoliday(h.id, { close: e.target.value })}
                          className="px-2 py-1.5 rounded-lg border text-sm"
                          style={{
                            background: "var(--bg-secondary)",
                            borderColor: "var(--border)",
                            color: "var(--text-primary)",
                          }}
                        />
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => removeHoliday(h.id)}
                      className="ml-auto text-xs px-2 py-1 rounded-lg"
                      style={{ color: "var(--error,#b91c1c)" }}
                    >
                      Удалить
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 rounded-xl font-semibold transition-all disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#ffffff" }}
          >
            {loading ? "Сохранение…" : isEdit ? "Сохранить" : "Добавить"}
          </button>
          <Link
            to="/settings/references/warehouses"
            className="px-6 py-3 rounded-xl font-medium inline-flex items-center gap-2"
            style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
          >
            Отмена
          </Link>
        </div>
      </form>
    </div>
  );
}
