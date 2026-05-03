# Stats Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/stats` page that surfaces Login + AssetLookup activity from App Insights, gated by `STATS_ALLOWLIST`.

**Architecture:** Five new endpoints under `/api/stats/*` on the existing Express server. Each endpoint runs a fixed KQL query against the App Insights REST API with a 60s in-process TTL cache. The SPA gains a `/stats` route with a page shell that fetches all four data endpoints in parallel on mount and again on a manual Refresh. Read access uses a separate App Insights data-plane API key; ingestion continues via the existing connection string.

**Tech Stack:** Express 4, App Insights REST API (https://api.applicationinsights.io/v1), React 19 + React Router v7, hand-rolled SVG charts (no library), Tailwind v4. Verification via `npm run typecheck`, `npm run build`, manual `curl`, and the live dashboard.

**Spec:** `docs/superpowers/specs/2026-05-03-stats-page-design.md`

**Deviation from spec:** No automated test harness — the repo has no test infrastructure today, so each task verifies via typecheck + curl + browser. Add automated tests later as a separate concern if the dashboard grows.

---

## File Map

### New files
- `src/api/stats.ts` — typed client for `/api/stats/*`
- `src/api/stats-access.ts` — allowlist probe (`probeStatsAccess`, `getStatsAccess`)
- `src/pages/stats/StatsPage.tsx` — page shell, fetch orchestration, refresh button
- `src/pages/stats/HeadlineTiles.tsx` — 4-tile grid
- `src/pages/stats/TrendChart.tsx` — wraps StackedBars, two series
- `src/pages/stats/TopAssetsTable.tsx` — top 25, assetId is a Link
- `src/pages/stats/UsersTable.tsx` — sortable leaderboard
- `src/pages/stats/NotAuthorized.tsx` — 403 view
- `src/pages/stats/charts.tsx` — `StackedBars` (copied from hannecard-hce-stock)

### Modified files
- `server.js` — add `cachedQuery` + `appInsightsApplicationId` helpers, `STATS_ALLOWLIST` middleware, 5 `/api/stats/*` endpoints
- `src/App.tsx` — add `/stats` route, call `probeStatsAccess()` after auth
- `src/pages/AssetPage.tsx` — add "Stats" link to nav bar (visible when `getStatsAccess()` is true)
- `docs/usage-analytics.md` — add "Stats dashboard" section
- `.env.example` — note the two new env vars

---

## Task 1: Server — cachedQuery + appInsightsApplicationId helpers

**Files:**
- Modify: `server.js` (insert after the `decodeJwtPayload` function, around line 39)

- [ ] **Step 1: Add the two helpers and the cache state**

Insert after the `decodeJwtPayload` function:

```js
// Read-only API key for the App Insights component this server queries.
// Created via `az monitor app-insights api-key create ... --read-properties
// ReadTelemetry`. Empty string means stats endpoints will 500 with a clear
// "not configured" error.
const APPINSIGHTS_API_KEY = process.env.APPINSIGHTS_API_KEY || '';

// Pull the Application ID out of the existing connection string instead of
// requiring a separate env var. The connection string is already configured
// for ingestion, so the source of truth is one.
function appInsightsApplicationId() {
  const cs = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING || '';
  const m = /(?:^|;)ApplicationId=([0-9a-f-]{36})(?:;|$)/i.exec(cs);
  return m ? m[1] : '';
}
const APPINSIGHTS_APP_ID = appInsightsApplicationId();

// Trivial TTL cache. 60s is a cheap defense against rapid Refresh-button
// clicking on the dashboard. Keys are short ("headline:30d", "trend:90d",
// "top-assets:30d", "users:30d") and there are exactly four, so a Map with
// no eviction is fine.
const statsCache = new Map();
const STATS_CACHE_TTL_MS = 60_000;

async function cachedQuery(key, kql, timeRangeDays) {
  const now = Date.now();
  const hit = statsCache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;
  if (!APPINSIGHTS_APP_ID || !APPINSIGHTS_API_KEY) {
    throw new Error(
      `App Insights query failed (${key}): APPLICATIONINSIGHTS_CONNECTION_STRING / APPINSIGHTS_API_KEY not configured`,
    );
  }
  const response = await fetch(
    `https://api.applicationinsights.io/v1/apps/${APPINSIGHTS_APP_ID}/query`,
    {
      method: 'POST',
      headers: {
        'x-api-key': APPINSIGHTS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: kql, timespan: `P${timeRangeDays}D` }),
    },
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `App Insights query failed (${key}): HTTP ${response.status} ${body.slice(0, 200)}`,
    );
  }
  const result = await response.json();
  return (statsCache.set(key, {
    value: result.tables?.[0]?.rows ?? [],
    expiresAt: now + STATS_CACHE_TTL_MS,
  }), statsCache.get(key).value);
}
```

- [ ] **Step 2: Verify the server still starts**

Run: `npm start`
Expected: `roller-timeline-viewer listening on :8080` and `proxying /api/* -> https://api.countroll.com`. Stop with Ctrl-C.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat(stats): add App Insights query helpers"
```

---

## Task 2: Server — STATS_ALLOWLIST gate + /api/stats/me

**Files:**
- Modify: `server.js` (insert after the existing `app.use((req, _res, next) => { ... })` middleware, around line 123)

- [ ] **Step 1: Add the allowlist + gate middleware + me endpoint**

Insert after the existing audit middleware closes (the `next();}); }` at the end of the Login/AssetLookup block):

```js
// Stats allowlist gate. Only usernames in STATS_ALLOWLIST may hit
// /api/stats/*. Reuses decodeJwtPayload so we share JWT handling.
const STATS_ALLOWLIST = (process.env.STATS_ALLOWLIST || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function isAllowed(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return { ok: false, username: '' };
  const payload = decodeJwtPayload(auth.slice(7));
  if (!payload) return { ok: false, username: '' };
  const username = payload.preferred_username || '';
  return { ok: STATS_ALLOWLIST.includes(username), username };
}

app.use('/api/stats', (req, res, next) => {
  const { ok, username } = isAllowed(req);
  if (!ok) {
    return res.status(403).json({ error: 'not authorized', username });
  }
  req.statsUsername = username;
  next();
});

app.get('/api/stats/me', (req, res) => {
  res.json({ username: req.statsUsername, allowed: true });
});
```

- [ ] **Step 2: Verify the gate rejects unauthenticated requests**

Run in one shell: `npm start`
Run in another shell:

```bash
curl -i http://localhost:8080/api/stats/me
```

Expected: `HTTP/1.1 403 Forbidden` with body `{"error":"not authorized","username":""}`.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat(stats): add STATS_ALLOWLIST gate + /api/stats/me"
```

---

## Task 3: Server — /api/stats/headline

**Files:**
- Modify: `server.js` (insert after the `/api/stats/me` handler from Task 2)

- [ ] **Step 1: Add the KQL string + handler**

Insert after the `/api/stats/me` handler:

```js
// All KQL strings in this file pin to Europe/Brussels because the warehouse
// + users are in Belgium / France. KQL defaults to UTC for now() /
// startofday() / bin(); without the conversion, "today" in the headline
// tile would be 1-2 hours offset from when operators actually worked.
// datetime_utc_to_local handles DST automatically.
const HEADLINE_KQL = `
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
    sessionsToday       = countif(name == "Login"       and timestamp >= dayStart),
    lookupsToday        = countif(name == "AssetLookup" and timestamp >= dayStart),
    activeToday         = dcountif(username, name == "AssetLookup" and timestamp >= dayStart),
    distinctAssetsToday = dcountif(assetId, name == "AssetLookup" and timestamp >= dayStart and isnotempty(assetId)),
    sessions30d         = countif(name == "Login"),
    lookups30d          = countif(name == "AssetLookup"),
    active30d           = dcountif(username, name == "AssetLookup"),
    distinctAssets30d   = dcountif(assetId, name == "AssetLookup" and isnotempty(assetId)),
    lastEventAt         = max(timestamp)
| extend
    sessionsAvg = round(sessions30d / 30.0, 1),
    lookupsAvg  = round(lookups30d  / 30.0, 1),
    activeAvg   = round(active30d   / 30.0, 1)
| project
    sessionsToday, sessionsAvg, lookupsToday, lookupsAvg,
    activeToday, activeAvg, distinctAssetsToday, distinctAssets30d,
    lastEventAt
`;

app.get('/api/stats/headline', async (_req, res) => {
  try {
    const rows = await cachedQuery('headline:30d', HEADLINE_KQL, 30);
    const r = rows[0] ?? [];
    res.json({
      sessionsToday:       Number(r[0] ?? 0),
      sessionsAvg:         Number(r[1] ?? 0),
      lookupsToday:        Number(r[2] ?? 0),
      lookupsAvg:          Number(r[3] ?? 0),
      activeToday:         Number(r[4] ?? 0),
      activeAvg:           Number(r[5] ?? 0),
      distinctAssetsToday: Number(r[6] ?? 0),
      distinctAssets30d:   Number(r[7] ?? 0),
      lastEventAt:         r[8] ?? null,
    });
  } catch (e) {
    console.error('stats/headline:', e.message);
    res.status(500).json({ error: 'query failed' });
  }
});
```

- [ ] **Step 2: Verify the gate still blocks (no real token yet, but rules should hold)**

Restart `npm start`, then:

```bash
curl -i http://localhost:8080/api/stats/headline
```

Expected: `HTTP/1.1 403 Forbidden` with body `{"error":"not authorized","username":""}`.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat(stats): add /api/stats/headline endpoint"
```

---

## Task 4: Server — /api/stats/trend

**Files:**
- Modify: `server.js` (insert after the `/api/stats/headline` handler)

- [ ] **Step 1: Add the KQL string + handler with pivot**

```js
const TREND_KQL = `
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
`;

app.get('/api/stats/trend', async (_req, res) => {
  try {
    const rows = await cachedQuery('trend:90d', TREND_KQL, 90);
    // Pivot rows ([date, name, count]) into [{date, login, lookup}].
    const byDate = new Map();
    for (const [date, name, count] of rows) {
      const day = byDate.get(date) ?? { date, login: 0, lookup: 0 };
      const key = name === 'Login' ? 'login' : name === 'AssetLookup' ? 'lookup' : null;
      if (key) day[key] = (day[key] || 0) + Number(count);
      byDate.set(date, day);
    }
    res.json([...byDate.values()]);
  } catch (e) {
    console.error('stats/trend:', e.message);
    res.status(500).json({ error: 'query failed' });
  }
});
```

- [ ] **Step 2: Verify the gate**

```bash
curl -i http://localhost:8080/api/stats/trend
```

Expected: `HTTP/1.1 403 Forbidden`.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat(stats): add /api/stats/trend endpoint"
```

---

## Task 5: Server — /api/stats/top-assets

**Files:**
- Modify: `server.js` (insert after the `/api/stats/trend` handler)

- [ ] **Step 1: Add the KQL string + handler**

```js
const TOP_ASSETS_KQL = `
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
`;

app.get('/api/stats/top-assets', async (_req, res) => {
  try {
    const rows = await cachedQuery('top-assets:30d', TOP_ASSETS_KQL, 30);
    res.json(rows.map(([assetId, views, uniqueUsers, lastViewed]) => ({
      assetId: String(assetId ?? ''),
      views: Number(views ?? 0),
      uniqueUsers: Number(uniqueUsers ?? 0),
      lastViewed: lastViewed ?? null,
    })));
  } catch (e) {
    console.error('stats/top-assets:', e.message);
    res.status(500).json({ error: 'query failed' });
  }
});
```

- [ ] **Step 2: Verify the gate**

```bash
curl -i http://localhost:8080/api/stats/top-assets
```

Expected: `HTTP/1.1 403 Forbidden`.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat(stats): add /api/stats/top-assets endpoint"
```

---

## Task 6: Server — /api/stats/users

**Files:**
- Modify: `server.js` (insert after the `/api/stats/top-assets` handler)

- [ ] **Step 1: Add the KQL string + handler**

```js
const USERS_KQL = `
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
`;

app.get('/api/stats/users', async (_req, res) => {
  try {
    const rows = await cachedQuery('users:30d', USERS_KQL, 30);
    res.json(rows.map(([username, sessions, lookups, assetsSeen, lastSeen]) => ({
      username: String(username ?? ''),
      sessions: Number(sessions ?? 0),
      lookups: Number(lookups ?? 0),
      assetsSeen: Number(assetsSeen ?? 0),
      lastSeen: lastSeen ?? null,
    })));
  } catch (e) {
    console.error('stats/users:', e.message);
    res.status(500).json({ error: 'query failed' });
  }
});
```

- [ ] **Step 2: Verify the gate**

```bash
curl -i http://localhost:8080/api/stats/users
```

Expected: `HTTP/1.1 403 Forbidden`.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat(stats): add /api/stats/users endpoint"
```

---

## Task 7: SPA — typed stats client

**Files:**
- Create: `src/api/stats.ts`

- [ ] **Step 1: Write the client**

```ts
/**
 * Typed wrappers around /api/stats/* endpoints. Each call attaches the
 * current Bearer token and the Third-Party header. Non-2xx responses
 * reject with a typed error so the page can render per-section error
 * states.
 */
