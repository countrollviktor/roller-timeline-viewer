# Stats Page Design

**Date:** 2026-05-03
**Status:** Approved — ready for implementation plan

## Goal

Add a `/stats` page to roller-timeline-viewer that surfaces who is using the
app and what assets they look at, built entirely from the existing `Login`
and `AssetLookup` events already flowing to App Insights from `server.js`.

## Non-goals

- No new browser-side telemetry. The dashboard works with what `server.js`
  already emits.
- No diagnostics / scan-rate / error-funnel tiles like the sibling
  hannecard-hce-stock dashboard — this is a viewer app, not a workflow app.
- No QA dashboard. The cloud-role filter is hardcoded to
  `roller-timeline-viewer-prod`; QA shows nothing if it ever exists.
- No background polling. One fetch on mount + a manual Refresh button.

## Scope

### Dashboard content (v1)

**Top row — four headline tiles, each showing today + 30-day daily average:**

| Tile | Today | Subtext |
|---|---|---|
| Sessions | `countif(name == "Login" and timestamp >= dayStart)` | `sessions30d / 30` |
| Asset lookups | `countif(name == "AssetLookup" and timestamp >= dayStart)` | `lookups30d / 30` |
| Active users | `dcountif(username, AssetLookup and >= dayStart)` | `active30d / 30` |
| Distinct assets viewed | `dcountif(assetId, AssetLookup and >= dayStart)` | (no subtext — 30d total instead) |

Note: "Active users" counts users who actually viewed an asset, not users
who only logged in. This is the right semantic for a viewer app — a login
without a lookup is noise.

**Middle — 90-day stacked-bar trend chart.** Two series: `Login` and
`AssetLookup`. Daily buckets in `Europe/Brussels`. Hand-rolled SVG using
the `StackedBars` primitive copied from hannecard-hce-stock.

**Bottom — two side-by-side tables:**

- **Top 25 viewed assets (30d)** — columns: assetId, views, unique users,
  last viewed (relative time). assetId is a `<Link to={`/asset/${id}`}>` so
  viewers can jump from stat → page in one click.
- **User leaderboard (30d)** — columns: username, sessions, lookups,
  assets seen, last seen. Sortable by lookups (default) or sessions.

### Out of scope (deferred)

- Hourly heatmap
- IP / geography breakdown
- New-users-this-week tile
- Login → Lookup conversion funnel

All of the above already have working KQL in `docs/usage-analytics.md` if
someone needs an ad-hoc answer. Adding them to the dashboard later is
purely additive (new endpoint + new component).

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     hannecard-locations-ai-prod                  │
│        (existing App Insights — Login + AssetLookup events)      │
└──────────────▲────────────────────────────────────▲──────────────┘
               │ ingest (already wired)             │ query (new)
               │                                    │ POST /v1/apps/{id}/query
               │                                    │ x-api-key: <readonly>
