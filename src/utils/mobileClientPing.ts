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

function fallbackInstallId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (id && id.length >= 6) return id;
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return `crm-${Date.now()}`;
  }
}

async function resolveNativeDeviceId(): Promise<string | null> {
  try {
    const { Device } = await import("@capacitor/device");
    const { identifier } = await Device.getId();
    const id = identifier?.trim();
    return id && id.length >= 6 ? id : null;
  } catch {
    return null;
  }
}

async function resolveDeviceHardwareMeta(): Promise<{
  os_version?: string;
  device_model?: string;
  device_manufacturer?: string;
}> {
  try {
    const { Device } = await import("@capacitor/device");
    const info = await Device.getInfo();
    return {
      os_version: info.osVersion ?? undefined,
      device_model: info.model ?? undefined,
      device_manufacturer: info.manufacturer ?? undefined,
    };
  } catch {
    return {};
  }
}

async function resolveNativeAppMeta(): Promise<{ native_version?: string; native_build?: number | undefined }> {
  try {
    const { App } = await import("@capacitor/app");
    const i = await App.getInfo();
    const buildRaw = i.build;
    let native_build: number | undefined;
    if (buildRaw !== undefined && buildRaw !== null && String(buildRaw).trim() !== "") {
      const n = parseInt(String(buildRaw), 10);
      if (Number.isFinite(n)) native_build = n;
    }
    return {
      native_version: i.version ?? undefined,
      native_build,
    };
  } catch {
    return {};
  }
}

/** Стабильный device_id для реестра: ANDROID_ID / iOS vendor id; иначе локальный UUID. */
export async function getMobileRegistryDeviceId(): Promise<string> {
  const nativeId = await resolveNativeDeviceId();
  if (nativeId) {
    try {
      localStorage.setItem(STORAGE_KEY, nativeId);
    } catch {
      /* ignore */
    }
    return nativeId;
  }
  return fallbackInstallId();
}

export type MobileClientPingExtras = Partial<{
  offline_data_version: string | null | undefined;
}>;

/** POST /api/mobile/clients/ping — JWT опционален; при авторизации заполняется пользователь в реестре. */
export async function pingMobileClientNow(extras?: MobileClientPingExtras): Promise<void> {
  if (!isNativeAppShell()) return;
  const rawId = await getMobileRegistryDeviceId();
  const device_id = String(rawId ?? "").trim();
  if (device_id.length < 6) return;

  const [hw, appMeta] = await Promise.all([resolveDeviceHardwareMeta(), resolveNativeAppMeta()]);
  let offline_data_version: string | undefined;
  if (extras?.offline_data_version != null) {
    const s = String(extras.offline_data_version).trim();
    if (s) offline_data_version = s;
  }

  await api
    .pingMobileClient({
      device_id,
      app_slug: "crm-webview",
      platform: shellPlatform(),
      native_version: appMeta.native_version,
      native_build: appMeta.native_build,
      bundle_version: typeof __APP_VERSION__ !== "undefined" ? String(__APP_VERSION__) : undefined,
      offline_data_version,
      os_version: hw.os_version,
      device_model: hw.device_model,
      device_manufacturer: hw.device_manufacturer,
    })
    .catch(() => {
      /* не мешаем работе приложения */
    });
}

export function scheduleMobileClientPing(): void {
  void pingMobileClientNow();
}
