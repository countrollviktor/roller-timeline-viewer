import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AssetPage } from './pages/AssetPage';

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
        {/* Logo/Icon */}
        <div className="mx-auto w-20 h-20 bg-[#1DB898] rounded-2xl flex items-center justify-center mb-6 shadow-lg">
          <svg
            className="w-10 h-10 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
          Roller Timeline Viewer
        </h1>
        <p className="text-gray-600 mb-8">
          View maintenance history for industrial rubber rollers
        </p>

        {/* Asset ID Form */}
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

        {/* Sample Asset Link */}
        <div className="text-sm text-gray-500">
          <span>Or try a sample: </span>
          <a
            href="/asset/6168"
            className="text-[#1DB898] hover:text-[#189e83] font-medium underline"
          >
            Asset 6168
          </a>
        </div>

        {/* Footer */}
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
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/asset/:assetId" element={<AssetPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
