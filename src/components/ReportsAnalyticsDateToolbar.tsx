import type { DatePresetId } from "../pages/reportsAnalyticsUtils";
import { dateRangeFromPreset, previousRangeSameLength, todayYmd } from "../pages/reportsAnalyticsUtils";

const PRESETS: { id: DatePresetId; label: string }[] = [
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
  { id: "quarter", label: "Квартал" },
  { id: "year", label: "Год" },
];

type SetParams = (mut: (p: URLSearchParams) => void) => void;

export function ReportsAnalyticsDateToolbar({
  from,
  to,
  cfrom,
  cto,
  setParams,
  compareEnabled,
}: {
  from: string;
  to: string;
  cfrom: string | null;
  cto: string | null;
  setParams: SetParams;
  compareEnabled: boolean;
}) {
  const today = todayYmd();

  const applyPrimaryPreset = (preset: DatePresetId) => {
    const { from: f, to: t } = dateRangeFromPreset(preset);
    setParams((p) => {
      p.set("from", f);
      p.set("to", t);
    });
  };

  const applyComparePreset = (preset: DatePresetId) => {
    const { from: f, to: t } = dateRangeFromPreset(preset);
    setParams((p) => {
      p.set("cfrom", f);
      p.set("cto", t);
    });
  };

  const setPrimaryField = (key: "from" | "to", value: string) => {
    setParams((p) => {
      p.set(key, value);
      const fr = key === "from" ? value : p.get("from") || today;
      const t = key === "to" ? value : p.get("to") || today;
      if (fr > t) {
        if (key === "from") p.set("to", fr);
        else p.set("from", t);
      }
    });
  };

  const setCompareField = (key: "cfrom" | "cto", value: string) => {
    setParams((p) => {
      p.set(key, value);
      const cf = key === "cfrom" ? value : p.get("cfrom") || today;
      const ct = key === "cto" ? value : p.get("cto") || today;
      if (cf > ct) {
        if (key === "cfrom") p.set("cto", cf);
        else p.set("cfrom", ct);
      }
    });
  };

  const enableCompareWithPrevious = () => {
    const { from: pf, to: pt } = previousRangeSameLength(from, to);
    setParams((p) => {
      p.set("cfrom", pf);
      p.set("cto", pt);
    });
  };

  const disableCompare = () => {
    setParams((p) => {
      p.delete("cfrom");
      p.delete("cto");
    });
  };

  const btnClass =
    "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-90";
  const btnStyle = { borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" } as const;

  return (
    <div className="space-y-4 rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-tertiary)" }}>
          Основной период
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {PRESETS.map((pr) => (
            <button key={pr.id} type="button" className={btnClass} style={btnStyle} onClick={() => applyPrimaryPreset(pr.id)}>
              {pr.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            С даты
            <input
              type="date"
              value={from}
              onChange={(e) => setPrimaryField("from", e.target.value)}
              className="px-3 py-2 rounded-lg text-sm border min-w-[10rem]"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            По дату
            <input
              type="date"
              value={to}
              onChange={(e) => setPrimaryField("to", e.target.value)}
              className="px-3 py-2 rounded-lg text-sm border min-w-[10rem]"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
        {!compareEnabled ? (
          <>
            <button
              type="button"
              className="px-3 py-2 rounded-lg text-sm font-medium border"
              style={{ borderColor: "var(--accent)", background: "var(--accent-light)", color: "var(--accent)" }}
              onClick={enableCompareWithPrevious}
            >
              Сравнить с предыдущим периодом
            </button>
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              тот же длины, сразу перед выбранными датами
            </span>
          </>
        ) : (
          <>
            <button type="button" className="text-sm underline-offset-2 hover:underline" style={{ color: "var(--text-secondary)" }} onClick={disableCompare}>
              Скрыть сравнение
            </button>
          </>
        )}
      </div>

      {compareEnabled && cfrom != null && cto != null && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-tertiary)" }}>
            Период для сравнения
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {PRESETS.map((pr) => (
              <button key={`c-${pr.id}`} type="button" className={btnClass} style={btnStyle} onClick={() => applyComparePreset(pr.id)}>
                {pr.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              С даты
              <input
                type="date"
                value={cfrom}
                onChange={(e) => setCompareField("cfrom", e.target.value)}
                className="px-3 py-2 rounded-lg text-sm border min-w-[10rem]"
                style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              По дату
              <input
                type="date"
                value={cto}
                onChange={(e) => setCompareField("cto", e.target.value)}
                className="px-3 py-2 rounded-lg text-sm border min-w-[10rem]"
                style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
