/** Совпадает с `android.appendUserAgent` в `apkprice/capacitor.config.ts`. */
const APK_SHELL_UA_MARKER = "MosoptikaPriceAPK";

/** Выставляется в начале `offline-api-shim.js` внутри APK (до загрузки React). */
const APK_SHELL_STORAGE_KEY = "mosoptika_apk_shell";

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

/**
 * Типичный origin бандла CRM внутри Capacitor Android: `https://localhost/...`.
 * Не путать с Vite (`http://localhost:5173`) и preview (`…:4173`).
 */
function isLikelyCapacitorBundledOrigin(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const { protocol, hostname, port } = window.location;
    const h = hostname.toLowerCase();
    if (h !== "localhost" && h !== "127.0.0.1") return false;
    if (port === "5173" || port === "4173") return false;
    if (protocol === "https:") return true;
    if (protocol === "capacitor:" || protocol === "ionic:") return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Полноценный CRM внутри APK Mosoptika Price: локальный бандл + офлайн-шим.
 * Не полагаемся только на `window.Capacitor` — в WebView он иногда недоступен до гидрации
 * или отличается по версии Capacitor.
 */
export function isNativeAppShell(): boolean {
  if (typeof window === "undefined") return false;
  // APK shim выставляет sync перед загрузкой бандла — надёжнее UA/Capacitor для фильтра admin_only.
  if (typeof (window as unknown as { __mosoptikaApkSyncOffline?: unknown }).__mosoptikaApkSyncOffline === "function") {
    return true;
  }
  try {
    const Capacitor = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
    if (typeof Capacitor?.getPlatform === "function") {
      const p = Capacitor.getPlatform();
      if (p === "android" || p === "ios") return true;
    }
    if (typeof Capacitor?.isNativePlatform === "function" && Capacitor.isNativePlatform() === true) {
      return true;
    }
  } catch {
    /* ignore */
  }
  if (isLikelyCapacitorBundledOrigin()) return true;
  try {
    if (localStorage.getItem(APK_SHELL_STORAGE_KEY) === "1") return true;
    if (sessionStorage.getItem(APK_SHELL_STORAGE_KEY) === "1") return true;
  } catch {
    /* ignore */
  }
  try {
    if (typeof navigator !== "undefined" && navigator.userAgent.includes(APK_SHELL_UA_MARKER)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** Разрешённые в APK маршруты: главная, три прайса, поставщики и PDF (включая карточки прайса). */
export function isNativeShellRetailPath(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname === "/lens-catalog" || pathname.startsWith("/lens-catalog/")) return true;
  const bases = ["/pricelist", "/pricelist-rx", "/pricelist-mkl"] as const;
  return bases.some((b) => pathname === b || pathname.startsWith(`${b}/`));
}
