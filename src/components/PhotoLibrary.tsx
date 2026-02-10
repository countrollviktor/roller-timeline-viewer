import { useState, useEffect, useCallback } from 'react';
import type { PictureEvent } from '../types';
import { PhotoViewer } from './PhotoViewer';

interface PhotoLibraryProps {
  pictures: PictureEvent[];
  onClose: () => void;
}

export function PhotoLibrary({ pictures, onClose }: PhotoLibraryProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && viewerIndex === null) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, viewerIndex]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const allPhotos = pictures.flatMap(pe => {
    const eventId = pe.url.split('/events/')[1] || '';
    return pe.pictures.map(pic => ({
      ...pic,
      eventId,
      eventUrl: pe.url,
    }));
  });

  const grouped = new Map<string, typeof allPhotos>();
  for (const photo of allPhotos) {
    const dateKey = photo.createdOn.split('T')[0];
    if (!grouped.has(dateKey)) grouped.set(dateKey, []);
    grouped.get(dateKey)!.push(photo);
  }

  const sortedGroups = Array.from(grouped.entries()).sort(
    (a, b) => b[0].localeCompare(a[0])
  );

  const displayPhotos = sortedGroups.flatMap(([, photos]) => photos);

  const totalCount = allPhotos.length;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      <div className="fixed inset-4 sm:inset-8 bg-white rounded-xl shadow-2xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Photos ({totalCount})
          </h2>
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

        <div className="flex-1 overflow-y-auto p-6">
          {sortedGroups.length === 0 ? (
            <p className="text-center text-gray-500 py-12">No photos available.</p>
          ) : (
            sortedGroups.map(([dateKey, photos]) => {
              const date = new Date(dateKey + 'T00:00:00');
              const label = date.toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              });
              return (
                <div key={dateKey} className="mb-8">
                  <h3 className="text-sm font-medium text-gray-500 mb-3">{label}</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {photos.map((photo, i) => (
                      <button
                        key={i}
                        className="aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-[#1DB898] transition-colors cursor-pointer"
                        onClick={() => {
                          let flatIndex = 0;
                          for (const [gKey, gPhotos] of sortedGroups) {
                            if (gKey === dateKey) { flatIndex += i; break; }
                            flatIndex += gPhotos.length;
                          }
                          setViewerIndex(flatIndex);
                        }}
                      >
                        <img
                          src={photo.downloadUrl}
                          alt={photo.fileName}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {viewerIndex !== null && (
        <PhotoViewer
          photos={displayPhotos}
          currentIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onNavigate={setViewerIndex}
        />
      )}
    </>
  );
}
