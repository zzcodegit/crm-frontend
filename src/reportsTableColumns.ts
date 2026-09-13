/** Синхронно с crm-backend/reports_table_columns.py */

export const REPORT_TABLE_COLUMN_LABELS: Record<string, string> = {
  created_at: "Дата и время",
  user_username: "Пользователь",
  warehouse_name: "Точка",
  comment: "Комментарий",
  utro_should: "На утро",
  utro: "Утро",
  revenue: "Выручка",
  nal: "Наличные",
  ost: "Ост. наличных (расчёт)",
  ost_fact: "Ост. наличных (факт)",
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
  "comment",
  "utro_should",
  "utro",
  "revenue",
  "nal",
  "ost",
  "ost_fact",
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

export function getAllReportTableColumnKeys(opts: { includeActions: boolean }): string[] {
  return opts.includeActions ? [...CANONICAL, "actions"] : [...CANONICAL];
}

export function normalizeReportTableColumnOrder(
  raw: string[] | null | undefined,
  opts: { includeActions: boolean; appendMissing?: boolean }
): string[] {
  const canonical = getAllReportTableColumnKeys({ includeActions: opts.includeActions });
  const appendMissing = opts.appendMissing ?? (raw == null || raw.length === 0);
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
  if (appendMissing) {
    for (const k of canonical) {
      if (!seen.has(k)) {
        out.push(k);
        seen.add(k);
      }
    }
  }
  return out;
}

export function normalizeReportTableColumnLabels(
  raw: Record<string, string> | null | undefined
): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!ALLOWED.has(key)) continue;
    const text = String(val).trim();
    if (text) out[key] = text.slice(0, 128);
  }
  return out;
}

export function mergeReportTableColumnLabels(
  custom?: Record<string, string> | null
): Record<string, string> {
  return { ...REPORT_TABLE_COLUMN_LABELS, ...normalizeReportTableColumnLabels(custom ?? undefined) };
}

export function resolveReportColumnLabel(
  key: string,
  labels?: Record<string, string> | null
): string {
  const custom = labels?.[key]?.trim();
  if (custom) return custom;
  return REPORT_TABLE_COLUMN_LABELS[key] ?? key;
}

export function reportColumnLabelsToOverrides(
  labels: Record<string, string>
): Record<string, string> {
  const normalized = normalizeReportTableColumnLabels(labels);
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(normalized)) {
    if (REPORT_TABLE_COLUMN_LABELS[key] !== val) out[key] = val;
  }
  return out;
}
