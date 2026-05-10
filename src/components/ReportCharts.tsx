/**
 * Лёгкие SVG-графики без внешних зависимостей (кривые и столбцы).
 */

type Point = { x: number; y: number };

function buildPath(points: Point[], width: number, height: number, pad: number, maxY: number): string {
  if (points.length === 0) return "";
  const innerW = width - 2 * pad;
  const innerH = height - 2 * pad;
  const n = points.length;
  const maxX = Math.max(n - 1, 1);
  const toX = (i: number) => pad + (i / maxX) * innerW;
  const toY = (y: number) => pad + innerH - (maxY > 0 ? (y / maxY) * innerH : 0);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(2)} ${toY(p.y).toFixed(2)}`).join(" ");
  return d;
}

export function LineChartSeries({
  title,
  series,
  height = 240,
  formatY = (v: number) => v.toLocaleString("ru-RU", { maximumFractionDigits: 0 }),
}: {
  title?: string;
  series: { name: string; color: string; data: { label: string; value: number }[] }[];
  height?: number;
  formatY?: (v: number) => string;
}) {
  const width = 800;
  const pad = 48;
  const labels = series[0]?.data.map((d) => d.label) ?? [];
  const n = labels.length;
  if (n === 0) {
    return (
      <div className="rounded-xl border p-6 text-sm text-center" style={{ borderColor: "var(--border)", color: "var(--text-tertiary)" }}>
        Нет данных для графика за период
      </div>
    );
  }

  const maxY = Math.max(
    1,
    ...series.flatMap((s) => s.data.map((d) => d.value))
  );

  const linePaths = series.map((s) => ({
    name: s.name,
    color: s.color,
    path: buildPath(
      s.data.map((d) => ({ x: 0, y: d.value })),
      width,
      height,
      pad,
      maxY
    ),
    points: s.data.map((d, i) => {
      const innerW = width - 2 * pad;
      const innerH = height - 2 * pad;
      const maxX = Math.max(n - 1, 1);
      const x = pad + (i / maxX) * innerW;
      const y = pad + innerH - (maxY > 0 ? (d.value / maxY) * innerH : 0);
      return { x, y, label: d.label, value: d.value };
    }),
  }));

  const tickYs = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: pad + (height - 2 * pad) * (1 - t),
    val: maxY * t,
  }));

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
      {title && (
        <div className="px-4 pt-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </div>
      )}
      <div className="flex flex-wrap gap-4 px-4 py-2 text-xs" style={{ color: "var(--text-secondary)" }}>
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 rounded" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto block" preserveAspectRatio="xMidYMid meet" aria-hidden>
        {/* сетка по Y */}
        {tickYs.map((t, i) => (
          <g key={i}>
            <line
              x1={pad}
              y1={t.y}
              x2={width - pad}
              y2={t.y}
              stroke="var(--border)"
              strokeOpacity={0.5}
              strokeWidth={1}
            />
            <text x={4} y={t.y + 4} fontSize={11} fill="var(--text-tertiary)">
              {formatY(t.val)}
            </text>
          </g>
        ))}
        {linePaths.map((lp) => (
          <path key={lp.name} d={lp.path} fill="none" stroke={lp.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {linePaths[0]?.points.map((p, i) =>
          i % Math.ceil(n / 12) === 0 || i === n - 1 ? (
            <text
              key={`${p.label}-${i}`}
              x={p.x}
              y={height - 8}
              fontSize={10}
              textAnchor="middle"
              fill="var(--text-tertiary)"
              transform={`rotate(-35 ${p.x} ${height - 8})`}
            >
              {p.label.length >= 8 && p.label[4] === "-" ? p.label.slice(5) : p.label}
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
}

export function BarChartH({
  title,
  rows,
  color = "var(--accent)",
  height = 220,
  formatValue = (v: number) => v.toLocaleString("ru-RU", { maximumFractionDigits: 0 }),
}: {
  title?: string;
  rows: { label: string; value: number }[];
  color?: string;
  height?: number;
  formatValue?: (v: number) => string;
}) {
  const width = 800;
  const pad = 40;
  const maxV = Math.max(1, ...rows.map((r) => r.value));
  const barGap = 6;
  const innerW = width - 2 * pad;
  const barW = rows.length > 0 ? Math.max(8, (innerW - barGap * (rows.length - 1)) / rows.length) : 8;
  const chartH = height - pad - 28;

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border p-6 text-sm text-center" style={{ borderColor: "var(--border)", color: "var(--text-tertiary)" }}>
        Нет данных
      </div>
    );
  }

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
      {title && (
        <div className="px-4 pt-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </div>
      )}
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto block" preserveAspectRatio="xMidYMid meet">
        {rows.map((r, i) => {
          const x = pad + i * (barW + barGap);
          const h = (r.value / maxV) * chartH;
          const y = pad + chartH - h;
          return (
            <g key={`${r.label}-${i}`}>
              <rect x={x} y={y} width={barW} height={h} rx={4} fill={color} opacity={0.85} />
              <text x={x + barW / 2} y={height - 6} fontSize={9} textAnchor="middle" fill="var(--text-tertiary)" transform={`rotate(-40 ${x + barW / 2} ${height - 6})`}>
                {r.label.length > 14 ? r.label.slice(0, 12) + "…" : r.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="px-4 pb-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
        Макс: {formatValue(maxV)}
      </div>
    </div>
  );
}

/**
 * Горизонтальные столбцы: подпись слева, длина пропорциональна значению.
 * Удобно при многих категориях (30–50+ точек): подписи читаемы, блок с прокруткой по высоте.
 */
export function BarChartHorizontal({
  title,
  hint,
  rows,
  color = "var(--accent)",
  rowHeight = 26,
  chartWidth = 800,
  labelMaxChars = 42,
  formatValue = (v: number) => v.toLocaleString("ru-RU", { maximumFractionDigits: 0 }),
}: {
  title?: string;
  /** Подсказка под заголовком (например про сортировку и прокрутку). */
  hint?: string;
  rows: { label: string; value: number }[];
  color?: string;
  rowHeight?: number;
  chartWidth?: number;
  labelMaxChars?: number;
  formatValue?: (v: number) => string;
}) {
  const sorted = sortRowsDesc(rows);
  const maxV = Math.max(1, ...sorted.map((r) => r.value));
  const sum = sorted.reduce((a, r) => a + r.value, 0);
  const padTop = 8;
  const padBottom = 10;
  const labelColW = Math.min(320, chartWidth * 0.38);
  const valueColW = 96;
  const gap = 8;
  const barY1 = labelColW + gap;
  const barMaxW = Math.max(80, chartWidth - barY1 - valueColW - gap - 12);
  const innerH = sorted.length * rowHeight;
  const height = padTop + innerH + padBottom;

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border p-6 text-sm text-center" style={{ borderColor: "var(--border)", color: "var(--text-tertiary)" }}>
        Нет данных
      </div>
    );
  }

  const trunc = (s: string) => {
    const t = s.trim();
    if (t.length <= labelMaxChars) return t;
    return t.slice(0, labelMaxChars - 1) + "…";
  };

  return (
    <div className="rounded-xl border overflow-hidden flex flex-col" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
      {title && (
        <div className="px-4 pt-3 shrink-0 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </div>
      )}
      {hint && (
        <p className="px-4 pt-1 pb-2 text-xs shrink-0 leading-snug" style={{ color: "var(--text-tertiary)" }}>
          {hint}
        </p>
      )}
      <div
        className="overflow-x-auto overflow-y-auto max-h-[min(72vh,920px)] -mx-1 px-1"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <svg
          viewBox={`0 0 ${chartWidth} ${height}`}
          className="min-w-[min(100%,640px)] w-full h-auto block"
          preserveAspectRatio="xMinYMin meet"
          role="img"
          aria-label={title ?? "Горизональная диаграмма"}
        >
          {sorted.map((r, i) => {
            const y0 = padTop + i * rowHeight;
            const yMid = y0 + rowHeight / 2;
            const barW = (r.value / maxV) * barMaxW;
            const full = r.label.trim();
            const labelShown = trunc(full);
            return (
              <g key={`${full}-${i}`}>
                <title>{`${full}: ${formatValue(r.value)} ₽`}</title>
                <text
                  x={labelColW - 6}
                  y={yMid + 4}
                  fontSize={11}
                  textAnchor="end"
                  fill="var(--text-primary)"
                  className="select-none"
                >
                  {labelShown}
                </text>
                <rect
                  x={barY1}
                  y={y0 + 5}
                  width={barMaxW}
                  height={rowHeight - 10}
                  rx={3}
                  fill="var(--border)"
                  opacity={0.35}
                />
                <rect
                  x={barY1}
                  y={y0 + 5}
                  width={barW}
                  height={rowHeight - 10}
                  rx={3}
                  fill={color}
                  opacity={0.88}
                />
                <text
                  x={chartWidth - 10}
                  y={yMid + 4}
                  fontSize={11}
                  textAnchor="end"
                  fill="var(--text-secondary)"
                  className="tabular-nums select-none"
                >
                  {formatValue(r.value)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="px-4 pb-3 pt-1 text-xs shrink-0 border-t" style={{ borderColor: "var(--border)", color: "var(--text-tertiary)" }}>
        Точек: {sorted.length}
        {" · "}
        Сумма: {formatValue(sum)} ₽
        {" · "}
        Макс.: {formatValue(maxV)} ₽
      </div>
    </div>
  );
}

function sortRowsDesc(rows: { label: string; value: number }[]) {
  return [...rows].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "ru"));
}
