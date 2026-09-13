/** Год в БД не используется — только день и месяц; 2000 — високосный (29 февраля). */
export const BIRTH_DATE_STORAGE_YEAR = 2000;

const MONTH_NAMES = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
] as const;

export function birthDateMonthLabel(month: number): string {
  return MONTH_NAMES[month - 1] ?? String(month);
}

export function daysInBirthMonth(month: number): number {
  if (month < 1 || month > 12) return 31;
  return new Date(BIRTH_DATE_STORAGE_YEAR, month, 0).getDate();
}

export function parseBirthDateFromApi(iso: string | null | undefined): { month: number; day: number } | null {
  if (!iso || !String(iso).trim()) return null;
  const m = String(iso).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (day > daysInBirthMonth(month)) return null;
  return { month, day };
}

export function birthDateToApi(month: number, day: number): string | null {
  if (!Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > daysInBirthMonth(month)) return null;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${BIRTH_DATE_STORAGE_YEAR}-${mm}-${dd}`;
}

export function formatBirthDateDisplay(iso: string | null | undefined): string {
  const parts = parseBirthDateFromApi(iso);
  if (!parts) {
    if (!iso || !String(iso).trim()) return "не указана";
    return String(iso).trim();
  }
  return `${parts.day} ${birthDateMonthLabel(parts.month).toLowerCase()}`;
}
