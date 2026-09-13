/** Системный ключ в custom_values; не использовать как code пользовательского поля. */
export const MKL_LENS_UI_KEY = "__mkl_lens_ui";

/** Складской прайс и RX: четыре колонки параметров линзы (как в форме /pricelist, /pricelist-rx). */
export const PRICELIST_LENS_UI_KEY = "__pricelist_lens_ui";

export type MklLensColumnKey = "sph" | "cyl" | "step" | "diameters" | "replacement" | "baseCurve";

/** Колонки склада / RX (без режима замены и ВС). */
export const PRICELIST_LENS_COLUMN_KEYS = ["sph", "cyl", "step", "diameters"] as const;

export type PricelistLensColumnKey = (typeof PRICELIST_LENS_COLUMN_KEYS)[number];

/** Подписи по умолчанию для /pricelist и /pricelist-rx. */
export const DEFAULT_PRICELIST_LENS_LABELS: Record<PricelistLensColumnKey, string> = {
  sph: "SPH",
  cyl: "CYL",
  step: "Шаг",
  diameters: "Ø",
};

const ALL_COLUMNS: MklLensColumnKey[] = ["sph", "cyl", "step", "diameters", "replacement", "baseCurve"];

/** Порядок колонок параметров линзы в списке прайса МКЛ. */
export const MKL_LIST_COLUMN_ORDER: MklLensColumnKey[] = [...ALL_COLUMNS];

/** Подписи по умолчанию в UI МКЛ (как раньше в приложении). */
export const DEFAULT_MKL_LENS_LABELS: Record<MklLensColumnKey, string> = {
  sph: "SPH",
  cyl: "CYL",
  step: "Шаг",
  diameters: "Матриал/Влаг",
  replacement: "Режим замены",
  baseCurve: "ВС",
};

export type MklLensUiFormState = {
  labels: Record<MklLensColumnKey, string>;
  showInList: Record<MklLensColumnKey, boolean>;
  showInDetail: Record<MklLensColumnKey, boolean>;
};

function boolRecordDefaultTrue(): Record<MklLensColumnKey, boolean> {
  return {
    sph: true,
    cyl: true,
    step: true,
    diameters: true,
    replacement: true,
    baseCurve: true,
  };
}

function emptyLabels(): Record<MklLensColumnKey, string> {
  return { sph: "", cyl: "", step: "", diameters: "", replacement: "", baseCurve: "" };
}

export function createDefaultMklLensUiFormState(): MklLensUiFormState {
  return {
    labels: emptyLabels(),
    showInList: boolRecordDefaultTrue(),
    showInDetail: boolRecordDefaultTrue(),
  };
}

type StoredMklLensUi = {
  labels?: Partial<Record<MklLensColumnKey, string>>;
  showInList?: Partial<Record<MklLensColumnKey, boolean>>;
  showInDetail?: Partial<Record<MklLensColumnKey, boolean>>;
};

function parseStoredJson(raw: unknown): StoredMklLensUi {
  if (raw == null) return {};
  let s = "";
  if (typeof raw === "string") s = raw.trim();
  else return {};
  if (!s) return {};
  try {
    const o = JSON.parse(s) as unknown;
    if (!o || typeof o !== "object") return {};
    return o as StoredMklLensUi;
  } catch {
    return {};
  }
}

export function mklLensUiFromCustomValues(
  cv: Record<string, string | string[] | boolean | null> | null | undefined
): MklLensUiFormState {
  const base = createDefaultMklLensUiFormState();
  const raw = cv?.[MKL_LENS_UI_KEY];
  const st = parseStoredJson(raw);
  for (const k of ALL_COLUMNS) {
    const lab = st.labels?.[k];
    if (typeof lab === "string") base.labels[k] = lab;
    const sl = st.showInList?.[k];
    if (typeof sl === "boolean") base.showInList[k] = sl;
    const sd = st.showInDetail?.[k];
    if (typeof sd === "boolean") base.showInDetail[k] = sd;
  }
  return base;
}

/** Параметры линзы для склада и RX (четыре поля). Состояние совместимо с MklLensUiFormState; replacement/baseCurve не используются. */
export function pricelistLensUiFromCustomValues(
  cv: Record<string, string | string[] | boolean | null> | null | undefined
): MklLensUiFormState {
  const base = createDefaultMklLensUiFormState();
  const raw = cv?.[PRICELIST_LENS_UI_KEY];
  const st = parseStoredJson(raw);
  for (const k of PRICELIST_LENS_COLUMN_KEYS) {
    const lab = st.labels?.[k];
    if (typeof lab === "string") base.labels[k] = lab;
    const sl = st.showInList?.[k];
    if (typeof sl === "boolean") base.showInList[k] = sl;
    const sd = st.showInDetail?.[k];
    if (typeof sd === "boolean") base.showInDetail[k] = sd;
  }
  return base;
}

export function effectivePricelistLensLabel(state: MklLensUiFormState, key: PricelistLensColumnKey): string {
  const t = (state.labels[key] ?? "").trim();
  return t || DEFAULT_PRICELIST_LENS_LABELS[key];
}

export function isPricelistLensColumnVisible(
  state: MklLensUiFormState,
  place: "list" | "detail",
  key: PricelistLensColumnKey
): boolean {
  return isMklLensColumnVisible(state, place, key);
}

