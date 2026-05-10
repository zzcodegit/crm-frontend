/** Синхронно с report_required_validation.py (ключи и правила) */

export const REPORT_REQUIRED_FIELD_OPTIONS: { key: string; label: string }[] = [
  { key: "warehouse_id", label: "Точка (склад)" },
  { key: "utro", label: "Утро (фактическое)" },
  { key: "revenue", label: "Выручка" },
  { key: "nal", label: "Наличные" },
  { key: "ost", label: "Остаток наличных" },
  { key: "bn_card_reconciliation", label: "Безнал сверка итогов" },
  { key: "bn_z_report", label: "Безнал Z-отчёт" },
  { key: "return_bn", label: "Сумма возвратов по безналу" },
  { key: "return_nal", label: "Сумма возвратов по налу" },
  { key: "returns_details", label: "Детализация возвратов (≥1 строка)" },
  { key: "vyhod", label: "Выход (зарплата)" },
  { key: "percent", label: "Процент (зарплата)" },
  { key: "vzyala", label: "Взято (зарплата)" },
  { key: "dolg", label: "Долг (зарплата)" },
  { key: "z_report_urls", label: "Файлы Z-отчёта" },
  { key: "card_reconciliation_urls", label: "Файлы сверки по картам" },
  { key: "extra_payments", label: "Доплаты (≥1 строка)" },
  { key: "expenses", label: "Расходы (≥1 строка)" },
  { key: "encashment_nal", label: "Инкассация: сумма (нал)" },
  { key: "encashment_bn", label: "Инкассация: сумма (безнал)" },
];

export type ReportCreatePayloadLike = {
  warehouse_id?: number;
  utro?: number;
  revenue?: number;
  nal?: number;
  bn?: number;
  ost?: number;
  ost_fact?: number | null;
  has_returns?: boolean;
  return_bn?: number;
  return_nal?: number;
  returns_details?: {
    date_check?: string | null;
    consultant_last_name?: string | null;
    return_reason?: string | null;
    amount?: number | null;
  }[];
  bn_card_reconciliation?: number;
  bn_z_report?: number;
  extra_payments?: { amount: number; order_number?: string; consultant_last_name?: string | null }[];
  vyhod?: number;
  percent?: number;
  vzyala?: number | null;
  vzyala_details?: { order_number?: string; amount: number; warehouse_id?: number | null }[];
  dolg?: number | null;
  dolg_details?: { order_number?: string; amount: number; warehouse_id?: number | null }[];
  has_expenses?: boolean;
  expenses?: { amount: number; expense_article_id: number }[];
  z_report_urls?: string[];
  card_reconciliation_urls?: string[];
  has_encashment?: boolean;
  encashment_nal?: number | null;
  encashment_bn?: number | null;
};

function hasVzyala(data: ReportCreatePayloadLike): boolean {
  if (data.vzyala_details && data.vzyala_details.length > 0) {
    return data.vzyala_details.some((x) => x.amount != null);
  }
  return data.vzyala != null;
}

function hasDolg(data: ReportCreatePayloadLike): boolean {
  if (data.dolg_details && data.dolg_details.length > 0) {
    return data.dolg_details.some((x) => x.amount != null);
  }
  return data.dolg != null;
}

function returnsDetailsNonempty(data: ReportCreatePayloadLike): boolean {
  for (const r of data.returns_details ?? []) {
    if (r.amount != null) return true;
    if ((r.date_check ?? "").trim() !== "") return true;
    if ((r.consultant_last_name ?? "").trim() !== "") return true;
    if ((r.return_reason ?? "").trim() !== "") return true;
  }
  return false;
}

/** null = ок, иначе текст ошибки */
export function validateReportRequiredFieldsClient(
  data: ReportCreatePayloadLike,
  requiredKeys: string[]
): string | null {
  const missing: string[] = [];
  const label = (k: string) => REPORT_REQUIRED_FIELD_OPTIONS.find((o) => o.key === k)?.label ?? k;

  for (const key of requiredKeys) {
    if (key === "warehouse_id") {
      if (data.warehouse_id == null) missing.push(label(key));
    } else if (key === "utro") {
      if (data.utro == null) missing.push(label(key));
    } else if (key === "revenue") {
      if (data.revenue == null) missing.push(label(key));
    } else if (key === "nal") {
      if (data.nal == null) missing.push(label(key));
    } else if (key === "ost") {
      if (data.ost == null) missing.push(label(key));
    } else if (key === "bn_card_reconciliation") {
      if (data.bn_card_reconciliation == null) missing.push(label(key));
    } else if (key === "bn_z_report") {
      if (data.bn_z_report == null) missing.push(label(key));
    } else if (key === "return_bn") {
      if (!data.has_returns || data.return_bn == null) missing.push(label(key));
    } else if (key === "return_nal") {
      if (!data.has_returns || data.return_nal == null) missing.push(label(key));
    } else if (key === "returns_details") {
      if (!data.has_returns || !returnsDetailsNonempty(data)) missing.push(label(key));
    } else if (key === "vyhod") {
      if (data.vyhod == null) missing.push(label(key));
    } else if (key === "percent") {
      if (data.percent == null) missing.push(label(key));
    } else if (key === "vzyala") {
      if (!hasVzyala(data)) missing.push(label(key));
    } else if (key === "dolg") {
      if (!hasDolg(data)) missing.push(label(key));
    } else if (key === "z_report_urls") {
      if (!data.z_report_urls?.length) missing.push(label(key));
    } else if (key === "card_reconciliation_urls") {
      if (!data.card_reconciliation_urls?.length) missing.push(label(key));
    } else if (key === "extra_payments") {
      if (!data.extra_payments?.length) missing.push(label(key));
    } else if (key === "expenses") {
      if (!data.has_expenses || !data.expenses?.length) missing.push(label(key));
    } else if (key === "encashment_nal") {
      if (!data.has_encashment || data.encashment_nal == null) missing.push(label(key));
    } else if (key === "encashment_bn") {
      if (!data.has_encashment || data.encashment_bn == null) missing.push(label(key));
    }
  }

  if (missing.length === 0) return null;
  return "Не заполнены обязательные поля: " + missing.join("; ");
}