┌──────────────┴────────────────────────────────────┴──────────────┐
│                          server.js (Express)                     │
│                                                                  │
│  /api/*  ── proxy → Countroll          (existing)                │
│  audit middleware: emit Login + AssetLookup  (existing)          │
│                                                                  │
│  STATS_ALLOWLIST middleware on /api/stats/*  (new)               │
│  /api/stats/me                               (new)               │
│  /api/stats/headline      cached 60s         (new)               │
│  /api/stats/trend         cached 60s         (new)               │
│  /api/stats/top-assets    cached 60s         (new)               │
│  /api/stats/users         cached 60s         (new)               │
│                                                                  │
│  static dist/ + SPA fallback                 (existing)          │
└──────────────────────▲───────────────────────────────────────────┘
                       │ fetch (Bearer token, same origin)
┌──────────────────────┴───────────────────────────────────────────┐
│                        SPA (React Router v6)                     │
│                                                                  │
│  /                       HomePage      (existing)                │
│  /asset/:assetId         AssetPage     (existing)                │
│  /stats                  StatsPage     (new — gated)             │
│                                                                  │
│  At app boot: GET /api/stats/me to decide whether to             │
│  surface the "Stats" link in the asset-page nav bar.             │
└──────────────────────────────────────────────────────────────────┘
```

Three things to flag:

- **App Insights resource is reused.** The connection string already on
  the App Service for ingestion serves both writes and reads. The
  Application ID is parsed out of `APPLICATIONINSIGHTS_CONNECTION_STRING`
  with the regex `/(?:^|;)ApplicationId=([0-9a-f-]{36})(?:;|$)/i`, so
  there is no second env var to drift.
- **Read uses a separate API key** (`APPINSIGHTS_API_KEY`) created via
  `az monitor app-insights api-key create … --read-properties
  ReadTelemetry`. No managed identity / role assignment needed.
- **All gating happens server-side.** The SPA only hides the Stats link
  as a UX nicety; the actual access control is the `/api/stats/*`
  middleware checking `STATS_ALLOWLIST`. Typing `/stats` directly works
  for unauthorized users — they just see "Not authorized."

## Server endpoints

All endpoints under `/api/stats/*` are gated by a middleware that
decodes the Bearer JWT, extracts `preferred_username`, and checks
membership in `STATS_ALLOWLIST` (comma-separated env var). Out-of-list
returns `403 { error: "not authorized", username }`. Reuses the existing
`decodeJwtPayload` helper in `server.js`.

All KQL pins to `cloud_RoleName == "roller-timeline-viewer-prod"` and
uses `Europe/Brussels` for day boundaries (warehouse + users are in
Belgium / France).

### `GET /api/stats/me`

No cache. Returns `{ username, allowed: true }`. Used by the SPA to
decide whether to render the Stats link.

### `GET /api/stats/headline` — 60s cache, 30d window

```kql
let tz = "Europe/Brussels";
let dayStart = datetime_local_to_utc(startofday(datetime_utc_to_local(now(), tz)), tz);
let windowStart = dayStart - 30d;
customEvents
| where timestamp >= windowStart
    and cloud_RoleName == "roller-timeline-viewer-prod"
    and name in ("Login","AssetLookup")
| extend username = tostring(customDimensions["user"]),
         assetId  = tostring(customDimensions["assetId"])
| summarize
    sessionsToday     = countif(name == "Login"       and timestamp >= dayStart),
    lookupsToday      = countif(name == "AssetLookup" and timestamp >= dayStart),
    activeToday       = dcountif(username, name == "AssetLookup" and timestamp >= dayStart),
    distinctAssetsToday = dcountif(assetId, name == "AssetLookup" and timestamp >= dayStart and isnotempty(assetId)),
    sessions30d       = countif(name == "Login"),
    lookups30d        = countif(name == "AssetLookup"),
    active30d         = dcountif(username, name == "AssetLookup"),
    distinctAssets30d = dcountif(assetId, name == "AssetLookup" and isnotempty(assetId)),
    lastEventAt       = max(timestamp)
| extend
    sessionsAvg = round(sessions30d / 30.0, 1),
    lookupsAvg  = round(lookups30d  / 30.0, 1),
    activeAvg   = round(active30d   / 30.0, 1)
```

Server returns:

```ts
{
  sessionsToday: number, sessionsAvg: number,
  lookupsToday: number,  lookupsAvg: number,
  activeToday: number,   activeAvg: number,
  distinctAssetsToday: number, distinctAssets30d: number,
  lastEventAt: string | null,
}
```

### `GET /api/stats/trend` — 60s cache, 90d window

```kql
let tz = "Europe/Brussels";
let windowStart = datetime_local_to_utc(startofday(datetime_utc_to_local(now(), tz)), tz) - 90d;
customEvents
| where timestamp >= windowStart
    and cloud_RoleName == "roller-timeline-viewer-prod"
    and name in ("Login","AssetLookup")
| extend localTs = datetime_utc_to_local(timestamp, tz)
| summarize count_ = count() by name, bucket = bin(localTs, 1d)
| project dateStr = format_datetime(bucket, "yyyy-MM-dd"), name, count_
| order by dateStr asc
```

Server pivots `[date, name, count]` rows into
`[{ date, login, lookup }]` and returns the array.

### `GET /api/stats/top-assets` — 60s cache, 30d window

```kql
let tz = "Europe/Brussels";
let windowStart = datetime_local_to_utc(startofday(datetime_utc_to_local(now(), tz)), tz) - 30d;
customEvents
| where timestamp >= windowStart
    and cloud_RoleName == "roller-timeline-viewer-prod"
    and name == "AssetLookup"
| extend assetId  = tostring(customDimensions["assetId"]),
         username = tostring(customDimensions["user"])
| where isnotempty(assetId)
| summarize views = count(), uniqueUsers = dcount(username), lastViewed = max(timestamp) by assetId
| order by views desc
| take 25
```

Returns `[{ assetId, views, uniqueUsers, lastViewed }]`.

### `GET /api/stats/users` — 60s cache, 30d window

```kql
let tz = "Europe/Brussels";
let windowStart = datetime_local_to_utc(startofday(datetime_utc_to_local(now(), tz)), tz) - 30d;
customEvents
| where timestamp >= windowStart
    and cloud_RoleName == "roller-timeline-viewer-prod"
    and name in ("Login","AssetLookup")
| extend username = tostring(customDimensions["user"]),
         assetId  = tostring(customDimensions["assetId"])
| where isnotempty(username)
| summarize
    sessions   = countif(name == "Login"),
    lookups    = countif(name == "AssetLookup"),
    assetsSeen = dcountif(assetId, name == "AssetLookup" and isnotempty(assetId)),
    lastSeen   = max(timestamp)
    by username
| order by lookups desc, sessions desc
```

Returns `[{ username, sessions, lookups, assetsSeen, lastSeen }]`.

### Shared infrastructure (copied from hannecard-hce-stock)

- `cachedQuery(key, kql, days)` helper with `Map`-based 60s TTL cache.
  Fixed key set (`headline:30d`, `trend:90d`, `top-assets:30d`,
  `users:30d`) — no eviction needed.
- POST to `https://api.applicationinsights.io/v1/apps/{appId}/query`
  with `x-api-key: <APPINSIGHTS_API_KEY>` and body
  `{ query: kql, timespan: 'P{N}D' }`.
- On non-2xx: log `console.error('stats/<key>:', message)` and respond
  `500 { error: "query failed" }`. Per-endpoint, not per-cache; one bad
  query does not fail the others.
- If `APPINSIGHTS_API_KEY` or the parsed `ApplicationId` is empty,
  `cachedQuery` throws a clear "not configured" error before making the
  HTTP call.

## SPA components

### Routing

Extend the existing `BrowserRouter` in `App.tsx`:

```tsx
<Route path="/stats" element={<StatsPage />} />
```

The route renders unconditionally. Gating is server-side via the 403
from `/api/stats/me`. Unauthorized users typing the URL see a
`<NotAuthorized />` page with a link back to `/`.

### Allowlist probe — `src/api/stats-access.ts`

A tiny module called once at app boot, result cached in a module
variable. Components read it synchronously to decide whether to surface
the Stats link.

```ts
let cached: boolean | null = null

export async function probeStatsAccess(): Promise<boolean> {
  if (cached !== null) return cached
  try {
    const token = await getAccessToken()
    const res = await fetch('/api/stats/me', {
      headers: { Authorization: `Bearer ${token}`, 'Third-Party': THIRD_PARTY_ID },
    })
    cached = res.ok
  } catch {
    cached = false
  }
  return cached
}

export function getStatsAccess(): boolean { return cached === true }
```

Called from `App.tsx` after `initAuth` resolves and before the first
route mounts. The result is in memory before any nav-bar render.

### Stats client — `src/api/stats.ts`

Thin typed wrappers around `fetch('/api/stats/...')` with the existing
Bearer token. One function per endpoint:

```ts
export interface Headline { /* shape from § "GET /api/stats/headline" */ }
export interface TrendDay { date: string; login: number; lookup: number }
export interface TopAsset { assetId: string; views: number; uniqueUsers: number; lastViewed: string }
export interface UserRow { username: string; sessions: number; lookups: number; assetsSeen: number; lastSeen: string }

