import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom';
import { AssetPage } from './pages/AssetPage';
import { StatsPage } from './pages/stats/StatsPage';
import { initAuth, login, type UserInfo } from './api/auth-code';
import { probeStatsAccess } from './api/stats-access';
import { LoadingSpinner } from './components/LoadingSpinner';

type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: UserInfo };

function LoginScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-emerald-50 flex items-center justify-center p-4">
      <div className="text-center max-w-md w-full">
        <div className="mb-8">
          <img src="/countroll-logo.svg" alt="Countroll" className="w-48 sm:w-64 mx-auto" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">Roller Timeline Viewer</h1>
        <p className="text-gray-600 mb-8">Sign in with your Countroll account to view maintenance history.</p>
        <button
          onClick={() => login()}
          className="px-8 py-3 bg-[#1DB898] text-white rounded-lg hover:bg-[#189e83] transition-colors font-medium shadow-sm"
        >
          Sign in with Countroll
        </button>
      </div>
    </div>
  );
}

function HomePage() {
  const [assetId, setAssetId] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (assetId.trim()) {
      navigate(`/asset/${assetId.trim()}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-emerald-50 flex items-center justify-center p-4">
      <div className="text-center max-w-md w-full">
        <div className="mb-8">
          <img src="/countroll-logo.svg" alt="Countroll" className="w-48 sm:w-64 mx-auto" />
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
          Roller Timeline Viewer
        </h1>
        <p className="text-gray-600 mb-8">
          View maintenance history for industrial rubber rollers
        </p>

        <form onSubmit={handleSubmit} className="mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={assetId}
              onChange={e => setAssetId(e.target.value)}
              placeholder="Enter asset ID..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1DB898] focus:border-transparent text-center text-lg"
            />
            <button
              type="submit"
              disabled={!assetId.trim()}
              className="px-6 py-3 bg-[#1DB898] text-white rounded-lg hover:bg-[#189e83] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              View
            </button>
          </div>
        </form>

        <div className="text-sm text-gray-500">
          <span>Or try a sample: </span>
          <Link
            to="/asset/6168"
            className="text-[#1DB898] hover:text-[#189e83] font-medium underline"
          >
            Asset 6168
          </Link>
        </div>

        <div className="mt-12 text-xs text-gray-400">
          <p>
            Data from{' '}
            <a
              href="https://app.countroll.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-600"
            >
              Countroll
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    initAuth()
      .then(async user => {
        if (user) {
          // Fire-and-await: keeps the loading spinner visible until the
          // probe resolves so the AssetPage nav bar can render the Stats
          // link synchronously on first paint.
          await probeStatsAccess();
          setAuth({ status: 'authenticated', user });
        } else {
          setAuth({ status: 'anonymous' });
        }
      })
      .catch(() => {
        setAuth({ status: 'anonymous' });
      });
  }, []);

  if (auth.status === 'loading') {
    return <LoadingSpinner message="Signing in..." />;
  }

  if (auth.status === 'anonymous') {
    return <LoginScreen />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/asset/:assetId" element={<AssetPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
