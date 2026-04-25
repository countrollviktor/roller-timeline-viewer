# Photo Library Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a photo library overlay to the asset page that shows all photos grouped by date, with a fullscreen viewer.

**Architecture:** A "Photos" button on the asset page opens a full-screen overlay (modal). The overlay shows all photos from the pictures API grouped by event date (newest first). Clicking a photo opens a fullscreen lightbox with prev/next navigation across all photos. No new routes needed — everything is an overlay on the existing asset page.

**Tech Stack:** React components, existing `PictureEvent`/`Picture` types, existing `fetchPictures` API, Tailwind CSS for styling.

---

### Task 1: PhotoLibrary overlay component (shell)

**Files:**
- Create: `src/components/PhotoLibrary.tsx`

**Step 1: Create the overlay shell**

```tsx
import type { PictureEvent } from '../types';

interface PhotoLibraryProps {
  pictures: PictureEvent[];
  onClose: () => void;
}

export function PhotoLibrary({ pictures, onClose }: PhotoLibraryProps) {
  // Flatten all pictures with their event date for grouping
  const allPhotos = pictures.flatMap(pe => {
    const eventId = pe.url.split('/events/')[1] || '';
    return pe.pictures.map(pic => ({
      ...pic,
      eventId,
      eventUrl: pe.url,
    }));
  });

  // Group by date (YYYY-MM-DD)
  const grouped = new Map<string, typeof allPhotos>();
  for (const photo of allPhotos) {
    const dateKey = photo.createdOn.split('T')[0];
    if (!grouped.has(dateKey)) grouped.set(dateKey, []);
    grouped.get(dateKey)!.push(photo);
  }

  // Sort groups newest first
  const sortedGroups = Array.from(grouped.entries()).sort(
    (a, b) => b[0].localeCompare(a[0])
  );

  const totalCount = allPhotos.length;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Overlay panel */}
      <div className="fixed inset-4 sm:inset-8 bg-white rounded-xl shadow-2xl z-50 flex flex-col">
        {/* Header */}
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

        {/* Scrollable content */}
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
                        onClick={() => {/* TODO: open fullscreen viewer */}}
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
    </>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/PhotoLibrary.tsx
git commit -m "feat: add PhotoLibrary overlay shell with date grouping"
```

---

### Task 2: Wire up PhotoLibrary to AssetPage

**Files:**
- Modify: `src/pages/AssetPage.tsx`

**Step 1: Add state and button**

Add to AssetPage:
- `const [showPhotoLibrary, setShowPhotoLibrary] = useState(false);`
- Import `PhotoLibrary` component
- Add a "Photos" button in the stats row (next to the dimension cards), showing photo count
- Render `<PhotoLibrary>` when `showPhotoLibrary` is true

The button should be styled as a teal outline button with a camera icon and count, e.g.: `📷 Photos (9)`.

Place the button after the `RollerDiagram` card in the stats flex row.

The total photo count comes from: `pictures.reduce((sum, pe) => sum + pe.pictures.length, 0)`.

Only show the button if there are pictures (`totalPhotoCount > 0`).

Render the overlay at the bottom of the component (sibling to `EventSidebar`):
```tsx
{showPhotoLibrary && (
  <PhotoLibrary
    pictures={pictures}
    onClose={() => setShowPhotoLibrary(false)}
  />
)}
```

**Step 2: Commit**

```bash
git add src/pages/AssetPage.tsx
git commit -m "feat: add Photos button and wire up PhotoLibrary overlay"
```

---

### Task 3: Fullscreen photo viewer

**Files:**
- Create: `src/components/PhotoViewer.tsx`
- Modify: `src/components/PhotoLibrary.tsx`

**Step 1: Create PhotoViewer component**

A fullscreen lightbox that shows one photo at a time with:
- Black background overlay
- Centered image (object-contain, max width/height)
- Left/right arrow buttons for prev/next
- Close button (top-right)
- Photo filename and date shown at bottom
- Keyboard navigation: Escape to close, ArrowLeft/ArrowRight for prev/next

