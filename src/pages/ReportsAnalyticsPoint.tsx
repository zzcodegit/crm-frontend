import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type ReportItem, type WarehouseItem } from "../api";
import { ReportsAnalyticsDateToolbar } from "../components/ReportsAnalyticsDateToolbar";
import { BarChartHorizontal, LineChartSeries } from "../components/ReportCharts";
import {
  aggregateReportMoney,
  deltaPct,
  enumerateDays,
  filterReportsByDateRange,
  normalizeDailySeriesToIndex,
  parseYmdParam,
  reportDayKey,
  todayYmd,
} from "./reportsAnalyticsUtils";

export default function ReportsAnalyticsPoint() {
  const [searchParams, setSearchParams] = useSearchParams();
  const today = todayYmd();
  const from = parseYmdParam(searchParams.get("from"), today);
  const to = parseYmdParam(searchParams.get("to"), today);
  const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
  const cfromRaw = searchParams.get("cfrom");
  const ctoRaw = searchParams.get("cto");
  const cfrom = cfromRaw && YMD_RE.test(cfromRaw) ? cfromRaw : null;
  const cto = ctoRaw && YMD_RE.test(ctoRaw) ? ctoRaw : null;
  const compareEnabled = cfrom != null && cto != null;
  const pointName = searchParams.get("point")?.trim() || "";

  const [reports, setReports] = useState<ReportItem[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr("");
    Promise.all([api.reports.list(), api.ref.warehouses.list()])
      .then(([r, w]) => {
        if (!cancelled) {
          setReports(r.filter((x) => !x.is_draft));
          setWarehouses(w);
        }
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Ошибка загрузки");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    let list = filterReportsByDateRange(reports, from, to);
    if (pointName) {
      list = list.filter((r) => r.warehouse_name === pointName);
    }
    return list;
  }, [reports, from, to, pointName]);

  const filteredCompare = useMemo(() => {
    if (!compareEnabled || cfrom == null || cto == null) return [];
    let list = filterReportsByDateRange(reports, cfrom, cto);
    if (pointName) {
      list = list.filter((r) => r.warehouse_name === pointName);
    }
    return list;
  }, [reports, cfrom, cto, pointName, compareEnabled]);

  const days = useMemo(() => enumerateDays(from, to), [from, to]);
  const daysCompare = useMemo(
    () => (compareEnabled && cfrom != null && cto != null ? enumerateDays(cfrom, cto) : []),
    [compareEnabled, cfrom, cto]
  );

  const byDayRevenue = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of days) map.set(d, 0);
    for (const r of filtered) {
      const d = reportDayKey(r);
      if (!d || !map.has(d)) continue;
      map.set(d, (map.get(d) ?? 0) + (Number(r.revenue) || 0));
    }
    return days.map((d) => ({ label: d, value: map.get(d) ?? 0 }));
  }, [filtered, days]);

  const byDayRevenueCompare = useMemo(() => {
    if (!compareEnabled) return [] as { label: string; value: number }[];
    const map = new Map<string, number>();
    for (const d of daysCompare) map.set(d, 0);
    for (const r of filteredCompare) {
      const d = reportDayKey(r);
      if (!d || !map.has(d)) continue;
      map.set(d, (map.get(d) ?? 0) + (Number(r.revenue) || 0));
    }
    return daysCompare.map((d) => ({ label: d, value: map.get(d) ?? 0 }));
  }, [filteredCompare, daysCompare, compareEnabled]);

  const byDayNalBn = useMemo(() => {
    const mapN = new Map<string, number>();
    const mapB = new Map<string, number>();
    for (const d of days) {
      mapN.set(d, 0);
      mapB.set(d, 0);
    }
    for (const r of filtered) {
      const d = reportDayKey(r);
      if (!d || !mapN.has(d)) continue;
      mapN.set(d, (mapN.get(d) ?? 0) + (Number(r.nal) || 0));
      mapB.set(d, (mapB.get(d) ?? 0) + (Number(r.bn) || 0));
    }
    return {
      nal: days.map((d) => ({ label: d, value: mapN.get(d) ?? 0 })),
      bn: days.map((d) => ({ label: d, value: mapB.get(d) ?? 0 })),
    };
  }, [filtered, days]);

  const byDayNalBnCompare = useMemo(() => {
    if (!compareEnabled) {
      return { nal: [] as { label: string; value: number }[], bn: [] as { label: string; value: number }[] };
    }
    const mapN = new Map<string, number>();
    const mapB = new Map<string, number>();
    for (const d of daysCompare) {
      mapN.set(d, 0);
      mapB.set(d, 0);
    }
    for (const r of filteredCompare) {
      const d = reportDayKey(r);
      if (!d || !mapN.has(d)) continue;
      mapN.set(d, (mapN.get(d) ?? 0) + (Number(r.nal) || 0));
      mapB.set(d, (mapB.get(d) ?? 0) + (Number(r.bn) || 0));
    }
    return {
      nal: daysCompare.map((d) => ({ label: d, value: mapN.get(d) ?? 0 })),
      bn: daysCompare.map((d) => ({ label: d, value: mapB.get(d) ?? 0 })),
    };
  }, [filteredCompare, daysCompare, compareEnabled]);

  const revenueSeriesDual = useMemo(() => {
    if (!compareEnabled || byDayRevenue.length === 0 || byDayRevenueCompare.length === 0) return null;
    const { a, b } = normalizeDailySeriesToIndex(byDayRevenue, byDayRevenueCompare);
    return [
      { name: `Выбранный период (${from} — ${to})`, color: "var(--accent)", data: a },
      { name: `Сравнение (${cfrom} — ${cto})`, color: "#f97316", data: b },
    ];
  }, [compareEnabled, byDayRevenue, byDayRevenueCompare, from, to, cfrom, cto]);

  const nalSeriesDual = useMemo(() => {
    if (!compareEnabled || byDayNalBn.nal.length === 0) return null;
    const { a, b } = normalizeDailySeriesToIndex(byDayNalBn.nal, byDayNalBnCompare.nal);
    return [
      { name: `Нал, ${from}—${to}`, color: "#16a34a", data: a },
      { name: `Нал, ${cfrom}—${cto}`, color: "#86efac", data: b },
    ];
  }, [compareEnabled, byDayNalBn.nal, byDayNalBnCompare.nal, from, to, cfrom, cto]);

  const bnSeriesDual = useMemo(() => {
    if (!compareEnabled || byDayNalBn.bn.length === 0) return null;
    const { a, b } = normalizeDailySeriesToIndex(byDayNalBn.bn, byDayNalBnCompare.bn);
    return [
      { name: `Безнал, ${from}—${to}`, color: "#2563eb", data: a },
      { name: `Безнал, ${cfrom}—${cto}`, color: "#93c5fd", data: b },
    ];
  }, [compareEnabled, byDayNalBn.bn, byDayNalBnCompare.bn, from, to, cfrom, cto]);

  const revenueByWarehouse = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filterReportsByDateRange(reports, from, to)) {
      const name = r.warehouse_name?.trim() || "—";
      map.set(name, (map.get(name) ?? 0) + (Number(r.revenue) || 0));
    }
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [reports, from, to]);

  const kpis = useMemo(() => {
    const n = filtered.length;
    const rev = filtered.reduce((a, r) => a + (Number(r.revenue) || 0), 0);
    const nal = filtered.reduce((a, r) => a + (Number(r.nal) || 0), 0);
    const bn = filtered.reduce((a, r) => a + (Number(r.bn) || 0), 0);
    return {
      count: n,
      revenue: rev,
      nal,
      bn,
      avg: n > 0 ? rev / n : 0,
    };
  }, [filtered]);

  const kpisCompare = useMemo(
    () => (compareEnabled ? aggregateReportMoney(filteredCompare) : null),
    [compareEnabled, filteredCompare]
  );

  const setParam = (key: string, value: string | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value == null || value === "") next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true }
    );
  };

  const setParams = (mut: (p: URLSearchParams) => void) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        mut(next);
        return next;
      },
      { replace: true }
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-slide-in pb-10">
      <div>
        <Link to={`/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`} className="text-sm font-medium hover:opacity-80" style={{ color: "var(--accent)" }}>
          ← Отчёты
        </Link>
        <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--text-primary)" }}>
          Аналитика по точке
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Динамика выручки и оплат, сводка по выбранному складу за период. Только для администратора.
        </p>
      </div>

      <ReportsAnalyticsDateToolbar
        from={from}
        to={to}
        cfrom={compareEnabled ? cfrom : null}
        cto={compareEnabled ? cto : null}
        setParams={setParams}
        compareEnabled={compareEnabled}
      />

      <div className="flex flex-wrap gap-3 items-end rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
        <label className="flex flex-col gap-1 text-xs font-medium min-w-[200px] flex-1" style={{ color: "var(--text-secondary)" }}>
          Точка (склад)
          <select
            value={pointName}
            onChange={(e) => setParam("point", e.target.value || null)}
            className="px-3 py-2 rounded-lg text-sm border w-full"
            style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          >
            <option value="">Все точки (фильтр только для графиков ниже — выберите точку)</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.name}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div style={{ color: "var(--text-secondary)" }}>Загрузка…</div>
      ) : err ? (
        <div style={{ color: "var(--error)" }}>{err}</div>
      ) : !pointName ? (
        <div className="rounded-xl border p-6 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
          Выберите точку в списке выше, чтобы увидеть детальную динамику по одному складу. Ниже — сравнение выручки по всем точкам за период.
        </div>
      ) : null}

      {pointName && !loading && !err && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(
              [
                { label: "Отчётов", cur: kpis.count, prev: kpisCompare?.count ?? 0, money: false },
                { label: "Выручка, ₽", cur: kpis.revenue, prev: kpisCompare?.revenue ?? 0, money: true },
                { label: "Наличные, ₽", cur: kpis.nal, prev: kpisCompare?.nal ?? 0, money: true },
                { label: "Безнал, ₽", cur: kpis.bn, prev: kpisCompare?.bn ?? 0, money: true },
              ] as const
            ).map((x) => {
              const fmt = (n: number) =>
                x.money ? n.toLocaleString("ru-RU", { maximumFractionDigits: 0 }) : String(n);
              const dlt = compareEnabled && kpisCompare ? deltaPct(x.cur, x.prev) : null;
              return (
                <div key={x.label} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
                  <div className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>
                    {x.label}
                  </div>
                  <div className="text-lg font-bold tabular-nums mt-1" style={{ color: "var(--text-primary)" }}>
                    {fmt(x.cur)}
                  </div>
                  {compareEnabled && kpisCompare && (
                    <div className="text-xs mt-2 space-y-0.5 tabular-nums" style={{ color: "var(--text-secondary)" }}>
                      <div>
                        сравн.: <span style={{ color: "var(--text-primary)" }}>{fmt(x.prev)}</span>
                      </div>
                      {dlt != null && (
                        <div style={{ color: dlt.startsWith("+") ? "#16a34a" : dlt.startsWith("—") ? "var(--text-tertiary)" : "#dc2626" }}>{dlt}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {revenueSeriesDual ? (
            <LineChartSeries
              title={`Выручка по дням — ${pointName} (ось: день 1…N внутри каждого периода)`}
              series={revenueSeriesDual}
              formatY={(v) => v.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}
            />
          ) : (
            <LineChartSeries
              title={`Выручка по дням — ${pointName}`}
              series={[{ name: "Выручка", color: "var(--accent)", data: byDayRevenue }]}
              formatY={(v) => v.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}
            />
          )}

          {nalSeriesDual && bnSeriesDual ? (
            <>
              <LineChartSeries title="Наличные по дням (сравнение периодов)" series={nalSeriesDual} />
              <LineChartSeries title="Безнал по дням (сравнение периодов)" series={bnSeriesDual} />
            </>
          ) : (
            <LineChartSeries
              title="Наличные и безнал по дням"
              series={[
                { name: "Наличные", color: "#16a34a", data: byDayNalBn.nal },
                { name: "Безнал", color: "#2563eb", data: byDayNalBn.bn },
              ]}
            />
          )}
        </>
      )}

      {!loading && !err && (
        <BarChartHorizontal
          title="Выручка по точкам за период (все склады)"
          hint="Сортировка по убыванию выручки. При большом числе точек используйте прокрутку списка."
          rows={revenueByWarehouse}
          color="var(--accent)"
        />
      )}
    </div>
  );
}
