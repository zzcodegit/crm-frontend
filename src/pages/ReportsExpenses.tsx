import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type ExpenseSummaryResponse, type ReportItem, type WarehouseItem } from "../api";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseYmdParam(v: string | null, fallback: string): string {
  if (v && YMD_RE.test(v)) return v;
  return fallback;
}

const fmtRub = (n: number) =>
  n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ReportsExpenses() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [me, setMe] = useState<{ is_admin?: boolean; is_manager?: boolean; is_consultant?: boolean } | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [summary, setSummary] = useState<ExpenseSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  useEffect(() => {
    if (me === null) return;
    setLoading(true);
    setError("");
    api.reports
      .expensesSummary({
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

  const rowsNonZero = summary?.rows.filter((r) => r.total_amount !== 0) ?? [];
  const showAllArticles = summary?.rows ?? [];

  return (
    <div className="max-w-6xl mx-auto w-full animate-slide-in">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
            Отчёт по расходам
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Суммы по{" "}
            <Link to="/settings/references/expense-articles" className="underline font-medium" style={{ color: "var(--accent)" }}>
              статьям расходов
            </Link>{" "}
            из отправленных сменных отчётов за выбранный период. Ниже — детализация по каждой строке расхода: дата отчёта, торговая точка, продавец (автор отчёта).
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
              Торговая точка (склад)
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
              aria-label="Фильтр по торговой точке: все или одна"
            >
              <option value="">Все точки (сумма по всем)</option>
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
            Итого по статьям
          </h2>
          {summary && !loading && (
            <div className="text-sm mt-1 space-y-0.5" style={{ color: "var(--text-secondary)" }}>
              <p>
                Период:{" "}
                {new Date(summary.date_from + "T12:00:00").toLocaleDateString("ru-RU")} —{" "}
                {new Date(summary.date_to + "T12:00:00").toLocaleDateString("ru-RU")}
              </p>
              <p>
                {pointName ? (
                  <>
                    По точке: <strong style={{ color: "var(--text-primary)" }}>{pointName}</strong>
                  </>
                ) : (
                  <>
                    По точкам: <strong style={{ color: "var(--text-primary)" }}>все</strong> (сводка по статьям; детализация по точкам и датам — в таблице ниже)
                  </>
                )}
              </p>
            </div>
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
                        Статья расхода
                      </th>
                      <th className="text-right py-2 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                        Сумма
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rowsNonZero.length > 0 ? rowsNonZero : showAllArticles).map((r) => (
                      <tr key={`${r.expense_article_id}-${r.expense_article_name}`} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="py-2.5 pr-4" style={{ color: "var(--text-primary)" }}>
                          {r.expense_article_name}
                        </td>
                        <td className="py-2.5 text-right font-medium tabular-nums" style={{ color: "var(--text-primary)" }}>
                          {fmtRub(r.total_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--border)" }}>
                      <td className="py-3 font-bold" style={{ color: "var(--text-primary)" }}>
                        Всего
                      </td>
                      <td className="py-3 text-right font-bold tabular-nums" style={{ color: "var(--accent)" }}>
                        {fmtRub(summary.grand_total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {(summary.detail_rows?.length ?? 0) > 0 && (
                <div className="mt-8 pt-6 border-t" style={{ borderColor: "var(--border)" }}>
                  <h3 className="text-base font-bold mb-3" style={{ color: "var(--text-primary)" }}>
                    Детализация по отчётам
                  </h3>
                  <div className="overflow-x-auto -mx-1">
                    <table className="w-full text-sm min-w-[640px]">
                      <thead>
                        <tr>
                          <th className="text-left py-2 pr-3 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                            Дата
                          </th>
                          <th className="text-left py-2 pr-3" style={{ color: "var(--text-secondary)" }}>
                            Точка
                          </th>
                          <th className="text-left py-2 pr-3" style={{ color: "var(--text-secondary)" }}>
                            Продавец
                          </th>
                          <th className="text-left py-2 pr-3" style={{ color: "var(--text-secondary)" }}>
                            Статья
                          </th>
                          <th className="text-right py-2 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                            Сумма
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.detail_rows!.map((row, idx) => (
                          <tr key={`${row.report_date}-${row.warehouse_name}-${row.seller_name}-${row.expense_article_id}-${idx}`} style={{ borderTop: "1px solid var(--border)" }}>
                            <td className="py-2 pr-3 whitespace-nowrap align-top" style={{ color: "var(--text-primary)" }}>
                              {new Date(`${row.report_date}T12:00:00`).toLocaleDateString("ru-RU")}
                            </td>
                            <td className="py-2 pr-3 align-top" style={{ color: "var(--text-primary)" }}>
                              {row.warehouse_name}
                            </td>
                            <td className="py-2 pr-3 align-top" style={{ color: "var(--text-primary)" }}>
                              {row.seller_name}
                            </td>
                            <td className="py-2 pr-3 align-top" style={{ color: "var(--text-secondary)" }}>
                              {row.expense_article_name}
                            </td>
                            <td className="py-2 text-right font-medium tabular-nums align-top" style={{ color: "var(--text-primary)" }}>
                              {fmtRub(row.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: "2px solid var(--border)" }}>
                          <td colSpan={4} className="py-2.5 font-bold" style={{ color: "var(--text-primary)" }}>
                            Итого по строкам
                          </td>
                          <td className="py-2.5 text-right font-bold tabular-nums" style={{ color: "var(--accent)" }}>
                            {fmtRub(summary.detail_rows!.reduce((s, x) => s + x.amount, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {rowsNonZero.length === 0 && summary.grand_total === 0 && (
                <p className="text-sm mt-3" style={{ color: "var(--text-tertiary)" }}>
                  За выбранный период расходов по отчётам нет (или не заполнены статьи).
                </p>
              )}
              {rowsNonZero.length > 0 && showAllArticles.length > rowsNonZero.length && (
                <p className="text-xs mt-3" style={{ color: "var(--text-tertiary)" }}>
                  Показаны только статьи с ненулевой суммой. Остальные статьи справочника за период не использовались.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
