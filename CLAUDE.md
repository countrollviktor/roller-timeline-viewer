# Roller Asset Timeline Viewer

## Project Overview

A web app that visualizes maintenance history for industrial rubber rollers on an interactive timeline. Data comes from the Countroll asset management API.

## Quick Start

```bash
# Install dependencies
npm install

# Configure credentials (copy and edit .env.example)
cp .env.example .env
# Edit .env with your Countroll credentials

# Start development server
npm run dev

# Build for production
npm run build
```

Visit http://localhost:5173 (or next available port)

---

## Project Structure

```
roller-timeline-viewer/
├── src/
│   ├── api/
│   │   └── countroll.ts       # API client with OAuth2 auth
│   ├── components/
│   │   ├── Timeline.tsx       # Main vis-timeline component
│   │   ├── Filters.tsx        # Event type & date filters + compress toggle
│   │   ├── Legend.tsx         # Event type color legend
│   │   ├── LoadingSpinner.tsx # Loading state component
│   │   ├── ErrorState.tsx     # Full-page error display
│   │   └── EmptyState.tsx     # Empty/no-results display
│   ├── pages/
│   │   └── AssetPage.tsx      # Main asset timeline page
│   ├── types.ts               # TypeScript interfaces
│   ├── App.tsx                # Routes & home page
│   ├── main.tsx               # Entry point
│   └── index.css              # Tailwind + vis-timeline overrides
├── .env.example               # Environment variables template
├── vite.config.ts             # Vite config with API proxy
└── CLAUDE.md                  # This file
```

---

## Features

### Timeline Visualization
- Interactive horizontal timeline using vis-timeline
- **Grouped by event type** - One row per event type for clear visual separation
- LINKED and UNLINKED combined into single "Position" row
- Zoom (scroll/pinch) and pan (drag) support
- Auto-fits all events on initial load (or full selected years when filtered)
- Dynamic height based on number of visible event types
- Dynamic view window management when years are selected
- Extended right margin (to year 2030) to prevent labels from being cut off

### Event Display
- Icon-only markers for clean, compact timeline view
- Group labels on left side showing icon + event type name
- **Combined rows** - LINKED and UNLINKED share a single "Position" row
- Color-coded rows by event type:
  - **RECOVERED** (Green) - Cover re-coated/refurbished (diameter restored)
  - **REGRINDED** (Red) - Cover reground (diameter diminished)
  - **PICTURE** (Purple) - Photo documentation
  - **ENGRAVED** (Orange) - Initial roller engraving (hidden by default)
  - **LINKED** (Cyan) - Position linked
  - **UNLINKED** (Slate) - Position unlinked
- Hover tooltips with full event details
- Click to open event in Countroll web app

### Filtering
- Toggle event types on/off (ENGRAVED hidden by default, shown at end of list)
- **Year selector** with drag-to-select (click and drag across years)
- Full year display when years selected (Jan 1 to Dec 31, or current date for current year)
- Instant filter updates
- Reset filters button

### Compressed View
- Toggle to compress large gaps (>90 days)
- Evenly spaces events for easier viewing
- Gap markers show original time spans
- Events labeled with actual dates

### Responsive Design
- Mobile-friendly layout
- Touch gestures supported
- Adaptive stats grid
- Collapsible debug panel

### Error Handling
- Loading spinner during API calls
- Error states with helpful messages
- Empty states with actions

---

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | React 18 + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS v4 |
| Timeline | vis-timeline + vis-data (with groups) |
| Routing | React Router v6 |
| State | React useState/useMemo |

---

## API Integration

### Authentication
- **Type:** OAuth2 (Keycloak) with password grant
- **Token URL:** `https://sso.countroll.com/realms/countroll-realm/protocol/openid-connect/token`
- **Client ID:** countroll-client
- Token caching with automatic refresh
- Concurrent request handling (prevents duplicate auth calls)

### Development Proxy
In development, Vite proxies API requests to avoid CORS issues:
- `/api/*` → `https://api.countroll.com/api/*`
- `/auth/*` → `https://sso.countroll.com/*`

### Endpoints Used

**Asset Data:**
```
GET /api/thing/{assetId}
Headers: Authorization: Bearer {token}, Third-Party: {id}
```