import { getAccessToken } from './auth-code';

const THIRD_PARTY_ID = import.meta.env.VITE_THIRD_PARTY_ID || '2';

export interface Headline {
  sessionsToday: number;
  sessionsAvg: number;
  lookupsToday: number;
  lookupsAvg: number;
  activeToday: number;
  activeAvg: number;
  distinctAssetsToday: number;
  distinctAssets30d: number;
  lastEventAt: string | null;
}

export interface TrendDay {
  date: string;
  login: number;
  lookup: number;
}

export interface TopAsset {
  assetId: string;
  views: number;
  uniqueUsers: number;
  lastViewed: string | null;
}

export interface UserRow {
  username: string;
  sessions: number;
  lookups: number;
  assetsSeen: number;
  lastSeen: string | null;
}

export interface MeResponse {
  username: string;
  allowed: true;
}

export class StatsForbiddenError extends Error {
  constructor() {
    super('not authorized');
    this.name = 'StatsForbiddenError';
  }
}

async function statsFetch<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(path, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Third-Party': THIRD_PARTY_ID,
      Accept: 'application/json',
    },
  });
  if (res.status === 403) throw new StatsForbiddenError();
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const getMe         = () => statsFetch<MeResponse>('/api/stats/me');
export const getHeadline   = () => statsFetch<Headline>('/api/stats/headline');
export const getTrend      = () => statsFetch<TrendDay[]>('/api/stats/trend');
export const getTopAssets  = () => statsFetch<TopAsset[]>('/api/stats/top-assets');
export const getUsers      = () => statsFetch<UserRow[]>('/api/stats/users');
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/api/stats.ts
git commit -m "feat(stats): typed client for /api/stats/*"
```

---

## Task 8: SPA — stats access probe

**Files:**
- Create: `src/api/stats-access.ts`

- [ ] **Step 1: Write the probe module**

```ts
/**
 * One-shot probe for /api/stats/me, called at app boot. The result is
 * cached in module memory so components can decide synchronously
 * whether to render the Stats nav link.
 */
