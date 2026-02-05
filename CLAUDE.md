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
│   │   └── countroll.ts        # API client with OAuth2 auth
│   ├── components/
│   │   ├── Timeline.tsx        # Main vis-timeline component + tooltip formatting
│   │   ├── Filters.tsx         # Event type & year filters
│   │   ├── EventSidebar.tsx    # Slide-in sidebar for event details + images
│   │   ├── LoadingSpinner.tsx  # Loading state component
│   │   ├── ErrorState.tsx      # Full-page error display
│   │   └── EmptyState.tsx      # Empty/no-results display
│   ├── pages/
│   │   └── AssetPage.tsx       # Main asset timeline page
│   ├── types.ts                # TypeScript interfaces
│   ├── App.tsx                 # Routes & home page with asset ID input
│   ├── main.tsx                # Entry point
│   └── index.css               # Tailwind + vis-timeline overrides
├── index.html                  # HTML entry (title: "Roller Timeline Viewer")
├── .env.example                # Environment variables template
├── vite.config.ts              # Vite config with API proxy
└── CLAUDE.md                   # This file
```

---

## Features

### Timeline Visualization
- Interactive horizontal timeline using vis-timeline
- Zoom (scroll/pinch) and pan (drag) support
- Auto-fits to event year range on initial load
- Dynamic height based on number of visible event types
- View window shows Jan 1 to Dec 31 of relevant years

### Event Display
- **Icon-only markers** - Clean, compact display with colored icon boxes
- No left-side labels (hidden via CSS for cleaner look)
- Color-coded by event type (see Event Types table below)
- Hover tooltips with event details and picture thumbnails
- **PICTURE comments highlighted** with yellow callout (`<mark>` element, styled in CSS)
- **Click opens sidebar** with full event details and all images

### Event Sidebar (EventSidebar.tsx)
- Opens on timeline event click (slides in from right)
- Shows event type badge, date, title, description
- PICTURE comments highlighted with amber callout
- Full image gallery in 2-column grid (click image to open full size)
- All event details (diameter, who, material, hardness)
- "Open in Countroll" button
- Backdrop click or X button to close

### Navigation
- **Home page** (App.tsx) with asset ID input field and sample asset link
- **Quick navigation** input in AssetPage header to jump to another asset by ID
- Routes: `/` (home), `/asset/:assetId` (timeline)

### Filtering
- Toggle event types on/off (ENGRAVED hidden by default)
- Default types: RECOVERED, REGRINDED, PICTURE, LINKED, UNLINKED
- **Year selector** with drag-to-select (click and drag across years)
- Full year display when years selected (Jan 1 to Dec 31)
- Instant filter updates
- Reset filters button
- Event count shown as subtle text below timeline

### Responsive Design
- Mobile-friendly layout
- Touch gestures supported
- Adaptive stats grid (Type, Diameter, Length)

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
| Timeline | vis-timeline + vis-data |
| Routing | React Router v6 |
| State | React useState/useMemo |

---

## API Integration

### Authentication
- **Type:** OAuth2 (Keycloak) with password grant
- **Token URL:** `https://sso.countroll.com/realms/countroll-realm/protocol/openid-connect/token`
- **Client ID:** countroll-client
- Token caching with automatic refresh (10s buffer before expiry)
- Mutex lock prevents concurrent token requests

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
# Your Countroll Credentials
VITE_OAUTH_USERNAME=your_username_here
VITE_OAUTH_PASSWORD=your_password_here
VITE_THIRD_PARTY_ID=2

# Optional overrides (defaults shown)
# VITE_COUNTROLL_API_URL=https://api.countroll.com
# VITE_OAUTH_TOKEN_URL=https://sso.countroll.com/realms/countroll-realm/protocol/openid-connect/token
# VITE_OAUTH_CLIENT_ID=countroll-client
```

---

## Event Types

| Type | Icon | Color | Default | Description |
|------|------|-------|---------|-------------|
| `RECOVERED` | ▲ | Green | On | Cover re-coated/refurbished |
| `REGRINDED` | ▼ | Red | On | Cover reground |
| `PICTURE` | 📷 | Purple | On | Photo documentation |
| `ENGRAVED` | ✒ | Orange | **Off** | Initial roller engraving |
| `LINKED` | 🔗 | Cyan | On | Position linked |
| `UNLINKED` | 🔗 | Slate | On | Position unlinked |

---

## Key Implementation Details

### API Client (countroll.ts)
- Token caching with 10-second buffer before expiry
- Mutex lock (`tokenPromise`) prevents concurrent token requests (race condition fix when fetching asset + pictures in parallel)
- Automatic proxy routing in development mode (`/api` and `/auth` prefixes)

### Timeline (Timeline.tsx)
- Initial window set via `start`/`end` options (not `setWindow()` — that causes zoom jumps)
- Selected years: shows Jan 1 to Dec 31 of selected range
- No years selected: shows first event year to last event year
- Icon-only markers with hidden left labels (CSS: `.vis-labelset { display: none }`)
- **Tooltip HTML gotcha:** vis-timeline strips `style` and `class` attributes from tooltip HTML for security. Use HTML elements like `<mark>` and style them via CSS selectors (`.vis-tooltip mark {}`)
- Click handler calls `onEventClick` prop to open the sidebar

### Event Sidebar (EventSidebar.tsx)
- Fixed position right-side panel with backdrop overlay
- Pictures shown in full grid (not limited to 3 like in tooltips)
- Links to full-size images and Countroll web app

### Filters (Filters.tsx)
- Drag-to-select years: mousedown starts, mouseenter extends range
- Click selected year to deselect
- Clear button appears when years are selected

### AssetPage (AssetPage.tsx)
- Stats row: Type, Diameter, Length cards (History card removed)
- Event count shown as subtle text below timeline
- Quick navigation input in header to jump to another asset

---

## Production Deployment

For production, you'll need a backend proxy to handle OAuth (credentials shouldn't be exposed in browser). Options:
1. Deploy behind a reverse proxy (nginx/Apache) that handles auth
2. Create a simple backend service that proxies authenticated requests
3. Use a serverless function (Vercel/Netlify) as an auth proxy

---

## GitHub

- Repository: `countrollviktor/roller-timeline-viewer`
- Branch: `master`
