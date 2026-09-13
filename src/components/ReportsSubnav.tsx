import { Link, useLocation } from "react-router-dom";

export type ReportsSubnavKey =
  | "expenses"
  | "encashment"
  | "central-cash"
  | "analytics-point"
  | "analytics-consultant"
  | "debts"
  | "withholding";

const ITEMS: {
  key: ReportsSubnavKey;
  label: string;
  pathname: string;
  accent?: boolean;
  buildSearch: (sp: URLSearchParams) => string;
}[] = [
  {
    key: "expenses",
    label: "Отчёт по расходам",
    pathname: "/reports/expenses",
    buildSearch: (sp) => (sp.toString() ? `?${sp.toString()}` : ""),
  },
  {
    key: "encashment",
    label: "Отчёт по инкассации",
    pathname: "/reports/encashment",
    buildSearch: (sp) => (sp.toString() ? `?${sp.toString()}` : ""),
  },
  {
    key: "central-cash",
    label: "Центральная касса",
    pathname: "/reports/central-cash",
    buildSearch: (sp) => (sp.toString() ? `?${sp.toString()}` : ""),
  },
  {
    key: "analytics-point",
    label: "Аналитика по точке",
    pathname: "/reports/analytics/point",
    accent: true,
    buildSearch: (sp) => {
      const p = new URLSearchParams();
      const from = sp.get("from");
      const to = sp.get("to");
      const point = sp.get("point");
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      if (point) p.set("point", point);
      const qs = p.toString();
      return qs ? `?${qs}` : "";
    },
  },
  {
    key: "analytics-consultant",
    label: "Аналитика по продавцу",
    pathname: "/reports/analytics/consultant",
    accent: true,
    buildSearch: (sp) => {
      const p = new URLSearchParams();
      const from = sp.get("from");
      const to = sp.get("to");
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      const qs = p.toString();
      return qs ? `?${qs}` : "";
    },
  },
  {
    key: "debts",
    label: "К взятию и взято",
    pathname: "/reports/debts-summary",
    accent: true,
    buildSearch: () => "",
  },
  {
    key: "withholding",
    label: "Удержание",
    pathname: "/reports/withholding",
    accent: true,
    buildSearch: () => "",
  },
];

export function reportsSubnavKeyFromPath(pathname: string): ReportsSubnavKey | null {
  if (pathname.startsWith("/reports/expenses")) return "expenses";
  if (pathname.startsWith("/reports/encashment")) return "encashment";
  if (pathname.startsWith("/reports/central-cash")) return "central-cash";
  if (pathname.startsWith("/reports/analytics/point")) return "analytics-point";
  if (pathname.startsWith("/reports/analytics/consultant")) return "analytics-consultant";
  if (pathname.startsWith("/reports/withholding")) return "withholding";
  if (pathname.startsWith("/reports/debts-summary") || pathname.startsWith("/reports/my-debts-stats")) return "debts";
  return null;
}

export default function ReportsSubnav({ active }: { active?: ReportsSubnavKey }) {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const current = active ?? reportsSubnavKeyFromPath(location.pathname);

  return (
    <nav
      className="flex flex-wrap items-center gap-2 mb-4 pb-4 border-b"
      style={{ borderColor: "var(--border)" }}
      aria-label="Разделы отчётов"
    >
      {ITEMS.map((item) => {
        const isActive = item.key === current;
        const to = `${item.pathname}${item.buildSearch(searchParams)}`;
        const accent = item.accent && !isActive;
        return (
          <Link
            key={item.key}
            to={to}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
            style={{
              borderColor: isActive ? "var(--accent)" : accent ? "rgba(0,82,204,0.3)" : "var(--border)",
              background: isActive ? "var(--accent)" : accent ? "var(--accent-light)" : "var(--bg-secondary)",
              color: isActive ? "#fff" : accent ? "var(--accent)" : "var(--text-primary)",
            }}
            aria-current={isActive ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
