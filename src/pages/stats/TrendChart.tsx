import type { TrendDay } from '../../api/stats';
import { GroupedBars } from './charts';

const TREND_DAYS = 90;

// Match the server's Europe/Brussels date bucketing so the rightmost slot is
// "today" in the same calendar the API uses.
function todayInBrussels(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date());
}

function shiftDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function TrendChart({ data }: { data: TrendDay[] }) {
  // The /api/stats/trend endpoint only returns days with events. Fill the full
  // 90-day window so the x-axis reflects time, not just non-empty buckets.
  const byDate = new Map(data.map(d => [d.date, d]));
  const today = todayInBrussels();
  const bars = [];
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const date = shiftDays(today, -i);
    const day = byDate.get(date);
    bars.push({
      date,
      values: [
        { key: 'Sessions', value: day?.login ?? 0, colorClass: 'fill-teal-500' },
        { key: 'Lookups',  value: day?.lookup ?? 0, colorClass: 'fill-amber-500' },
      ],
    });
  }
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-gray-900">Activity (90 days)</h2>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 bg-teal-500 rounded-sm" /> Sessions
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 bg-amber-500 rounded-sm" /> Lookups
          </span>
        </div>
      </div>
      <GroupedBars data={bars} />
    </div>
  );
}
