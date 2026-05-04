import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { TopAsset } from '../../api/stats';

const PAGE_SIZE = 25;

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
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * PAGE_SIZE;
  const visible = data.slice(start, start + PAGE_SIZE);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="text-base font-semibold text-gray-900">Top viewed assets (30 days)</h2>
        {data.length > PAGE_SIZE && (
          <span className="text-xs text-gray-500 tabular-nums">
            {start + 1}–{start + visible.length} of {data.length}
          </span>
        )}
      </div>
      {data.length === 0 ? (
        <div className="p-4 text-sm text-gray-500">No lookups in the last 30 days.</div>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left w-12">#</th>
                <th className="px-4 py-2 text-left">Asset</th>
                <th className="px-4 py-2 text-right">Views</th>
                <th className="px-4 py-2 text-right">Unique users</th>
                <th className="px-4 py-2 text-right">Last viewed</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row, i) => (
                <tr key={row.assetId} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-gray-400 tabular-nums">{start + i + 1}</td>
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
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 text-xs text-gray-500">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="px-2 py-1 rounded border border-gray-200 hover:border-[#1DB898] hover:text-[#1DB898] disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:text-gray-500"
              >
                Prev
              </button>
              <span className="tabular-nums">Page {safePage + 1} of {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                className="px-2 py-1 rounded border border-gray-200 hover:border-[#1DB898] hover:text-[#1DB898] disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:text-gray-500"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