export function pricelistLensUiHasNonDefaultSettings(state: MklLensUiFormState): boolean {
  for (const k of PRICELIST_LENS_COLUMN_KEYS) {
    if ((state.labels[k] ?? "").trim() !== "") return true;
    if (state.showInList[k] === false) return true;
    if (state.showInDetail[k] === false) return true;
  }
  return false;
}

export function serializePricelistLensUiToCustomValue(state: MklLensUiFormState): string | null {
  if (!pricelistLensUiHasNonDefaultSettings(state)) return null;
  const labels: Partial<Record<MklLensColumnKey, string>> = {};
  const showInList: Partial<Record<MklLensColumnKey, boolean>> = {};
  const showInDetail: Partial<Record<MklLensColumnKey, boolean>> = {};
  for (const k of PRICELIST_LENS_COLUMN_KEYS) {
    const lab = (state.labels[k] ?? "").trim();
    if (lab) labels[k] = lab;
    if (state.showInList[k] === false) showInList[k] = false;
    if (state.showInDetail[k] === false) showInDetail[k] = false;
  }
  return JSON.stringify({ labels, showInList, showInDetail });
}

export function effectiveMklLensLabel(state: MklLensUiFormState, key: MklLensColumnKey): string {
  const t = (state.labels[key] ?? "").trim();
  return t || DEFAULT_MKL_LENS_LABELS[key];
}

export type PricelistLensCatalog = "warehouse" | "rx" | "mkl";

/** Подпись столбца с учётом каталога (для склада/RX у «diameters» по умолчанию Ø, для МКЛ — Матриал/Влаг). */
export function effectiveLensColumnLabel(
  state: MklLensUiFormState,
  catalog: PricelistLensCatalog,
  key: MklLensColumnKey
): string {
  if (catalog !== "mkl" && (PRICELIST_LENS_COLUMN_KEYS as readonly string[]).includes(key)) {
    return effectivePricelistLensLabel(state, key as PricelistLensColumnKey);
  }
  return effectiveMklLensLabel(state, key);
}

export function isMklLensColumnVisible(
  state: MklLensUiFormState,
  place: "list" | "detail",
  key: MklLensColumnKey
): boolean {
  const rec = place === "list" ? state.showInList : state.showInDetail;
  return rec[key] !== false;
}

export function lensUiFromCatalogCustomValues(
  catalog: PricelistLensCatalog,
  cv: Record<string, string | string[] | boolean | null> | null | undefined
): MklLensUiFormState {
  return catalog === "mkl" ? mklLensUiFromCustomValues(cv) : pricelistLensUiFromCustomValues(cv);
}

/** Колонки параметров линзы, которые нужно показать в списке прайса для данной позиции. */
export function visibleListLensColumnKeys(
  catalog: PricelistLensCatalog,
  lensUi: MklLensUiFormState
): MklLensColumnKey[] {
  const order = catalog === "mkl" ? MKL_LIST_COLUMN_ORDER : [...PRICELIST_LENS_COLUMN_KEYS];
  return order.filter((k) => isMklLensColumnVisible(lensUi, "list", k));
}

type RowWithCustomValues = {
  customValues?: Record<string, string | string[] | boolean | null> | null;
};

/** Колонки списка для одной позиции: из набора группы оставляем только с галочкой «в списке». */
export function listLensColumnKeysForRow(
  lensUi: MklLensUiFormState,
  groupColumnKeys: MklLensColumnKey[]
): MklLensColumnKey[] {
  return groupColumnKeys.filter((k) => isMklLensColumnVisible(lensUi, "list", k));
}

/** Объединение колонок по группе (максимальный набор слотов; видимость значений — по каждой позиции). */
export function listLensColumnKeysForRows(
  rows: RowWithCustomValues[],
  catalog: PricelistLensCatalog
): MklLensColumnKey[] {
  const order = catalog === "mkl" ? MKL_LIST_COLUMN_ORDER : [...PRICELIST_LENS_COLUMN_KEYS];
  const set = new Set<MklLensColumnKey>();
  for (const row of rows) {
    const lensUi = lensUiFromCatalogCustomValues(catalog, row.customValues ?? undefined);
    for (const k of visibleListLensColumnKeys(catalog, lensUi)) {
      set.add(k);
    }
  }
  if (set.size === 0) {
    return visibleListLensColumnKeys(catalog, createDefaultMklLensUiFormState());
  }
  return order.filter((k) => set.has(k));
}

/** true, если отличие от полностью стандартных настроек (есть что сохранить в custom_values). */
export function mklLensUiHasNonDefaultSettings(state: MklLensUiFormState): boolean {
  for (const k of ALL_COLUMNS) {
    if ((state.labels[k] ?? "").trim() !== "") return true;
    if (state.showInList[k] === false) return true;
    if (state.showInDetail[k] === false) return true;
  }
  return false;
}

/** JSON-строка для custom_values или null, если всё по умолчанию. */
export function serializeMklLensUiToCustomValue(state: MklLensUiFormState): string | null {
  if (!mklLensUiHasNonDefaultSettings(state)) return null;
  const labels: Partial<Record<MklLensColumnKey, string>> = {};
  const showInList: Partial<Record<MklLensColumnKey, boolean>> = {};
  const showInDetail: Partial<Record<MklLensColumnKey, boolean>> = {};
  for (const k of ALL_COLUMNS) {
    const lab = (state.labels[k] ?? "").trim();
    if (lab) labels[k] = lab;
    if (state.showInList[k] === false) showInList[k] = false;
    if (state.showInDetail[k] === false) showInDetail[k] = false;
  }
  return JSON.stringify({ labels, showInList, showInDetail });
}
