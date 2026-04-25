// Production server for Azure App Service.
// Serves the built frontend from dist/ and proxies /api/* to Countroll.
// No credentials here — the browser sends a Bearer token it got directly
// from Keycloak, and we just forward it.

import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 8080;
const API_TARGET = process.env.COUNTROLL_API_URL || 'https://api.countroll.com';

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
app.disable('x-powered-by');

app.get('/healthz', (_req, res) => {
  res.status(200).send('ok');
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
