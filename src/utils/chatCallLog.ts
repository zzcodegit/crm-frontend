const CALL_LOG_PREFIX = "📞 ";

/** Лог звонков в чате (dev). */
export function logChatCall(_event: string, _detail?: unknown): void {
  /* no-op in production build */
}

export function isCallLogMessage(text: string | null | undefined): boolean {
  return Boolean(text && text.startsWith(CALL_LOG_PREFIX));
}

export function callLogIsMissed(text: string | null | undefined): boolean {
  if (!text) return false;
  return text.includes("Пропущенный");
}
