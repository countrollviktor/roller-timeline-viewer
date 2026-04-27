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
