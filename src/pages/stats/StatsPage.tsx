import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  getHeadline, getTrend, getTopAssets, getUsers,
  StatsForbiddenError,
  type Headline, type TrendDay, type TopAsset, type UserRow,
} from '../../api/stats';
import { logout, getCurrentUser } from '../../api/auth-code';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorState } from '../../components/ErrorState';
import { HeadlineTiles } from './HeadlineTiles';
import { TrendChart } from './TrendChart';
import { TopAssetsTable } from './TopAssetsTable';
import { UsersTable } from './UsersTable';
import { NotAuthorized } from './NotAuthorized';

interface SectionState<T> {
  data: T | null;
  error: string | null;
}

function emptySection<T>(): SectionState<T> {
  return { data: null, error: null };
}

export function StatsPage() {
  const [headline, setHeadline] = useState<SectionState<Headline>>(emptySection);
  const [trend, setTrend] = useState<SectionState<TrendDay[]>>(emptySection);
  const [topAssets, setTopAssets] = useState<SectionState<TopAsset[]>>(emptySection);
  const [users, setUsers] = useState<SectionState<UserRow[]>>(emptySection);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // Run all four in parallel; each populates its own section state. A
    // failure in one does not blank the others — that is the per-section
    // error pattern from the spec.
    const settle = async <T,>(
      p: Promise<T>,
      set: (s: SectionState<T>) => void,
    ): Promise<'forbidden' | 'ok' | 'error'> => {
      try {
        const data = await p;
        set({ data, error: null });
        return 'ok';
      } catch (err) {
        if (err instanceof StatsForbiddenError) return 'forbidden';
        set({ data: null, error: err instanceof Error ? err.message : String(err) });
        return 'error';
      }
    };
    const results = await Promise.all([
      settle(getHeadline(),  setHeadline),
      settle(getTrend(),     setTrend),
      settle(getTopAssets(), setTopAssets),
      settle(getUsers(),     setUsers),
    ]);
    if (results.includes('forbidden')) {
      setForbidden(true);
    } else {
      setLoadedAt(new Date());
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (forbidden) return <NotAuthorized />;
  if (loading && !loadedAt) return <LoadingSpinner message="Loading stats..." />;

  const user = getCurrentUser();
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
          <Link to="/">
            <img src="/countroll-logo.svg" alt="Countroll" className="h-5" />
          </Link>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="px-3 py-1 text-sm bg-[#1DB898] text-white rounded hover:bg-[#189e83] disabled:opacity-50"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              onClick={() => logout()}
              title={user ? `Signed in as ${user.preferredUsername}` : 'Sign out'}
              className="text-xs text-gray-500 hover:text-[#1DB898] px-2 py-1"
            >
              {user?.preferredUsername ? `${user.preferredUsername} · Sign out` : 'Sign out'}
            </button>
          </div>
        </div>
      </nav>

      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Stats</h1>
          <p className="text-xs text-gray-500 mt-1">
            {loadedAt ? `Loaded at ${loadedAt.toLocaleTimeString()} · data may lag ~1 min` : 'Loading…'}
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {headline.data
          ? <HeadlineTiles data={headline.data} />
          : <SectionError label="headline tiles" message={headline.error} />}

        {trend.data
          ? <TrendChart data={trend.data} />
          : <SectionError label="trend chart" message={trend.error} />}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {topAssets.data
            ? <TopAssetsTable data={topAssets.data} />
            : <SectionError label="top assets" message={topAssets.error} />}

          {users.data
            ? <UsersTable data={users.data} />
            : <SectionError label="users" message={users.error} />}
        </div>
      </main>
    </div>
  );
}

function SectionError({ label, message }: { label: string; message: string | null }) {
  if (!message) return null;
  return (
    <ErrorState
      title={`Failed to load ${label}`}
      message={message}
      suggestion="Click Refresh, or check the App Service logs."
    />
  );
}