export function getHeadline(): Promise<Headline>
export function getTrend(): Promise<TrendDay[]>
export function getTopAssets(): Promise<TopAsset[]>
export function getUsers(): Promise<UserRow[]>
```

Each function rejects with a typed error on non-2xx so the page can
render per-section error states.

### Component tree — `src/pages/stats/`

```
StatsPage.tsx              page shell, nav bar, useEffect that fires the
                           four fetches in parallel and renders children
                           once data arrives. No polling — Refresh button
                           re-runs the four fetches manually.
                           Renders <NotAuthorized /> on 403.
HeadlineTiles.tsx          4-tile grid (Sessions / Lookups / Active users
                           / Distinct assets), each showing today + the
                           "avg N/day" subtext.
TrendChart.tsx             wraps StackedBars, two series (Login + Lookup),
                           90 days, teal + amber.
TopAssetsTable.tsx         table of 25 rows. assetId is a Link to
                           /asset/:id (lets the viewer jump from
                           stat → page in one click).
UsersTable.tsx             leaderboard, sortable by lookups (default)
                           or sessions, with a relative-time
                           "last seen" column.
NotAuthorized.tsx          full-page 403 message with a link back to /.
charts.tsx                 StackedBars copied verbatim from
                           hannecard-hce-stock (~50 lines, no library).
