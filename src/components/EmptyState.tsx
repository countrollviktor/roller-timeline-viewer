interface EmptyStateProps {
  title: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="flex items-center justify-center py-16 px-4">
      <div className="text-center max-w-sm">
        {/* Empty Icon */}
        <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <svg
            className="w-8 h-8 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </div>

        <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
        <p className="text-gray-500 mb-4">{message}</p>

        {action && (
          <button
            onClick={action.onClick}
            className="text-blue-600 hover:text-blue-800 font-medium underline"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
