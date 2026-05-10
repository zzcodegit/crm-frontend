import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type CentralCashPayoutItem, type RefItem, type UserItem } from "../api";

function userLabel(u: UserItem): string {
  const last = (u.last_name || "").trim();
  const first = (u.first_name || "").trim();
  if (last || first) return `${last} ${first}`.trim();
  return u.username;
}

const fmtRub = (n: number) =>
  n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatDt(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function ReportsCentralCash() {
  const [rows, setRows] = useState<CentralCashPayoutItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [takenSources, setTakenSources] = useState<RefItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [paidToId, setPaidToId] = useState<number | "">("");
  const [amount, setAmount] = useState("");
  const [takenSourceId, setTakenSourceId] = useState<number | "">("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = () => {
    setError("");
    api.centralCashPayouts
      .list()
      .then(setRows)
      .catch((e) => {
        setRows([]);
        setError(e instanceof Error ? e.message : "Не удалось загрузить записи");
      });
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([api.getUsers(), api.centralCashPayouts.list(), api.ref.takenSources.list()])
      .then(([u, r, sources]) => {
        setUsers(u.filter((x) => x.is_active));
        setRows(r);
        setTakenSources(sources);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Ошибка загрузки");
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const userOptions = useMemo(() => {
    return [...users].sort((a, b) => userLabel(a).localeCompare(userLabel(b), "ru"));
  }, [users]);

  const total = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");
    if (paidToId === "") {
      setSubmitError("Выберите сотрудника");
      return;
    }
    const raw = amount.replace(",", ".").trim();
    const num = parseFloat(raw);
    if (Number.isNaN(num) || num <= 0) {
      setSubmitError("Укажите сумму больше нуля");
      return;
    }
    setSaving(true);
    try {
      await api.centralCashPayouts.create({
        paid_to_user_id: paidToId,
        amount: num,
        taken_source_id: takenSourceId === "" ? null : takenSourceId,
        note: note.trim() || null,
      });
      setAmount("");
      setTakenSourceId("");
      setNote("");
      load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Удалить эту запись о выплате?")) return;
    setDeletingId(id);
    setSubmitError("");
    try {
      await api.centralCashPayouts.delete(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Не удалось удалить");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto w-full animate-slide-in px-1">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
            Центральная касса
          </h1>
          <p className="text-sm max-w-2xl" style={{ color: "var(--text-secondary)" }}>
            Учёт выплат сотрудникам из центральной кассы. Записи видны только администраторам и не связаны со сменными отчётами по точкам.
          </p>
        </div>
        <Link
          to="/reports"
          className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
        >
          ← К списку отчётов
        </Link>
      </div>

      <div
        className="rounded-2xl p-5 mb-6 border shadow-sm"
        style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}
      >
        <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
          Новая выплата
        </h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Сотрудник
            </label>
            <select
              value={paidToId === "" ? "" : String(paidToId)}
              onChange={(e) => setPaidToId(e.target.value === "" ? "" : Number.parseInt(e.target.value, 10))}
              className="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              <option value="">Выберите…</option>
              {userOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {userLabel(u)} ({u.username})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Сумма (₽)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm border outline-none tabular-nums"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
              placeholder="0,00"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Как выданы деньги
            </label>
            <select
              value={takenSourceId === "" ? "" : String(takenSourceId)}
              onChange={(e) => setTakenSourceId(e.target.value === "" ? "" : Number.parseInt(e.target.value, 10))}
              className="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              <option value="">Выберите…</option>
              {takenSources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-1">
            <button
              type="submit"
              disabled={saving}
              className="w-full px-4 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {saving ? "Сохранение…" : "Записать выплату"}
            </button>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Комментарий (необязательно)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
              placeholder="Например: аванс, премия, подотчёт"
            />
          </div>
        </form>
        {submitError && (
          <p className="mt-3 text-sm" style={{ color: "var(--error)" }}>
            {submitError}
          </p>
        )}
      </div>

      <div
        className="rounded-2xl border overflow-hidden shadow-sm"
        style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}
      >
        <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-2 border-b" style={{ borderColor: "var(--border)" }}>
          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
            Журнал выплат
          </span>
          <span className="text-sm tabular-nums" style={{ color: "var(--text-secondary)" }}>
            Всего: <strong style={{ color: "var(--text-primary)" }}>{fmtRub(total)}</strong> ₽ ({rows.length}{" "}
            {rows.length === 1 ? "запись" : rows.length < 5 ? "записи" : "записей"})
          </span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
            Загрузка…
          </div>
        ) : error ? (
          <div className="p-8 text-center text-sm" style={{ color: "var(--error)" }}>
            {error}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
            Пока нет записей. Добавьте первую выплату выше.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--bg-secondary)" }}>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--text-secondary)" }}>
                    Дата
                  </th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--text-secondary)" }}>
                    Сотрудник
                  </th>
                  <th className="text-right px-4 py-3 font-medium tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    Сумма
                  </th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--text-secondary)" }}>
                    Как выданы
                  </th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--text-secondary)" }}>
                    Комментарий
                  </th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--text-secondary)" }}>
                    Записал
                  </th>
                  <th className="w-24 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
                      {formatDt(r.created_at)}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--text-primary)" }}>
                      <div className="font-medium">{r.paid_to_name || "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                      {fmtRub(r.amount)} ₽
                    </td>
                    <td className="px-4 py-3 max-w-[220px] truncate" style={{ color: "var(--text-secondary)" }} title={r.taken_source_name ?? ""}>
                      {r.taken_source_name?.trim() ? r.taken_source_name : "—"}
                    </td>
                    <td className="px-4 py-3 max-w-[200px] truncate" style={{ color: "var(--text-secondary)" }} title={r.note ?? ""}>
                      {r.note?.trim() ? r.note : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {r.recorded_by_name || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => void handleDelete(r.id)}
                        disabled={deletingId === r.id}
                        className="text-xs font-medium px-2 py-1 rounded-lg disabled:opacity-50"
                        style={{ color: "var(--error)" }}
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
