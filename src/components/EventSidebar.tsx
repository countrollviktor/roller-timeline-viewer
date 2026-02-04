import { EVENT_TYPE_CONFIG } from './Timeline';
import type { AssetEvent, PictureEvent } from '../types';

interface EventSidebarProps {
  event: AssetEvent;
  pictures?: PictureEvent[];
  assetId: string;
  onClose: () => void;
}

// Format date as "25 Aug 2025" or "25 Aug 2025, 14:30"
function formatDate(date: Date, includeTime: boolean): string {
  const day = date.getDate();
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const year = date.getFullYear();

  if (includeTime) {
    const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${day} ${month} ${year}, ${time}`;
  }
  return `${day} ${month} ${year}`;
}

// Find pictures for an event
function getPicturesForEvent(eventId: string, pictures?: PictureEvent[]): PictureEvent | undefined {
  if (!pictures) return undefined;
  return pictures.find(p => p.url.includes(eventId));
}

// Get Countroll web app URL for an event
function getEventUrl(assetId: string, eventId: string): string {
  return `https://app.countroll.com/#/thing/${assetId}/events/${eventId}`;
}

export function EventSidebar({ event, pictures, assetId, onClose }: EventSidebarProps) {
  const config = EVENT_TYPE_CONFIG[event.type];
  const displayDate = new Date(event.creationDateTime);
  const showTimeTypes = ['PICTURE', 'LINKED', 'UNLINKED', 'ENGRAVED', 'INITIALIZED', 'UNINITIALIZED'];
  const formattedDate = formatDate(displayDate, showTimeTypes.includes(event.type));
  const pictureData = getPicturesForEvent(event.id, pictures);
  const eventUrl = getEventUrl(assetId, event.id);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Sidebar */}
      <div className="fixed right-0 top-0 h-full w-full sm:w-96 bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <span
              className="w-8 h-8 rounded-full flex items-center justify-center text-lg"
              style={{ backgroundColor: config.bgColor, color: config.color }}
            >
              {config.icon}
            </span>
            <span
              className="px-2 py-1 rounded text-sm font-medium"
              style={{ backgroundColor: config.bgColor, color: config.color }}
            >
              {config.label}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Date */}
          <p className="text-sm text-gray-500 mb-4">{formattedDate}</p>

          {/* Title */}
          {event.title && (
            <h2 className="text-lg font-semibold text-gray-900 mb-2">{event.title}</h2>
          )}

          {/* Description/Comment */}
          {event.description && (
            <div
              className={`mb-4 ${
                event.type === 'PICTURE'
                  ? 'p-3 bg-amber-50 border-l-4 border-amber-400 rounded text-amber-900 font-medium'
                  : 'text-gray-700'
              }`}
            >
              {event.description}
            </div>
          )}

          {/* Details */}
          <div className="space-y-2 mb-6">
            {event.diameter && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Diameter</span>
                <span className="text-gray-900 font-medium">{event.diameter} mm</span>
              </div>
            )}
            {event.who && event.who !== 'service-account-datam-service-client' && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">By</span>
                <span className="text-gray-900 font-medium">{event.who}</span>
              </div>
            )}
            {event.coverMaterial && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Material</span>
                <span className="text-gray-900 font-medium">{event.coverMaterial}</span>
              </div>
            )}
            {event.coverHardness && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Hardness</span>
                <span className="text-gray-900 font-medium">{event.coverHardness}</span>
              </div>
            )}
          </div>

          {/* Pictures */}
          {pictureData && pictureData.pictures.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Photos ({pictureData.pictures.length})
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {pictureData.pictures.map((pic, index) => (
                  <a
                    key={index}
                    href={pic.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 transition-colors"
                  >
                    <img
                      src={pic.downloadUrl}
                      alt={pic.fileName}
                      className="w-full h-full object-cover"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200">
          <a
            href={eventUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Open in Countroll
          </a>
        </div>
      </div>
    </>
  );
}
