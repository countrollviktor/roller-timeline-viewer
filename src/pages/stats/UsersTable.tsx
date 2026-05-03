import { useState } from 'react';
import type { UserRow } from '../../api/stats';

type SortKey = 'lookups' | 'sessions';

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

export function UsersTable({ data }: { data: UserRow[] }) {
  const [sort, setSort] = useState<SortKey>('lookups');
  const sorted = [...data].sort((a, b) => b[sort] - a[sort] || b.sessions - a.sessions);

  function header(label: string, key: SortKey) {
    const active = sort === key;
    return (
      <button
        type="button"
        onClick={() => setSort(key)}
        className={`text-xs uppercase tracking-wide ${
          active ? 'text-[#1DB898] font-semibold' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        {label}{active ? ' ↓' : ''}
      </button>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <h2 className="text-base font-semibold text-gray-900 px-4 py-3 border-b border-gray-200">
        Users (30 days)
      </h2>
      {sorted.length === 0 ? (
        <div className="p-4 text-sm text-gray-500">No activity in the last 30 days.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs uppercase tracking-wide text-gray-500">User</th>
              <th className="px-4 py-2 text-right">{header('Sessions', 'sessions')}</th>
              <th className="px-4 py-2 text-right">{header('Lookups', 'lookups')}</th>
              <th className="px-4 py-2 text-right text-xs uppercase tracking-wide text-gray-500">Assets seen</th>
              <th className="px-4 py-2 text-right text-xs uppercase tracking-wide text-gray-500">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => (
              <tr key={row.username} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium text-gray-900">{row.username}</td>
                <td className="px-4 py-2 text-right tabular-nums">{row.sessions}</td>
                <td className="px-4 py-2 text-right tabular-nums">{row.lookups}</td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-600">{row.assetsSeen}</td>
                <td className="px-4 py-2 text-right text-gray-500">{relTime(row.lastSeen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
