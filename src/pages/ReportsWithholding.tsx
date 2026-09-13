import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ReportsSubnav from "../components/ReportsSubnav";
import { api } from "../api";
import type { EmployeeSalaryBalanceResponse, ManualWithholdingRow, RefItem } from "../api";

const BALANCE_EPS = 1e-6;

function todayYmdLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthStartYmdLocal(anchor: Date = new Date()): string {
  const y = anchor.getFullYear();
  const m = anchor.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

function createdAtBusinessDayYmd(v?: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  // Отображаем и фильтруем по календарному дню Москвы, чтобы совпадало с отчётами.
  const ymd = d.toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

function fmtMoney(n: number): string {
  return Number(n || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ReportsWithholding() {
  const [rows, setRows] = useState<ManualWithholdingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(() => monthStartYmdLocal());
  const [dateTo, setDateTo] = useState(() => todayYmdLocal());
  const [showClosed, setShowClosed] = useState(false);
  const [consultants, setConsultants] = useState<{ id: number; last_name: string }[]>([]);
  const [warehouses, setWarehouses] = useState<RefItem[]>([]);
  const [newUserId, setNewUserId] = useState<number | "">("");
  const [newAmount, setNewAmount] = useState("");
  const [newWhId, setNewWhId] = useState<number | "">("");
  const [newMonth, setNewMonth] = useState("");
  const [newReason, setNewReason] = useState("");
  const [newNote, setNewNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [deleteBusyId, setDeleteBusyId] = useState<number | null>(null);
  const [closeBusyId, setCloseBusyId] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<ManualWithholdingRow | null>(null);
  const [editUserId, setEditUserId] = useState<number | "">("");
  const [editAmount, setEditAmount] = useState("");
  const [editWhId, setEditWhId] = useState<number | "">("");
  const [editMonth, setEditMonth] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");
  const [salaryBalance, setSalaryBalance] = useState<EmployeeSalaryBalanceResponse | null>(null);
  const [salaryBalanceLoading, setSalaryBalanceLoading] = useState(false);

  const loadRows = async () => {
    setLoading(true);
    try {
      const resp = await api.reports.withholdingSummary();
      setRows(Array.isArray(resp.rows) ? resp.rows : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
    api.reports.consultants().then(setConsultants).catch(() => setConsultants([]));
    api.ref.warehouses.list().then(setWarehouses).catch(() => setWarehouses([]));
  }, []);

  useEffect(() => {
    if (newUserId === "") {
      setSalaryBalance(null);
      return;
    }
    let cancelled = false;
    setSalaryBalanceLoading(true);
    api.reports
      .employeeSalaryBalance({ userId: Number(newUserId) })
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
  }, [newUserId, rows]);

  const projectedBalance = useMemo(() => {
    if (salaryBalance == null) return null;
    const issued = Number(salaryBalance.central_cash_issued) || 0;
    const taken = Number(salaryBalance.vzyala_taken) || 0;
    return issued - taken;
  }, [salaryBalance]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = (dateFrom || "").trim();
    const to = (dateTo || "").trim();
    const validFrom = /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null;
    const validTo = /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : null;

    return rows.filter((r) => {
      if (!showClosed && r.closed) return false;
      const day = createdAtBusinessDayYmd(r.created_at);
      if (validFrom && (!day || day < validFrom)) return false;
      if (validTo && (!day || day > validTo)) return false;
      if (!q) return true;
      return (
        [
          r.user_name,
          r.reason ?? "",
          r.note ?? "",
          r.warehouse_name ?? "",
          r.report_month ?? "",
          String(r.id),
          String(r.amount),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    });
  }, [rows, search, dateFrom, dateTo, showClosed]);

  const totalAmount = useMemo(() => filtered.reduce((s, r) => s + Number(r.amount || 0), 0), [filtered]);

  const onCreate = async () => {
    setError("");
    if (newUserId === "") {
      setError("Выберите сотрудника");
      return;
    }
    const amt = Number(newAmount.replace(",", "."));
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Укажите корректную сумму");
      return;
    }
    setSubmitting(true);
    try {
      await api.reports.createWithholding({
        user_id: Number(newUserId),
        amount: amt,
        warehouse_id: newWhId === "" ? null : Number(newWhId),
        report_month: newMonth.trim() || null,
        reason: newReason.trim() || null,
        note: newNote.trim() || null,
      });
      setNewAmount("");
      setNewMonth("");
      setNewReason("");
      setNewNote("");
      await loadRows();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось добавить удержание");
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async (id: number) => {
    if (!window.confirm("Удалить удержание?")) return;
    setDeleteBusyId(id);
    try {
      await api.reports.deleteWithholding(id);
      await loadRows();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось удалить");
    } finally {
      setDeleteBusyId(null);
    }
  };

  const onCloseRow = async (id: number) => {
    if (!window.confirm("Закрыть удержание? Оно останется в истории, но будет скрыто из списка по умолчанию.")) return;
    setCloseBusyId(id);
    try {
      await api.reports.closeWithholding(id);
      await loadRows();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось закрыть");
    } finally {
      setCloseBusyId(null);
    }
  };

  const onReopenRow = async (id: number) => {
    setCloseBusyId(id);
    try {
      await api.reports.reopenWithholding(id);
      await loadRows();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось открыть удержание");
    } finally {
      setCloseBusyId(null);
    }
  };

  const openEdit = (r: ManualWithholdingRow) => {
    setEditError("");
    if (r.closed) {
      setEditError("Нельзя редактировать закрытое удержание. Сначала откройте его.");
      return;
    }
    setEditRow(r);
    setEditUserId(r.user_id ?? "");
    setEditAmount(String(Number(r.amount || 0)));
    setEditWhId(r.warehouse_id == null ? "" : r.warehouse_id);
    setEditMonth(r.report_month || "");
    setEditReason(r.reason || "");
    setEditNote(r.note || "");
  };

  const closeEdit = () => {
    setEditRow(null);
    setEditError("");
    setEditSubmitting(false);
  };

  const onSaveEdit = async () => {
    if (!editRow) return;
    setEditError("");
    if (editUserId === "") {
      setEditError("Выберите сотрудника");
      return;
    }
    const amt = Number(editAmount.replace(",", "."));
    if (!Number.isFinite(amt) || amt <= 0) {
      setEditError("Укажите корректную сумму");
      return;
    }
    setEditSubmitting(true);
    try {
      await api.reports.updateWithholding(editRow.id, {
        user_id: Number(editUserId),
        amount: amt,
        warehouse_id: editWhId === "" ? null : Number(editWhId),
        report_month: editMonth.trim() || null,
        reason: editReason.trim() || null,
        note: editNote.trim() || null,
      });
      closeEdit();
      await loadRows();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Не удалось сохранить изменения");
    } finally {
      setEditSubmitting(false);
    }
  };

  return (
    <div className="w-full animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Удержание
          </h1>
          <p className="text-sm mt-1 max-w-3xl" style={{ color: "var(--text-secondary)" }}>
            Ручное добавление удержаний по сотрудникам. Погашаются в сменном отчёте в блоке «Удержания» (увеличивают наличные в кассе). На баланс ЦК не влияют.
          </p>
        </div>
        <Link
          to="/reports"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border"
          style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
        >
          К отчётам
        </Link>
      </div>

      <ReportsSubnav active="withholding" />

      <div className="rounded-2xl border p-4 mb-4" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="block text-sm">
            <span style={{ color: "var(--text-secondary)" }}>Сотрудник</span>
            <select
              value={newUserId === "" ? "" : String(newUserId)}
              onChange={(e) => setNewUserId(e.target.value === "" ? "" : Number(e.target.value))}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
            >
              <option value="">—</option>
              {consultants.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.last_name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span style={{ color: "var(--text-secondary)" }}>Сумма удержания</span>
            <input
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm tabular-nums"
              style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
            />
          </label>
          <label className="block text-sm">
            <span style={{ color: "var(--text-secondary)" }}>Точка</span>
            <select
              value={newWhId === "" ? "" : String(newWhId)}
              onChange={(e) => setNewWhId(e.target.value === "" ? "" : Number(e.target.value))}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
            >
              <option value="">—</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span style={{ color: "var(--text-secondary)" }}>Период</span>
            <input
              value={newMonth}
              onChange={(e) => setNewMonth(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
            />
          </label>
          <label className="block text-sm">
            <span style={{ color: "var(--text-secondary)" }}>Причина</span>
            <input
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
            />
          </label>
          <label className="block text-sm md:col-span-2 lg:col-span-3">
            <span style={{ color: "var(--text-secondary)" }}>Комментарий</span>
            <input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
            />
          </label>
        </div>
        {newUserId !== "" ? (
          <div
            className="mt-3 rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
          >
            {salaryBalanceLoading && salaryBalance == null ? (
              <span style={{ color: "var(--text-tertiary)" }}>Загрузка баланса…</span>
            ) : salaryBalance != null ? (
              <div className="flex flex-col gap-1 tabular-nums">
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  <span style={{ color: "var(--text-secondary)" }}>
                    Доступно из ЦК:{" "}
                    <strong style={{ color: "var(--text-primary)" }}>
                      {fmtMoney(
                        Math.max(
                          0,
                          (Number(salaryBalance.central_cash_issued) || 0) -
                            (Number(salaryBalance.vzyala_taken) || 0)
                        )
                      )}{" "}
                      ₽
                    </strong>
                  </span>
                  {(Number(salaryBalance.manual_withholdings) || 0) > BALANCE_EPS ? (
                    <span style={{ color: "var(--text-secondary)" }}>
                      Уже удержано:{" "}
                      <strong style={{ color: "var(--text-primary)" }}>
                        {fmtMoney(Number(salaryBalance.manual_withholdings || 0))} ₽
                      </strong>
                    </span>
                  ) : null}
                  <span style={{ color: "var(--text-secondary)" }}>
                    Текущий баланс:{" "}
                    <strong style={{ color: "var(--text-primary)" }}>
                      {fmtMoney(
                        (Number(salaryBalance.central_cash_issued) || 0) -
                          (Number(salaryBalance.vzyala_taken) || 0)
                      )}{" "}
                      ₽
                    </strong>
                  </span>
                </div>
                {projectedBalance != null ? (
                  <span style={{ color: "var(--text-secondary)" }}>
                    Баланс ЦК (без удержаний):{" "}
                    <strong style={{ color: "var(--text-primary)" }}>
                      {fmtMoney(projectedBalance)} ₽
                    </strong>
                  </span>
                ) : null}
              </div>
            ) : (
              <span style={{ color: "var(--text-tertiary)" }}>Не удалось загрузить баланс</span>
            )}
          </div>
        ) : null}
        {error ? (
          <div className="text-sm mt-3" style={{ color: "var(--error)" }}>
            {error}
          </div>
        ) : null}
        <div className="mt-3">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void onCreate()}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            {submitting ? "Сохранение…" : "Добавить удержание"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
        <div className="p-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex flex-wrap gap-4 text-sm" style={{ color: "var(--text-secondary)" }}>
            <span>
              Строк: <strong style={{ color: "var(--text-primary)" }}>{filtered.length}</strong>
            </span>
            <span>
              Сумма: <strong className="tabular-nums" style={{ color: "var(--text-primary)" }}>{fmtMoney(totalAmount)}</strong>
            </span>
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span style={{ color: "var(--text-secondary)" }}>Дата с</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
              />
            </label>
            <label className="block text-sm">
              <span style={{ color: "var(--text-secondary)" }}>Дата по</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
              />
            </label>
          </div>
          <label className="mt-3 inline-flex items-center gap-2 text-sm select-none">
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
            <span style={{ color: "var(--text-secondary)" }}>Показывать закрытые</span>
          </label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск: сотрудник, причина, период, сумма…"
            className="mt-3 w-full px-3 py-2 rounded-lg border text-sm"
            style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
          />
        </div>
        {loading ? (
          <div className="p-8 text-center" style={{ color: "var(--text-secondary)" }}>Загрузка…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center" style={{ color: "var(--text-secondary)" }}>Нет данных</div>
        ) : (
          <div className="overflow-auto max-h-[72vh]">
            <table className="w-full min-w-[980px] text-sm border-collapse">
              <thead className="sticky top-0 z-10">
                <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}>
                  <th className="text-left px-3 py-2">Дата</th>
                  <th className="text-left px-3 py-2">Сотрудник</th>
                  <th className="text-right px-3 py-2">Сумма</th>
                  <th className="text-left px-3 py-2">Точка</th>
                  <th className="text-left px-3 py-2">Период</th>
                  <th className="text-left px-3 py-2">Причина</th>
                  <th className="text-left px-3 py-2">Комментарий</th>
                  <th className="text-left px-3 py-2">Добавил</th>
                  <th className="text-left px-3 py-2">Статус</th>
                  <th className="text-left px-3 py-2">Действия</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-3 py-2">{fmtDate(r.created_at)}</td>
                    <td className="px-3 py-2">{r.user_name}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoney(r.amount)}</td>
                    <td className="px-3 py-2">{r.warehouse_name || "—"}</td>
                    <td className="px-3 py-2">{r.report_month || "—"}</td>
                    <td className="px-3 py-2">{r.reason || "—"}</td>
                    <td className="px-3 py-2">{r.note || "—"}</td>
                    <td className="px-3 py-2">{r.recorded_by_name || "—"}</td>
                    <td className="px-3 py-2">
                      {r.closed ? (
                        <div className="text-xs leading-snug">
                          <div className="font-semibold" style={{ color: "var(--text-tertiary)" }}>
                            Закрыто
                          </div>
                          {r.closed_at ? (
                            <div className="mt-0.5 tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                              {fmtDate(r.closed_at)}
                            </div>
                          ) : null}
                          {r.closed_by_name ? (
                            <div className="mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                              {r.closed_by_name}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs font-semibold" style={{ color: "#16a34a" }}>
                          Открыто
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {!r.closed ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openEdit(r)}
                            className="text-xs font-medium underline"
                            style={{ color: "var(--accent)" }}
                          >
                            Редактировать
                          </button>
                          <span className="mx-2" style={{ color: "var(--text-tertiary)" }}>
                            ·
                          </span>
                          <button
                            type="button"
                            disabled={closeBusyId === r.id}
                            onClick={() => void onCloseRow(r.id)}
                            className="text-xs font-medium underline disabled:opacity-50"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {closeBusyId === r.id ? "…" : "Закрыть"}
                          </button>
                          <span className="mx-2" style={{ color: "var(--text-tertiary)" }}>
                            ·
                          </span>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={closeBusyId === r.id}
                            onClick={() => void onReopenRow(r.id)}
                            className="text-xs font-medium underline disabled:opacity-50"
                            style={{ color: "var(--accent)" }}
                          >
                            {closeBusyId === r.id ? "…" : "Открыть"}
                          </button>
                          <span className="mx-2" style={{ color: "var(--text-tertiary)" }}>
                            ·
                          </span>
                        </>
                      )}
                      <button
                        type="button"
                        disabled={deleteBusyId === r.id}
                        onClick={() => void onDelete(r.id)}
                        className="text-xs font-medium underline disabled:opacity-50"
                        style={{ color: "var(--error)" }}
                      >
                        {deleteBusyId === r.id ? "…" : "Удалить"}
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
            className="w-full max-w-[720px] rounded-2xl border overflow-hidden"
            style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-center justify-between gap-3" style={{ borderColor: "var(--border)" }}>
              <div className="font-bold" style={{ color: "var(--text-primary)" }}>
                Редактирование удержания #{editRow.id}
              </div>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg text-sm border"
                style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                onClick={closeEdit}
              >
                Закрыть
              </button>
            </div>

            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span style={{ color: "var(--text-secondary)" }}>Сотрудник</span>
                  <select
                    value={editUserId === "" ? "" : String(editUserId)}
                    onChange={(e) => setEditUserId(e.target.value === "" ? "" : Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                  >
                    <option value="">—</option>
                    {consultants.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.last_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span style={{ color: "var(--text-secondary)" }}>Сумма удержания</span>
                  <input
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm tabular-nums"
                    style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                  />
                </label>
                <label className="block text-sm">
                  <span style={{ color: "var(--text-secondary)" }}>Точка</span>
                  <select
                    value={editWhId === "" ? "" : String(editWhId)}
                    onChange={(e) => setEditWhId(e.target.value === "" ? "" : Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                  >
                    <option value="">—</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span style={{ color: "var(--text-secondary)" }}>Период</span>
                  <input
                    value={editMonth}
                    onChange={(e) => setEditMonth(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                  />
                </label>
                <label className="block text-sm md:col-span-2">
                  <span style={{ color: "var(--text-secondary)" }}>Причина</span>
                  <input
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                  />
                </label>
                <label className="block text-sm md:col-span-2">
                  <span style={{ color: "var(--text-secondary)" }}>Комментарий</span>
                  <input
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                  />
                </label>
              </div>

              {editError ? (
                <div className="text-sm mt-3" style={{ color: "var(--error)" }}>
                  {editError}
                </div>
              ) : null}

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg text-sm font-medium border"
                  style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                  onClick={closeEdit}
                  disabled={editSubmitting}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: "var(--accent)" }}
                  disabled={editSubmitting}
                  onClick={() => void onSaveEdit()}
                >
                  {editSubmitting ? "Сохранение…" : "Сохранить"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