import { getMe, StatsForbiddenError } from './stats';

let cached: boolean | null = null;

export async function probeStatsAccess(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    await getMe();
    cached = true;
  } catch (err) {
    if (!(err instanceof StatsForbiddenError)) {
      console.warn('stats access probe failed:', err);
    }
    cached = false;
  }
  return cached;
}

export function getStatsAccess(): boolean {
  return cached === true;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/api/stats-access.ts
git commit -m "feat(stats): allowlist probe for nav-bar surfacing"
```

---

## Task 9: SPA — chart primitive + NotAuthorized

**Files:**
- Create: `src/pages/stats/charts.tsx`
- Create: `src/pages/stats/NotAuthorized.tsx`

- [ ] **Step 1: Write `charts.tsx` (StackedBars copy from sibling)**

```tsx
/**
 * Hand-rolled SVG StackedBars. Copied from hannecard-hce-stock and
 * trimmed to what the trend chart needs — no Sparkline, no Heatmap.
 * Add them back if a future chart needs them.
 */

export interface StackedBarsProps {
  data: { date: string; values: { key: string; value: number; colorClass: string }[] }[];
  width?: number;
  height?: number;
}

export function StackedBars({ data, width = 800, height = 220 }: StackedBarsProps) {
  if (data.length === 0) {
    return <div className="text-sm text-gray-500">No data.</div>;
  }
  const totals = data.map(d => d.values.reduce((s, v) => s + v.value, 0));
  const max = Math.max(...totals, 1);
  const slotW = width / data.length;
  const barW = Math.max(slotW * 0.7, 1);
  const barOffset = (slotW - barW) / 2;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full h-[220px]"
      role="img"
      aria-label="Daily trend"
    >
      {data.map((d, i) => {
        let yCursor = height;
        const x = i * slotW + barOffset;
        return d.values.map((v, j) => {
          const h = (v.value / max) * height;
          yCursor -= h;
          return (
            <rect
              key={`${d.date}-${v.key}-${j}`}
              x={x}
              y={yCursor}
              width={barW}
              height={h}
              className={v.colorClass}
            >
              <title>{`${d.date} — ${v.key}: ${v.value}`}</title>
            </rect>
          );
        });
      })}
    </svg>
  );
}
```

- [ ] **Step 2: Write `NotAuthorized.tsx`**

```tsx
import { Link } from 'react-router-dom';

