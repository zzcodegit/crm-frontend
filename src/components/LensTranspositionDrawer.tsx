import { useEffect, useMemo, useState } from "react";
import {
  formatRxLine,
  parseAxisInput,
  parseDiopter,
  transposeRx,
} from "../utils/lensTransposition";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function LensTranspositionDrawer({ open, onClose }: Props) {
  const [sphStr, setSphStr] = useState("-3.00");
  const [cylStr, setCylStr] = useState("-1.25");
  const [axisStr, setAxisStr] = useState("180");

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const parsed = useMemo(() => {
    const sph = parseDiopter(sphStr);
    const cyl = parseDiopter(cylStr);
    const axis = parseAxisInput(axisStr);
    return { sph, cyl, axis };
  }, [sphStr, cylStr, axisStr]);

  const result = useMemo(() => {
    if (parsed.sph === null || parsed.cyl === null || parsed.axis === null) return null;
    return transposeRx(parsed.sph, parsed.cyl, parsed.axis);
  }, [parsed]);

  const invalidInput = parsed.sph === null || parsed.cyl === null || parsed.axis === null;
  const infoNoCyl =
    !invalidInput && result === null
      ? "При цилиндре 0 D транспозиция не нужна — рецепт сферический."
      : null;
  const parseError = invalidInput ? "Проверьте ввод: сфера, цилиндр и ось должны быть числами." : null;

  const resetForm = () => {
    setSphStr("");
    setCylStr("");
    setAxisStr("");
  };

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-[90] transition-opacity duration-300"
        style={{
          background: "rgba(0,0,0,0.45)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          top: "4rem",
        }}
        aria-hidden={!open}
        onClick={onClose}
      />
      <aside
        className="fixed right-0 z-[95] w-full max-w-md shadow-2xl flex flex-col transition-transform duration-300 ease-out"
        style={{
          background: "var(--bg-primary)",
          borderLeft: "1px solid var(--border-color)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          pointerEvents: open ? "auto" : "none",
          top: "4rem",
          height: "calc(100vh - 4rem)",
        }}
        aria-hidden={!open}
        aria-modal="true"
        role="dialog"
        aria-labelledby="lens-transpose-title"
      >
        <div
          className="flex items-center justify-between gap-3 px-5 py-4 shrink-0 border-b"
          style={{ borderColor: "var(--border-color)" }}
        >
          <div>
            <h2 id="lens-transpose-title" className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Транспозиция линз
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
              Эквивалентная запись рецепта в другой форме цилиндра
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-10 h-10 rounded-xl text-lg leading-none flex items-center justify-center transition-colors"
            style={{ color: "var(--text-secondary)", border: "1px solid var(--border-color)" }}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <div className="rounded-xl p-4 text-sm" style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
            <p className="font-medium mb-1" style={{ color: "var(--text-primary)" }}>
              Как это работает
            </p>
            <p>
              Пересчёт: <span className="tabular-nums">S′ = S + C</span>, <span className="tabular-nums">C′ = −C</span>, ось
              поворачивается на 90° (в пределах 1–180°). Удобно при подборе линз, когда в каталоге указан другой знак
              цилиндра.
            </p>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                Сфера (D)
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={sphStr}
                onChange={(e) => setSphStr(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl text-sm outline-none tabular-nums"
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                }}
                placeholder="Напр. -3.00 или +1.50"
                autoComplete="off"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                Цилиндр (DC)
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={cylStr}
                onChange={(e) => setCylStr(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl text-sm outline-none tabular-nums"
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                }}
                placeholder="Напр. -1.25"
                autoComplete="off"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                Ось (градусы)
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={axisStr}
                onChange={(e) => setAxisStr(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl text-sm outline-none tabular-nums"
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                }}
                placeholder="1–180, например 180 или 090"
                autoComplete="off"
              />
            </label>
          </div>

          <div
            className="rounded-xl p-4 border"
            style={{
              background: "var(--bg-secondary)",
              borderColor: parseError ? "var(--error)" : "var(--border-color)",
            }}
          >
            <div className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              Исходный рецепт
            </div>
            {parsed.sph !== null && parsed.cyl !== null && parsed.axis !== null ? (
              <div className="text-base font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                {formatRxLine(parsed.sph, parsed.cyl, parsed.axis)}
              </div>
            ) : (
              <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                —
              </div>
            )}
            <div className="text-xs font-medium mt-4 mb-2" style={{ color: "var(--text-secondary)" }}>
              После транспозиции
            </div>
            {parseError ? (
              <div className="text-sm" style={{ color: "var(--error)" }}>
                {parseError}
              </div>
            ) : infoNoCyl ? (
              <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {infoNoCyl}
              </div>
            ) : result ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="text-lg font-bold tabular-nums flex-1" style={{ color: "var(--accent)" }}>
                  {formatRxLine(result.sph, result.cyl, result.axis)}
                </div>
                <button
                  type="button"
                  onClick={resetForm}
                  className="shrink-0 text-sm font-semibold px-4 py-2 rounded-xl"
                  style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border-color)" }}
                >
                  Сбросить
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}
