# Roller Asset Timeline Viewer

## Project Overview

A web app that visualizes maintenance history for industrial rubber rollers on an interactive timeline. Data comes from the Countroll asset management API.

## Quick Start

```bash
# Install dependencies
npm install

# Configure Keycloak client id (copy and edit .env.example)
cp .env.example .env
# Edit .env — set VITE_OAUTH_CLIENT_ID to the Countroll Keycloak client id.

# Start development server
npm run dev

# Build for production
npm run build

# Run the production server locally (serves dist/ + /api proxy)
npm start
```

Visit http://localhost:5173 (or next available port)

---

## Project Structure

```
roller-timeline-viewer/
├── src/
│   ├── api/
│   │   ├── countroll.ts        # API client — relative /api/* calls with Bearer token
│   │   └── auth-code.ts        # OAuth2 Authorization Code flow against Keycloak (public client)
│   ├── components/
│   │   ├── Timeline.tsx        # Main vis-timeline component + tooltip formatting
│   │   ├── Filters.tsx         # Event type & year filters
│   │   ├── EventSidebar.tsx    # Slide-in sidebar for event details + images
│   │   ├── RollerDiagram.tsx   # SVG roller sketch with dimension callouts
│   │   ├── PhotoLibrary.tsx    # Full-screen photo grid overlay
│   │   ├── PhotoViewer.tsx     # Fullscreen lightbox with keyboard nav
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
├── server.js                   # Express production server (serves dist/ + /api proxy) for Azure App Service
├── vite.config.ts              # Vite config with API proxy
├── public/
│   ├── vite.svg                # Vite favicon
│   └── countroll-logo.svg      # Countroll brand logo (teal + gray wordmark)
├── CLAUDE.md                   # This file
└── LESSONS_LEARNED.md          # Technical gotchas & patterns discovered
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
- **Icon-only box markers** centered on their exact date (`type: 'box'`, `align: 'center'`)
- Left-side row labels showing event type or material name
- Color-coded by event type (see Event Types table below)
- **RECOVERED events split by material** — separate rows per `coverMaterial` (e.g. "Rubber", "PU")
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

### Roller Diagram (RollerDiagram.tsx)
- SVG technical drawing adapts to asset type (`type` prop from `asset.type`)
- **ROLLER:** Cylindrical body with shafts extending from each end, end cap ellipses
- **SLEEVE:** Hollow cylinder with bore visible on front face (left), smooth curved back end (right), dashed bore lines through body, no shafts
- **Proportionally scaled** to real diameter/length ratio
- Teal dimension callout lines with arrowheads for diameter and length
- Adapts viewBox to fit the shape (long-thin vs short-fat)
- **Clickable** — click the compact diagram card to open expanded view in overlay
- `compact` prop controls sizing: `true` (default) = 80px max-height in stats row, `false` = full size in overlay

### Photo Library (PhotoLibrary.tsx + PhotoViewer.tsx)
- **Photos button** on asset page (visible when photos exist) opens full-screen overlay
- All photos grouped by date, newest first
- Includes photos from both `/pictures` API (PICTURE events) and `/documents` API (OTHER events)
- Click thumbnail opens fullscreen lightbox with prev/next keyboard navigation (arrow keys)
- Escape closes viewer, then overlay
- Body scroll locked while overlay is open

### Navigation
- **Slim nav bar** on asset page with Countroll logo (links to home) and quick search
- **Countroll logo** on every page (home, asset, loading, error states)
- **Home page** (App.tsx) with Countroll logo, asset ID input, and sample asset link
- Routes: `/` (home), `/asset/:assetId` (timeline)

### Filtering
- Toggle event types on/off (ENGRAVED hidden by default)
- Default types: RECOVERED, REGRINDED, PICTURE, OTHER, LINKED, UNLINKED
- **Year selector** with drag-to-select (click and drag across years)
- Full year display when years selected (Jan 1 to Dec 31)
- Instant filter updates
- Reset filters button
- Event count shown as subtle text below timeline

### Responsive Design
- Mobile-friendly layout
- Touch gestures supported
- Adaptive stats grid (Type, Diameter, Length) with roller diagram

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
- **Type:** OAuth2 Authorization Code flow (Keycloak public client — no client secret). Shared client with `countroll-spoken-reception`.
- **Token URL:** `https://sso.countroll.com/realms/countroll-realm/protocol/openid-connect/token`
- **Client ID:** set via `VITE_OAUTH_CLIENT_ID` — no credentials stored anywhere. Users log in via Keycloak redirect; tokens live in memory only. Keycloak SSO session cookies enable silent re-auth on refresh.
- The Keycloak client must have this app's origin registered in **Valid Redirect URIs** and **Web Origins** (CORS).
- Access-token refresh happens browser-direct to Keycloak (no proxy involved). A 30s buffer triggers refresh before expiry. 401 from the API logs the user out.

