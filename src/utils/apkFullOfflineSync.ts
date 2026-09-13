import { api } from "../api";

import { pingMobileClientNow } from "./mobileClientPing";

export type ApkFullOfflineSyncResult = {
  hint: string;
};

/** Полное обновление офлайн-данных в APK: снимок с прода (если есть шим) + загрузка прайсов в память. */
export async function apkFullOfflineSync(): Promise<ApkFullOfflineSyncResult> {
  const parts: string[] = [];
  if (typeof window !== "undefined" && typeof window.__mosoptikaApkSyncOffline === "function") {
    const snap = await window.__mosoptikaApkSyncOffline();
    const msg =
      snap && typeof snap === "object" && "message" in snap ? String((snap as { message?: string }).message ?? "") : "";
    if (msg) parts.push(msg);
  }
  const result = await api.pricelistOffline.syncAllWithProgress(() => {});
  const sv = result.sidebarVideo;
  const svHint = !sv?.url
    ? "Видео сайдбара: не задано"
    : sv.saved
      ? "Видео сайдбара: скачано"
      : "Видео сайдбара: не удалось скачать (повторите при стабильной сети)";
  parts.push(
    `Прайсы в памяти: склад ${result.warehouse.count}, RX ${result.rx.count}, MKL ${result.mkl.count} · загружено ${Math.round(((result.progress.downloadedBytes || 0) / 1024 / 1024) * 10) / 10} МБ`,
  );
  parts.push(svHint);

  let offlineVer: string | undefined;
  try {
    const r = await fetch(`${window.location.origin}/api/offline/version`, { cache: "no-store" });
    if (r.ok) {
      const j = (await r.json()) as { version?: string };
      if (typeof j.version === "string" && j.version.trim()) offlineVer = j.version.trim();
    }
  } catch {
    /* ignore */
  }
  await pingMobileClientNow({ offline_data_version: offlineVer ?? null });

  return { hint: parts.filter(Boolean).join(" · ") };
}
