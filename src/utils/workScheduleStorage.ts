const PREFIX = "work_schedule_overrides_";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Прочитать правки одной недели из localStorage (ключ понедельника YYYY-MM-DD). */
export function getWeekOverridesFromStorage(weekMonday: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(`${PREFIX}${weekMonday}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeWeekOverridesToStorage(weekMonday: string, map: Record<string, string>): void {
  try {
    localStorage.setItem(`${PREFIX}${weekMonday}`, JSON.stringify(map));
  } catch {
    // ignore
  }
}

/**
 * Переносит ячейки «точка|день» с недели sourceMonday на неделю targetMonday
 * (сдвиг дат на разницу понедельников).
 */
export function remapWeekOverridesBetweenWeeks(
  sourceMap: Record<string, string>,
  sourceMonday: string,
  targetMonday: string
): Record<string, string> {
  const deltaDays = Math.round(
    (new Date(targetMonday + "T12:00:00Z").getTime() - new Date(sourceMonday + "T12:00:00Z").getTime()) / 86400000
  );
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sourceMap)) {
    const pipe = k.lastIndexOf("|");
    if (pipe < 0) continue;
    const point = k.slice(0, pipe);
    const dayYmd = k.slice(pipe + 1);
    if (!YMD_RE.test(dayYmd)) continue;
    const d = new Date(dayYmd + "T12:00:00");
    d.setDate(d.getDate() + deltaDays);
    const newYmd = d.toISOString().slice(0, 10);
    out[`${point}|${newYmd}`] = v;
  }
  return out;
}

/**
 * Копирует график с одной недели на другую в localStorage и возвращает карту для целевой недели.
 * Если передан sourceOverrides (например актуальное состояние текущей недели в редакторе), он используется вместо чтения из storage для sourceMonday.
 */
export function copyWeekScheduleToWeek(
  sourceMonday: string,
  targetMonday: string,
  sourceOverrides?: Record<string, string> | null
): Record<string, string> {
  const src = sourceOverrides != null ? { ...sourceOverrides } : getWeekOverridesFromStorage(sourceMonday);
  const mapped = remapWeekOverridesBetweenWeeks(src, sourceMonday, targetMonday);
  writeWeekOverridesToStorage(targetMonday, mapped);
  return mapped;
}

/** Понедельник недели, в которую попадает дата YYYY-MM-DD. */
export function mondayOfWeekContaining(ymd: string): string {
  const base = new Date(ymd + "T12:00:00Z");
  const day = base.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(base);
  monday.setUTCDate(base.getUTCDate() + diffToMonday);
  return monday.toISOString().slice(0, 10);
}

/** Собрать все недели с правками из localStorage (ключи — понедельники YYYY-MM-DD). */
export function gatherWeeksFromLocalStorage(): Record<string, Record<string, string>> {
  const weeks: Record<string, Record<string, string>> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(PREFIX)) continue;
      const weekStart = key.slice(PREFIX.length);
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Record<string, string>;
      if (parsed && typeof parsed === "object") weeks[weekStart] = parsed;
    }
  } catch {
    // ignore
  }
  return weeks;
}

/** Удалить локальную копию одной недели (после снятия с публикации на сервере). */
export function removeWeekOverridesFromStorage(weekMonday: string): void {
  try {
    localStorage.removeItem(`${PREFIX}${weekMonday}`);
  } catch {
    // ignore
  }
}

export function clearAllWorkScheduleOverridesLocal(): void {
  const toRemove: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) toRemove.push(key);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

/** Заменить локальные правки графика содержимым черновика/публикации. */
export function applyWeeksToLocalStorage(weeks: Record<string, Record<string, string>>): void {
  clearAllWorkScheduleOverridesLocal();
  try {
    Object.entries(weeks).forEach(([weekStart, map]) => {
      localStorage.setItem(`${PREFIX}${weekStart}`, JSON.stringify(map));
    });
  } catch {
    // ignore
  }
}

const MOSCOW_TZ = "Europe/Moscow";

/**
 * Дни недели (ключи YYYY-MM-DD понедельника и далее) в том же виде, что и на главной в WorkScheduleBoard.
 * Нужна согласованность с подтверждениями графика и публикацией (не local + toISOString — иначе сдвиг даты).
 */
export function buildMoscowWeekDays(baseDate: Date): { key: string; label: string }[] {
  const moscowYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: MOSCOW_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(baseDate);

  const baseUtc = new Date(`${moscowYmd}T12:00:00Z`);
  const day = baseUtc.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(baseUtc);
  monday.setUTCDate(baseUtc.getUTCDate() + diffToMonday);
  const list: { key: string; label: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    list.push({
      key: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("ru-RU", {
        timeZone: MOSCOW_TZ,
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
      }),
    });
  }
  return list;
}
