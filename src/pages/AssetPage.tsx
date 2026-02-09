import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchAsset, fetchPictures, isApiConfigured } from '../api/countroll';
import { Timeline, MAIN_EVENT_TYPES } from '../components/Timeline';
import { Filters } from '../components/Filters';
import { EventSidebar } from '../components/EventSidebar';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { LoadingSpinner } from '../components/LoadingSpinner';
import type { EventType, AssetEvent, Asset, PictureEvent } from '../types';

export function AssetPage() {
  const { assetId } = useParams<{ assetId: string }>();
  const navigate = useNavigate();

  // Navigation state
  const [searchId, setSearchId] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchId.trim()) {
      navigate(`/asset/${searchId.trim()}`);
      setSearchId('');
    }
  };

  // Data state
  const [asset, setAsset] = useState<Asset | null>(null);
  const [pictures, setPictures] = useState<PictureEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Default event types (exclude ENGRAVED)
  const DEFAULT_EVENT_TYPES: EventType[] = ['RECOVERED', 'REGRINDED', 'PICTURE', 'LINKED', 'UNLINKED'];

  // Filter state
  const [selectedTypes, setSelectedTypes] = useState<Set<EventType>>(
    () => new Set(DEFAULT_EVENT_TYPES)
  );
  const [selectedYears, setSelectedYears] = useState<Set<number>>(() => new Set());

  // Sidebar state
  const [selectedEvent, setSelectedEvent] = useState<AssetEvent | null>(null);

  // Fetch asset data
  useEffect(() => {
    if (!assetId) {
      setLoading(false);
      return;
    }

    if (!isApiConfigured()) {
      setError('API credentials not configured. Please set VITE_OAUTH_USERNAME and VITE_OAUTH_PASSWORD in .env file.');
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        // Fetch asset and pictures in parallel
        const [assetData, picturesData] = await Promise.all([
          fetchAsset(assetId!),
          fetchPictures(assetId!).catch(() => ({ pictureEvents: [] })),
        ]);

        if (!cancelled) {
          setAsset(assetData);
          setPictures(picturesData.pictureEvents || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load asset data');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [assetId]);

  // Toggle event type filter
  const handleTypeToggle = (type: EventType) => {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  // Reset all filters
  const handleReset = () => {
    setSelectedTypes(new Set(DEFAULT_EVENT_TYPES));
    setSelectedYears(new Set());
  };

  // Filter events
  const filteredEvents = useMemo(() => {
    if (!asset) return [];

    return (asset.events || []).filter((event: AssetEvent) => {
      // Must be visible
      if (event.state !== 'VISIBLE') return false;

      // Must match selected type (or be a non-main type that's always shown)
      const isMainType = MAIN_EVENT_TYPES.includes(event.type);
      if (isMainType && !selectedTypes.has(event.type)) return false;

      // Must be within selected years (if any selected)
      if (selectedYears.size > 0) {
        const eventYear = new Date(event.creationDateTime).getFullYear();
        if (!selectedYears.has(eventYear)) return false;
      }

      return true;
    });
  }, [asset, selectedTypes, selectedYears]);

  // All visible events (for stats)
  const allVisibleEvents = useMemo(() => {
    if (!asset) return [];
    return (asset.events || []).filter(e => e.state === 'VISIBLE');
  }, [asset]);

  // Available years from events
  const availableYears = useMemo(() => {
    if (allVisibleEvents.length === 0) return [];
    const years = new Set(allVisibleEvents.map(e => new Date(e.creationDateTime).getFullYear()));
    return Array.from(years).sort((a, b) => a - b);
  }, [allVisibleEvents]);

  // No asset ID provided
  if (!assetId) {
    return (
      <ErrorState
        title="No Asset ID"
        message="Please provide an asset ID in the URL to view its timeline."
        suggestion="Example: /asset/6168"
      />
    );
  }

  // Loading state
  if (loading) {
    return <LoadingSpinner message={`Loading asset ${assetId}...`} />;
  }

  // Error state
  if (error) {
    return (
      <ErrorState
        title="Failed to Load Asset"
        message={error}
        suggestion="Check the asset ID and your network connection, then try again."
      />
    );
  }

  // Asset not found
  if (!asset) {
    return (
      <ErrorState
        title="Asset Not Found"
        message={`No data found for asset ID: ${assetId}`}
        suggestion="Check the asset ID and try again."
      />
    );
  }

  const isFiltered = filteredEvents.length !== allVisibleEvents.length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
                  {asset.preferredLabel}
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 whitespace-nowrap">
                  {asset.status.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="text-gray-500 mt-1 text-sm sm:text-base truncate">{asset.description}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <form onSubmit={handleSearch} className="flex gap-1">
                <input
                  type="text"
                  value={searchId}
                  onChange={e => setSearchId(e.target.value)}
                  placeholder="Go to asset..."
                  className="w-28 sm:w-32 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={!searchId.trim()}
                  className="px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  Go
                </button>
              </form>
              <div className="text-right text-sm text-gray-500">
                <p>Asset ID: {asset.id}</p>
                {asset.currentPosition && (
                  <p className="truncate">Location: {asset.currentPosition.name}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-4 sm:py-6">
        {/* Stats Row */}
        <div className="flex flex-wrap gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="bg-white rounded-lg shadow-sm p-3 sm:p-4">
            <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Type</dt>
            <dd className="mt-1 text-xl sm:text-2xl font-semibold text-gray-900">{asset.type}</dd>
          </div>
          {asset.nominalCoverDiameter && (
            <div className="bg-white rounded-lg shadow-sm p-3 sm:p-4">
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Diameter</dt>
              <dd className="mt-1 text-xl sm:text-2xl font-semibold text-gray-900">{asset.nominalCoverDiameter} mm</dd>
            </div>
          )}
          {asset.length && (
            <div className="bg-white rounded-lg shadow-sm p-3 sm:p-4">
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Length</dt>
              <dd className="mt-1 text-xl sm:text-2xl font-semibold text-gray-900">{asset.length} mm</dd>
            </div>
          )}
        </div>

        {/* Timeline Card */}
        <div className="bg-white rounded-lg shadow-sm">
          {/* Filters */}
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200 overflow-x-auto">
            <Filters
              selectedTypes={selectedTypes}
              onTypeToggle={handleTypeToggle}
              availableYears={availableYears}
              selectedYears={selectedYears}
              onYearsChange={setSelectedYears}
              onReset={handleReset}
            />
          </div>

          {/* Timeline Header */}
          <div className="px-4 sm:px-6 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-xs sm:text-sm text-gray-500">
              <span className="hidden sm:inline">Scroll to zoom | Drag to pan | Hover for details | Click to open in Countroll</span>
              <span className="sm:hidden">Pinch to zoom | Drag to pan | Tap for details</span>
            </p>
          </div>

          {/* Timeline */}
          <div className="p-2 sm:p-4">
            {allVisibleEvents.length === 0 ? (
              <EmptyState
                title="No Events"
                message="This asset has no recorded events yet."
              />
            ) : filteredEvents.length > 0 ? (
              <Timeline
                events={filteredEvents}
                pictures={pictures}
                assetId={asset.id}
                selectedYears={selectedYears}
                onEventClick={setSelectedEvent}
              />
            ) : (
              <EmptyState
                title="No Matching Events"
                message="No events match your current filter criteria."
                action={{
                  label: 'Reset filters',
                  onClick: handleReset,
                }}
              />
            )}
          </div>

          {/* Event count */}
          {allVisibleEvents.length > 0 && (
            <div className="px-4 sm:px-6 py-2 border-t border-gray-100 text-sm text-gray-500">
              {isFiltered ? (
                <span>Showing {filteredEvents.length} of {allVisibleEvents.length} events</span>
              ) : (
                <span>{allVisibleEvents.length} events</span>
              )}
            </div>
          )}
        </div>

        {/* Debug: Event list */}
        <details className="mt-4 sm:mt-6">
          <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
            Debug: View raw event data ({(asset.events || []).length} total, {filteredEvents.length} filtered)
          </summary>
          <pre className="mt-2 bg-gray-800 text-green-400 p-4 rounded-lg overflow-auto text-xs max-h-96">
            {JSON.stringify(filteredEvents, null, 2)}
          </pre>
        </details>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 py-6 text-center text-sm text-gray-400">
        <p>
          Asset data from{' '}
          <a
            href={`https://app.countroll.com/#/thing/${asset.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:text-blue-600 underline"
          >
            Countroll
          </a>
        </p>
      </footer>

      {/* Event Sidebar */}
      {selectedEvent && (
        <EventSidebar
          event={selectedEvent}
          pictures={pictures}
          assetId={asset.id}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}
