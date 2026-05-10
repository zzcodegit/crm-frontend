/** Парсит сумму из строки («от 3550», «3 550», «3550»). */
export function parsePriceFromText(input: string): number {
  let s = (input || "").trim();
  if (!s) return NaN;
  s = s.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  s = s.replace(/^(от|от\.|ot|from|с|с\.|c)\s+/i, "").trim();
  s = s.replace(/(\d)\s+(?=\d)/g, "$1");
  const m = s.match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return NaN;
  return parseFloat(m[0]!.replace(",", "."));
}

/** true, если в начале строки указано «от …» (сохраняем флаг в БД). */
export function priceFromFromText(input: string): boolean {
  let s = (input || "").trim().replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  if (!s) return false;
  // Поддерживаем варианты: «от 3550», «от3550», «От 3 550», а также «с 3550».
  if (/^(от|от\.|ot|from|с|c)\b/i.test(s)) return true;
  if (/^от\d/i.test(s)) return true;
  if (/^[сc]\d/i.test(s)) return true;
  return false;
}

/** Строка для поля ввода при редактировании. */
export function formatPriceInputValue(price: number, priceFrom: boolean): string {
  if (!priceFrom) return String(price);
  const n = Number(price);
  if (!Number.isFinite(n)) return String(price);
  return `от ${n.toLocaleString("ru-RU")}`;
}

/** Отображение цены в списке и карточке. */
export function formatPricelistPriceRub(price: number, priceFrom?: boolean): string {
  const n = Number(price);
  const formatted = Number.isFinite(n) ? n.toLocaleString("ru-RU") : String(price);
  return priceFrom ? `от ${formatted} ₽` : `${formatted} ₽`;
}