### Development Proxy
In development, Vite proxies only the REST API (Keycloak is reached browser-direct with CORS):
- `/api/*` → `https://api.countroll.com/api/*`

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

**Event Documents (for OTHER events):**
```
GET /api/assets/{assetId}/events/{eventId}/documents        # List documents
GET /api/assets/{assetId}/events/{eventId}/thumbnails/{name} # Time-limited thumbnail URL
GET /api/assets/{assetId}/events/{eventId}/download/{name}   # Time-limited download URL
Headers: Authorization: Bearer {token}, Third-Party: {id}
```

### Environment Variables

Create a `.env` file from `.env.example`:

```env
# Keycloak public client id (shared with countroll-spoken-reception)
VITE_OAUTH_CLIENT_ID=your-countroll-client-id
VITE_THIRD_PARTY_ID=2

# Optional overrides (defaults shown)
# VITE_OAUTH_TOKEN_URL=https://sso.countroll.com/realms/countroll-realm/protocol/openid-connect/token

# Server-side only (read by server.js, never bundled into the browser)
# COUNTROLL_API_URL=https://api.countroll.com
```

---

## Event Types

| Type | Icon | Color | Default | Description |
|------|------|-------|---------|-------------|
| `RECOVERED` | ▲ | Green | On | Cover re-coated/refurbished |
| `REGRINDED` | ▼ | Red | On | Cover reground |
| `PICTURE` | 📷 | Purple | On | Photo documentation |
| `ENGRAVED` | ✒ | Orange | **Off** | Initial roller engraving |
| `OTHER` | ★ | Dark Teal | On | Miscellaneous (often used for photos) |
| `LINKED` | 🔗 | Cyan | On | Position linked |
| `UNLINKED` | 🔗 | Slate | On | Position unlinked |

---

## Key Implementation Details

### API Client (countroll.ts + auth-code.ts)
- `auth-code.ts` owns the token lifecycle: `initAuth()` on startup (handles the `?code=` callback), `getAccessToken()` refreshes automatically with a 30s buffer, `login()`/`logout()` redirect to Keycloak.
- `countroll.ts` endpoints call relative `/api/*` paths — the browser never talks to `api.countroll.com` directly. Dev goes through Vite's `/api` proxy; prod goes through `server.js`.
- 401 from the API calls `logout()` to bounce the user through Keycloak again.

### Timeline (Timeline.tsx)
- Items use `type: 'box'` with `align: 'center'` so icons are centered on their exact date
- Box line and dot hidden via CSS (`.vis-item.vis-box .vis-line, .vis-dot { display: none }`)
- Initial window set via `start`/`end` options (not `setWindow()` — that causes zoom jumps)
- Selected years: shows Jan 1 to Dec 31 of selected range
- No years selected: shows first event year to last event year
- Left-side row labels visible, showing icon + type/material name with colored left border
- **RECOVERED rows are dynamic** — split by `coverMaterial` field, creating separate groups per material
- Static groups for other event types; LINKED + UNLINKED share a "Position" row
- **Tooltip HTML gotcha:** vis-timeline strips `style` and `class` attributes from tooltip HTML for security. Use HTML elements like `<mark>` and style them via CSS selectors (`.vis-tooltip mark {}`)
- **Point vs Box centering:** `type: 'point'` items cannot be centered — the `align` option only works for `box`, `range`, and `background` types. vis-timeline positions point items using `transform` inline styles, so CSS `transform` overrides break positioning entirely
- Click handler calls `onEventClick` prop to open the sidebar
- **Unknown event types** are silently filtered out (API may return types not in our config)

