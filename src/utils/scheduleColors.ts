import type { CSSProperties } from "react";

/** Контрастный цвет текста на цветном фоне ячейки графика. */
export function contrastingTextOnScheduleBg(bg: string): string {
  const raw = (bg || "").trim();
  if (!raw.startsWith("#")) return "var(--text-primary)";
  const hex = raw.slice(1);
  if (hex.length !== 3 && hex.length !== 6) return "var(--text-primary)";
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return "var(--text-primary)";
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#172b4d" : "#ffffff";
}

export function scheduleConsultantChipStyle(
  name: string,
  colors: Record<string, string>,
  highlight: boolean,
  activeName: string,
): CSSProperties {
  const bg = (colors[name] || "").trim();
  if (bg) {
    return {
      backgroundColor: bg,
      color: contrastingTextOnScheduleBg(bg),
      border:
        highlight && activeName === name
          ? "2px solid var(--accent)"
          : "1px solid rgba(0, 0, 0, 0.1)",
      boxShadow: highlight && activeName === name ? "0 0 0 1px var(--accent-light)" : undefined,
    };
  }
  if (highlight && activeName === name) {
    return {
      backgroundColor: "var(--accent-light)",
      color: "var(--accent)",
      fontWeight: 700,
    };
  }
  return {};
}
