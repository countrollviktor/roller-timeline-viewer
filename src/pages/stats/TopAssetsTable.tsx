import { Link } from 'react-router-dom';
import type { TopAsset } from '../../api/stats';

function relTime(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

export function TopAssetsTable({ data }: { data: TopAsset[] }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <h2 className="text-base font-semibold text-gray-900 px-4 py-3 border-b border-gray-200">
        Top 25 viewed assets (30 days)
      </h2>
      {data.length === 0 ? (
        <div className="p-4 text-sm text-gray-500">No lookups in the last 30 days.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">Asset</th>
              <th className="px-4 py-2 text-right">Views</th>
              <th className="px-4 py-2 text-right">Unique users</th>
              <th className="px-4 py-2 text-right">Last viewed</th>
            </tr>
          </thead>
          <tbody>
            {data.map(row => (
              <tr key={row.assetId} className="border-t border-gray-100">
                <td className="px-4 py-2">
                  <Link
                    to={`/asset/${row.assetId}`}
                    className="text-[#1DB898] hover:text-[#189e83] font-medium"
                  >
                    {row.assetId}
                  </Link>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{row.views}</td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-600">{row.uniqueUsers}</td>
                <td className="px-4 py-2 text-right text-gray-500">{relTime(row.lastViewed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
