/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin прода для `/uploads/*` в WebView без `window.__mosoptikaRemoteOrigin` (перекрывает дефолт в `api.ts`). */
  readonly VITE_REMOTE_ASSET_ORIGIN?: string;
}

declare const __APP_VERSION__: string;

interface Window {
  /** Выставляется в `offline-api-shim.js` внутри APK — обновление снимка офлайн с прода. */
  __mosoptikaApkSyncOffline?: () => Promise<{ ok?: boolean; message?: string } | void>;
  /** Origin прода для статики `/uploads/*` в WebView (иначе `normalizeAssetUrl` даёт https://localhost/...). */
  __mosoptikaRemoteOrigin?: string;
}
