import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type EncashmentSummaryResponse, type ReportItem, type WarehouseItem } from "../api";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseYmdParam(v: string | null, fallback: string): string {
  if (v && YMD_RE.test(v)) return v;
  return fallback;
}

const fmtMoney = (n: number) =>
  n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Даты отчётов с инкассацией по точке за период */
function fmtReportDates(isoDates: string[] | undefined): string {
  if (!isoDates?.length) return "—";
  return isoDates
    .map((d) => new Date(`${d}T12:00:00`).toLocaleDateString("ru-RU"))
    .join(", ");
}

function fmtSellerNames(names: string[] | undefined): string {
  if (!names?.length) return "—";
  return names.join(", ");
}

export default function ReportsEncashment() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [me, setMe] = useState<{ is_admin?: boolean; is_manager?: boolean; is_consultant?: boolean } | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [summary, setSummary] = useState<EncashmentSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionWarehouseId, setActionWarehouseId] = useState<number | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  const todayLocalStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const today = todayLocalStr();
  let dateFrom = parseYmdParam(searchParams.get("from"), today);
  let dateTo = parseYmdParam(searchParams.get("to"), today);
  if (dateFrom > dateTo) {
    const t = dateFrom;
    dateFrom = dateTo;
    dateTo = t;
  }
  const pointName = searchParams.get("point")?.trim() || null;

  const setFilters = (mut: (p: URLSearchParams) => void) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        mut(next);
        return next;
      },
      { replace: true }
    );
  };

  useEffect(() => {
    api.getMe().then(setMe).catch(() => setMe(null));
  }, []);

  useEffect(() => {
    if (me === null) return;
    Promise.all([api.reports.list(), api.ref.warehouses.list()])
      .then(([reps, whs]) => {
        setReports(reps);
        setWarehouses(whs);
      })
      .catch(() => {
        setReports([]);
        setWarehouses([]);
      });
  }, [me]);

  const canSeeAllPoints = me?.is_admin === true;
  const displayWarehouses = useMemo((): { id: number; name: string }[] => {
    if (canSeeAllPoints) {
      return [...warehouses].sort((a, b) => a.name.localeCompare(b.name)).map((w) => ({ id: w.id, name: w.name }));
    }
    const whIds = new Set(reports.map((r) => r.warehouse_id).filter((id): id is number => id != null));
    return [...warehouses]
      .filter((w) => whIds.has(w.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((w) => ({ id: w.id, name: w.name }));
  }, [warehouses, reports, canSeeAllPoints]);

  const warehouseIdForApi = useMemo(() => {
    if (!pointName) return null;
    const w = displayWarehouses.find((x) => x.name === pointName);
    return w?.id ?? null;
  }, [pointName, displayWarehouses]);

  const loadSummary = useCallback(() => {
    if (me === null) return;
    setLoading(true);
    setError("");
    api.reports
      .encashmentSummary({
        dateFrom,
        dateTo,
        warehouseId: warehouseIdForApi,
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      })
      .then(setSummary)
      .catch((e) => {
        setSummary(null);
        setError(e instanceof Error ? e.message : "Не удалось загрузить отчёт");
      })
      .finally(() => setLoading(false));
  }, [me, dateFrom, dateTo, warehouseIdForApi]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const canMarkReceived = me?.is_admin === true || me?.is_manager === true;

  const refreshSummaryQuiet = useCallback(async () => {
    if (me === null) return;
    try {
      const s = await api.reports.encashmentSummary({
        dateFrom,
        dateTo,
        warehouseId: warehouseIdForApi,
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      });
      setSummary(s);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось обновить отчёт");
    }
  }, [me, dateFrom, dateTo, warehouseIdForApi]);

  const handleMarkReceived = async (warehouseId: number) => {
    setActionWarehouseId(warehouseId);
    setError("");
    try {
      await api.reports.markEncashmentReceived({ warehouseId, dateFrom, dateTo });
      await refreshSummaryQuiet();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить отметку");
    } finally {
      setActionWarehouseId(null);
    }
  };

  const handleUnmarkReceived = async (warehouseId: number) => {
    if (!window.confirm("Снять отметку «получено» для этой точки за выбранный период?")) return;
    setActionWarehouseId(warehouseId);
    setError("");
    try {
      await api.reports.unmarkEncashmentReceived({ warehouseId, dateFrom, dateTo });
      await refreshSummaryQuiet();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось снять отметку");
    } finally {
      setActionWarehouseId(null);
    }
  };

  const rowsWithAmount = summary?.rows.filter((r) => r.total_nal !== 0 || r.total_bn !== 0 || r.total !== 0) ?? [];
  const tableRows = rowsWithAmount.length > 0 ? rowsWithAmount : summary?.rows ?? [];

  return (
    <div className="max-w-5xl mx-auto w-full animate-slide-in">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
            Отчёт по инкассации
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Суммы инкассации (наличные и безнал) по точкам из отправленных сменных отчётов за период. Данные как в колонках «Инкасс. нал» и «Инкасс. бн» в{" "}
            <Link to="/reports" className="underline font-medium" style={{ color: "var(--accent)" }}>
              общей таблице отчётов
            </Link>
            . Администратор и менеджер могут отмечать инкассацию как полученную за выбранные даты по каждой точке.
          </p>
        </div>
        <Link
          to={{ pathname: "/reports", search: searchParams.toString() ? `?${searchParams.toString()}` : "" }}
          className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
        >
          ← К списку отчётов
        </Link>
      </div>

      <div className="rounded-2xl p-5 mb-6 border shadow-sm" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              С даты
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                const v = e.target.value;
                setFilters((p) => {
                  p.set("from", v);
                  const to = p.get("to");
                  if (to && v > to) p.set("to", v);
                });
              }}
              className="px-3 py-2 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-[var(--accent)]"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              По дату
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                const v = e.target.value;
                setFilters((p) => {
                  p.set("to", v);
                  const from = p.get("from");
                  if (from && v < from) p.set("from", v);
                });
              }}
              className="px-3 py-2 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-[var(--accent)]"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Точка
            </label>
            <select
              value={pointName ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setFilters((p) => {
                  if (!v) p.delete("point");
                  else p.set("point", v);
                });
              }}
              className="min-w-[220px] px-3 py-2 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-[var(--accent)]"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              <option value="">Все точки</option>
              {displayWarehouses.map((w) => (
                <option key={w.id} value={w.name}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-xl text-sm" style={{ background: "var(--error-light,#fee2e2)", color: "var(--error,#b91c1c)" }}>
          {error}
        </div>
      )}

      <div className="rounded-2xl overflow-hidden border shadow-sm" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
            Итого по точкам
          </h2>
          {summary && !loading && (
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              Период:{" "}
              {new Date(summary.date_from + "T12:00:00").toLocaleDateString("ru-RU")} —{" "}
              {new Date(summary.date_to + "T12:00:00").toLocaleDateString("ru-RU")}
              {pointName ? ` · точка: ${pointName}` : ""}
            </p>
          )}
        </div>
        <div className="p-5">
          {loading ? (
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Загрузка…
            </div>
          ) : !summary ? (
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Нет данных
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left py-2 pr-4" style={{ color: "var(--text-secondary)" }}>
                        Точка
                      </th>
                      <th className="text-left py-2 pr-4 min-w-[120px]" style={{ color: "var(--text-secondary)" }}>
                        Дата
                      </th>
                      <th className="text-left py-2 pr-4 min-w-[100px]" style={{ color: "var(--text-secondary)" }}>
                        Продавец
                      </th>
                      <th className="text-right py-2 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                        Наличные
                      </th>
                      <th className="text-right py-2 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                        Безнал
                      </th>
                      <th className="text-right py-2 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                        Всего
                      </th>
                      <th className="text-left py-2 pl-4 min-w-[200px]" style={{ color: "var(--text-secondary)" }}>
                        Получено
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((r, idx) => (
                      <Fragment key={`${r.report_id ?? "row"}-${r.warehouse_id}-${idx}`}>
                      <tr style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="py-2.5 pr-4 font-medium" style={{ color: "var(--text-primary)" }}>
                          {r.warehouse_name}
                          {(r.report_items?.length ?? 0) > 1 ? (
                            <button
                              type="button"
                              className="ml-2 text-xs underline"
                              style={{ color: "var(--accent)" }}
                              onClick={() =>
                                setExpandedRows((prev) => ({
                                  ...prev,
                                  [r.warehouse_id]: !prev[r.warehouse_id],
                                }))
                              }
                            >
                              {expandedRows[r.warehouse_id] ? "Скрыть" : `Показать (${r.report_items?.length ?? 0})`}
                            </button>
                          ) : null}
                        </td>
                        <td className="py-2.5 pr-4 text-xs align-top" style={{ color: "var(--text-secondary)" }}>
                          {(r.report_items?.length ?? 0) > 1
                            ? `Несколько (${r.report_items?.length ?? 0})`
                            : fmtReportDates(r.report_dates)}
                        </td>
                        <td className="py-2.5 pr-4 text-xs align-top" style={{ color: "var(--text-primary)" }}>
                          {(r.report_items?.length ?? 0) > 1 ? "Несколько" : fmtSellerNames(r.seller_names)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums" style={{ color: "var(--text-primary)" }}>
                          {fmtMoney(r.total_nal)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums" style={{ color: "var(--text-primary)" }}>
                          {fmtMoney(r.total_bn)}
                        </td>
                        <td className="py-2.5 text-right font-medium tabular-nums" style={{ color: "var(--text-primary)" }}>
                          {fmtMoney(r.total)}
                        </td>
                        <td className="py-2.5 pl-4 align-top">
                          {r.received ? (
                            <div className="space-y-1.5">
                              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                                {r.received_at
                                  ? new Date(r.received_at).toLocaleString("ru-RU", {
                                      day: "2-digit",
                                      month: "2-digit",
                                      year: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "—"}
                                {r.received_by_name ? ` · ${r.received_by_name}` : ""}
                              </div>
                              {canMarkReceived && (
                                <button
                                  type="button"
                                  disabled={actionWarehouseId === r.warehouse_id}
                                  onClick={() => handleUnmarkReceived(r.warehouse_id)}
                                  className="text-xs font-medium px-2.5 py-1 rounded-lg border transition-opacity disabled:opacity-50"
                                  style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                                >
                                  {actionWarehouseId === r.warehouse_id ? "…" : "Снять отметку"}
                                </button>
                              )}
                            </div>
                          ) : canMarkReceived ? (
                            <button
                              type="button"
                              disabled={actionWarehouseId === r.warehouse_id}
                              onClick={() => handleMarkReceived(r.warehouse_id)}
                              className="text-sm font-medium px-3 py-1.5 rounded-lg transition-opacity disabled:opacity-50"
                              style={{ background: "var(--accent)", color: "#fff" }}
                            >
                              {actionWarehouseId === r.warehouse_id ? "Сохранение…" : "Получено"}
                            </button>
                          ) : (
                            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                      {expandedRows[r.warehouse_id] && (r.report_items?.length ?? 0) > 1 ? (
                        <tr key={`details-${r.warehouse_id}-${idx}`} style={{ borderTop: "1px dashed var(--border)" }}>
                          <td className="py-2 pl-4 pr-2" colSpan={7}>
                            <div className="rounded-lg p-3 text-xs" style={{ background: "var(--bg-secondary)" }}>
                              <div className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>Детализация инкассаций</div>
                              <div className="space-y-1">
                                {(r.report_items || []).map((it) => (
                                  <div key={`${r.warehouse_id}-${it.report_id}`} className="flex flex-wrap gap-3 justify-between" style={{ color: "var(--text-secondary)" }}>
                                    <span>{new Date(`${it.report_date}T12:00:00`).toLocaleDateString("ru-RU")} · {it.seller_name || "—"}</span>
                                    <span style={{ color: "var(--text-primary)" }}>
                                      Нал: {fmtMoney(it.nal)} · Б/н: {fmtMoney(it.bn)} · Итого: {fmtMoney(it.total)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--border)" }}>
                      <td className="py-3 font-bold" style={{ color: "var(--text-primary)" }}>
                        Всего
                      </td>
                      <td className="py-3" style={{ color: "var(--text-tertiary)" }} />
                      <td className="py-3" style={{ color: "var(--text-tertiary)" }} />
                      <td className="py-3 text-right font-bold tabular-nums" style={{ color: "var(--accent)" }}>
                        {fmtMoney(summary.grand_total_nal)}
                      </td>
                      <td className="py-3 text-right font-bold tabular-nums" style={{ color: "var(--accent)" }}>
                        {fmtMoney(summary.grand_total_bn)}
                      </td>
                      <td className="py-3 text-right font-bold tabular-nums" style={{ color: "var(--accent)" }}>
                        {fmtMoney(summary.grand_total)}
                      </td>
                      <td className="py-3 pl-4" style={{ color: "var(--text-tertiary)" }}>
                        <span className="text-xs">По точкам</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {summary.rows.length === 0 && summary.grand_total === 0 && (
                <p className="text-sm mt-3" style={{ color: "var(--text-tertiary)" }}>
                  За выбранный период нет отчётов с заполненной инкассацией.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
