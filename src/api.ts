const API_BASE = "/api";
const PRICELIST_OFFLINE_CACHE_VERSION = 2;
const PRICELIST_OFFLINE_KEY = `pricelist-offline-v${PRICELIST_OFFLINE_CACHE_VERSION}`;
const PRICELIST_OFFLINE_DB_NAME = "crm-offline";
const PRICELIST_OFFLINE_STORE = "kv";
const PRICELIST_OFFLINE_ASSETS_STORE = "assets";
const resolvedAssetObjectUrlCache = new Map<string, string>();
const resolveAssetPromiseCache = new Map<string, Promise<string>>();

function getToken(): string | null {
  return localStorage.getItem("token");
}

/** FastAPI 422: detail — массив объектов; иначе new Error показывает [object Object] */
function formatApiDetail(data: unknown): string {
  if (!data || typeof data !== "object" || !("detail" in data)) return "Ошибка запроса";
  const d = (data as { detail: unknown }).detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    return d
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) return String((item as { msg: string }).msg);
        try {
          return JSON.stringify(item);
        } catch {
          return String(item);
        }
      })
      .join("; ");
  }
  if (d && typeof d === "object") {
    try {
      return JSON.stringify(d);
    } catch {
      return "Ошибка запроса";
    }
  }
  return String(d ?? "Ошибка запроса");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: HeadersInit = { "Content-Type": "application/json", ...options.headers };
  const token = getToken();
  if (token) (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem("token");
    throw new Error("Неверный логин или пароль");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(formatApiDetail(data));
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text.trim()) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

type PricelistCatalog = "warehouse" | "rx" | "mkl";

type PricelistOfflineBucket = {
  updatedAt: string;
  list: PricelistItemResponse[];
  byId: Record<number, PricelistItemResponse>;
};

type PricelistOfflineStore = Partial<Record<PricelistCatalog, PricelistOfflineBucket>>;
const PRICELIST_OFFLINE_NATIVE_KEY = `${PRICELIST_OFFLINE_KEY}-native`;

type CapacitorPreferencesPlugin = {
  get: (args: { key: string }) => Promise<{ value: string | null }>;
  set: (args: { key: string; value: string }) => Promise<void>;
};

function getCapacitorPreferencesPlugin(): CapacitorPreferencesPlugin | null {
  try {
    const w = window as unknown as {
      Capacitor?: {
        Plugins?: {
          Preferences?: CapacitorPreferencesPlugin;
        };
      };
    };
    return w.Capacitor?.Plugins?.Preferences ?? null;
  } catch {
    return null;
  }
}

async function readPricelistOfflineStoreFromNativeStorage(): Promise<PricelistOfflineStore | null> {
  const plugin = getCapacitorPreferencesPlugin();
  if (!plugin) return null;
  try {
    const { value } = await plugin.get({ key: PRICELIST_OFFLINE_NATIVE_KEY });
    if (!value) return null;
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as PricelistOfflineStore;
  } catch {
    return null;
  }
}

async function writePricelistOfflineStoreToNativeStorage(next: PricelistOfflineStore): Promise<void> {
  const plugin = getCapacitorPreferencesPlugin();
  if (!plugin) return;
  try {
    await plugin.set({ key: PRICELIST_OFFLINE_NATIVE_KEY, value: JSON.stringify(next) });
  } catch {
    // ignore native storage errors
  }
}

