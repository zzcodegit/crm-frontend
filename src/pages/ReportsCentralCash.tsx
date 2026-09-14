import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ReportsSubnav from "../components/ReportsSubnav";
import {
  api,
  type CentralCashPayoutItem,
  type EmployeeSalaryBalanceResponse,
  type RefItem,
  type UserItem,
} from "../api";

const BALANCE_EPS = 1e-6;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function userLabel(u: UserItem): string {
  const last = (u.last_name || "").trim();
  const first = (u.first_name || "").trim();
  if (last || first) return `${last} ${first}`.trim();
  return u.username;
}

const fmtRub = (n: number) =>
  n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function todayYmdMoscow(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
}

function formatDt(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function formatYmd(ymd: string | null | undefined): string {
  if (!ymd || !YMD_RE.test(ymd)) return "—";
  const [y, m, d] = ymd.split("-");
  return `${d}.${m}.${y}`;
}

function parseAmount(raw: string): number | null {
  const num = parseFloat(raw.replace(",", ".").trim());
  if (Number.isNaN(num) || num <= 0) return null;
  return num;
}

/** Учётный баланс ЦК: выдано − взято (удержания на баланс не влияют). */
function ccPageBalance(bal: EmployeeSalaryBalanceResponse): number {
  const issued = Number(bal.central_cash_issued) || 0;
  const taken = Number(bal.vzyala_taken) || 0;
  return issued - taken;
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
  const [balanceEffectiveDate, setBalanceEffectiveDate] = useState(() => todayYmdMoscow());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [salaryBalance, setSalaryBalance] = useState<EmployeeSalaryBalanceResponse | null>(null);
  const [salaryBalanceLoading, setSalaryBalanceLoading] = useState(false);

  const [editRow, setEditRow] = useState<CentralCashPayoutItem | null>(null);
  const [editPaidToId, setEditPaidToId] = useState<number | "">("");
  const [editAmount, setEditAmount] = useState("");
  const [editTakenSourceId, setEditTakenSourceId] = useState<number | "">("");
  const [editNote, setEditNote] = useState("");
  const [editBalanceEffectiveDate, setEditBalanceEffectiveDate] = useState("");
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editBalance, setEditBalance] = useState<EmployeeSalaryBalanceResponse | null>(null);
  const [editBalanceLoading, setEditBalanceLoading] = useState(false);

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

  useEffect(() => {
    if (paidToId === "") {
      setSalaryBalance(null);
      return;
    }
    let cancelled = false;
    setSalaryBalanceLoading(true);
    api.reports
      .employeeSalaryBalance({ userId: Number(paidToId) })
      .then((r) => {
        if (!cancelled) setSalaryBalance(r);
      })
      .catch(() => {
        if (!cancelled) setSalaryBalance(null);
      })
      .finally(() => {
        if (!cancelled) setSalaryBalanceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [paidToId, rows]);

  useEffect(() => {
    if (!editRow || editPaidToId === "") {
      setEditBalance(null);
      return;
    }
    let cancelled = false;
    setEditBalanceLoading(true);
    api.reports
      .employeeSalaryBalance({ userId: Number(editPaidToId) })
      .then((r) => {
        if (!cancelled) setEditBalance(r);
      })
      .catch(() => {
        if (!cancelled) setEditBalance(null);
      })
      .finally(() => {
        if (!cancelled) setEditBalanceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editRow, editPaidToId]);

  const userOptions = useMemo(() => {
    return [...users].sort((a, b) => userLabel(a).localeCompare(userLabel(b), "ru"));
  }, [users]);

  const total = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);

  const todayYmd = todayYmdMoscow();

  /** После новой выписки: учётный баланс + сумма (только если дата пополнения ≤ сегодня). */
  const projectedBalance = useMemo(() => {
    if (salaryBalance == null) return null;
    const add = parseAmount(amount) ?? 0;
    if (!YMD_RE.test(balanceEffectiveDate) || balanceEffectiveDate > todayYmd) {
      return ccPageBalance(salaryBalance);
    }
    return ccPageBalance(salaryBalance) + add;
  }, [salaryBalance, amount, balanceEffectiveDate, todayYmd]);

  const createDateIsFuture =
    YMD_RE.test(balanceEffectiveDate) && balanceEffectiveDate > todayYmd;

  /** При редактировании той же записи: заменить старую сумму на новую. */
  const editProjectedBalance = useMemo(() => {
    if (editBalance == null || !editRow) return null;
    const next = parseAmount(editAmount) ?? 0;
    const sameUser = Number(editPaidToId) === editRow.paid_to_user_id;
    const oldDate = editRow.balance_effective_date || "";
    const oldCounted = !oldDate || oldDate <= todayYmd;
    const newCounted = YMD_RE.test(editBalanceEffectiveDate) && editBalanceEffectiveDate <= todayYmd;
    const oldAmt = sameUser && oldCounted ? Number(editRow.amount || 0) : 0;
    const nextAmt = newCounted ? next : 0;
    return ccPageBalance(editBalance) - oldAmt + nextAmt;
  }, [editBalance, editRow, editAmount, editPaidToId, editBalanceEffectiveDate, todayYmd]);

  const editDateIsFuture =
    YMD_RE.test(editBalanceEffectiveDate) && editBalanceEffectiveDate > todayYmd;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");
    if (paidToId === "") {
      setSubmitError("Выберите сотрудника");
      return;
    }
    const num = parseAmount(amount);
    if (num == null) {
      setSubmitError("Укажите сумму больше нуля");
      return;
    }
    const bed = YMD_RE.test(balanceEffectiveDate) ? balanceEffectiveDate : todayYmdMoscow();
    if (bed !== balanceEffectiveDate) setBalanceEffectiveDate(bed);
    setSaving(true);
    try {
      await api.centralCashPayouts.create({
        paid_to_user_id: paidToId,
        amount: num,
        taken_source_id: takenSourceId === "" ? null : takenSourceId,
        note: note.trim() || null,
        balance_effective_date: bed,
      });
      setAmount("");
      setTakenSourceId("");
      setNote("");
      setBalanceEffectiveDate(todayYmdMoscow());
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

  const openEdit = (r: CentralCashPayoutItem) => {
    setEditError("");
    setEditRow(r);
    setEditPaidToId(r.paid_to_user_id);
    setEditAmount(String(Number(r.amount || 0)));
    setEditTakenSourceId(r.taken_source_id == null ? "" : r.taken_source_id);
    setEditNote(r.note || "");
    setEditBalanceEffectiveDate(
      r.balance_effective_date && YMD_RE.test(r.balance_effective_date)
        ? r.balance_effective_date
        : todayYmdMoscow()
    );
  };

  const closeEdit = () => {
    setEditRow(null);
    setEditError("");
    setEditBalance(null);
  };

  const saveEdit = async () => {
    if (!editRow) return;
    setEditError("");
    if (editPaidToId === "") {
      setEditError("Выберите сотрудника");
      return;
    }
    const num = parseAmount(editAmount);
    if (num == null) {
      setEditError("Укажите сумму больше нуля");
      return;
    }
    const bed = YMD_RE.test(editBalanceEffectiveDate)
      ? editBalanceEffectiveDate
      : todayYmdMoscow();
    if (bed !== editBalanceEffectiveDate) setEditBalanceEffectiveDate(bed);
    setEditSaving(true);
    try {
      await api.centralCashPayouts.update(editRow.id, {
        paid_to_user_id: editPaidToId,
        amount: num,
        taken_source_id: editTakenSourceId === "" ? null : editTakenSourceId,
        note: editNote.trim() || null,
        balance_effective_date: bed,
      });
      closeEdit();
      load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setEditSaving(false);
    }
  };

  const renderBalanceBlock = (
    bal: EmployeeSalaryBalanceResponse | null,
    loadingBal: boolean,
    projected: number | null,
    amountRaw: string,
    afterLabel: string,
    futureHint?: string | null
  ) => {
    if (loadingBal && bal == null) {
      return <span style={{ color: "var(--text-tertiary)" }}>Загрузка баланса…</span>;
    }
    if (bal == null) {
      return <span style={{ color: "var(--text-tertiary)" }}>Не удалось загрузить баланс</span>;
    }
    const withholdings = Number(bal.manual_withholdings) || 0;
    const pageBal = ccPageBalance(bal);
    const amtOk = (parseAmount(amountRaw) ?? 0) > 0;
    const issued = Number(bal.central_cash_issued) || 0;
    const taken = Number(bal.vzyala_taken) || 0;
    return (
      <div className="flex flex-col gap-1 tabular-nums">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span style={{ color: "var(--text-secondary)" }}>
            Выдано из ЦК:{" "}
            <strong style={{ color: "var(--text-primary)" }}>{fmtRub(issued)} ₽</strong>
          </span>
          {taken > BALANCE_EPS ? (
            <span style={{ color: "var(--text-secondary)" }}>
              Списано «Взято»:{" "}
              <strong style={{ color: "var(--text-primary)" }}>{fmtRub(taken)} ₽</strong>
            </span>
          ) : null}
          {withholdings > BALANCE_EPS ? (
            <span style={{ color: "var(--text-secondary)" }}>
              Удержано:{" "}
              <strong style={{ color: "var(--text-primary)" }}>{fmtRub(withholdings)} ₽</strong>
            </span>
          ) : null}
          <span style={{ color: "var(--text-secondary)" }}>
            Текущий баланс:{" "}
            <strong
              style={{
                color: pageBal < -BALANCE_EPS ? "var(--error)" : "var(--text-primary)",
              }}
            >
              {fmtRub(pageBal)} ₽
            </strong>
          </span>
        </div>
        {withholdings > BALANCE_EPS && Array.isArray(bal.withholding_items) && bal.withholding_items.length > 0 ? (
          <ul className="text-xs mt-0.5 space-y-0.5" style={{ color: "var(--text-tertiary)" }}>
            {bal.withholding_items.map((w) => (
              <li key={w.id}>
                {fmtRub(w.amount)} ₽
                {w.reason?.trim() ? ` — ${w.reason.trim()}` : ""}
                {w.note?.trim() ? ` (${w.note.trim()})` : ""}
              </li>
            ))}
          </ul>
        ) : null}
        {futureHint ? (
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {futureHint}
          </span>
        ) : null}
        {projected != null && amtOk && !futureHint ? (
          <span style={{ color: "var(--text-secondary)" }}>
            {afterLabel}:{" "}
            <strong
              style={{
                color: projected < -BALANCE_EPS ? "var(--error)" : "var(--text-primary)",
              }}
            >
              {fmtRub(projected)} ₽
            </strong>
            {withholdings > BALANCE_EPS ? (
              <span className="ml-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                (выдано − взято; удержания отдельно)
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto w-full animate-slide-in px-1">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
            Центральная касса
          </h1>
          <p className="text-sm max-w-2xl" style={{ color: "var(--text-secondary)" }}>
            Учёт выплат сотрудникам из центральной кассы. Дата пополнения баланса — день, с которого сумма доступна
            для закрытия долгов «из баланса» (можно указать прошлую или будущую дату).
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

      <ReportsSubnav active="central-cash" />

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
              Дата пополнения баланса
            </label>
            <input
              type="date"
              value={balanceEffectiveDate}
              onChange={(e) => setBalanceEffectiveDate(e.target.value || todayYmdMoscow())}
              onBlur={() => {
                if (!YMD_RE.test(balanceEffectiveDate)) setBalanceEffectiveDate(todayYmdMoscow());
              }}
              className="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
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
        {paidToId !== "" ? (
          <div
            className="mt-3 rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
          >
            {renderBalanceBlock(
              salaryBalance,
              salaryBalanceLoading,
              projectedBalance,
              amount,
              "После записи выплаты",
              createDateIsFuture ? `На балансе появится с ${formatYmd(balanceEffectiveDate)}` : null
            )}
          </div>
        ) : null}
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
        <div
          className="px-5 py-3 flex flex-wrap items-center justify-between gap-2 border-b"
          style={{ borderColor: "var(--border)" }}
        >
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
                    Дата пополнения
                  </th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--text-secondary)" }}>
                    Записано
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
                  <th className="w-36 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-3 whitespace-nowrap font-medium" style={{ color: "var(--text-primary)" }}>
                      {formatYmd(r.balance_effective_date)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {formatDt(r.created_at)}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--text-primary)" }}>
                      <div className="font-medium">{r.paid_to_name || "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                      {fmtRub(r.amount)} ₽
                    </td>
                    <td
                      className="px-4 py-3 max-w-[220px] truncate"
                      style={{ color: "var(--text-secondary)" }}
                      title={r.taken_source_name ?? ""}
                    >
                      {r.taken_source_name?.trim() ? r.taken_source_name : "—"}
                    </td>
                    <td
                      className="px-4 py-3 max-w-[200px] truncate"
                      style={{ color: "var(--text-secondary)" }}
                      title={r.note ?? ""}
                    >
                      {r.note?.trim() ? r.note : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {r.recorded_by_name || "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        className="text-xs font-medium px-2 py-1 rounded-lg mr-1"
                        style={{ color: "var(--accent)" }}
                      >
                        Изменить
                      </button>
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

      {editRow && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-3"
          style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}
          onClick={closeEdit}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-[640px] rounded-2xl border overflow-hidden"
            style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="p-4 border-b flex items-center justify-between gap-3"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="font-bold" style={{ color: "var(--text-primary)" }}>
                Редактирование выплаты #{editRow.id}
              </div>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg text-sm border"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                }}
                onClick={closeEdit}
              >
                Закрыть
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-sm sm:col-span-2">
                  <span style={{ color: "var(--text-secondary)" }}>Сотрудник</span>
                  <select
                    value={editPaidToId === "" ? "" : String(editPaidToId)}
                    onChange={(e) =>
                      setEditPaidToId(e.target.value === "" ? "" : Number.parseInt(e.target.value, 10))
                    }
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--bg-secondary)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <option value="">Выберите…</option>
                    {userOptions.map((u) => (
                      <option key={u.id} value={u.id}>
                        {userLabel(u)} ({u.username})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span style={{ color: "var(--text-secondary)" }}>Сумма (₽)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm tabular-nums"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--bg-secondary)",
                      color: "var(--text-primary)",
                    }}
                  />
                </label>
                <label className="block text-sm">
                  <span style={{ color: "var(--text-secondary)" }}>Дата пополнения баланса</span>
                  <input
                    type="date"
                    value={editBalanceEffectiveDate}
                    onChange={(e) => setEditBalanceEffectiveDate(e.target.value || todayYmdMoscow())}
                    onBlur={() => {
                      if (!YMD_RE.test(editBalanceEffectiveDate)) {
                        setEditBalanceEffectiveDate(todayYmdMoscow());
                      }
                    }}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--bg-secondary)",
                      color: "var(--text-primary)",
                    }}
                  />
                </label>
                <label className="block text-sm sm:col-span-2">
                  <span style={{ color: "var(--text-secondary)" }}>Как выданы деньги</span>
                  <select
                    value={editTakenSourceId === "" ? "" : String(editTakenSourceId)}
                    onChange={(e) =>
                      setEditTakenSourceId(e.target.value === "" ? "" : Number.parseInt(e.target.value, 10))
                    }
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--bg-secondary)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <option value="">Выберите…</option>
                    {takenSources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm sm:col-span-2">
                  <span style={{ color: "var(--text-secondary)" }}>Комментарий</span>
                  <input
                    type="text"
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--bg-secondary)",
                      color: "var(--text-primary)",
                    }}
                  />
                </label>
              </div>
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                Смена даты пополнения пересчитает баланс и подписи «Баланс / из кассы» в отчётах.
              </p>

              {editPaidToId !== "" ? (
                <div
                  className="rounded-xl border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
                >
                  {renderBalanceBlock(
                    editBalance,
                    editBalanceLoading,
                    editProjectedBalance,
                    editAmount,
                    "После сохранения",
                    editDateIsFuture
                      ? `На балансе появится с ${formatYmd(editBalanceEffectiveDate)}`
                      : null
                  )}
                </div>
              ) : null}

              {editError ? (
                <p className="text-sm" style={{ color: "var(--error)" }}>
                  {editError}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="px-4 py-2 rounded-lg text-sm border"
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                  }}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  disabled={editSaving}
                  onClick={() => void saveEdit()}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: "var(--accent)" }}
                >
                  {editSaving ? "Сохранение…" : "Сохранить"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
