import type { ReportItem } from "../api";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseYmdParam(v: string | null, fallback: string): string {
  if (v && YMD_RE.test(v)) return v;
  return fallback;
}

export function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Календарный день смены по моменту отправки/создания (Europe/Moscow), не локальный браузер. */
export function reportBusinessDayYmd(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
}

/** День отчёта по моменту отправки / создания — календарная дата в Europe/Moscow. */
export function reportDayKey(r: ReportItem): string | null {
  const t = r.submitted_at ?? r.created_at;
  if (!t) return null;
  const ymd = reportBusinessDayYmd(t);
  return ymd || null;
}

export function enumerateDays(from: string, to: string): string[] {
  if (from > to) return [];
  const out: string[] = [];
  const cur = new Date(from + "T12:00:00");
  const end = new Date(to + "T12:00:00");
  while (cur <= end) {
    out.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`
    );
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function filterReportsByDateRange(reports: ReportItem[], from: string, to: string): ReportItem[] {
  return reports.filter((r) => {
    const d = reportDayKey(r);
    if (!d) return false;
    return d >= from && d <= to;
  });
}

export function ymdFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type DatePresetId = "week" | "month" | "quarter" | "year";

/** Календарные границы: неделя пн–вс, месяц, квартал, год (год — с 1 янв. по 31 дек. года якорной даты). */
export function dateRangeFromPreset(preset: DatePresetId, anchor: Date = new Date()): { from: string; to: string } {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const day = anchor.getDate();

  switch (preset) {
    case "week": {
      const dow = anchor.getDay();
      const diffToMonday = dow === 0 ? -6 : 1 - dow;
      const monday = new Date(anchor);
      monday.setDate(day + diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: ymdFromDate(monday), to: ymdFromDate(sunday) };
    }
    case "month": {
      const from = new Date(y, m, 1);
      const to = new Date(y, m + 1, 0);
      return { from: ymdFromDate(from), to: ymdFromDate(to) };
    }
    case "quarter": {
      const q = Math.floor(m / 3);
      const from = new Date(y, q * 3, 1);
      const to = new Date(y, q * 3 + 3, 0);
      return { from: ymdFromDate(from), to: ymdFromDate(to) };
    }
    case "year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    default:
      return { from: ymdFromDate(anchor), to: ymdFromDate(anchor) };
  }
}

/** Предыдущий отрезок той же длины (дней), сразу перед `from` — для быстрого сравнения «с прошлым». */
export function previousRangeSameLength(from: string, to: string): { from: string; to: string } {
  const start = new Date(from + "T12:00:00");
  const end = new Date(to + "T12:00:00");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return { from, to };
  }
  const days =
    Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));
  return { from: ymdFromDate(prevStart), to: ymdFromDate(prevEnd) };
}

/** Сводка по отчётам для KPI. */
export function aggregateReportMoney(rows: ReportItem[]) {
  const n = rows.length;
  const revenue = rows.reduce((a, r) => a + (Number(r.revenue) || 0), 0);
  const nal = rows.reduce((a, r) => a + (Number(r.nal) || 0), 0);
  const bn = rows.reduce((a, r) => a + (Number(r.bn) || 0), 0);
  return { count: n, revenue, nal, bn };
}

export function deltaPct(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "0%" : "—";
  const p = ((current - previous) / previous) * 100;
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toFixed(1)}%`;
}

/** Две серии по дням с разной длиной → общая ось «день 1…N» для одного графика. */
export function normalizeDailySeriesToIndex(
  a: { label: string; value: number }[],
  b: { label: string; value: number }[]
): { a: { label: string; value: number }[]; b: { label: string; value: number }[]; maxLen: number } {
  const len = Math.max(a.length, b.length, 1);
  const outA: { label: string; value: number }[] = [];
  const outB: { label: string; value: number }[] = [];
  for (let i = 0; i < len; i++) {
    const lab = `${i + 1}`;
    outA.push({ label: lab, value: a[i]?.value ?? 0 });
    outB.push({ label: lab, value: b[i]?.value ?? 0 });
  }
  return { a: outA, b: outB, maxLen: len };
}

