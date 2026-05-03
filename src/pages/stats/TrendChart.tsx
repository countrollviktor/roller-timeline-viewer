import type { TrendDay } from '../../api/stats';
import { StackedBars } from './charts';

export function TrendChart({ data }: { data: TrendDay[] }) {
  // Map each day to the StackedBars row shape. Login is teal, AssetLookup
  // is amber — same palette family as the existing app accents.
  const bars = data.map(d => ({
    date: d.date,
    values: [
      { key: 'Sessions', value: d.login, colorClass: 'fill-teal-500' },
      { key: 'Lookups', value: d.lookup, colorClass: 'fill-amber-500' },
    ],
  }));
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
      <StackedBars data={bars} />
    </div>
  );
}
