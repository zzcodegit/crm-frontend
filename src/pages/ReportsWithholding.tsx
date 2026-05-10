import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { ManualWithholdingRow, RefItem } from "../api";

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
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
  }, [rows, search]);

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

  return (
    <div className="w-full animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Удержание
          </h1>
          <p className="text-sm mt-1 max-w-3xl" style={{ color: "var(--text-secondary)" }}>
            Ручное добавление удержаний по сотрудникам. Не связано с блоком «Взято» в отчётах.
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
    </div>
  );
}

