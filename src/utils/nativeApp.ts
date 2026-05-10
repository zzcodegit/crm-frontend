/**
 * В APK (Capacitor) рантайм подставляет window.Capacitor без импорта @capacitor/core в веб-сборке.
 */
export function isNativeAppShell(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const Capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor;
    return typeof Capacitor?.isNativePlatform === "function" && Capacitor.isNativePlatform() === true;
  } catch {
    return false;
  }
}
