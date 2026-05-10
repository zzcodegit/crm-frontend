/** Транспозиция сфероцилиндрического рецепта: S / C × axis → (S+C) / (−C) × axis′ */

const EPS = 1e-6;

export function normalizeAxisDeg(raw: number): number {
  if (!Number.isFinite(raw)) return 90;
  let a = raw % 180;
  if (a < 0) a += 180;
  if (a === 0) return 180;
  return a;
}

/** Парсит число: запятая/точка, ±, пробелы */
export function parseDiopter(s: string): number | null {
  const t = s.replace(/\s/g, "").replace(",", ".").replace("−", "-");
  if (t === "" || t === "-" || t === "+" || t === ".") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function parseAxisInput(s: string): number | null {
  const t = s.replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return normalizeAxisDeg(n);
}

export interface TransposeResult {
  sph: number;
  cyl: number;
  axis: number;
}

/**
 * Транспозиция: S′ = S + C, C′ = −C, ось: если ≤90° то +90°, иначе −90°.
 * При |C| ≈ 0 возвращает null.
 */
export function transposeRx(sph: number, cyl: number, axisDeg: number): TransposeResult | null {
  if (Math.abs(cyl) < EPS) return null;
  const axis = normalizeAxisDeg(axisDeg);
  const sphT = sph + cyl;
  const cylT = -cyl;
  const axisT = axis <= 90 ? axis + 90 : axis - 90;
  return { sph: sphT, cyl: cylT, axis: normalizeAxisDeg(axisT) };
}

function fmtD(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  return sign + Math.abs(n).toFixed(2);
}

/** Человекочитаемый вид: +2.00 / -0.50 × 090° */
export function formatRxLine(sph: number, cyl: number, axis: number): string {
  const ax = Math.round(axis);
  const axStr = ax === 180 ? "180" : String(ax).padStart(3, "0");
  return `${fmtD(sph)} / ${fmtD(cyl)} × ${axStr}°`;
}
