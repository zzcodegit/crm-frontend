/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface Window {
  /** Выставляется в `offline-api-shim.js` внутри APK — обновление снимка офлайн с прода. */
  __mosoptikaApkSyncOffline?: () => Promise<{ ok?: boolean; message?: string } | void>;
}
