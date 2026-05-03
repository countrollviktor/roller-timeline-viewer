import { Link } from 'react-router-dom';

export function NotAuthorized() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-emerald-50 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <img src="/countroll-logo.svg" alt="Countroll" className="w-48 mx-auto mb-8" />
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Not authorized</h1>
        <p className="text-gray-600 mb-8">
          Your account is not on the stats allowlist. Ask an administrator to add your
          Countroll username if you need access.
        </p>
        <Link
          to="/"
          className="px-6 py-3 bg-[#1DB898] text-white rounded-lg hover:bg-[#189e83] transition-colors font-medium"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
