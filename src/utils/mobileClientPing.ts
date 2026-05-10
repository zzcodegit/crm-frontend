import { api } from "../api";

import { isNativeAppShell } from "./nativeApp";

const STORAGE_KEY = "crm_mobile_device_install_id";

function shellPlatform(): string {
  try {
    const C = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    const p = C?.getPlatform?.();
    if (p && p !== "web") return p;
  } catch {
    /* ignore */
  }
  if (typeof navigator !== "undefined") {
    if (/Android/i.test(navigator.userAgent)) return "android";
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return "ios";
  }
  return "web";
}

function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (id && id.length >= 8) return id;
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return `crm-${Date.now()}`;
  }
}

/** Регистрация APK/WebView по device_id (JWT опционален на бэкенде). */
export function scheduleMobileClientPing(): void {
  if (!isNativeAppShell()) return;
  void api
    .pingMobileClient({
      device_id: getOrCreateDeviceId(),
      app_slug: "crm-webview",
      platform: shellPlatform(),
      native_version: typeof __APP_VERSION__ !== "undefined" ? String(__APP_VERSION__) : undefined,
    })
    .catch(() => {
      /* не мешаем работе приложения */
    });
}
