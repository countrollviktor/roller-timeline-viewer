import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchAsset, fetchPictures, fetchEventDocuments, fetchDocumentThumbnailUrl, isApiConfigured } from '../api/countroll';
import { Timeline, MAIN_EVENT_TYPES } from '../components/Timeline';
import { Filters } from '../components/Filters';
import { EventSidebar } from '../components/EventSidebar';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { RollerDiagram } from '../components/RollerDiagram';
import { PhotoLibrary } from '../components/PhotoLibrary';
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
  const DEFAULT_EVENT_TYPES: EventType[] = ['RECOVERED', 'REGRINDED', 'PICTURE', 'OTHER', 'LINKED', 'UNLINKED'];

  // Filter state
  const [selectedTypes, setSelectedTypes] = useState<Set<EventType>>(
    () => new Set(DEFAULT_EVENT_TYPES)
  );
  const [selectedYears, setSelectedYears] = useState<Set<number>>(() => new Set());

  // Sidebar state
  const [selectedEvent, setSelectedEvent] = useState<AssetEvent | null>(null);

  // Photo library state
  const [showPhotoLibrary, setShowPhotoLibrary] = useState(false);

  // Diagram expanded state
  const [showDiagram, setShowDiagram] = useState(false);

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

    // Reset filters when navigating to a new asset
    setSelectedTypes(new Set(DEFAULT_EVENT_TYPES));
    setSelectedYears(new Set());
    setSelectedEvent(null);

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
          const allPictures = [...(picturesData.pictureEvents || [])];

          // Fetch documents for OTHER events (they store pictures as documents)
          const otherEvents = (assetData.events || []).filter((e: AssetEvent) => e.type === 'OTHER' && e.state === 'VISIBLE');
          if (otherEvents.length > 0) {
            const docResults = await Promise.all(
              otherEvents.map(async (e: AssetEvent) => {
                const docs = await fetchEventDocuments(assetId!, e.id);
                const imageDocs = docs.filter(d => d.contentType.startsWith('image/'));
                if (imageDocs.length === 0) return null;
                // Fetch thumbnail URLs for grid display
                const thumbnailUrls = await Promise.all(
                  imageDocs.map(d => fetchDocumentThumbnailUrl(assetId!, e.id, d.documentName))
                );
                return {
                  url: `https://app.countroll.com/#/thing/${assetId}/events/${e.id}`,
                  numberOfPictures: imageDocs.length,
                  pictures: imageDocs.map((d, i) => ({
                    fileName: d.displayName,
                    downloadUrl: thumbnailUrls[i],
                    createdOn: d.creationDateTime,
                    updatedOn: d.lastUpdatedDateTime,
                    contentType: d.contentType,
                  })),
                };
              })
            );
            for (const pe of docResults) {
              if (pe) allPictures.push(pe);
            }
          }

          setAsset(assetData);
          setPictures(allPictures);
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
      {/* Nav bar */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
          <a href="/">
            <img src="/countroll-logo.svg" alt="Countroll" className="h-5" />
          </a>
          <form onSubmit={handleSearch} className="flex gap-1">
            <input
              type="text"
              value={searchId}
              onChange={e => setSearchId(e.target.value)}
              placeholder="Go to asset..."
              className="w-28 sm:w-32 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#1DB898]"
            />
            <button
              type="submit"
              disabled={!searchId.trim()}
              className="px-2 py-1 text-sm bg-[#1DB898] text-white rounded hover:bg-[#189e83] disabled:opacity-50"
            >
              Go
            </button>
          </form>
        </div>
      </nav>

      {/* Asset header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div className="min-w-0">
              {(() => {
                const partnerLabel = asset.partnerLabels
                  ? Object.values(asset.partnerLabels)[0]
                  : undefined;
                return (
                  <>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
                        {partnerLabel || asset.preferredLabel}
                        {partnerLabel && (
                          <span className="text-sm font-normal text-gray-400 ml-2">({asset.preferredLabel})</span>
                        )}
                      </h1>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800 whitespace-nowrap">
                        {asset.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-gray-500 mt-1 text-sm truncate">
                      {asset.description}
                    </p>
                  </>
                );
              })()}
            </div>
            <div className="text-right text-xs text-gray-400 shrink-0">
              <p>{asset.type} ID: {asset.id}</p>
              {asset.currentPosition && (
                <p className="truncate">{asset.currentPosition.name}</p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-4 sm:py-6">
        {/* Stats + Roller Diagram */}
        <div className="flex flex-wrap items-stretch gap-3 sm:gap-4 mb-4 sm:mb-6">
          {asset.nominalCoverDiameter && (
            <div className="bg-white rounded-lg shadow-sm p-3 sm:p-4">
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Diameter</dt>
              <dd className="mt-1 text-xl sm:text-2xl font-semibold text-gray-900">{asset.nominalCoverDiameter} mm</dd>
            </div>
          )}
          {asset.nominalCoverLength && (
            <div className="bg-white rounded-lg shadow-sm p-3 sm:p-4">
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Cover Length</dt>
              <dd className="mt-1 text-xl sm:text-2xl font-semibold text-gray-900">{asset.nominalCoverLength} mm</dd>
            </div>
          )}
          {asset.length && asset.length !== asset.nominalCoverLength && (
            <div className="bg-white rounded-lg shadow-sm p-3 sm:p-4">
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Length</dt>
              <dd className="mt-1 text-xl sm:text-2xl font-semibold text-gray-900">{asset.length} mm</dd>
            </div>
          )}
          {(asset.nominalCoverDiameter || asset.nominalCoverLength || asset.length) && (
            <button
              onClick={() => setShowDiagram(true)}
              className="bg-white rounded-lg shadow-sm p-3 sm:p-4 flex items-center hover:border-[#1DB898] border border-transparent transition-colors cursor-pointer"
            >
              <RollerDiagram type={asset.type} diameter={asset.nominalCoverDiameter} coverLength={asset.nominalCoverLength} totalLength={asset.length} />
            </button>
          )}
          {(() => {
            const totalPhotoCount = pictures.reduce((sum, pe) => sum + pe.pictures.length, 0);
            if (totalPhotoCount === 0) return null;
            return (
              <button
                onClick={() => setShowPhotoLibrary(true)}
                className="bg-white rounded-lg shadow-sm p-3 sm:p-4 hover:border-[#1DB898] border border-transparent transition-colors"
              >
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Photos</dt>
                <dd className="mt-1 text-xl sm:text-2xl font-semibold text-[#1DB898]">📷 {totalPhotoCount}</dd>
              </button>
            );
          })()}
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

        {/* Debug sections */}
        <details className="mt-4 sm:mt-6">
          <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
            Debug: View thing data
          </summary>
          <pre className="mt-2 bg-gray-800 text-green-400 p-4 rounded-lg overflow-auto text-xs max-h-96">
            {JSON.stringify({ ...asset, events: undefined }, null, 2)}
          </pre>
        </details>
        <details className="mt-2">
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
            className="text-[#1DB898] hover:text-[#189e83] underline"
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

      {/* Photo Library */}
      {showPhotoLibrary && (
        <PhotoLibrary
          pictures={pictures}
          onClose={() => setShowPhotoLibrary(false)}
        />
      )}

      {/* Expanded Diagram */}
      {showDiagram && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowDiagram(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-8" onClick={() => setShowDiagram(false)}>
            <div className="bg-white rounded-xl shadow-2xl p-6 sm:p-8 max-w-2xl w-full" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                  {asset.type} Diagram
                </h3>
                <button
                  onClick={() => setShowDiagram(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <RollerDiagram type={asset.type} diameter={asset.nominalCoverDiameter} coverLength={asset.nominalCoverLength} totalLength={asset.length} compact={false} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