```tsx
import { useEffect, useCallback } from 'react';
import type { Picture } from '../types';

interface PhotoViewerProps {
  photos: (Picture & { eventId: string })[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export function PhotoViewer({ photos, currentIndex, onClose, onNavigate }: PhotoViewerProps) {
  const photo = photos[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowLeft' && hasPrev) onNavigate(currentIndex - 1);
    if (e.key === 'ArrowRight' && hasNext) onNavigate(currentIndex + 1);
  }, [onClose, onNavigate, currentIndex, hasPrev, hasNext]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const date = new Date(photo.createdOn);
  const dateStr = date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return (
    <div className="fixed inset-0 bg-black z-[60] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm opacity-75">
          {currentIndex + 1} / {photos.length}
        </span>
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-full transition-colors"
          aria-label="Close"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Image area with nav arrows */}
      <div className="flex-1 flex items-center justify-center relative px-12">
        {hasPrev && (
          <button
            onClick={() => onNavigate(currentIndex - 1)}
            className="absolute left-2 p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors"
            aria-label="Previous"
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        <img
          src={photo.downloadUrl}
          alt={photo.fileName}
          className="max-w-full max-h-full object-contain"
        />

        {hasNext && (
          <button
            onClick={() => onNavigate(currentIndex + 1)}
            className="absolute right-2 p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors"
            aria-label="Next"
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Bottom bar */}
      <div className="px-4 py-3 text-center text-white">
        <p className="text-sm">{photo.fileName}</p>
        <p className="text-xs opacity-60">{dateStr}</p>
      </div>
    </div>
  );
}
```

**Step 2: Wire up PhotoViewer in PhotoLibrary**

Add state to `PhotoLibrary`:
```tsx
const [viewerIndex, setViewerIndex] = useState<number | null>(null);
```

Flatten `allPhotos` into a single ordered array (newest first, matching the grid display order). When a thumbnail is clicked, set `viewerIndex` to the photo's index in the flat array.

Replace the `onClick={() => {/* TODO */}}` with:
```tsx
onClick={() => {
  // Find this photo's index in the flat allPhotos array
  const flatIndex = allPhotos.indexOf(photo);
  setViewerIndex(flatIndex);
}}
```

Note: since the groups are sorted newest-first but the flat `allPhotos` array follows the API order, we need to reorder `allPhotos` to match the display order. Create a `displayPhotos` array by flattening `sortedGroups`:

```tsx
const displayPhotos = sortedGroups.flatMap(([, photos]) => photos);
```

Use `displayPhotos` for both the grid rendering and the viewer index.

Render `PhotoViewer` at the bottom:
```tsx
{viewerIndex !== null && (
  <PhotoViewer
    photos={displayPhotos}
    currentIndex={viewerIndex}
    onClose={() => setViewerIndex(null)}
    onNavigate={setViewerIndex}
  />
)}
```

**Step 3: Commit**

```bash
git add src/components/PhotoViewer.tsx src/components/PhotoLibrary.tsx
git commit -m "feat: add fullscreen photo viewer with keyboard navigation"
```

---

### Task 4: Polish and edge cases

**Files:**
- Modify: `src/components/PhotoLibrary.tsx`
- Modify: `src/components/PhotoViewer.tsx`

**Step 1: Handle edge cases**

- Close PhotoLibrary on Escape key (only when viewer is not open)
- Prevent body scroll when overlay is open (add `overflow-hidden` to body)
- Ensure the Photos button count badge is consistent

In `PhotoLibrary`, add Escape key handler:
```tsx
useEffect(() => {
  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && viewerIndex === null) onClose();
  };
  document.addEventListener('keydown', handleKey);
  return () => document.removeEventListener('keydown', handleKey);
}, [onClose, viewerIndex]);
```

In `PhotoLibrary`, lock body scroll:
```tsx
useEffect(() => {
  document.body.style.overflow = 'hidden';
  return () => { document.body.style.overflow = ''; };
}, []);
```

**Step 2: Commit**

```bash
git add src/components/PhotoLibrary.tsx src/components/PhotoViewer.tsx
git commit -m "feat: add keyboard shortcuts and scroll lock to photo library"
```

---

### Task 5: Final review and cleanup

**Step 1: Verify everything works**

- Open an asset with photos (e.g. 6168)
- Click Photos button — overlay opens with grouped photos
- Click a photo — fullscreen viewer opens
- Arrow keys navigate between photos
- Escape closes viewer, then overlay
- Body doesn't scroll behind overlay

**Step 2: Commit and push**

```bash
git push
```