export function NotAuthorized() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-emerald-50 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <img src="/countroll-logo.svg" alt="Countroll" className="w-48 mx-auto mb-8" />
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Not authorized</h1>
        <p className="text-gray-600 mb-8">
          Your account is not on the stats allowlist. Ask an administrator to add your
          Countroll username if you need access.
        </p>
        <Link
          to="/"
          className="px-6 py-3 bg-[#1DB898] text-white rounded-lg hover:bg-[#189e83] transition-colors font-medium"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/stats/charts.tsx src/pages/stats/NotAuthorized.tsx
git commit -m "feat(stats): chart primitive + NotAuthorized view"
```

---

## Task 10: SPA — HeadlineTiles

**Files:**
- Create: `src/pages/stats/HeadlineTiles.tsx`

- [ ] **Step 1: Write the component**

```tsx
import type { Headline } from '../../api/stats';

interface TileProps {
  label: string;
  today: number;
  subtext: string;
}

function Tile({ label, today, subtext }: TileProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-3xl font-bold text-gray-900 mt-1">{today.toLocaleString()}</div>
      <div className="text-xs text-gray-400 mt-1">{subtext}</div>
    </div>
  );
}

export function HeadlineTiles({ data }: { data: Headline }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Tile
        label="Sessions today"
        today={data.sessionsToday}
        subtext={`avg ${data.sessionsAvg.toLocaleString()}/day (30d)`}
      />
      <Tile
        label="Asset lookups today"
        today={data.lookupsToday}
        subtext={`avg ${data.lookupsAvg.toLocaleString()}/day (30d)`}
      />
      <Tile
        label="Active users today"
        today={data.activeToday}
        subtext={`avg ${data.activeAvg.toLocaleString()}/day (30d)`}
      />
      <Tile
        label="Distinct assets today"
        today={data.distinctAssetsToday}
        subtext={`${data.distinctAssets30d.toLocaleString()} unique (30d)`}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/stats/HeadlineTiles.tsx
git commit -m "feat(stats): HeadlineTiles component"
```

---

## Task 11: SPA — TrendChart

**Files:**
- Create: `src/pages/stats/TrendChart.tsx`

- [ ] **Step 1: Write the component**

```tsx
import type { TrendDay } from '../../api/stats';
import { StackedBars } from './charts';

export function TrendChart({ data }: { data: TrendDay[] }) {
  // Map each day to the StackedBars row shape. Login is teal, AssetLookup
  // is amber — same palette family as the existing app accents.
  const bars = data.map(d => ({
    date: d.date,
    values: [
      { key: 'Sessions', value: d.login, colorClass: 'fill-teal-500' },
      { key: 'Lookups', value: d.lookup, colorClass: 'fill-amber-500' },
    ],
  }));
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-gray-900">Activity (90 days)</h2>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 bg-teal-500 rounded-sm" /> Sessions
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 bg-amber-500 rounded-sm" /> Lookups
          </span>
        </div>
      </div>
      <StackedBars data={bars} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/stats/TrendChart.tsx
git commit -m "feat(stats): TrendChart component"
```

---

## Task 12: SPA — TopAssetsTable

**Files:**
- Create: `src/pages/stats/TopAssetsTable.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { Link } from 'react-router-dom';
import type { TopAsset } from '../../api/stats';

function relTime(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

export function TopAssetsTable({ data }: { data: TopAsset[] }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <h2 className="text-base font-semibold text-gray-900 px-4 py-3 border-b border-gray-200">
        Top 25 viewed assets (30 days)
      </h2>
      {data.length === 0 ? (
        <div className="p-4 text-sm text-gray-500">No lookups in the last 30 days.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">Asset</th>
              <th className="px-4 py-2 text-right">Views</th>
              <th className="px-4 py-2 text-right">Unique users</th>
              <th className="px-4 py-2 text-right">Last viewed</th>
            </tr>
          </thead>
          <tbody>
            {data.map(row => (
              <tr key={row.assetId} className="border-t border-gray-100">
                <td className="px-4 py-2">
                  <Link
                    to={`/asset/${row.assetId}`}
                    className="text-[#1DB898] hover:text-[#189e83] font-medium"
                  >
                    {row.assetId}
                  </Link>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{row.views}</td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-600">{row.uniqueUsers}</td>
                <td className="px-4 py-2 text-right text-gray-500">{relTime(row.lastViewed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/stats/TopAssetsTable.tsx
git commit -m "feat(stats): TopAssetsTable component"
```

---

## Task 13: SPA — UsersTable

**Files:**
- Create: `src/pages/stats/UsersTable.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState } from 'react';
import type { UserRow } from '../../api/stats';

type SortKey = 'lookups' | 'sessions';

function relTime(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

export function UsersTable({ data }: { data: UserRow[] }) {
  const [sort, setSort] = useState<SortKey>('lookups');
  const sorted = [...data].sort((a, b) => b[sort] - a[sort] || b.sessions - a.sessions);

  function header(label: string, key: SortKey) {
    const active = sort === key;
    return (
      <button
        type="button"
        onClick={() => setSort(key)}
        className={`text-xs uppercase tracking-wide ${
          active ? 'text-[#1DB898] font-semibold' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        {label}{active ? ' ↓' : ''}
      </button>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <h2 className="text-base font-semibold text-gray-900 px-4 py-3 border-b border-gray-200">
        Users (30 days)
      </h2>
      {sorted.length === 0 ? (
        <div className="p-4 text-sm text-gray-500">No activity in the last 30 days.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs uppercase tracking-wide text-gray-500">User</th>
              <th className="px-4 py-2 text-right">{header('Sessions', 'sessions')}</th>
              <th className="px-4 py-2 text-right">{header('Lookups', 'lookups')}</th>
              <th className="px-4 py-2 text-right text-xs uppercase tracking-wide text-gray-500">Assets seen</th>
              <th className="px-4 py-2 text-right text-xs uppercase tracking-wide text-gray-500">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => (
              <tr key={row.username} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium text-gray-900">{row.username}</td>
                <td className="px-4 py-2 text-right tabular-nums">{row.sessions}</td>
                <td className="px-4 py-2 text-right tabular-nums">{row.lookups}</td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-600">{row.assetsSeen}</td>
                <td className="px-4 py-2 text-right text-gray-500">{relTime(row.lastSeen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/stats/UsersTable.tsx
git commit -m "feat(stats): UsersTable component with sort"
```

---

## Task 14: SPA — StatsPage shell

**Files:**
- Create: `src/pages/stats/StatsPage.tsx`

- [ ] **Step 1: Write the page shell**

```tsx
import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  getHeadline, getTrend, getTopAssets, getUsers,
  StatsForbiddenError,
  type Headline, type TrendDay, type TopAsset, type UserRow,
} from '../../api/stats';
import { logout, getCurrentUser } from '../../api/auth-code';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorState } from '../../components/ErrorState';
import { HeadlineTiles } from './HeadlineTiles';
import { TrendChart } from './TrendChart';
import { TopAssetsTable } from './TopAssetsTable';
import { UsersTable } from './UsersTable';
import { NotAuthorized } from './NotAuthorized';

interface SectionState<T> {
  data: T | null;
  error: string | null;
}

function emptySection<T>(): SectionState<T> {
  return { data: null, error: null };
}

export function StatsPage() {
  const [headline, setHeadline] = useState<SectionState<Headline>>(emptySection);
  const [trend, setTrend] = useState<SectionState<TrendDay[]>>(emptySection);
  const [topAssets, setTopAssets] = useState<SectionState<TopAsset[]>>(emptySection);
  const [users, setUsers] = useState<SectionState<UserRow[]>>(emptySection);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // Run all four in parallel; each populates its own section state. A
    // failure in one does not blank the others — that is the per-section
    // error pattern from the spec.
    const settle = async <T,>(
      p: Promise<T>,
      set: (s: SectionState<T>) => void,
    ): Promise<'forbidden' | 'ok' | 'error'> => {
      try {
        const data = await p;
        set({ data, error: null });
        return 'ok';
      } catch (err) {
        if (err instanceof StatsForbiddenError) return 'forbidden';
        set({ data: null, error: err instanceof Error ? err.message : String(err) });
        return 'error';
      }
    };
    const results = await Promise.all([
      settle(getHeadline(),  setHeadline),
      settle(getTrend(),     setTrend),
      settle(getTopAssets(), setTopAssets),
      settle(getUsers(),     setUsers),
    ]);
    if (results.includes('forbidden')) {
      setForbidden(true);
    } else {
      setLoadedAt(new Date());
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (forbidden) return <NotAuthorized />;
  if (loading && !loadedAt) return <LoadingSpinner message="Loading stats..." />;

  const user = getCurrentUser();
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
          <Link to="/">
            <img src="/countroll-logo.svg" alt="Countroll" className="h-5" />
          </Link>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="px-3 py-1 text-sm bg-[#1DB898] text-white rounded hover:bg-[#189e83] disabled:opacity-50"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              onClick={() => logout()}
              title={user ? `Signed in as ${user.preferredUsername}` : 'Sign out'}
              className="text-xs text-gray-500 hover:text-[#1DB898] px-2 py-1"
            >
              {user?.preferredUsername ? `${user.preferredUsername} · Sign out` : 'Sign out'}
            </button>
          </div>
        </div>
      </nav>

      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Stats</h1>
          <p className="text-xs text-gray-500 mt-1">
            {loadedAt ? `Loaded at ${loadedAt.toLocaleTimeString()} · data may lag ~1 min` : 'Loading…'}
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {headline.data
          ? <HeadlineTiles data={headline.data} />
          : <SectionError label="headline tiles" message={headline.error} />}

        {trend.data
          ? <TrendChart data={trend.data} />
          : <SectionError label="trend chart" message={trend.error} />}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {topAssets.data
            ? <TopAssetsTable data={topAssets.data} />
            : <SectionError label="top assets" message={topAssets.error} />}

          {users.data
            ? <UsersTable data={users.data} />
            : <SectionError label="users" message={users.error} />}
        </div>
      </main>
    </div>
  );
}

function SectionError({ label, message }: { label: string; message: string | null }) {
  if (!message) return null;
  return (
    <ErrorState
      title={`Failed to load ${label}`}
      message={message}
      suggestion="Click Refresh, or check the App Service logs."
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/stats/StatsPage.tsx
git commit -m "feat(stats): StatsPage shell with parallel fetch + refresh"
```

---

## Task 15: SPA — Wire route + nav link

**Files:**
- Modify: `src/App.tsx` (add `/stats` route, call `probeStatsAccess()` after auth)
- Modify: `src/pages/AssetPage.tsx` (add Stats link in nav bar)

- [ ] **Step 1: Add the route + probe in `App.tsx`**

In `src/App.tsx`, change the imports section to include `StatsPage` and `probeStatsAccess`:

```tsx
import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom';
import { AssetPage } from './pages/AssetPage';
import { StatsPage } from './pages/stats/StatsPage';
import { initAuth, login, type UserInfo } from './api/auth-code';
import { probeStatsAccess } from './api/stats-access';
import { LoadingSpinner } from './components/LoadingSpinner';
```

Then in the existing `useEffect` inside `App()`, replace the `initAuth().then(...)` block so the probe fires after a successful auth and the route is added below:

```tsx
  useEffect(() => {
    initAuth()
      .then(async user => {
        if (user) {
          // Fire-and-await: keeps the loading spinner visible until the
          // probe resolves so the AssetPage nav bar can render the Stats
          // link synchronously on first paint.
          await probeStatsAccess();
          setAuth({ status: 'authenticated', user });
        } else {
          setAuth({ status: 'anonymous' });
        }
      })
      .catch(() => {
        setAuth({ status: 'anonymous' });
      });
  }, []);
```

And add the route inside the existing `<Routes>` block:

```tsx
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/asset/:assetId" element={<AssetPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
```

- [ ] **Step 2: Add the Stats link in `AssetPage.tsx`**

In `src/pages/AssetPage.tsx`, add an import:

```tsx
import { Link } from 'react-router-dom';
import { getStatsAccess } from '../api/stats-access';
```

(Note: `useNavigate` is already imported; only add `Link` if not present.)

Then in the nav bar JSX (around the existing `<form onSubmit={handleSearch}>` block), insert a Stats link before the search form, gated by `getStatsAccess()`:

```tsx
            {getStatsAccess() && (
              <Link
                to="/stats"
                className="text-sm text-gray-600 hover:text-[#1DB898] px-2 py-1"
              >
                Stats
              </Link>
            )}
            <form onSubmit={handleSearch} className="flex gap-1">
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: clean build, no errors.

- [ ] **Step 5: Manual smoke test (browser)**

Run: `npm run dev` (in one shell) and `npm start` is not needed in dev — Vite proxies /api directly to Countroll prod. To exercise the new endpoints you need either:

- (a) a temporary `.env.local` with `STATS_ALLOWLIST=<your-keycloak-username>` and `APPINSIGHTS_API_KEY=<a-temp-key>` plus running `npm start` instead of `npm run dev` (so the express server sees the env vars), then visiting `http://localhost:8080`.
- (b) deferring the live data check until after deploy. Mid-build verification: load `http://localhost:5173`, sign in, type `/stats` in the URL bar — you should see "Not authorized" because no allowlist is configured. The Stats link must NOT appear in the asset-page nav for the same reason.

Confirm:
- Sign-in succeeds.
- `/stats` shows `<NotAuthorized />` when no allowlist match.
- `/asset/6168` does NOT show a "Stats" link in the nav.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/pages/AssetPage.tsx
git commit -m "feat(stats): wire /stats route and nav link"
```

---

## Task 16: Docs + env example

**Files:**
- Modify: `docs/usage-analytics.md` (append a new section)
- Modify: `.env.example` (append the two new server-side vars)

- [ ] **Step 1: Append a "Stats dashboard" section to `docs/usage-analytics.md`**

Append at the end of `docs/usage-analytics.md`:

```markdown
## Stats dashboard

The `/stats` page is gated by `STATS_ALLOWLIST` and queries this App
Insights resource via a read-only API key. No managed identity / role
assignment required — the dashboard speaks the App Insights REST API
directly. See the design at
`docs/superpowers/specs/2026-05-03-stats-page-design.md`.

**Required env vars (per App Service):**

| Var                                     | Source                                                  |
| --------------------------------------- | ------------------------------------------------------- |
| `STATS_ALLOWLIST`                       | comma-separated Keycloak `preferred_username`s          |
| `APPINSIGHTS_API_KEY`                   | read-only data-plane key on the AI resource             |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | already set for ingestion; reused to read `ApplicationId` |

**Create / rotate a read-only API key:**

```bash
az monitor app-insights api-key create \
  --app hannecard-locations-ai-prod \
  --resource-group hannecard-locations \
  --api-key "roller-stats-reader" \
  --read-properties ReadTelemetry
```

Then set the printed `apiKey` as `APPINSIGHTS_API_KEY` on the App
Service. To rotate: delete the existing key and create a new one with
the same name.

**Add a viewer:** edit `STATS_ALLOWLIST` on the App Service
Configuration blade (comma-separated). Saving triggers an automatic
restart, which both applies the new value and flushes the in-process
stats cache.

**Stats endpoints:**

| Path                          | Cache TTL | KQL window |
| ----------------------------- | --------- | ---------- |
| `GET /api/stats/me`           | -         | -          |
| `GET /api/stats/headline`     | 60 s      | 30 d       |
| `GET /api/stats/trend`        | 60 s      | 90 d       |
| `GET /api/stats/top-assets`   | 60 s      | 30 d       |
| `GET /api/stats/users`        | 60 s      | 30 d       |

All endpoints share the same in-process `Map`-based TTL cache;
restarting the App Service flushes it.

**Prod-only:** the KQL is hardcoded to
`cloud_RoleName == "roller-timeline-viewer-prod"`. If the App Service
is ever renamed, every query in `server.js` needs updating alongside
the `usage-analytics.md` recipes above.
```

- [ ] **Step 2: Append the new env vars to `.env.example`**

Append at the end of `.env.example`:

```env

# Stats dashboard (server-side only, optional in dev)
# STATS_ALLOWLIST=user1,user2
# APPINSIGHTS_API_KEY=<read-only data-plane key on hannecard-locations-ai-prod>
```

- [ ] **Step 3: Commit**

```bash
git add docs/usage-analytics.md .env.example
git commit -m "docs(stats): document /stats dashboard + new env vars"
```

---

## Post-deploy verification

After the next deploy to production:

1. In the Azure portal: App Service → `roller-timeline-viewer-prod` → Configuration. Add `STATS_ALLOWLIST=<your-username>` and `APPINSIGHTS_API_KEY=<value-from-az-cli>`. Save (triggers a ~30-60s restart on the B1 plan).
2. Create the API key once with the `az monitor app-insights api-key create` command from Task 16.
3. Visit `https://roller-timeline-viewer-prod.azurewebsites.net/stats` after sign-in.
4. Verify all four sections render with non-zero data.
5. Click an assetId in the Top Assets table — should navigate to `/asset/<id>` and load the timeline.
6. Sign in as a non-allowlisted user → confirm the Stats link does not appear in the asset-page nav and `/stats` shows `<NotAuthorized />`.

If any KQL returns an empty array unexpectedly, run the query in the App Insights "Logs" blade with the same `cloud_RoleName` filter to confirm the data exists; then check `APPINSIGHTS_API_KEY` is the read-only key (not the deprecated `instrumentationKey` — those look similar but are different).