**Pictures:**
```
GET /api/assets/{assetId}/pictures
Headers: Authorization: Bearer {token}, Third-Party: {id}
```

### Environment Variables

Create a `.env` file from `.env.example`:

```env
# Countroll API credentials
VITE_OAUTH_USERNAME=your-username
VITE_OAUTH_PASSWORD=your-password
VITE_THIRD_PARTY_ID=your-third-party-id

# Optional overrides
VITE_COUNTROLL_API_URL=https://api.countroll.com
VITE_OAUTH_TOKEN_URL=https://sso.countroll.com/realms/countroll-realm/protocol/openid-connect/token
VITE_OAUTH_CLIENT_ID=countroll-client
```

---

## API Schema

### Asset Fields
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Asset ID |
| `preferredLabel` | string | Display name |
| `description` | string | Asset description |
| `status` | string | Current status |
| `type` | string | Asset type (e.g., "ROLLER") |
| `nominalCoverDiameter` | number | Nominal diameter (mm) |
| `length` | number | Length (mm) |
| `currentPosition` | object | Current location |
| `events` | array | Event history |

### Event Fields
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Event UUID |
| `type` | string | RECOVERED, REGRINDED, PICTURE, ENGRAVED, etc. |
| `creationDateTime` | string | ISO timestamp |
| `title` | string | Event title |
| `description` | string | Event description |
| `state` | string | VISIBLE or HIDDEN |
| `who` | string | Operator name |
| `diameter` | number | Diameter at event time |
| `reference` | string | Work order number |
| `coverMaterial` | string | Material (RECOVERED events) |
| `coverHardness` | string | Hardness (RECOVERED events) |

### Picture Event Fields
| Field | Type | Description |
|-------|------|-------------|
| `url` | string | Deep link to Countroll |
| `numberOfPictures` | number | Picture count |
| `pictures[].fileName` | string | Image filename |
| `pictures[].downloadUrl` | string | Pre-signed Azure Blob URL |
| `pictures[].contentType` | string | MIME type |

---

## Event Types

| Type | Color | Filterable | Default | Row | Description |
|------|-------|------------|---------|-----|-------------|
| `RECOVERED` | Green | Yes | On | Own row | Cover re-coated/refurbished |
| `REGRINDED` | Red | Yes | On | Own row | Cover reground |
| `PICTURE` | Purple | Yes | On | Own row | Photo documentation |
| `ENGRAVED` | Orange | Yes | **Off** | Own row | Initial roller engraving |
| `LINKED` | Cyan | Yes | On | Position | Position linked |
| `UNLINKED` | Slate | Yes | On | Position | Position unlinked |
| `INITIALIZED` | Gray | No | - | - | Device/barcode scan |
| `UNINITIALIZED` | Gray | No | - | - | Device removed |

---

## Key Implementation Details

### API Client (countroll.ts)
- Token caching with 10-second buffer before expiry
- Mutex lock prevents concurrent token requests (race condition fix)
- Automatic proxy routing in development mode

### Timeline Groups (Timeline.tsx)
- Events displayed in grouped rows using `TIMELINE_GROUPS`
- LINKED and UNLINKED share the "Position" row
- Filter order: RECOVERED, REGRINDED, PICTURE, LINKED, UNLINKED, ENGRAVED

### Year Selector (Filters.tsx)
- Drag-to-select: mousedown starts selection, mouseenter adds/removes years
- Mode determined by initial click: clicking selected year = deselect mode
- Clear button appears when years are selected

### View Window Management (Timeline.tsx)
When years are selected (non-compressed mode):
- Start: Jan 1 of earliest selected year minus 30 days padding
- End: April 1 of year after latest selected (room for labels)
- Current year: extends 120 days past today
- Uses `timeline.setWindow()` API for smooth transitions

---

## Production Deployment

For production, you'll need a backend proxy to handle OAuth (credentials shouldn't be exposed in browser). Options:
1. Deploy behind a reverse proxy (nginx/Apache) that handles auth
2. Create a simple backend service that proxies authenticated requests
3. Use a serverless function (Vercel/Netlify) as an auth proxy
