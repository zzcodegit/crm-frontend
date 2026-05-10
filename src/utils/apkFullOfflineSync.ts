import { api } from "../api";

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
  parts.push(
    `Прайсы в памяти: склад ${result.warehouse.count}, RX ${result.rx.count}, MKL ${result.mkl.count} · загружено ${Math.round(((result.progress.downloadedBytes || 0) / 1024 / 1024) * 10) / 10} МБ`,
  );
  return { hint: parts.filter(Boolean).join(" · ") };
}
