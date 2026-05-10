/** Синхронно с crm-backend/reports_table_columns.py */

export const REPORT_TABLE_COLUMN_LABELS: Record<string, string> = {
  created_at: "Дата и время",
  user_username: "Пользователь",
  warehouse_name: "Точка",
  utro_should: "На утро",
  utro: "Утро",
  revenue: "Выручка",
  nal: "Наличные",
  ost: "Остаток наличных",
  has_returns: "Возвраты",
  has_expenses: "Расходы",
  return_bn: "Возвр. бн",
  return_nal: "Возвр. нал",
  bn_card_reconciliation: "Безнал сверка",
  bn_z_report: "Безнал Z",
  encashment_nal: "Инкасс. нал",
  encashment_bn: "Инкасс. бн",
  vyhod: "Выход",
  percent: "%",
  vzyala: "Взято",
  dolg: "Долг",
  extra: "Доплаты",
  z_report: "Z-отчёт",
  card: "Сверка",
  actions: "Действия",
};

const CANONICAL: string[] = [
  "created_at",
  "user_username",
  "warehouse_name",
  "utro_should",
  "utro",
  "revenue",
  "nal",
  "ost",
  "has_returns",
  "has_expenses",
  "return_bn",
  "return_nal",
  "bn_card_reconciliation",
  "bn_z_report",
  "encashment_nal",
  "encashment_bn",
  "vyhod",
  "percent",
  "vzyala",
  "dolg",
  "extra",
  "z_report",
  "card",
];

const ALLOWED = new Set([...CANONICAL, "actions"]);

export function normalizeReportTableColumnOrder(
  raw: string[] | null | undefined,
  opts: { includeActions: boolean }
): string[] {
  const canonical = opts.includeActions ? [...CANONICAL, "actions"] : [...CANONICAL];
  if (!raw?.length) return canonical;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of raw) {
    if (!ALLOWED.has(k)) continue;
    if (k === "actions" && !opts.includeActions) continue;
    if (seen.has(k)) continue;
    out.push(k);
    seen.add(k);
  }
  for (const k of canonical) {
    if (!seen.has(k)) {
      out.push(k);
      seen.add(k);
    }
  }
  return out;
}
