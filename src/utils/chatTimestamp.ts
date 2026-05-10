function isSameLocalCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Сегодня — только время; иначе дата и время (год указывается, если не текущий). */
export function formatChatTimestamp(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (isSameLocalCalendarDay(d, now)) {
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }
  const opts: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  };
  if (d.getFullYear() !== now.getFullYear()) {
    opts.year = "numeric";
  }
  return d.toLocaleString("ru-RU", opts);
}
