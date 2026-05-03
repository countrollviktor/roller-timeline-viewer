// Production server for Azure App Service.
// Serves the built frontend from dist/ and proxies /api/* to Countroll.
// No credentials here — the browser sends a Bearer token it got directly
// from Keycloak, and we just forward it.

import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import appInsights from 'applicationinsights';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 8080;
const API_TARGET = process.env.COUNTROLL_API_URL || 'https://api.countroll.com';

// App Insights — shared with hannecard-locations-prod. We tag telemetry with
// our role name so this app's events are filterable in Log Analytics.
if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  appInsights
    .setup()
    .setAutoCollectRequests(false)
    .setAutoCollectDependencies(false)
    .setAutoCollectExceptions(true)
    .setAutoCollectConsole(false)
    .start();
  const ctx = appInsights.defaultClient.context;
  ctx.tags[ctx.keys.cloudRole] = 'roller-timeline-viewer';
}

function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

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
  const value = result.tables?.[0]?.rows ?? [];
  statsCache.set(key, { value, expiresAt: now + STATS_CACHE_TTL_MS });
  return value;
}

// Hostname allowlist — prevents accidental proxy to anything but Countroll.
const ALLOWED_TARGETS = new Set([
  'https://api.countroll.com',
  'https://apiqa.countroll.com',
]);
if (!ALLOWED_TARGETS.has(API_TARGET)) {
  console.error(`Refusing to start: COUNTROLL_API_URL="${API_TARGET}" is not in the allowlist.`);
  process.exit(1);
}

const app = express();
app.set('trust proxy', true); // App Service is fronted by an LB — read X-Forwarded-For for req.ip
app.disable('x-powered-by');

app.get('/healthz', (_req, res) => {
  res.status(200).send('ok');
});

// Audit: emit one Login event per Keycloak session per container instance.
// Keyed by sid (Keycloak session id) when present, falling back to sub+iat.
// Bounded to avoid unbounded growth — tokens rotate so old keys never repeat.
const seenSessions = new Set();
const SESSION_CAP = 10_000;

app.use((req, _res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return next();

  const payload = decodeJwtPayload(auth.slice(7));
  if (!payload) return next();

  const user = payload.preferred_username ?? '';
  const sub = payload.sub ?? '';
  const ip = req.ip ?? req.socket?.remoteAddress ?? '';
  const userAgent = req.headers['user-agent'] ?? '';

  // Login: dedupe per session per container instance.
  const sessionKey = payload.sid ?? `${sub}|${payload.iat ?? ''}`;
  if (sessionKey && !seenSessions.has(sessionKey)) {
    seenSessions.add(sessionKey);
    if (seenSessions.size > SESSION_CAP) {
      // Set preserves insertion order — drop the oldest entry.
      seenSessions.delete(seenSessions.values().next().value);
    }

    console.log(`login user=${user} sub=${sub} ip=${ip}`);

    if (appInsights.defaultClient) {
      appInsights.defaultClient.trackEvent({
        name: 'Login',
        properties: {
          user,
          sub,
          email: payload.email ?? '',
          sid: payload.sid ?? '',
          jti: payload.jti ?? '',
          iat: payload.iat ? new Date(payload.iat * 1000).toISOString() : '',
          ip,
          userAgent,
        },
      });
    }
  }

  // AssetLookup: emit one event per /api/thing/{id} hit. No dedupe — repeat
  // lookups are the engagement signal we want.
  const assetMatch = req.path.match(/^\/api\/thing\/([^/]+)$/);
  if (assetMatch && appInsights.defaultClient) {
    appInsights.defaultClient.trackEvent({
      name: 'AssetLookup',
      properties: {
        user,
        sub,
        assetId: decodeURIComponent(assetMatch[1]),
        ip,
        userAgent,
      },
    });
  }

  next();
});

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
| project assetId, views, uniqueUsers, lastViewed
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

// /api/* -> Countroll. changeOrigin rewrites the Host header to api.countroll.com.
// No xfwd: Countroll's edge rejects X-Forwarded-* from unknown hops with 403.
// Drop cookies so the browser's session cookie never reaches the upstream.
// Mount on `/` and filter by path so the full URL (including the /api prefix)
// is preserved when forwarding upstream. app.use('/api', proxy) would strip
// /api before http-proxy-middleware sees req.url, forwarding to the wrong path.
app.use(
  createProxyMiddleware({
    target: API_TARGET,
    changeOrigin: true,
    pathFilter: '/api/**',
    proxyTimeout: 30_000,
    timeout: 30_000,
    on: {
      proxyReq: (proxyReq) => {
        proxyReq.removeHeader('cookie');
      },
      error: (err, _req, res) => {
        console.error('Proxy error:', err.message);
        if (res && !res.headersSent) {
          res.writeHead(502);
          res.end('Upstream error');
        }
      },
    },
  }),
);

const distDir = path.join(__dirname, 'dist');
app.use(
  express.static(distDir, {
    index: false,
    maxAge: '1h',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }),
);

// SPA fallback — any non-/api path returns index.html.
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`roller-timeline-viewer listening on :${PORT}`);
  console.log(`proxying /api/* -> ${API_TARGET}`);
});
