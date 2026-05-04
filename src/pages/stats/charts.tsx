/**
 * Hand-rolled SVG GroupedBars. Originally derived from hannecard-hce-stock
 * (where it was a stacked variant) and adapted to render side-by-side bars
 * per slot — easier to compare two series like Sessions vs Lookups.
 */

export interface GroupedBarsProps {
  data: { date: string; values: { key: string; value: number; colorClass: string }[] }[];
  width?: number;
  height?: number;
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function GroupedBars({ data, width = 800, height = 196 }: GroupedBarsProps) {
  if (data.length === 0) {
    return <div className="text-sm text-gray-500">No data.</div>;
  }
  const seriesCount = data[0].values.length;
  const max = Math.max(
    1,
    ...data.flatMap(d => d.values.map(v => v.value)),
  );
  const slotW = width / data.length;
  const groupW = slotW * 0.85;
  const subBarW = Math.max(groupW / seriesCount, 1);
  const groupOffset = (slotW - groupW) / 2;

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
        {data.map((d, i) =>
          d.values.map((v, j) => {
            const h = (v.value / max) * height;
            const x = i * slotW + groupOffset + j * subBarW;
            const y = height - h;
            return (
              <rect
                key={`${d.date}-${v.key}-${j}`}
                x={x}
                y={y}
                width={subBarW}
                height={h}
                className={v.colorClass}
              >
                <title>{`${d.date} — ${v.key}: ${v.value}`}</title>
              </rect>
            );
          }),
        )}
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
