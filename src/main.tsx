import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { PageTitleProvider } from "./contexts/PageTitleContext";
import { PermissionsProvider } from "./contexts/PermissionsContext";
import App from "./App";
import "./index.css";
import { isNativeAppShell } from "./utils/nativeApp";

function remoteOriginForRecovery(): string {
  const fromWindow = (window as unknown as { __mosoptikaRemoteOrigin?: unknown }).__mosoptikaRemoteOrigin;
  if (typeof fromWindow === "string" && /^https?:\/\//.test(fromWindow)) return fromWindow.replace(/\/$/, "");
  const fromEnv = (import.meta.env.VITE_REMOTE_ASSET_ORIGIN as string | undefined)?.trim();
  if (fromEnv && /^https?:\/\//.test(fromEnv)) return fromEnv.replace(/\/$/, "");
  return "https://mosoptika-study.ru";
}

function tryRecoverFromChunkLoadError(raw: unknown): void {
  try {
    if (!isNativeAppShell()) return;
    const h = window.location.hostname.toLowerCase();
    if (h !== "localhost" && h !== "127.0.0.1") return;
    const msg = String(raw ?? "");
    const isChunkError =
      /Loading chunk [\w-]+ failed/i.test(msg) ||
      /Failed to fetch dynamically imported module/i.test(msg) ||
      (/\/assets\/.+\.js/i.test(msg) && /404|ERR_ABORTED/i.test(msg));
    if (!isChunkError) return;
    // Предохраняемся от циклов (например, если и прод недоступен).
    if (sessionStorage.getItem("crm_chunk_recovery_once") === "1") return;
    sessionStorage.setItem("crm_chunk_recovery_once", "1");
    const target = `${remoteOriginForRecovery()}${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(target);
  } catch {
    /* ignore */
  }
}

window.addEventListener("error", (ev) => {
  const e = ev.error as { message?: string } | undefined;
  tryRecoverFromChunkLoadError(e?.message ?? ev.message);
});
window.addEventListener("unhandledrejection", (ev) => {
  const r = ev.reason as { message?: string } | undefined;
  tryRecoverFromChunkLoadError(r?.message ?? String(ev.reason));
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <PermissionsProvider>
            <PageTitleProvider>
              <App />
            </PageTitleProvider>
          </PermissionsProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);