```

Per-file size budget: <150 lines. Data-shaping logic lives in
`src/api/stats.ts`, not in the components.

### Nav-bar surfacing — `AssetPage.tsx`

Add a "Stats" link to the existing slim nav bar (currently logo +
quick-search). Shown only when `getStatsAccess()` is `true`. Same
Tailwind treatment as the existing search affordance.

### Loading & error states

- Initial mount: full-page `<LoadingSpinner />` (existing component).
- Per-section error: inline `<ErrorState />` so one bad query does not
  blank the dashboard.
- Refresh button: shown in the page header. Disabled while fetching.
  Updates a "loaded at HH:MM" subtext on success.

### No new dependencies

Charts are hand-rolled SVG. Tables are plain `<table>` with Tailwind.

## Operations

### New env vars on the App Service (one-time)

| Var | Value | Source |
|---|---|---|
| `STATS_ALLOWLIST` | comma-separated Keycloak `preferred_username`s | manual |
| `APPINSIGHTS_API_KEY` | data-plane read-only key on `hannecard-locations-ai-prod` | `az` (below) |

`APPLICATIONINSIGHTS_CONNECTION_STRING` is already set for ingestion —
the new code parses `ApplicationId=` out of it.

### Create the read-only API key (one-time)

```bash
az monitor app-insights api-key create \
  --app hannecard-locations-ai-prod \
  --resource-group hannecard-locations \
  --api-key "roller-stats-reader" \
  --read-properties ReadTelemetry
```

Copy the printed `apiKey` into `APPINSIGHTS_API_KEY` on the App Service
Configuration blade. Saving triggers an automatic restart, which both
applies the new value and flushes the in-process stats cache.

To rotate: `az monitor app-insights api-key delete --api-key
roller-stats-reader …` then re-create.

### Add a viewer

Edit `STATS_ALLOWLIST` on the App Service Configuration blade. Save →
automatic restart → cache flush → new user has access on next page
load. No code change.

### Local dev

Both new env vars are optional. If `APPINSIGHTS_API_KEY` is missing,
`cachedQuery` throws "not configured" and endpoints return 500; the
dashboard renders with inline error states. If `STATS_ALLOWLIST` is
missing, no usernames are allowed and `/stats` shows
`<NotAuthorized />`. Both are fine — the dashboard is a prod-only
feature.

A developer can optionally add their own `preferred_username` to
`STATS_ALLOWLIST` in `.env` and a temporary key to `APPINSIGHTS_API_KEY`
to test against prod data; the Vite dev server already proxies `/api/*`
so it Just Works.

### Docs update — extend `docs/usage-analytics.md`

Add a "Stats dashboard" section near the bottom that documents:

- The `/stats` route and how to be added to the allowlist.
- The four endpoints with cache TTL and KQL window — small table.
- The API-key creation/rotation commands.
- A note that the dashboard is prod-only (cloud-role filter is
  hardcoded).

The existing KQL recipes stay where they are — they remain the answer
for ad-hoc questions the dashboard does not cover.

## Testing

- **Server:** one integration-style test that boots `server.js` with
  mocked `fetch`, posts to each endpoint with a stub Bearer token in
  the allowlist, asserts the JSON shape, and asserts a 403 for an
  out-of-allowlist token.
- **KQL strings:** not unit-tested. Verified by running them against
  prod App Insights once during the initial deploy and saving the
  observed response shapes as fixtures.
- **Client:** render `StatsPage` against MSW handlers returning the
  fixture JSON, snapshot the rendered tiles + table contents.
- **No e2e against real App Insights** — too flaky, too slow, and the
  surface is small.

## Deploy

No deploy-script changes needed. The existing GitHub Actions /
`az webapp up` workflow ships `dist/` + `server.js` + `package.json` +
`node_modules/`. Run order: set the two env vars first, then deploy
the new code. Reversing the order means the dashboard 500s for ~1
deploy cycle but does not break anything else.

## Open risks

- **Role-name dependency.** The KQL filters are hardcoded to
  `roller-timeline-viewer-prod`. If the App Service is ever renamed,
  every query in `server.js` and `docs/usage-analytics.md` needs
  updating. Documented in `usage-analytics.md` already; will repeat in
  the new "Stats dashboard" section.
- **Cache flushing on env var change.** Adding a viewer requires an
  App Service restart, which is ~30-60s of downtime on the shared B1
  plan (no slots). Acceptable for an internal admin action.
- **App Insights ingestion lag.** Events typically appear in
  `customEvents` within 30-60s. The dashboard may show "today" totals
  that lag the user's actual activity by a minute. Document in the
  dashboard footer ("data may lag ~1 min").
