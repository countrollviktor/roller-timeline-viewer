/**
 * Hand-rolled SVG StackedBars. Copied from hannecard-hce-stock and
 * trimmed to what the trend chart needs — no Sparkline, no Heatmap.
 * Add them back if a future chart needs them.
 */

export interface StackedBarsProps {
  data: { date: string; values: { key: string; value: number; colorClass: string }[] }[];
  width?: number;
  height?: number;
}

export function StackedBars({ data, width = 800, height = 220 }: StackedBarsProps) {
  if (data.length === 0) {
    return <div className="text-sm text-gray-500">No data.</div>;
  }
  const totals = data.map(d => d.values.reduce((s, v) => s + v.value, 0));
  const max = Math.max(...totals, 1);
  const slotW = width / data.length;
  const barW = Math.max(slotW * 0.7, 1);
  const barOffset = (slotW - barW) / 2;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full h-[220px]"
      role="img"
      aria-label="Daily trend"
    >
      {data.map((d, i) => {
        let yCursor = height;
        const x = i * slotW + barOffset;
        return d.values.map((v, j) => {
          const h = (v.value / max) * height;
          yCursor -= h;
          return (
            <rect
              key={`${d.date}-${v.key}-${j}`}
              x={x}
              y={yCursor}
              width={barW}
              height={h}
              className={v.colorClass}
            >
              <title>{`${d.date} — ${v.key}: ${v.value}`}</title>
            </rect>
          );
        });
      })}
    </svg>
  );
}