### Event Sidebar (EventSidebar.tsx)
- Fixed position right-side panel with backdrop overlay
- Pictures shown in full grid (not limited to 3 like in tooltips)
- Links to full-size images and Countroll web app

### Filters (Filters.tsx)
- Drag-to-select years: mousedown starts, mouseenter extends range
- Click selected year to deselect
- Clear button appears when years are selected

### AssetPage (AssetPage.tsx)
- **Two-row header:** slim nav bar (logo + search) separated from asset info
- **Partner label as title** — first value from `partnerLabels` shown large, with `preferredLabel` (C-label) in smaller brackets, e.g. "400428426 (C8522)"
- Falls back to `preferredLabel` if no partner labels exist
- Asset ID shown as small subtle text in top-right corner
- Stats row: Type, Diameter, Length cards + RollerDiagram SVG
- Event count shown as subtle text below timeline
- Defensive `(asset.events || [])` guards — API may return assets without `events` array
- **OTHER event documents:** The `/pictures` endpoint doesn't return photos from OTHER events. Instead, AssetPage fetches documents for each OTHER event via the `/documents` endpoint, gets thumbnail URLs via `/thumbnails/{name}`, and merges them into the pictures array so they appear in the photo library and tooltips
- Thumbnail/download URLs from the documents API are **time-limited** (signed URLs)

### Branding
- All accent colors use Countroll teal `#1DB898` (hover: `#189e83`)
- Countroll logo SVG at `public/countroll-logo.svg` — sourced from countroll.com
- No blue/indigo — teal throughout (buttons, links, focus rings, timeline current-time line)

---

## Production Deployment — Azure App Service

Deploys as a single Node app on the shared App Service plan. No secrets required — the browser obtains tokens directly from Keycloak via the Authorization Code flow.

**Runtime:** Node 20 LTS (Linux). Startup command auto-detected from the `start` script (`node server.js`).

**What `server.js` does:**
- Serves the built `dist/` folder with SPA fallback.
- Proxies `/api/*` to `https://api.countroll.com` (configurable via `COUNTROLL_API_URL`, hostname allowlisted).
- Forwards the caller's `Authorization` and `Third-Party` headers; strips cookies.
- Exposes `/healthz` for App Service health checks.

**App Service Configuration → Application settings:**
- `VITE_OAUTH_CLIENT_ID` — the Keycloak client id (shared with countroll-spoken-reception).
- `VITE_THIRD_PARTY_ID` — typically `2`.
- `WEBSITE_RUN_FROM_PACKAGE=1` — faster cold starts.
- `COUNTROLL_API_URL` (optional) — defaults to `https://api.countroll.com`.

**Keycloak setup (one-time):** add the App Service URL (e.g. `https://<app>.azurewebsites.net/*`) to **Valid Redirect URIs** and its origin (without path) to **Web Origins** on the existing Countroll Keycloak client.

**Deploy:** `npm run deploy` (wraps `bash scripts/deploy.sh`). Builds `dist/`, installs prod-only `node_modules`, packages everything into `deploy.zip` via Python's zipfile module, and pushes via Kudu's `/api/zipdeploy`. Restores devDeps after.

> **Why Python instead of `tar -a -cf x.zip`:** Windows' bsdtar produces a TAR archive even with `.zip` extension, and Kudu silently extracts 0 files when handed a tar (deploy returns "RuntimeSuccessful" with empty wwwroot). Don't switch the script away from Python without verifying the zip with `unzip -l` first.

Override target via `.env.deploy` (gitignored):

```sh
AZURE_RESOURCE_GROUP=hannecard-locations
AZURE_WEBAPP_NAME=roller-timeline-viewer-prod
```

---

## GitHub

- Repository: `countrollviktor/roller-timeline-viewer`
- Branch: `master`