function readPricelistOfflineStoreFromLocalStorage(): PricelistOfflineStore {
  try {
    const raw = localStorage.getItem(PRICELIST_OFFLINE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as PricelistOfflineStore;
  } catch {
    return {};
  }
}

function writePricelistOfflineStoreToLocalStorage(next: PricelistOfflineStore): void {
  try {
    localStorage.setItem(PRICELIST_OFFLINE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

function openOfflineDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    const req = indexedDB.open(PRICELIST_OFFLINE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PRICELIST_OFFLINE_STORE)) {
        db.createObjectStore(PRICELIST_OFFLINE_STORE);
      }
      if (!db.objectStoreNames.contains(PRICELIST_OFFLINE_ASSETS_STORE)) {
        db.createObjectStore(PRICELIST_OFFLINE_ASSETS_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function readPricelistOfflineStore(): Promise<PricelistOfflineStore> {
  const db = await openOfflineDb();
  if (!db) {
    const native = await readPricelistOfflineStoreFromNativeStorage();
    if (native) return native;
    return readPricelistOfflineStoreFromLocalStorage();
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(PRICELIST_OFFLINE_STORE, "readonly");
      const store = tx.objectStore(PRICELIST_OFFLINE_STORE);
      const req = store.get(PRICELIST_OFFLINE_KEY);
      req.onsuccess = () => {
        const value = req.result;
        if (!value || typeof value !== "object") {
          void (async () => {
            const native = await readPricelistOfflineStoreFromNativeStorage();
            resolve(native || {});
          })();
          return;
        }
        resolve(value as PricelistOfflineStore);
      };
      req.onerror = () => {
        void (async () => {
          const native = await readPricelistOfflineStoreFromNativeStorage();
          resolve(native || readPricelistOfflineStoreFromLocalStorage());
        })();
      };
    } catch {
      void (async () => {
        const native = await readPricelistOfflineStoreFromNativeStorage();
        resolve(native || readPricelistOfflineStoreFromLocalStorage());
      })();
    }
  });
}

async function writePricelistOfflineStore(next: PricelistOfflineStore): Promise<void> {
  const db = await openOfflineDb();
  if (!db) {
    writePricelistOfflineStoreToLocalStorage(next);
    await writePricelistOfflineStoreToNativeStorage(next);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(PRICELIST_OFFLINE_STORE, "readwrite");
      const store = tx.objectStore(PRICELIST_OFFLINE_STORE);
      const req = store.put(next, PRICELIST_OFFLINE_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(new Error("Не удалось записать офлайн-кэш"));
    } catch {
      reject(new Error("Не удалось записать офлайн-кэш"));
    }
  });
  writePricelistOfflineStoreToLocalStorage(next);
  await writePricelistOfflineStoreToNativeStorage(next);
}

function normalizeAssetUrl(url: string): string {
  const raw = (url || "").trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("//")) return `${window.location.protocol}${raw}`;
  if (raw.startsWith("/")) return `${window.location.origin}${raw}`;
  return raw;
}

async function readCachedAssetBlob(assetUrl: string): Promise<Blob | null> {
  const db = await openOfflineDb();
  if (!db) return null;
  const key = normalizeAssetUrl(assetUrl);
  if (!key) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(PRICELIST_OFFLINE_ASSETS_STORE, "readonly");
      const store = tx.objectStore(PRICELIST_OFFLINE_ASSETS_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const v = req.result;
        resolve(v instanceof Blob ? v : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeCachedAssetBlob(assetUrl: string, blob: Blob): Promise<void> {
  const db = await openOfflineDb();
  if (!db) return;
  const key = normalizeAssetUrl(assetUrl);
  if (!key) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(PRICELIST_OFFLINE_ASSETS_STORE, "readwrite");
      const store = tx.objectStore(PRICELIST_OFFLINE_ASSETS_STORE);
      const req = store.put(blob, key);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

type CacheAssetResult = {
  ok: boolean;
  fromCache: boolean;
  downloadedBytes: number;
};

async function cacheAssetUrl(assetUrl: string): Promise<CacheAssetResult> {
  const normalized = normalizeAssetUrl(assetUrl);
  if (!normalized) return { ok: false, fromCache: false, downloadedBytes: 0 };
  const already = await readCachedAssetBlob(normalized);
  if (already) return { ok: true, fromCache: true, downloadedBytes: 0 };
  try {
    const resp = await fetch(normalized, { method: "GET" });
    if (!resp.ok) return { ok: false, fromCache: false, downloadedBytes: 0 };
    const blob = await resp.blob();
    if (!blob || blob.size <= 0) return { ok: false, fromCache: false, downloadedBytes: 0 };
    await writeCachedAssetBlob(normalized, blob);
    return { ok: true, fromCache: false, downloadedBytes: blob.size };
  } catch {
    return { ok: false, fromCache: false, downloadedBytes: 0 };
  }
}

function collectAssetUrlsFromPricelistItems(items: PricelistItemResponse[]): string[] {
  const urls = new Set<string>();
  const pullDescriptionImageUrls = (text: string) => {
    if (!text) return;
    const mdRe = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    let m: RegExpExecArray | null;
    while ((m = mdRe.exec(text)) !== null) {
      if (m[1]) urls.add(m[1]);
    }
    const htmlRe = /<img[^>]+src=["']([^"']+)["']/gi;
    let hm: RegExpExecArray | null;
    while ((hm = htmlRe.exec(text)) !== null) {
      if (hm[1]) urls.add(hm[1]);
    }
  };
  items.forEach((item) => {
    if (item.photo_url) urls.add(item.photo_url);
    if (Array.isArray(item.photo_urls)) {
      item.photo_urls.forEach((u) => {
        if (u) urls.add(String(u));
      });
    }
    pullDescriptionImageUrls(String(item.full_description || ""));
  });
  return [...urls];
}

async function cacheAssetsFromPricelistItems(
  items: PricelistItemResponse[],
  onProgress?: (p: { done: number; total: number; toDownload: number; downloadedBytes: number }) => void
): Promise<{ saved: number; total: number; toDownload: number; downloadedBytes: number }> {
  const urls = collectAssetUrlsFromPricelistItems(items);
  let toDownload = 0;
  for (const u of urls) {
    const existing = await readCachedAssetBlob(normalizeAssetUrl(u));
    if (!existing) toDownload += 1;
  }
  let saved = 0;
  let done = 0;
  let downloadedBytes = 0;
  onProgress?.({ done, total: urls.length, toDownload, downloadedBytes });
  for (const u of urls) {
    const res = await cacheAssetUrl(u);
    if (res.ok) saved += 1;
    downloadedBytes += res.downloadedBytes;
    done += 1;
    onProgress?.({ done, total: urls.length, toDownload, downloadedBytes });
  }
  return { saved, total: urls.length, toDownload, downloadedBytes };
}

async function cachePricelistList(catalog: PricelistCatalog, list: PricelistItemResponse[]): Promise<void> {
  const prev = await readPricelistOfflineStore();
  const byId: Record<number, PricelistItemResponse> = {};
  list.forEach((item) => {
    byId[item.id] = item;
  });
  prev[catalog] = {
    updatedAt: new Date().toISOString(),
    list,
    byId,
  };
  await writePricelistOfflineStore(prev);
}

async function cachePricelistItem(catalog: PricelistCatalog, item: PricelistItemResponse): Promise<void> {
  const prev = await readPricelistOfflineStore();
  const existing = prev[catalog];
  const byId = { ...(existing?.byId || {}), [item.id]: item };
  const listBase = existing?.list || [];
  const index = listBase.findIndex((x) => x.id === item.id);
  const list =
    index >= 0
      ? [...listBase.slice(0, index), item, ...listBase.slice(index + 1)]
      : [item, ...listBase];
  prev[catalog] = {
    updatedAt: new Date().toISOString(),
    list,
    byId,
  };
  await writePricelistOfflineStore(prev);
}

async function readCachedPricelistList(catalog: PricelistCatalog): Promise<PricelistItemResponse[]> {
  const store = await readPricelistOfflineStore();
  return store[catalog]?.list || [];
}

async function readCachedPricelistItem(catalog: PricelistCatalog, id: number): Promise<PricelistItemResponse | null> {
  const store = await readPricelistOfflineStore();
  const fromMap = store[catalog]?.byId?.[id];
  if (fromMap) return fromMap;
  const fromList = (store[catalog]?.list || []).find((x) => x.id === id);
  return fromList || null;
}

function isNetworkRequestError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = (err.message || "").toLowerCase();
  return msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("network request failed");
}

function isProbablyOffline(): boolean {
  try {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  } catch {
    return false;
  }
}

async function requestPricelistListWithOffline(path: string, catalog: PricelistCatalog): Promise<PricelistItemResponse[]> {
  if (isProbablyOffline()) {
    const cached = await readCachedPricelistList(catalog);
    if (cached.length > 0) return cached;
  }
  try {
    const data = await request<PricelistItemResponse[]>(path);
    await cachePricelistList(catalog, data || []);
    await cacheAssetsFromPricelistItems(data || []);
    return data || [];
  } catch (err) {
    const cached = await readCachedPricelistList(catalog);
    if (cached.length > 0 && isNetworkRequestError(err)) return cached;
    throw err;
  }
}

async function requestPricelistItemWithOffline(path: string, catalog: PricelistCatalog, id: number): Promise<PricelistItemResponse> {
  if (isProbablyOffline()) {
    const cached = await readCachedPricelistItem(catalog, id);
    if (cached) return cached;
  }
  try {
    const data = await request<PricelistItemResponse>(path);
    await cachePricelistItem(catalog, data);
    return data;
  } catch (err) {
    const cached = await readCachedPricelistItem(catalog, id);
    if (cached && isNetworkRequestError(err)) return cached;
    throw err;
  }
}

async function requestMultipart<T>(path: string, formData: FormData, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...options, method: options.method || "POST", body: formData, headers });
  if (res.status === 401) {
    localStorage.removeItem("token");
    throw new Error("Неверный логин или пароль");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(formatApiDetail(data));
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface UserItem {
  id: number;
  username: string;
  is_active: boolean;
  first_name?: string | null;
  last_name?: string | null;
  patronymic?: string | null;
  telegram_id?: string | null;
  phone?: string | null;
  birth_date?: string | null;
  group_ids?: number[];
  last_login_at?: string | null;
  /** false — не показывать бейдж и не слать push о новых сообщениях */
  chat_notifications_enabled?: boolean;
  avatar_url?: string | null;
}
export interface GroupItem {
  id: number;
  name: string;
}
export interface SidebarVideoSettings {
  video_url: string | null;
  visible_group_ids: number[];
}
export interface SidebarMenuOrderSettings {
  order: string[];
}
export type GroupPermissionsResponse = {
  permissions: Record<string, string[]>;
};
export interface OrderLineItem {
  id: number;
  order_id: number;
  line_number: number;
  product_id: number | null;
  characteristic_id: number | null;
  nomenclature: string | null;
  quantity: number;
  price: number;
  percent_manual: number | null;
  sum_manual: number | null;
  sum: number;
  vat_rate_id: number | null;
  product_name: string | null;
  characteristic_name: string | null;
  vat_rate_name: string | null;
}
export interface OrderItem {
  id: number;
  status: string | null;
  order_status_id: number | null;
  order_status_name: string | null;
  priority_id: number | null;
  priority_name: string | null;
  consultant_id: number | null;
  consultant: string | null;
  order_number: string | null;
  date: string | null;
  readiness_date: string | null;
  client_id: number | null;
  client: string | null;
  age: number | null;
  phone: string | null;
  sms: boolean;
  call: string | null;
  prepayment: number | null;
  card: boolean;
  cash: boolean;
  extra_payment: number | null;
  od_sph: string | null;
  od_cyl: string | null;
  od_axis: string | null;
  od_pd: string | null;
  od_add_deg: string | null;
  od_height: string | null;
  diametr: string | null;
  os_sph: string | null;
  os_cyl: string | null;
  os_axis: string | null;
  os_pd: string | null;
  os_add_deg: string | null;
  os_height: string | null;
  for_what: string | null;
  frame_article: string | null;
  print_info: string | null;
  promotion: boolean;
  prescription_order: boolean;
  child_order: boolean;
  no_lenses: boolean;
  client_frame_lenses: boolean;
  case_included: boolean;
  from_client_words: boolean;
  doctor_prescription: boolean;
  doctor_name: string | null;
  clinic: string | null;
  by_client_glasses: boolean;
  demo_mo: boolean;
  price_includes_vat: boolean;
  organization_id: number | null;
  organization_name: string | null;
  department_id: number | null;
  department_name: string | null;
  warehouse: string | null;
  warehouse_id: number | null;
  warehouse_name: string | null;
  author_id: number | null;
  author_name: string | null;
  ship_one_date: boolean;
  ship_date: string | null;
  total: number;
  comment: string | null;
  created_at: string | null;
  items: OrderLineItem[];
}
export interface RefItem {
  id: number;
  name: string;
}

/** Слот времени HH:MM */
export type WarehouseDaySlot = { open: string; close: string };

export type WarehouseWeeklyHours = {
  mon?: WarehouseDaySlot | null;
  tue?: WarehouseDaySlot | null;
  wed?: WarehouseDaySlot | null;
  thu?: WarehouseDaySlot | null;
  fri?: WarehouseDaySlot | null;
  sat?: WarehouseDaySlot | null;
  sun?: WarehouseDaySlot | null;
};

export type WarehouseHolidayHours = {
  date: string;
  closed: boolean;
  open?: string;
  close?: string;
};

export type WarehouseOpeningHours = {
  weekly?: WarehouseWeeklyHours | null;
  holidays?: WarehouseHolidayHours[];
};

export interface WarehouseItem {
  id: number;
  name: string;
  organization_id?: number | null;
  organization_name?: string | null;
  manager_id?: number | null;
  manager_name?: string | null;
  opening_hours?: WarehouseOpeningHours | null;
}

export interface ReportItem {
  id: number;
  created_at: string | null;
  /** Момент отправки (не черновика); если нет — старые данные, смотреть created_at */
  submitted_at?: string | null;
  user_id: number;
  user_username: string;
  warehouse_id: number | null;
  warehouse_name: string;
  utro: number | null;
  revenue: number | null;
  nal: number | null;
  bn: number | null;
  ost: number | null;
  /** Фактический остаток наличных; для следующей смены подставляется в «утро» (приоритет над расчётным ost) */
  ost_fact?: number | null;
  is_draft?: boolean;
  has_returns: boolean;
  return_bn: number | null;
  return_nal: number | null;
  returns_details?: { date_check: string | null; consultant_last_name: string | null; return_reason?: string | null; amount?: number | null }[];
  bn_card_reconciliation: number | null;
  bn_z_report: number | null;
  extra_payments: { amount: number; order_number: string; consultant_last_name?: string | null }[];
  vyhod: number | null;
  percent: number | null;
  vzyala: number | null;
  /** Детализация «взято»: заказ, взято с заказа, за что взято, % от заказа, точка (склад) */
  vzyala_details?: {
    order_number: string;
    amount: number;
    taken_reason_id?: number | null;
    taken_source_id?: number | null;
    order_percent?: number | null;
    report_month?: string | null;
    warehouse_id: number | null;
    linked_debt_row_uid?: string | null;
    linked_debt_report_id?: number | null;
  }[];
  dolg: number | null;
  dolg_details?: {
    order_number: string;
    amount: number;
    debt_reason_id?: number | null;
    order_percent?: number | null;
    report_month?: string | null;
    warehouse_id: number | null;
    debt_row_uid?: string | null;
  }[];
  has_expenses?: boolean;
  expenses?: { amount: number; expense_article_id: number }[];
  z_report_urls: string[];
  card_reconciliation_urls: string[];
  has_encashment?: boolean;
  encashment_nal?: number | null;
  encashment_bn?: number | null;
}

/** Выплата из центральной кассы (админ-учёт) */
export interface CentralCashPayoutItem {
  id: number;
  created_at: string;
  paid_to_user_id: number;
  paid_to_name: string;
  amount: number;
  note?: string | null;
  recorded_by_user_id?: number | null;
  recorded_by_name: string;
}

export interface ExpenseSummaryRow {
  expense_article_id: number;
  expense_article_name: string;
  total_amount: number;
}

export interface ExpenseDetailRow {
  expense_article_id: number;
  expense_article_name: string;
  amount: number;
  warehouse_name: string;
  report_date: string;
  seller_name: string;
}

export interface ExpenseSummaryResponse {
  date_from: string;
  date_to: string;
  rows: ExpenseSummaryRow[];
  grand_total: number;
  /** Строки расходов по каждому отчёту: дата, точка, продавец */
  detail_rows?: ExpenseDetailRow[];
}

export interface EncashmentSummaryRow {
  report_id?: number | null;
  warehouse_id: number;
  warehouse_name: string;
  total_nal: number;
  total_bn: number;
  total: number;
  /** Календарные даты отчётов с инкассацией (YYYY-MM-DD) */
  report_dates?: string[];
  /** Авторы отчётов с инкассацией по точке за период */
  seller_names?: string[];
  /** Отмечено админом/менеджером как «получено» за этот период */
  received?: boolean;
  received_at?: string | null;
  received_by_name?: string | null;
  report_items?: {
    report_id: number;
    report_date: string;
    seller_name: string;
    nal: number;
    bn: number;
    total: number;
  }[];
}

export interface EncashmentSummaryResponse {
  date_from: string;
  date_to: string;
  rows: EncashmentSummaryRow[];
  grand_total_nal: number;
  grand_total_bn: number;
  grand_total: number;
}

export interface AvailableDebtRow {
  debt_row_uid: string;
  report_id: number;
  report_created_at?: string | null;
  report_submitted_at?: string | null;
  amount: number;
  order_number: string;
  debt_reason_id?: number | null;
  report_month?: string | null;
  warehouse_id?: number | null;
  warehouse_name?: string | null;
  manual_debt_id?: number | null;
}

export interface DebtTakeEventItem {
  amount: number;
  report_id: number;
  taken_at?: string | null;
  taken_user_id?: number | null;
  taken_user_name?: string;
  taken_reason_id?: number | null;
  taken_reason_name?: string | null;
}

export interface DebtSummaryRow {
  debt_row_uid: string;
  debt_report_id: number;
  debt_created_at?: string | null;
  debt_submitted_at?: string | null;
  debt_user_id: number;
  debt_user_name: string;
  debt_amount: number;
  debt_order_number: string;
  debt_reason_id?: number | null;
  debt_reason_name?: string | null;
  debt_report_month?: string | null;
  debt_warehouse_id?: number | null;
  debt_warehouse_name?: string | null;
  taken_report_id?: number | null;
  taken_at?: string | null;
  taken_user_id?: number | null;
  taken_user_name?: string | null;
  taken_amount?: number | null;
  taken_reason_id?: number | null;
  taken_reason_name?: string | null;
  status: "open" | "taken" | string;
  debt_source?: string;
  manual_debt_id?: number | null;
  admin_note?: string | null;
  take_events?: DebtTakeEventItem[];
}

export interface TakenSummaryRow {
  row_key: string;
  report_id: number;
  report_created_at?: string | null;
  report_submitted_at?: string | null;
  user_id: number;
  user_name: string;
  amount: number;
  taken_reason_id?: number | null;
  taken_reason_name?: string | null;
  taken_source_id?: number | null;
  taken_source_name?: string | null;
  order_number: string;
  report_month?: string | null;
  warehouse_id?: number | null;
  warehouse_name?: string | null;
  linked_debt_row_uid?: string | null;
  linked_debt_report_id?: number | null;
  is_linked_debt_take: boolean;
}

export interface EmployeeLedgerLine {
  at?: string | null;
  kind: string;
  report_id?: number | null;
  manual_debt_id?: number | null;
  amount: number;
  description: string;
}

export interface EmployeeLedgerResponse {
  user_id: number;
  user_name: string;
  remaining_debt_total: number;
  vzyala_total: number;
  vzyala_linked_debt_total: number;
  lines: EmployeeLedgerLine[];
}

export interface ManualWithholdingRow {
  id: number;
  created_at?: string | null;
  user_id: number;
  user_name: string;
  amount: number;
  warehouse_id?: number | null;
  warehouse_name?: string | null;
  report_month?: string | null;
  reason?: string | null;
  note?: string | null;
  recorded_by_user_id?: number | null;
  recorded_by_name?: string | null;
}

export interface PricelistGroupItem {
  id: number;
  name: string;
  sort_index: number;
  display_properties_in_list: boolean;
  display_as_tiles?: boolean;
  tiles_per_page?: number;
}

export interface CountryItem {
  id: number;
  name: string;
  code?: string;
}

export interface ManufacturerItem {
  id: number;
  name: string;
  description?: string;
  country_id?: number;
  image_url?: string;
  catalog_pdf_url?: string | null;
  show_in_lens_catalog?: boolean;
  open_pdf_in_lens_catalog?: boolean;
  show_country_in_lens_catalog?: boolean;
  show_description_in_lens_catalog?: boolean;
  country?: CountryItem;
}

export interface FeatureItem {
  id: number;
  name: string;
  icon_url?: string;
  color?: string;
  colors?: string[];
}

/** Группа штрихкодов с названием (name null — общий список без заголовка) */
export interface PricelistBarcodeSection {
  name?: string | null;
  items: { code: string; price?: number | null; description?: string | null }[];
}

export interface PricelistItemResponse {
  id: number;
  manufacturer_id: number | null;
  manufacturer_name: string;
  lens_name: string;
  description?: string | null;
  full_description?: string | null;
  barcode?: string | null;
  barcodes?: { code: string; price?: number | null; description?: string | null }[];
  /** Группы; для старых позиций — одна секция без названия */
  barcode_sections?: PricelistBarcodeSection[];
  photo_url?: string | null;
  photo_urls?: string[];
  sph?: string | null;
  cyl?: string | null;
  step?: string | null;
  diameters?: string | null;
  price: number;
  sort_index?: number;
  /** Цена «от N ₽» — префикс в списке и карточке */
  price_from?: boolean;
  is_promo?: boolean;
  uv_protection?: boolean;
  material?: string | null;
  lens_id?: number | null;
  group: string;
  coefficient?: string | null;
  feature_ids: number[];
  feature_colors?: Record<string, string[]>; // feature_id (str) -> список цветов
  custom_values?: Record<string, string | string[] | boolean | null>;
  hide_detail_link?: boolean;
  /** Не показывать загруженные фото на странице карточки товара */
  hide_photo?: boolean;
  enable_transposition_calc?: boolean;
}

export interface PricelistPublicationJobItem {
  id: number;
  catalog: "warehouse" | "rx" | "mkl";
  action: string;
  batch_code?: string | null;
  batch_name?: string | null;
  target_item_id?: number | null;
  payload_json: Record<string, any>;
  publish_at: string;
  status: "pending" | "applied" | "failed" | "cancelled";
  created_by_user_id?: number | null;
  created_at?: string | null;
  applied_at?: string | null;
  error_text?: string | null;
}

export interface CustomFieldOptionItem {
  id: number;
  value: string;
  sort_index: number;
  is_active: boolean;
}

export interface DriveItem {
  id: number;
  parent_id: number | null;
  is_folder: boolean;
  name: string;
  owner_user_id: number;
  file_url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  shared_user_ids: number[] | null;
  shared_group_ids: number[] | null;
  folder_icon: string | null;
  public_enabled: boolean;
  public_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface DrivePublicItemResponse {
  item_id: number;
  name: string;
  file_url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
}

export interface DriveBreadcrumbItem {
  id: number;
  name: string;
}

export interface DriveFolderPickerItem {
  id: number;
  parent_id: number | null;
  name: string;
}

export interface CustomFieldItem {
  id: number;
  code: string;
  label: string;
  field_type: "string" | "string_multi" | "select" | "multi_select" | "checkbox" | "reference";
  is_required: boolean;
  is_active: boolean;
  show_in_warehouse: boolean;
  show_in_rx: boolean;
  show_in_mkl: boolean;
  sort_index: number;
  options: CustomFieldOptionItem[];
}

export interface PortalTaskItem {
  id: number;
  title: string;
  description?: string | null;
  status: "new" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  created_by_user_id?: number | null;
  created_by_username?: string | null;
  assignee_user_id?: number | null;
  assignee_label?: string | null;
  due_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface TaskAssigneeOption {
  id: number;
  username: string;
  label: string;
}

export interface SupplyTicketItem {
  id: number;
  warehouse_id?: number | null;
  warehouse_name?: string | null;
  request_text: string;
  created_by_user_id?: number | null;
  created_by_username?: string | null;
  status: "open" | "closed";
  created_at?: string | null;
  updated_at?: string | null;
}

export interface SupplyTicketMessageItem {
  id: number;
  ticket_id: number;
  author_user_id?: number | null;
  author_username?: string | null;
  message: string;
  created_at?: string | null;
}

export interface TrainingArticleItem {
  id: number;
  title: string;
  section: string;
  preview_image_url?: string | null;
  content_html: string;
  is_published: boolean;
  created_by_user_id?: number | null;
  created_by_username?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type TrainingQuestionType =
  | "single"
  | "multi"
  | "text"
  | "short_text"
  | "select"
  | "image_single"
  | "image_multi";

export interface TrainingQuizQuestion {
  id: string;
  type: TrainingQuestionType;
  text: string;
  image_url?: string | null;
  options?: { id: string; text: string; image_url?: string | null }[];
  correct_option_ids?: string[];
  correct_text?: string | null;
  correct_texts?: string[] | null;
  case_insensitive?: boolean;
}

export interface TrainingQuizSpec {
  title?: string;
  time_limit_sec?: number | null;
  pass_mode?: "errors" | "percent";
  max_wrong?: number | null;
  min_percent?: number | null;
  questions: TrainingQuizQuestion[];
}

export interface TrainingBlock {
  id: string;
  title: string;
  order: number;
  content_html: string;
  materials: { title: string; html: string }[];
  opens_at: string | null;
  require_previous: boolean;
  quiz: TrainingQuizSpec | null;
}

export interface TrainingCoursePayload {
  version: number;
  blocks: TrainingBlock[];
  final_exam: TrainingQuizSpec | null;
  certificate?: { title?: string; subtitle?: string };
}

export interface TrainingCourseRow {
  id: number;
  title: string;
  description: string;
  preview_image_url: string | null;
  is_published: boolean;
  updated_at?: string | null;
}

export interface TrainingCourseAdmin extends TrainingCourseRow {
  payload: TrainingCoursePayload;
  created_at?: string | null;
  created_by_user_id?: number | null;
}

export interface TrainingCourseLearnResponse {
  id: number;
  title: string;
  description: string;
  preview_image_url: string | null;
  payload: TrainingCoursePayload;
  progress: {
    blocks_quiz_passed?: Record<string, boolean>;
    blocks_completed?: Record<string, boolean>;
    exam_passed?: boolean;
    certificate_code?: string | null;
    certificate_issued_at?: string | null;
  };
  available_block_ids: string[];
}

export interface NormativeActItem {
  id: number;
  title: string;
  section: string;
  preview_image_url?: string | null;
  attachment_url?: string | null;
  attachment_filename?: string | null;
  visible_user_ids?: number[];
  content_html: string;
  is_published: boolean;
  created_by_user_id?: number | null;
  created_by_username?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  signed_by_me?: boolean;
  signed_at?: string | null;
}

export interface NormativeActSignReportItem {
  user_id: number;
  username: string;
  display_name: string;
  signed: boolean;
  signed_at?: string | null;
}

export interface WorkScheduleDraftItem {
  id: number;
  name: string;
  payload: { weeks?: Record<string, Record<string, string>> };
  created_at?: string | null;
  updated_at?: string | null;
}

export interface WorkScheduleMyConfirmation {
  week_start: string;
  confirmed: boolean;
  confirmed_at?: string | null;
}

export interface WorkScheduleConfirmationReportRow {
  user_id: number;
  username: string;
  display_name: string;
  confirmed_at?: string | null;
}

export interface WorkScheduleConfirmationReport {
  week_start: string;
  total_consultants: number;
  confirmed_count: number;
  rows: WorkScheduleConfirmationReportRow[];
}

export interface ProductRefItem {
  id: number;
  name: string;
  code: string | null;
}
export interface ProductCharItem {
  id: number;
  product_id: number;
  name: string;
}

// --- Chat ---

export type ChatMediaType = "image" | "video" | "audio";

export interface ChatAttachment {
  id: number;
  url: string;
  media_type: ChatMediaType;
  filename?: string | null;
  mime_type?: string | null;
  created_at?: string | null;
}

export interface ChatMessageSender {
  id: number;
  username: string;
  display_name: string;
  avatar_url?: string | null;
}

export interface ChatMessageItem {
  id: number;
  private_dialog_id: number | null;
  group_dialog_id?: number | null;
  sender: ChatMessageSender | null;
  display_text: string | null;
  is_deleted: boolean;
  created_at: string | null;
  edited_at: string | null;
  attachments: ChatAttachment[];
  reply_to_message_id?: number | null;
  reply_to_text?: string | null;
  reply_to_sender_name?: string | null;
  reply_to_is_deleted?: boolean;
  is_read?: boolean;
}

export interface ChatUserShortResponse {
  id: number;
  username: string;
  display_name: string;
  is_active: boolean;
  avatar_url?: string | null;
}

export interface PrivateDialogItem {
  id: number;
  other_user: {
    id: number;
    username: string;
    display_name: string;
    is_active: boolean;
    avatar_url?: string | null;
  };
  last_message_text: string | null | undefined;
  last_message_at: string | null | undefined;
  has_unread?: boolean;
}

export interface GroupDialogItem {
  id: number;
  name: string;
  image_url?: string | null;
  last_message_text: string | null | undefined;
  last_message_at: string | null | undefined;
  has_unread?: boolean;
}

export interface GroupMemberItem {
  user: ChatUserShortResponse;
  is_admin: boolean;
  is_active: boolean;
  joined_at: string | null | undefined;
  left_at: string | null | undefined;
}

export interface ChatNotificationSummary {
  unread_count: number;
  last_message_text?: string | null;
  last_message_sender?: string | null;
  last_message_chat?: string | null;
}

/** Не больше `le` в GET /chat/users. Старый прод: 100; после обновления бэкенда (le≥500) можно поднять до 500. */
export const CHAT_USERS_QUERY_LIMIT = 100;

export const api = {
  login(username: string, password: string) {
    return request<{ access_token: string; token_type: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  setupPassword(username: string, password: string, password_confirm: string) {
    return request<{ access_token: string; token_type: string }>("/auth/setup-password", {
      method: "POST",
      body: JSON.stringify({ username, password, password_confirm }),
    });
  },
  getMe() {
    return request<
      UserItem & {
        is_admin: boolean;
        is_manager?: boolean;
        is_consultant?: boolean;
        role?: string;
        impersonator_username?: string | null;
      }
    >("/auth/me");
  },
  updateMyProfile: (data: { avatar_url?: string | null }) =>
    request<
      UserItem & {
        is_admin: boolean;
        is_manager?: boolean;
        is_consultant?: boolean;
        role?: string;
        impersonator_username?: string | null;
      }
    >("/auth/me/profile", { method: "PATCH", body: JSON.stringify(data) }),
  /** Только администратор: токен от имени другого пользователя (в JWT claim `imp`). */
  impersonateUser: (userId: number) =>
    request<{ access_token: string; token_type: string }>(`/auth/impersonate/${userId}`, { method: "POST" }),
  /** Вернуть токен администратора после impersonate. */
  stopImpersonation: () =>
    request<{ access_token: string; token_type: string }>("/auth/stop-impersonation", { method: "POST" }),
  getUsers: () => request<UserItem[]>("/users"),
  getUser: (id: number) => request<UserItem>(`/users/${id}`),
  createUser: (data: { username: string; password: string; first_name?: string; last_name?: string; patronymic?: string; telegram_id?: string; phone?: string; birth_date?: string | null }) =>
    request<UserItem>("/users", { method: "POST", body: JSON.stringify(data) }),
  inviteUser: (fio: string) =>
    request<UserItem>("/users/invite", {
      method: "POST",
      body: JSON.stringify({ fio }),
    }),
  updateUser: (id: number, data: { first_name?: string; last_name?: string; patronymic?: string; telegram_id?: string; phone?: string; birth_date?: string | null; is_active?: boolean; password?: string }) =>
    request<UserItem>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteUser: (id: number) => request(`/users/${id}`, { method: "DELETE" }),
  getGroups: () => request<GroupItem[]>("/groups"),
  getGroup: (id: number) => request<GroupItem>(`/groups/${id}`),
  getGroupMembers: (groupId: number) => request<UserItem[]>(`/groups/${groupId}/members`),
  createGroup: (name: string) => request<GroupItem>("/groups", { method: "POST", body: JSON.stringify({ name }) }),
  deleteGroup: (id: number) => request(`/groups/${id}`, { method: "DELETE" }),
  addGroupMember: (groupId: number, userId: number) =>
    request(`/groups/${groupId}/members/${userId}`, { method: "POST" }),
  removeGroupMember: (groupId: number, userId: number) =>
    request(`/groups/${groupId}/members/${userId}`, { method: "DELETE" }),
  getGroupPermissions: () => request<GroupPermissionsResponse>("/settings/group-permissions"),
  updateGroupPermissions: (permissions: Record<string, string[]>) =>
    request<GroupPermissionsResponse>("/settings/group-permissions", {
      method: "PUT",
      body: JSON.stringify({ permissions }),
    }),
  getSidebarVideoSettings: () => request<SidebarVideoSettings>("/settings/sidebar-video"),
  updateSidebarVideoSettings: (data: { video_url?: string | null; visible_group_ids: number[] }) =>
    request<SidebarVideoSettings>("/settings/sidebar-video", {
      method: "PUT",
      body: JSON.stringify({
        video_url: data.video_url ?? null,
        visible_group_ids: data.visible_group_ids ?? [],
      }),
    }),
  getSidebarMenuOrderSettings: () => request<SidebarMenuOrderSettings>("/settings/sidebar-menu-order"),
  updateSidebarMenuOrderSettings: (data: { order: string[] }) =>
    request<SidebarMenuOrderSettings>("/settings/sidebar-menu-order", {
      method: "PUT",
      body: JSON.stringify({
        order: data.order ?? [],
      }),
    }),
  getReportRequiredFields: () => request<{ required: string[] }>("/settings/report-required-fields"),
  updateReportRequiredFields: (required: string[]) =>
    request<{ required: string[] }>("/settings/report-required-fields", {
      method: "PUT",
      body: JSON.stringify({ required }),
    }),
  getReportsTableColumns: () =>
    request<{ default_columns: string[]; mine_columns: string[] | null }>("/settings/reports-table-columns"),
  updateReportsTableColumnsDefault: (columns: string[]) =>
    request<{ columns: string[] }>("/settings/reports-table-columns/default", {
      method: "PUT",
      body: JSON.stringify({ columns }),
    }),
  updateReportsTableColumnsMine: (columns: string[]) =>
    request<{ columns: string[] }>("/settings/reports-table-columns/mine", {
      method: "PUT",
      body: JSON.stringify({ columns }),
    }),
  clearReportsTableColumnsMine: () =>
    request<{ ok: boolean }>("/settings/reports-table-columns/mine", { method: "DELETE" }),
  portalTasks: {
    list: () => request<PortalTaskItem[]>("/portal-tasks"),
    assignees: () => request<TaskAssigneeOption[]>("/portal-tasks/assignees"),
    create: (d: {
      title: string;
      description?: string;
      status?: "new" | "in_progress" | "done";
      priority?: "low" | "medium" | "high";
      assignee_user_id?: number | null;
      due_at?: string | null;
    }) => request<PortalTaskItem>("/portal-tasks", { method: "POST", body: JSON.stringify(d) }),
    update: (
      id: number,
      d: Partial<{
        title: string;
        description: string | null;
        status: "new" | "in_progress" | "done";
        priority: "low" | "medium" | "high";
        assignee_user_id: number | null;
        due_at: string | null;
      }>
    ) => request<PortalTaskItem>(`/portal-tasks/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
    delete: (id: number) => request(`/portal-tasks/${id}`, { method: "DELETE" }),
  },
  supplyTickets: {
    list: (limit: number = 15, offset: number = 0, status: "open" | "closed" | "all" = "open") =>
      request<{ items: SupplyTicketItem[]; total: number; limit: number; offset: number }>(
        `/supply-tickets?limit=${limit}&offset=${offset}&status=${status}`
      ),
    create: (d: { warehouse_id?: number | null; request_text: string }) =>
      request<SupplyTicketItem>("/supply-tickets", { method: "POST", body: JSON.stringify(d) }),
    updateStatus: (ticketId: number, status: "open" | "closed") =>
      request<SupplyTicketItem>(`/supply-tickets/${ticketId}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    messages: (ticketId: number) => request<SupplyTicketMessageItem[]>(`/supply-tickets/${ticketId}/messages`),
    sendMessage: (ticketId: number, message: string) =>
      request<SupplyTicketMessageItem>(`/supply-tickets/${ticketId}/messages`, { method: "POST", body: JSON.stringify({ message }) }),
  },
  training: {
    list: () => request<TrainingArticleItem[]>("/training/articles"),
    get: (id: number) => request<TrainingArticleItem>(`/training/articles/${id}`),
    create: (d: { title: string; section?: string; preview_image_url?: string | null; content_html: string; is_published?: boolean }) =>
      request<TrainingArticleItem>("/training/articles", { method: "POST", body: JSON.stringify(d) }),
    update: (id: number, d: { title?: string; section?: string; preview_image_url?: string | null; content_html?: string; is_published?: boolean }) =>
      request<TrainingArticleItem>(`/training/articles/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
    delete: (id: number) => request(`/training/articles/${id}`, { method: "DELETE" }),
    coursesList: () => request<TrainingCourseRow[]>("/training/courses/list"),
    coursesAdminAll: () => request<TrainingCourseRow[]>("/training/courses/admin/all"),
    courseGetAdmin: (id: number) => request<TrainingCourseAdmin>(`/training/courses/${id}/admin`),
    courseCreate: (d: {
      title: string;
      description?: string;
      preview_image_url?: string | null;
      is_published?: boolean;
      payload?: TrainingCoursePayload;
    }) =>
      request<TrainingCourseAdmin>("/training/courses", {
        method: "POST",
        body: JSON.stringify(d),
      }),
    courseUpdate: (
      id: number,
      d: {
        title?: string;
        description?: string;
        preview_image_url?: string | null;
        is_published?: boolean;
        payload?: TrainingCoursePayload;
      }
    ) =>
      request<TrainingCourseAdmin>(`/training/courses/${id}`, {
        method: "PATCH",
        body: JSON.stringify(d),
      }),
    courseDelete: (id: number) => request(`/training/courses/${id}`, { method: "DELETE" }),
    courseLearn: (id: number) => request<TrainingCourseLearnResponse>(`/training/courses/${id}/learn`),
    courseSubmitQuiz: (
      courseId: number,
      body: { block_id?: string; is_exam?: boolean; answers: Record<string, unknown> }
    ) =>
      request<{
        passed: boolean;
        wrong_count: number;
        total: number;
        wrong_question_ids: string[];
        progress: TrainingCourseLearnResponse["progress"];
      }>(`/training/courses/${courseId}/submit-quiz`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    courseCompleteBlock: (courseId: number, block_id: string) =>
      request<{ ok: boolean; progress: TrainingCourseLearnResponse["progress"] }>(
        `/training/courses/${courseId}/complete-block`,
        { method: "POST", body: JSON.stringify({ block_id }) }
      ),
  },
  normativeActs: {
    list: () => request<NormativeActItem[]>("/normative-acts/articles"),
    get: (id: number) => request<NormativeActItem>(`/normative-acts/articles/${id}`),
    create: (d: {
      title: string;
      section?: string;
      preview_image_url?: string | null;
      attachment_url?: string | null;
      attachment_filename?: string | null;
      visible_user_ids?: number[];
      content_html: string;
      is_published?: boolean;
    }) => request<NormativeActItem>("/normative-acts/articles", { method: "POST", body: JSON.stringify(d) }),
    update: (id: number, d: {
      title?: string;
      section?: string;
      preview_image_url?: string | null;
      attachment_url?: string | null;
      attachment_filename?: string | null;
      visible_user_ids?: number[];
      content_html?: string;
      is_published?: boolean;
    }) => request<NormativeActItem>(`/normative-acts/articles/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
    delete: (id: number) => request(`/normative-acts/articles/${id}`, { method: "DELETE" }),
    sign: (id: number) => request<{ ok: boolean; signed_at?: string | null }>(`/normative-acts/articles/${id}/sign`, { method: "POST" }),
    report: (id: number) => request<NormativeActSignReportItem[]>(`/normative-acts/articles/${id}/report`),
  },
  getOrders: (statusFilter?: "new" | "accepted" | "all", offset?: number) => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status_filter", statusFilter);
    if (offset != null) params.set("offset", String(offset));
    return request<{ items: OrderItem[]; has_more: boolean }>(`/orders${params.toString() ? `?${params}` : ""}`);
  },
  getOrder: (id: number) => request<OrderItem>(`/orders/${id}`),
  acceptOrder: (id: number) => request<OrderItem>(`/orders/${id}/accept`, { method: "PATCH" }),
  reports: {
    list: () =>
      request<ReportItem[]>("/reports"),
    create: (d: {
      warehouse_id?: number;
      utro?: number;
      revenue?: number;
      nal?: number;
      bn?: number;
      ost?: number;
      ost_fact?: number | null;
      is_draft?: boolean;
      has_returns?: boolean;
      return_bn?: number;
      return_nal?: number;
      returns_details?: { date_check: string | null; consultant_last_name: string | null; return_reason?: string | null; amount?: number }[];
      bn_card_reconciliation?: number;
      bn_z_report?: number;
      has_encashment?: boolean;
      encashment_nal?: number;
      encashment_bn?: number;
      extra_payments?: { amount: number; order_number: string; consultant_last_name?: string | null }[];
      vyhod?: number;
      percent?: number;
      vzyala?: number | null;
      vzyala_details?: {
        order_number: string;
        amount: number;
        taken_reason_id?: number | null;
        taken_source_id?: number | null;
        order_percent?: number | null;
        report_month?: string | null;
        warehouse_id: number | null;
        linked_debt_row_uid?: string | null;
        linked_debt_report_id?: number | null;
      }[];
      dolg?: number | null;
      dolg_details?: {
        order_number: string;
        amount: number;
        debt_reason_id?: number | null;
        order_percent?: number | null;
        report_month?: string | null;
        warehouse_id: number | null;
        debt_row_uid?: string | null;
      }[];
      has_expenses?: boolean;
      expenses?: { amount: number; expense_article_id: number }[];
      z_report_urls?: string[];
      card_reconciliation_urls?: string[];
    }) => request<{ id: number }>("/reports", { method: "POST", body: JSON.stringify(d) }),
    get: (id: number) => request<ReportItem>(`/reports/${id}`),
    update: (
      id: number,
      d: {
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
        returns_details?: { date_check: string | null; consultant_last_name: string | null; return_reason?: string | null; amount?: number }[];
        bn_card_reconciliation?: number;
        bn_z_report?: number;
        has_encashment?: boolean;
        encashment_nal?: number;
        encashment_bn?: number;
        extra_payments?: { amount: number; order_number: string; consultant_last_name?: string | null }[];
        vyhod?: number;
        percent?: number;
        vzyala?: number | null;
        vzyala_details?: {
          order_number: string;
          amount: number;
          taken_reason_id?: number | null;
          taken_source_id?: number | null;
          order_percent?: number | null;
          report_month?: string | null;
          warehouse_id: number | null;
          linked_debt_row_uid?: string | null;
          linked_debt_report_id?: number | null;
        }[];
        dolg?: number | null;
        dolg_details?: {
          order_number: string;
          amount: number;
          debt_reason_id?: number | null;
          order_percent?: number | null;
          report_month?: string | null;
          warehouse_id: number | null;
          debt_row_uid?: string | null;
        }[];
        has_expenses?: boolean;
        expenses?: { amount: number; expense_article_id: number }[];
        z_report_urls?: string[];
        card_reconciliation_urls?: string[];
        /** ISO 8601; только при редактировании отчёта администратором */
        created_at?: string;
        /** ISO 8601; время отправки (используется в списке отчётов) */
        submitted_at?: string;
        /** Смена отправителя отчёта (консультант); только при редактировании администратором */
        user_id?: number;
      }
    ) => request<ReportItem>(`/reports/${id}`, { method: "PATCH", body: JSON.stringify({ ...d, is_draft: false }) }),
    delete: (id: number) => request(`/reports/${id}`, { method: "DELETE" }),
    getDraft: () => request<ReportItem | null>("/reports/draft"),
    consultants: () => request<{ id: number; last_name: string }[]>("/reports/consultants"),
    availableDebts: (params?: { userId?: number; excludeReportId?: number }) => {
      const sp = new URLSearchParams();
      if (params?.userId != null) sp.set("user_id", String(params.userId));
      if (params?.excludeReportId != null) sp.set("exclude_report_id", String(params.excludeReportId));
      return request<{ rows: AvailableDebtRow[] }>(`/reports/debts/available${sp.toString() ? `?${sp.toString()}` : ""}`);
    },
    debtsSummary: () => request<{ rows: DebtSummaryRow[] }>("/reports/debts/summary"),
    /** Сводка по долгам только для текущего пользователя (консультант). */
    debtsMySummary: () => request<{ rows: DebtSummaryRow[] }>("/reports/debts/my-summary"),
    takenSummary: () => request<{ rows: TakenSummaryRow[] }>("/reports/taken/summary"),
    /** Строки «Взято» только из отчётов текущего пользователя. */
    takenMySummary: () => request<{ rows: TakenSummaryRow[] }>("/reports/taken/my-summary"),
    withholdingSummary: () => request<{ rows: ManualWithholdingRow[] }>("/reports/withholding/summary"),
    createWithholding: (d: {
      user_id: number;
      amount: number;
      warehouse_id?: number | null;
      report_month?: string | null;
      reason?: string | null;
      note?: string | null;
    }) => request<ManualWithholdingRow>("/reports/withholding/manual", { method: "POST", body: JSON.stringify(d) }),
    deleteWithholding: (id: number) => request<void>(`/reports/withholding/manual/${id}`, { method: "DELETE" }),
    employeeLedger: (userId: number) =>
      request<EmployeeLedgerResponse>(`/reports/debts/employee-ledger?user_id=${encodeURIComponent(String(userId))}`),
    createManualDebt: (d: {
      user_id: number;
      amount: number;
      debt_reason_id?: number | null;
      warehouse_id?: number | null;
      report_month?: string | null;
      order_number?: string;
      note?: string | null;
    }) =>
      request<{
        id: number;
        user_id: number;
        amount: number;
        debt_row_uid: string;
        debt_reason_id?: number | null;
        warehouse_id?: number | null;
        report_month?: string | null;
        order_number?: string;
        note?: string | null;
        created_at?: string | null;
      }>("/reports/debts/manual", { method: "POST", body: JSON.stringify(d) }),
    deleteManualDebt: (id: number) => request(`/reports/debts/manual/${id}`, { method: "DELETE" }),
    /** Корректировка ручной записи; при сумме 0 и отсутствии зачётов — удаление (204). */
    updateManualDebt: (
      id: number,
      d: {
        amount?: number;
        debt_reason_id?: number | null;
        warehouse_id?: number | null;
        report_month?: string | null;
        order_number?: string;
        note?: string | null;
      }
    ) =>
      request<{
        id: number;
        user_id: number;
        amount: number;
        debt_row_uid: string;
        debt_reason_id?: number | null;
        warehouse_id?: number | null;
        report_month?: string | null;
        order_number?: string;
        note?: string | null;
        created_at?: string | null;
      } | void>(`/reports/debts/manual/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
    /** Погасить полностью: сумма = зачтённому; без зачётов — удаление записи (204). */
    settleManualDebt: (id: number) => request<void>(`/reports/debts/manual/${id}/settle`, { method: "POST" }),
    getWarehouseLastOst: (warehouseId: number, opts?: { beforeReportId?: number }) => {
      const sp = new URLSearchParams();
      if (opts?.beforeReportId != null) sp.set("before_report_id", String(opts.beforeReportId));
      const q = sp.toString();
      return request<{ ost: number | null; warehouse_id?: number; last_report_created_at?: string | null }>(
        `/reports/warehouse/${warehouseId}/last-ost${q ? `?${q}` : ""}`
      );
    },
    expensesSummary: (params: { dateFrom: string; dateTo: string; warehouseId?: number | null; timezoneOffsetMinutes?: number }) => {
      const sp = new URLSearchParams();
      sp.set("date_from", params.dateFrom);
      sp.set("date_to", params.dateTo);
      if (params.warehouseId != null) sp.set("warehouse_id", String(params.warehouseId));
      sp.set("timezone_offset_minutes", String(params.timezoneOffsetMinutes ?? new Date().getTimezoneOffset()));
      return request<ExpenseSummaryResponse>(`/reports/summary/expenses?${sp.toString()}`);
    },
    encashmentSummary: (params: { dateFrom: string; dateTo: string; warehouseId?: number | null; timezoneOffsetMinutes?: number }) => {
      const sp = new URLSearchParams();
      sp.set("date_from", params.dateFrom);
      sp.set("date_to", params.dateTo);
      if (params.warehouseId != null) sp.set("warehouse_id", String(params.warehouseId));
      sp.set("timezone_offset_minutes", String(params.timezoneOffsetMinutes ?? new Date().getTimezoneOffset()));
      return request<EncashmentSummaryResponse>(`/reports/summary/encashment?${sp.toString()}`);
    },
    markEncashmentReceived: (params: { warehouseId: number; dateFrom: string; dateTo: string }) =>
      request<{ ok: boolean }>("/reports/encashment/received", {
        method: "POST",
        body: JSON.stringify({
          warehouse_id: params.warehouseId,
          date_from: params.dateFrom,
          date_to: params.dateTo,
        }),
      }),
    unmarkEncashmentReceived: (params: { warehouseId: number; dateFrom: string; dateTo: string }) => {
      const sp = new URLSearchParams();
      sp.set("warehouse_id", String(params.warehouseId));
      sp.set("date_from", params.dateFrom);
      sp.set("date_to", params.dateTo);
      return request<void>(`/reports/encashment/received?${sp.toString()}`, { method: "DELETE" });
    },
  },
  centralCashPayouts: {
    list: () => request<CentralCashPayoutItem[]>("/central-cash-payouts"),
    create: (d: { paid_to_user_id: number; amount: number; note?: string | null }) =>
      request<CentralCashPayoutItem>("/central-cash-payouts", { method: "POST", body: JSON.stringify(d) }),
    delete: (id: number) => request<void>(`/central-cash-payouts/${id}`, { method: "DELETE" }),
  },
  workSchedule: {
    getPublished: () => request<{ weeks: Record<string, Record<string, string>> }>("/work-schedule/published"),
    publish: (payload: { weeks: Record<string, Record<string, string>> }) =>
      request<{ weeks: Record<string, Record<string, string>> }>("/work-schedule/publish", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    deletePublishedWeek: (weekStart: string) =>
      request<void>(`/work-schedule/published/week/${encodeURIComponent(weekStart)}`, { method: "DELETE" }),
    listDrafts: () => request<WorkScheduleDraftItem[]>("/work-schedule/drafts"),
    getDraft: (id: number) => request<WorkScheduleDraftItem>(`/work-schedule/drafts/${id}`),
    createDraft: (d: { name: string; payload: { weeks: Record<string, Record<string, string>> } }) =>
      request<WorkScheduleDraftItem>("/work-schedule/drafts", { method: "POST", body: JSON.stringify(d) }),
    updateDraft: (
      id: number,
      d: { name?: string; payload?: { weeks: Record<string, Record<string, string>> } }
    ) => request<WorkScheduleDraftItem>(`/work-schedule/drafts/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
    deleteDraft: (id: number) => request(`/work-schedule/drafts/${id}`, { method: "DELETE" }),
    confirmSchedule: (weekStart: string) =>
      request<WorkScheduleMyConfirmation>("/work-schedule/confirmation", {
        method: "POST",
        body: JSON.stringify({ week_start: weekStart }),
      }),
    getMyConfirmation: (weekStart: string) => {
      const sp = new URLSearchParams({ week_start: weekStart });
      return request<WorkScheduleMyConfirmation>(`/work-schedule/confirmation/me?${sp.toString()}`);
    },
    getConfirmationsReport: (weekStart: string) => {
      const sp = new URLSearchParams({ week_start: weekStart });
      return request<WorkScheduleConfirmationReport>(`/work-schedule/confirmations/report?${sp.toString()}`);
    },
  },
  pricelist: {
    list: () => requestPricelistListWithOffline("/pricelist", "warehouse"),
    get: (id: number) => requestPricelistItemWithOffline(`/pricelist/${id}`, "warehouse", id),
  },
  /** Прайс RX — отдельные таблицы на бэкенде, не общие с «Прайс склад». */
  pricelistRx: {
    list: () => requestPricelistListWithOffline("/pricelist-rx", "rx"),
    get: (id: number) => requestPricelistItemWithOffline(`/pricelist-rx/${id}`, "rx", id),
  },
  /** Прайс МКЛ — отдельные таблицы на бэкенде. */
  pricelistMkl: {
    list: () => requestPricelistListWithOffline("/pricelist-mkl", "mkl"),
    get: (id: number) => requestPricelistItemWithOffline(`/pricelist-mkl/${id}`, "mkl", id),
  },
  pricelistOffline: {
    getSnapshot: async () => readPricelistOfflineStore(),
    syncCatalog: async (catalog: PricelistCatalog) => {
      const endpointByCatalog: Record<PricelistCatalog, string> = {
        warehouse: "/pricelist",
        rx: "/pricelist-rx",
        mkl: "/pricelist-mkl",
      };
      const list = await request<PricelistItemResponse[]>(endpointByCatalog[catalog]);
      await cachePricelistList(catalog, list || []);
      const assets = await cacheAssetsFromPricelistItems(list || []);
      return {
        catalog,
        count: (list || []).length,
        assets: assets.saved,
        assets_total: assets.total,
        assets_to_download: assets.toDownload,
        downloaded_bytes: assets.downloadedBytes,
        updated_at: new Date().toISOString(),
      };
    },
    syncAllWithProgress: async (onProgress?: (p: {
      stage: string;
      doneFiles: number;
      totalFiles: number;
      toDownloadFiles: number;
      downloadedBytes: number;
    }) => void) => {
      let doneFiles = 0;
      let totalFiles = 0;
      let toDownloadFiles = 0;
      let downloadedBytes = 0;
      const notify = (stage: string) => onProgress?.({ stage, doneFiles, totalFiles, toDownloadFiles, downloadedBytes });

      const syncOne = async (catalog: PricelistCatalog, stageLabel: string) => {
        const endpointByCatalog: Record<PricelistCatalog, string> = {
          warehouse: "/pricelist",
          rx: "/pricelist-rx",
          mkl: "/pricelist-mkl",
        };
        notify(`${stageLabel}: загрузка списка`);
        const list = await request<PricelistItemResponse[]>(endpointByCatalog[catalog]);
        await cachePricelistList(catalog, list || []);
        const baseDone = doneFiles;
        const baseTotal = totalFiles;
        const baseToDownload = toDownloadFiles;
        const baseBytes = downloadedBytes;
        const assetStats = await cacheAssetsFromPricelistItems(list || [], (s) => {
          doneFiles = baseDone + s.done;
          totalFiles = baseTotal + s.total;
          toDownloadFiles = baseToDownload + s.toDownload;
          downloadedBytes = baseBytes + s.downloadedBytes;
          notify(`${stageLabel}: файлы ${s.done}/${s.total}`);
        });
        doneFiles = baseDone + assetStats.total;
        totalFiles = baseTotal + assetStats.total;
        toDownloadFiles = baseToDownload + assetStats.toDownload;
        downloadedBytes = baseBytes + assetStats.downloadedBytes;
        notify(`${stageLabel}: готово`);
        return {
          catalog,
          count: (list || []).length,
          assets: assetStats.saved,
          assets_total: assetStats.total,
          assets_to_download: assetStats.toDownload,
          downloaded_bytes: assetStats.downloadedBytes,
          updated_at: new Date().toISOString(),
        };
      };

      const warehouse = await syncOne("warehouse", "Склад");
      const rx = await syncOne("rx", "RX");
      const mkl = await syncOne("mkl", "MKL");
      notify("Видео сайдбара");
      const sidebarVideo = await api.pricelistOffline.syncSidebarVideo();
      if (sidebarVideo.url) {
        totalFiles += 1;
        doneFiles += sidebarVideo.saved ? 1 : 0;
        toDownloadFiles += sidebarVideo.saved ? 1 : 0;
      }
      notify("Готово");
      return { warehouse, rx, mkl, sidebarVideo, progress: { doneFiles, totalFiles, toDownloadFiles, downloadedBytes } };
    },
    syncAll: async () => {
      const warehouse = await api.pricelistOffline.syncCatalog("warehouse");
      const rx = await api.pricelistOffline.syncCatalog("rx");
      const mkl = await api.pricelistOffline.syncCatalog("mkl");
      const sidebarVideo = await api.pricelistOffline.syncSidebarVideo();
      return { warehouse, rx, mkl, sidebarVideo };
    },
    syncSidebarVideo: async () => {
      try {
        const cfg = await api.getSidebarVideoSettings();
        const videoUrl = (cfg.video_url || "").trim();
        if (!videoUrl) {
          return { saved: false, url: null as string | null };
        }
        const saved = (await cacheAssetUrl(videoUrl)).ok;
        return { saved, url: videoUrl };
      } catch {
        return { saved: false, url: null as string | null };
      }
    },
    resolveAssetUrl: async (assetUrl: string) => {
      const normalized = normalizeAssetUrl(assetUrl);
      if (!normalized) return assetUrl;
      const cachedObjectUrl = resolvedAssetObjectUrlCache.get(normalized);
      if (cachedObjectUrl) return cachedObjectUrl;
      const cachedPromise = resolveAssetPromiseCache.get(normalized);
      if (cachedPromise) return cachedPromise;
      const resolver = (async () => {
        const blob = await readCachedAssetBlob(normalized);
        if (!blob) return assetUrl;
        try {
          const objectUrl = URL.createObjectURL(blob);
          resolvedAssetObjectUrlCache.set(normalized, objectUrl);
          return objectUrl;
        } catch {
          return assetUrl;
        }
      })();
      resolveAssetPromiseCache.set(normalized, resolver);
      const resolved = await resolver;
      resolveAssetPromiseCache.delete(normalized);
      return resolved;
    },
  },
  ref: {
    organizations: { list: () => request<RefItem[]>("/ref/organizations"), create: (d: { name: string }) => request<RefItem>("/ref/organizations", { method: "POST", body: JSON.stringify(d) }), update: (id: number, d: { name: string }) => request<RefItem>(`/ref/organizations/${id}`, { method: "PATCH", body: JSON.stringify(d) }), delete: (id: number) => request(`/ref/organizations/${id}`, { method: "DELETE" }) },
    departments: { list: () => request<RefItem[]>("/ref/departments"), create: (d: { name: string }) => request<RefItem>("/ref/departments", { method: "POST", body: JSON.stringify(d) }), update: (id: number, d: { name: string }) => request<RefItem>(`/ref/departments/${id}`, { method: "PATCH", body: JSON.stringify(d) }), delete: (id: number) => request(`/ref/departments/${id}`, { method: "DELETE" }) },
    warehouses: {
      list: () => request<WarehouseItem[]>("/ref/warehouses"),
      get: (id: number) => request<WarehouseItem>(`/ref/warehouses/${id}`),
      create: (d: {
        name: string;
        organization_id?: number | null;
        manager_id?: number | null;
        opening_hours?: WarehouseOpeningHours | null;
      }) => request<WarehouseItem>("/ref/warehouses", { method: "POST", body: JSON.stringify(d) }),
      update: (
        id: number,
        d: {
          name?: string;
          organization_id?: number | null;
          manager_id?: number | null;
          opening_hours?: WarehouseOpeningHours | null;
        }
      ) => request<WarehouseItem>(`/ref/warehouses/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
      delete: (id: number) => request(`/ref/warehouses/${id}`, { method: "DELETE" }),
    },
    managers: () => request<{ id: number; username: string; first_name?: string; last_name?: string; display_name: string }[]>("/ref/managers"),
    authors: { list: () => request<RefItem[]>("/ref/authors"), create: (d: { name: string }) => request<RefItem>("/ref/authors", { method: "POST", body: JSON.stringify(d) }), update: (id: number, d: { name: string }) => request<RefItem>(`/ref/authors/${id}`, { method: "PATCH", body: JSON.stringify(d) }), delete: (id: number) => request(`/ref/authors/${id}`, { method: "DELETE" }) },
    vatRates: { list: () => request<RefItem[]>("/ref/vat-rates"), create: (d: { name: string }) => request<RefItem>("/ref/vat-rates", { method: "POST", body: JSON.stringify(d) }), update: (id: number, d: { name: string }) => request<RefItem>(`/ref/vat-rates/${id}`, { method: "PATCH", body: JSON.stringify(d) }), delete: (id: number) => request(`/ref/vat-rates/${id}`, { method: "DELETE" }) },
    orderStatuses: { list: () => request<RefItem[]>("/ref/order-statuses"), create: (d: { name: string }) => request<RefItem>("/ref/order-statuses", { method: "POST", body: JSON.stringify(d) }), update: (id: number, d: { name: string }) => request<RefItem>(`/ref/order-statuses/${id}`, { method: "PATCH", body: JSON.stringify(d) }), delete: (id: number) => request(`/ref/order-statuses/${id}`, { method: "DELETE" }) },
    expenseArticles: { list: () => request<RefItem[]>("/ref/expense-articles"), create: (d: { name: string }) => request<RefItem>("/ref/expense-articles", { method: "POST", body: JSON.stringify(d) }), update: (id: number, d: { name: string }) => request<RefItem>(`/ref/expense-articles/${id}`, { method: "PATCH", body: JSON.stringify(d) }), delete: (id: number) => request(`/ref/expense-articles/${id}`, { method: "DELETE" }) },
    takenReasons: { list: () => request<RefItem[]>("/ref/taken-reasons"), create: (d: { name: string }) => request<RefItem>("/ref/taken-reasons", { method: "POST", body: JSON.stringify(d) }), update: (id: number, d: { name: string }) => request<RefItem>(`/ref/taken-reasons/${id}`, { method: "PATCH", body: JSON.stringify(d) }), delete: (id: number) => request(`/ref/taken-reasons/${id}`, { method: "DELETE" }) },
    takenSources: { list: () => request<RefItem[]>("/ref/taken-sources"), create: (d: { name: string }) => request<RefItem>("/ref/taken-sources", { method: "POST", body: JSON.stringify(d) }), update: (id: number, d: { name: string }) => request<RefItem>(`/ref/taken-sources/${id}`, { method: "PATCH", body: JSON.stringify(d) }), delete: (id: number) => request(`/ref/taken-sources/${id}`, { method: "DELETE" }) },
    debtReasons: { list: () => request<RefItem[]>("/ref/debt-reasons"), create: (d: { name: string }) => request<RefItem>("/ref/debt-reasons", { method: "POST", body: JSON.stringify(d) }), update: (id: number, d: { name: string }) => request<RefItem>(`/ref/debt-reasons/${id}`, { method: "PATCH", body: JSON.stringify(d) }), delete: (id: number) => request(`/ref/debt-reasons/${id}`, { method: "DELETE" }) },
    priorities: { list: () => request<RefItem[]>("/ref/priorities"), create: (d: { name: string }) => request<RefItem>("/ref/priorities", { method: "POST", body: JSON.stringify(d) }), update: (id: number, d: { name: string }) => request<RefItem>(`/ref/priorities/${id}`, { method: "PATCH", body: JSON.stringify(d) }), delete: (id: number) => request(`/ref/priorities/${id}`, { method: "DELETE" }) },
    countries: { list: () => request<CountryItem[]>("/ref/countries"), create: (d: { name: string }) => request<CountryItem>("/ref/countries", { method: "POST", body: JSON.stringify(d) }) },
    manufacturers: { 
      list: () => request<ManufacturerItem[]>("/ref/manufacturers"), 
      get: (id: number) => request<ManufacturerItem>(`/ref/manufacturers/${id}`),
      create: (d: { name: string; description?: string; country_id?: number; image_url?: string; catalog_pdf_url?: string; show_in_lens_catalog?: boolean; open_pdf_in_lens_catalog?: boolean; show_country_in_lens_catalog?: boolean; show_description_in_lens_catalog?: boolean }) => request<ManufacturerItem>("/ref/manufacturers", { method: "POST", body: JSON.stringify(d) }),
      update: (id: number, d: { name?: string; description?: string; country_id?: number; image_url?: string; catalog_pdf_url?: string | null; show_in_lens_catalog?: boolean; open_pdf_in_lens_catalog?: boolean; show_country_in_lens_catalog?: boolean; show_description_in_lens_catalog?: boolean }) => request<ManufacturerItem>(`/ref/manufacturers/${id}`, { method: "PATCH", body: JSON.stringify(d) }), 
      delete: (id: number) => request(`/ref/manufacturers/${id}`, { method: "DELETE" }) 
    },
    features: { 
      list: () => request<FeatureItem[]>("/ref/features"), 
      get: (id: number) => request<FeatureItem>(`/ref/features/${id}`),
      create: (d: { name: string; icon_url?: string; color?: string; colors?: string[] }) => request<FeatureItem>("/ref/features", { method: "POST", body: JSON.stringify(d) }), 
      update: (id: number, d: { name?: string; icon_url?: string; color?: string; colors?: string[] }) => request<FeatureItem>(`/ref/features/${id}`, { method: "PATCH", body: JSON.stringify(d) }), 
      delete: (id: number) => request(`/ref/features/${id}`, { method: "DELETE" }) 
    },
    coefficients: {
      list: () => request<RefItem[]>("/ref/coefficients"),
      create: (d: { name: string }) => request<RefItem>("/ref/coefficients", { method: "POST", body: JSON.stringify(d) }),
      delete: (id: number) => request(`/ref/coefficients/${id}`, { method: "DELETE" }),
    },
    colors: {
      list: () => request<RefItem[]>("/ref/colors"),
      get: (id: number) => request<RefItem>(`/ref/colors/${id}`),
      create: (d: { name: string }) => request<RefItem>("/ref/colors", { method: "POST", body: JSON.stringify(d) }),
      update: (id: number, d: { name: string }) => request<RefItem>(`/ref/colors/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
      delete: (id: number) => request(`/ref/colors/${id}`, { method: "DELETE" }),
    },
    pricelistGroups: {
      list: () => request<PricelistGroupItem[]>("/ref/pricelist-groups"),
      get: (id: number) => request<PricelistGroupItem>(`/ref/pricelist-groups/${id}`),
      create: (d: { name: string; sort_index?: number; display_properties_in_list?: boolean; display_as_tiles?: boolean; tiles_per_page?: number }) => request<PricelistGroupItem>("/ref/pricelist-groups", { method: "POST", body: JSON.stringify(d) }),
      update: (id: number, d: { name?: string; sort_index?: number; display_properties_in_list?: boolean; display_as_tiles?: boolean; tiles_per_page?: number }) => request<PricelistGroupItem>(`/ref/pricelist-groups/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
      delete: (id: number) => request(`/ref/pricelist-groups/${id}`, { method: "DELETE" }),
    },
    pricelistRxGroups: {
      list: () => request<PricelistGroupItem[]>("/ref/pricelist-rx-groups"),
      get: (id: number) => request<PricelistGroupItem>(`/ref/pricelist-rx-groups/${id}`),
      create: (d: { name: string; sort_index?: number; display_properties_in_list?: boolean; display_as_tiles?: boolean; tiles_per_page?: number }) => request<PricelistGroupItem>("/ref/pricelist-rx-groups", { method: "POST", body: JSON.stringify(d) }),
      update: (id: number, d: { name?: string; sort_index?: number; display_properties_in_list?: boolean; display_as_tiles?: boolean; tiles_per_page?: number }) => request<PricelistGroupItem>(`/ref/pricelist-rx-groups/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
      delete: (id: number) => request(`/ref/pricelist-rx-groups/${id}`, { method: "DELETE" }),
    },
    pricelistMklGroups: {
      list: () => request<PricelistGroupItem[]>("/ref/pricelist-mkl-groups"),
      get: (id: number) => request<PricelistGroupItem>(`/ref/pricelist-mkl-groups/${id}`),
      create: (d: { name: string; sort_index?: number; display_properties_in_list?: boolean; display_as_tiles?: boolean; tiles_per_page?: number }) => request<PricelistGroupItem>("/ref/pricelist-mkl-groups", { method: "POST", body: JSON.stringify(d) }),
      update: (id: number, d: { name?: string; sort_index?: number; display_properties_in_list?: boolean; display_as_tiles?: boolean; tiles_per_page?: number }) => request<PricelistGroupItem>(`/ref/pricelist-mkl-groups/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
      delete: (id: number) => request(`/ref/pricelist-mkl-groups/${id}`, { method: "DELETE" }),
    },
    pricelist: {
      create: (d: { manufacturer_id: number; lens_name: string; description?: string; full_description?: string; barcode?: string; barcodes?: { code: string; price?: number; description?: string }[]; barcode_sections?: { name?: string | null; items: { code: string; price?: number; description?: string }[] }[]; photo_url?: string; photo_urls?: string[]; sph?: string; cyl?: string; step?: string; diameters?: string; price: number; sort_index?: number; price_from?: boolean; is_promo?: boolean; uv_protection?: boolean; material?: string | null; lens_id?: number; group: string; coefficient?: string; feature_ids?: number[]; feature_colors?: Record<string, string[]>; custom_values?: Record<string, string | string[] | boolean | null>; hide_detail_link?: boolean; hide_photo?: boolean; enable_transposition_calc?: boolean; publish_mode?: "now" | "schedule"; publish_at?: string | null }) =>
        request<PricelistItemResponse>("/ref/pricelist", { method: "POST", body: JSON.stringify(d) }),
      bulkCreate: (items: any[]) =>
        request<PricelistItemResponse[]>("/ref/pricelist/bulk", { method: "POST", body: JSON.stringify({ items }) }),
      update: (id: number, d: { manufacturer_id?: number; lens_name?: string; description?: string | null; full_description?: string | null; barcode?: string; barcodes?: { code: string; price?: number; description?: string }[]; barcode_sections?: { name?: string | null; items: { code: string; price?: number; description?: string }[] }[]; photo_url?: string; photo_urls?: string[]; sph?: string; cyl?: string; step?: string; diameters?: string; price?: number; sort_index?: number; price_from?: boolean; is_promo?: boolean; uv_protection?: boolean; material?: string | null; lens_id?: number | null; group?: string; coefficient?: string | null; feature_ids?: number[]; feature_colors?: Record<string, string[]>; custom_values?: Record<string, string | string[] | boolean | null>; hide_detail_link?: boolean; hide_photo?: boolean; enable_transposition_calc?: boolean; publish_mode?: "now" | "schedule"; publish_at?: string | null }) =>
        request<PricelistItemResponse>(`/ref/pricelist/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
      delete: (id: number) => request(`/ref/pricelist/${id}`, { method: "DELETE" }),
    },
    pricelistRx: {
      create: (d: { manufacturer_id: number; lens_name: string; description?: string; full_description?: string; barcode?: string; barcodes?: { code: string; price?: number; description?: string }[]; barcode_sections?: { name?: string | null; items: { code: string; price?: number; description?: string }[] }[]; photo_url?: string; photo_urls?: string[]; sph?: string; cyl?: string; step?: string; diameters?: string; price: number; sort_index?: number; price_from?: boolean; is_promo?: boolean; uv_protection?: boolean; material?: string | null; lens_id?: number; group: string; coefficient?: string; feature_ids?: number[]; feature_colors?: Record<string, string[]>; custom_values?: Record<string, string | string[] | boolean | null>; hide_detail_link?: boolean; hide_photo?: boolean; enable_transposition_calc?: boolean; publish_mode?: "now" | "schedule"; publish_at?: string | null }) =>
        request<PricelistItemResponse>("/ref/pricelist-rx", { method: "POST", body: JSON.stringify(d) }),
      bulkCreate: (items: any[]) =>
        request<PricelistItemResponse[]>("/ref/pricelist-rx/bulk", { method: "POST", body: JSON.stringify({ items }) }),
      update: (id: number, d: { manufacturer_id?: number; lens_name?: string; description?: string | null; full_description?: string | null; barcode?: string; barcodes?: { code: string; price?: number; description?: string }[]; barcode_sections?: { name?: string | null; items: { code: string; price?: number; description?: string }[] }[]; photo_url?: string; photo_urls?: string[]; sph?: string; cyl?: string; step?: string; diameters?: string; price?: number; sort_index?: number; price_from?: boolean; is_promo?: boolean; uv_protection?: boolean; material?: string | null; lens_id?: number | null; group?: string; coefficient?: string | null; feature_ids?: number[]; feature_colors?: Record<string, string[]>; custom_values?: Record<string, string | string[] | boolean | null>; hide_detail_link?: boolean; hide_photo?: boolean; enable_transposition_calc?: boolean; publish_mode?: "now" | "schedule"; publish_at?: string | null }) =>
        request<PricelistItemResponse>(`/ref/pricelist-rx/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
      delete: (id: number) => request(`/ref/pricelist-rx/${id}`, { method: "DELETE" }),
    },
    pricelistMkl: {
      create: (d: { manufacturer_id: number; lens_name: string; description?: string; full_description?: string; barcode?: string; barcodes?: { code: string; price?: number; description?: string }[]; barcode_sections?: { name?: string | null; items: { code: string; price?: number; description?: string }[] }[]; photo_url?: string; photo_urls?: string[]; sph?: string; cyl?: string; step?: string; diameters?: string; price: number; sort_index?: number; price_from?: boolean; is_promo?: boolean; uv_protection?: boolean; material?: string | null; lens_id?: number; group: string; coefficient?: string; feature_ids?: number[]; feature_colors?: Record<string, string[]>; custom_values?: Record<string, string | string[] | boolean | null>; hide_detail_link?: boolean; hide_photo?: boolean; enable_transposition_calc?: boolean; publish_mode?: "now" | "schedule"; publish_at?: string | null }) =>
        request<PricelistItemResponse>("/ref/pricelist-mkl", { method: "POST", body: JSON.stringify(d) }),
      bulkCreate: (items: any[]) =>
        request<PricelistItemResponse[]>("/ref/pricelist-mkl/bulk", { method: "POST", body: JSON.stringify({ items }) }),
      update: (id: number, d: { manufacturer_id?: number; lens_name?: string; description?: string | null; full_description?: string | null; barcode?: string; barcodes?: { code: string; price?: number; description?: string }[]; barcode_sections?: { name?: string | null; items: { code: string; price?: number; description?: string }[] }[]; photo_url?: string; photo_urls?: string[]; sph?: string; cyl?: string; step?: string; diameters?: string; price?: number; sort_index?: number; price_from?: boolean; is_promo?: boolean; uv_protection?: boolean; material?: string | null; lens_id?: number | null; group?: string; coefficient?: string | null; feature_ids?: number[]; feature_colors?: Record<string, string[]>; custom_values?: Record<string, string | string[] | boolean | null>; hide_detail_link?: boolean; hide_photo?: boolean; enable_transposition_calc?: boolean; publish_mode?: "now" | "schedule"; publish_at?: string | null }) =>
        request<PricelistItemResponse>(`/ref/pricelist-mkl/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
      delete: (id: number) => request(`/ref/pricelist-mkl/${id}`, { method: "DELETE" }),
    },
    pricelistPublications: {
      list: (params?: { catalog?: "warehouse" | "rx" | "mkl"; status?: "pending" | "applied" | "failed" | "cancelled" | "all" }) => {
        const sp = new URLSearchParams();
        if (params?.catalog) sp.set("catalog", params.catalog);
        if (params?.status) sp.set("status", params.status);
        const qs = sp.toString();
        return request<PricelistPublicationJobItem[]>(`/ref/pricelist-publications${qs ? `?${qs}` : ""}`);
      },
      create: (d: { catalog: "warehouse" | "rx" | "mkl"; action?: "create" | "update" | "upsert"; target_item_id?: number | null; payload_json: Record<string, any>; publish_at: string; batch_code?: string | null; batch_name?: string | null }) =>
        request<PricelistPublicationJobItem>("/ref/pricelist-publications", { method: "POST", body: JSON.stringify(d) }),
      assignBatch: (d: { job_ids: number[]; batch_name: string }) =>
        request<PricelistPublicationJobItem[]>("/ref/pricelist-publications/assign-batch", { method: "POST", body: JSON.stringify(d) }),
      publishBatchNow: (batchCode: string) =>
        request<PricelistPublicationJobItem[]>(`/ref/pricelist-publications/batches/${encodeURIComponent(batchCode)}/publish-now`, { method: "POST" }),
      publishNow: (jobId: number) => request<PricelistPublicationJobItem>(`/ref/pricelist-publications/${jobId}/publish-now`, { method: "POST" }),
      publishAllNow: (catalog?: "warehouse" | "rx" | "mkl") => {
        const qs = catalog ? `?catalog=${catalog}` : "";
        return request<PricelistPublicationJobItem[]>(`/ref/pricelist-publications/publish-all-now${qs}`, { method: "POST" });
      },
      cancel: (jobId: number) => request(`/ref/pricelist-publications/${jobId}`, { method: "DELETE" }),
    },
    customFields: {
      list: () => request<CustomFieldItem[]>("/ref/custom-fields"),
      listAll: () => request<CustomFieldItem[]>("/ref/custom-fields/all"),
      create: (d: { code?: string; label: string; field_type: "string" | "string_multi" | "select" | "multi_select" | "checkbox" | "reference"; is_required?: boolean; is_active?: boolean; show_in_warehouse?: boolean; show_in_rx?: boolean; show_in_mkl?: boolean; sort_index?: number }) =>
        request<CustomFieldItem>("/ref/custom-fields", { method: "POST", body: JSON.stringify(d) }),
      update: (id: number, d: Partial<{ code: string; label: string; field_type: "string" | "string_multi" | "select" | "multi_select" | "checkbox" | "reference"; is_required: boolean; is_active: boolean; show_in_warehouse: boolean; show_in_rx: boolean; show_in_mkl: boolean; sort_index: number }>) =>
        request<CustomFieldItem>(`/ref/custom-fields/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
      delete: (id: number) => request(`/ref/custom-fields/${id}`, { method: "DELETE" }),
      addOption: (fieldId: number, d: { value: string; sort_index?: number; is_active?: boolean }) =>
        request<CustomFieldOptionItem>(`/ref/custom-fields/${fieldId}/options`, { method: "POST", body: JSON.stringify(d) }),
      updateOption: (fieldId: number, optionId: number, d: Partial<{ value: string; sort_index: number; is_active: boolean }>) =>
        request<CustomFieldOptionItem>(`/ref/custom-fields/${fieldId}/options/${optionId}`, { method: "PATCH", body: JSON.stringify(d) }),
      deleteOption: (fieldId: number, optionId: number) => request(`/ref/custom-fields/${fieldId}/options/${optionId}`, { method: "DELETE" }),
    },
    products: { list: () => request<ProductRefItem[]>("/ref/products"), create: (d: { name: string; code?: string }) => request<ProductRefItem>("/ref/products", { method: "POST", body: JSON.stringify(d) }), update: (id: number, d: { name?: string; code?: string }) => request<ProductRefItem>(`/ref/products/${id}`, { method: "PATCH", body: JSON.stringify(d) }), delete: (id: number) => request(`/ref/products/${id}`, { method: "DELETE" }) },
    productCharacteristics: {
      list: (productId?: number) => request<ProductCharItem[]>(`/ref/product-characteristics${productId != null ? `?product_id=${productId}` : ""}`),
      create: (d: { product_id: number; name: string }) => request<ProductCharItem>("/ref/product-characteristics", { method: "POST", body: JSON.stringify(d) }),
      update: (id: number, d: { name: string }) => request<ProductCharItem>(`/ref/product-characteristics/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
      delete: (id: number) => request(`/ref/product-characteristics/${id}`, { method: "DELETE" }),
    },
  },
  drive: {
    list: (parentId?: number | null, search?: string, trashed?: boolean) => {
      const params = new URLSearchParams();
      if (!trashed && parentId != null) params.set("parent_id", String(parentId));
      if (search) params.set("search", search);
      if (trashed) params.set("trashed", "true");
      const qs = params.toString();
      return request<DriveItem[]>(`/drive/items${qs ? `?${qs}` : ""}`);
    },
    create: (d: { parent_id?: number | null; is_folder: boolean; name: string; file_url?: string | null; mime_type?: string | null; size_bytes?: number | null; shared_user_ids?: number[]; shared_group_ids?: number[] }) =>
      request<DriveItem>("/drive/items", { method: "POST", body: JSON.stringify(d) }),
    get: (id: number) => request<DriveItem>(`/drive/items/${id}`),
    update: (
      id: number,
      d: {
        parent_id?: number | null;
        name?: string;
        shared_user_ids?: number[];
        shared_group_ids?: number[];
        folder_icon?: string | null;
        public_enabled?: boolean;
      }
    ) => request<DriveItem>(`/drive/items/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
    delete: (id: number) => request(`/drive/items/${id}`, { method: "DELETE" }),
    restore: (id: number) => request<DriveItem>(`/drive/items/${id}/restore`, { method: "POST" }),
    purge: (id: number) => request(`/drive/items/${id}/purge`, { method: "DELETE" }),
    copy: (id: number, d?: { parent_id?: number | null }) =>
      request<DriveItem>(`/drive/items/${id}/copy`, { method: "POST", body: JSON.stringify(d ?? {}) }),
    folders: () => request<DriveFolderPickerItem[]>("/drive/folders"),
    publicGet: (token: string) => request<DrivePublicItemResponse>(`/public/drive/${encodeURIComponent(token)}`),
    path: (parentId?: number | null) => {
      const params = new URLSearchParams();
      if (parentId != null) params.set("parent_id", String(parentId));
      const qs = params.toString();
      return request<DriveBreadcrumbItem[]>(`/drive/path${qs ? `?${qs}` : ""}`);
    },
  },
  upload: {
    profileImage: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return requestMultipart<{ filename: string; url: string }>("/upload/profile-image", fd);
    },
    chatImage: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return requestMultipart<{ filename: string; url: string }>("/upload/chat-image", fd);
    },
    sidebarVideo: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return requestMultipart<{ filename: string; url: string }>("/upload/sidebar-video", fd);
    },
  },
  chat: {
    users: (search?: string, limit?: number) => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (limit != null && limit > 0) params.set("limit", String(limit));
      const qs = params.toString();
      return request<ChatUserShortResponse[]>(`/chat/users${qs ? `?${qs}` : ""}`);
    },
    general: {
      messages: (afterId?: number, limit: number = 50) => {
        const params = new URLSearchParams();
        if (afterId != null) params.set("after_id", String(afterId));
        params.set("limit", String(limit));
        return request<ChatMessageItem[]>(`/chat/general/messages?${params.toString()}`);
      },
      send: (text: string | null, files: File[], replyToMessageId?: number | null) => {
        const fd = new FormData();
        if (text != null) fd.append("text", text);
        if (replyToMessageId != null) fd.append("reply_to_message_id", String(replyToMessageId));
        files.forEach((f) => fd.append("files", f));
        if (files.some((f) => (f.name || "").toLowerCase().startsWith("voice-"))) {
          fd.append("is_voice_note", "true");
        }
        return requestMultipart<ChatMessageItem>("/chat/general/messages", fd);
      },
      leave: () => request<void>("/chat/general/leave", { method: "POST" }),
      join: () => request<void>("/chat/general/join", { method: "POST" }),
    },
    privateDialogs: {
      list: () => request<PrivateDialogItem[]>("/chat/private/dialogs"),
      ensure: (userId: number) => request<{ id: number }>(`/chat/private/dialogs/${userId}`, { method: "POST" }),
      messages: (dialogId: number, afterId?: number, limit: number = 50) =>
        (() => {
          const params = new URLSearchParams();
          if (afterId != null) params.set("after_id", String(afterId));
          params.set("limit", String(limit));
          return request<ChatMessageItem[]>(`/chat/private/dialogs/${dialogId}/messages?${params.toString()}`);
        })(),
      send: (dialogId: number, text: string | null, files: File[], replyToMessageId?: number | null) => {
        const fd = new FormData();
        if (text != null) fd.append("text", text);
        if (replyToMessageId != null) fd.append("reply_to_message_id", String(replyToMessageId));
        files.forEach((f) => fd.append("files", f));
        if (files.some((f) => (f.name || "").toLowerCase().startsWith("voice-"))) {
          fd.append("is_voice_note", "true");
        }
        return requestMultipart<ChatMessageItem>(`/chat/private/dialogs/${dialogId}/messages`, fd);
      },
      /** Убрать личный чат из списка у текущего пользователя (у собеседника остаётся). */
      delete: (dialogId: number) => request<void>(`/chat/private/dialogs/${dialogId}`, { method: "DELETE" }),
    },
    groupDialogs: {
      list: () => request<GroupDialogItem[]>("/chat/group/dialogs"),
      create: (data: { name: string; image_url?: string | null; member_ids?: number[] }) =>
        request<GroupDialogItem>("/chat/group/dialogs", {
          method: "POST",
          body: JSON.stringify({ name: data.name, image_url: data.image_url ?? null, member_ids: data.member_ids ?? [] }),
        }),
      update: (dialogId: number, data: { name?: string; image_url?: string | null }) =>
        request<GroupDialogItem>(`/chat/group/dialogs/${dialogId}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        }),
      addMember: (dialogId: number, userId: number) =>
        request<void>(`/chat/group/dialogs/${dialogId}/members/${userId}`, { method: "POST" }),
      removeMember: (dialogId: number, userId: number) =>
        request<void>(`/chat/group/dialogs/${dialogId}/members/${userId}`, { method: "DELETE" }),
      /** Полное удаление группы (только администратор). */
      delete: (dialogId: number) =>
        request<void>(`/chat/group/dialogs/${dialogId}`, { method: "DELETE" }),
      members: (dialogId: number) => request<GroupMemberItem[]>(`/chat/group/dialogs/${dialogId}/members`),
      messages: (dialogId: number, afterId?: number, limit: number = 50) => {
        const params = new URLSearchParams();
        if (afterId != null) params.set("after_id", String(afterId));
        params.set("limit", String(limit));
        return request<ChatMessageItem[]>(`/chat/group/dialogs/${dialogId}/messages?${params.toString()}`);
      },
      send: (dialogId: number, text: string | null, files: File[], replyToMessageId?: number | null) => {
        const fd = new FormData();
        if (text != null) fd.append("text", text);
        if (replyToMessageId != null) fd.append("reply_to_message_id", String(replyToMessageId));
        files.forEach((f) => fd.append("files", f));
        if (files.some((f) => (f.name || "").toLowerCase().startsWith("voice-"))) {
          fd.append("is_voice_note", "true");
        }
        return requestMultipart<ChatMessageItem>(`/chat/group/dialogs/${dialogId}/messages`, fd);
      },
    },
    editMessage: (messageId: number, text: string | null) =>
      request<ChatMessageItem>(`/chat/messages/${messageId}`, { method: "PATCH", body: JSON.stringify({ text }) }),
    forwardMessage: (messageId: number, data: { target_chat_type: "general" | "private" | "group"; target_dialog_id?: number | null }) =>
      request<ChatMessageItem>(`/chat/messages/${messageId}/forward`, {
        method: "POST",
        body: JSON.stringify({ target_chat_type: data.target_chat_type, target_dialog_id: data.target_dialog_id ?? null }),
      }),
    deleteMessage: (messageId: number) => request<void>(`/chat/messages/${messageId}`, { method: "DELETE" }),
    markMessagesRead: (messageIds: number[]) =>
      request<void>("/chat/messages/mark-read", { method: "POST", body: JSON.stringify(messageIds) }),
    markAllMessagesRead: () =>
      request<void>("/chat/messages/mark-read-all", { method: "POST" }),
    notificationsSummary: () =>
      request<ChatNotificationSummary>("/chat/notifications/summary"),
    patchNotificationSettings: (d: { enabled: boolean }) =>
      request<{ chat_notifications_enabled: boolean }>("/chat/notifications/settings", {
        method: "PATCH",
        body: JSON.stringify({ enabled: d.enabled }),
      }),
    webpushPublicKey: () => request<{ public_key: string }>("/chat/webpush/public-key"),
    webpushSubscribe: (d: { endpoint: string; p256dh: string; auth: string; platform?: string }) =>
      request<void>("/chat/webpush/subscribe", { method: "POST", body: JSON.stringify(d) }),
    webpushUnsubscribe: (endpoint: string) => {
      const sp = new URLSearchParams({ endpoint });
      return request<void>(`/chat/webpush/subscribe?${sp.toString()}`, { method: "DELETE" });
    },
  },
};
