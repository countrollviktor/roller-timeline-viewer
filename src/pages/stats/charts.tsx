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

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function StackedBars({ data, width = 800, height = 196 }: StackedBarsProps) {
  if (data.length === 0) {
    return <div className="text-sm text-gray-500">No data.</div>;
  }
  const totals = data.map(d => d.values.reduce((s, v) => s + v.value, 0));
  const max = Math.max(...totals, 1);
  const slotW = width / data.length;
  const barW = Math.max(slotW * 0.7, 1);
  const barOffset = (slotW - barW) / 2;

  // Drop a label at every month boundary in the visible window. Three or four
  // labels across 90 days reads cleanly without crowding.
  const labels: { text: string; percent: number }[] = [];
  data.forEach((d, i) => {
    const [, m, day] = d.date.split('-');
    if (day === '01') {
      labels.push({
        text: MONTH_NAMES[Number(m) - 1],
        percent: ((i + 0.5) / data.length) * 100,
      });
    }
  });

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full h-[196px] border-b border-gray-200"
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
      <div className="relative h-5 mt-1">
        {labels.map(l => (
          <span
            key={`${l.text}-${l.percent}`}
            className="absolute -translate-x-1/2 text-[10px] text-gray-500"
            style={{ left: `${l.percent}%` }}
          >
            {l.text}
          </span>
        ))}
      </div>
    </div>
  );
}
