#!/usr/bin/env bash
#
# Deploy roller-timeline-viewer to its Azure App Service.
#
# Usage:
#   bash scripts/deploy.sh
#
# Builds a pre-baked bundle (Vite SPA in dist/ + Express server +
# production node_modules) and pushes it via Kudu's /api/zipdeploy.
# SCM build (Oryx) is disabled on the App Service, so what we zip is
# what runs.
#
# This project ships only to one App Service (no QA, no slot — the B1
# plan can't host slots). Override via .env.deploy (gitignored):
#
#   AZURE_RESOURCE_GROUP — defaults to hannecard-locations
#   AZURE_WEBAPP_NAME    — defaults to roller-timeline-viewer-prod
#
# Why Python instead of `tar -a -cf x.zip`: Windows' bsdtar produces a
# TAR archive even with .zip extension, and Kudu silently extracts 0
# files when handed a tar. Python's zipfile module is reliable on every
# platform we run on.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env.deploy ]]; then
  set -a; source .env.deploy; set +a
fi

RG="${AZURE_RESOURCE_GROUP:-hannecard-locations}"
APP="${AZURE_WEBAPP_NAME:-roller-timeline-viewer-prod}"

if ! command -v python >/dev/null 2>&1 && ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python (or python3) not on PATH — required to build the zip." >&2
  exit 1
fi
PY=$(command -v python || command -v python3)

if ! command -v az >/dev/null 2>&1; then
  echo "ERROR: az CLI not on PATH." >&2
  exit 1
fi

echo "==> Target: $APP in $RG"

echo "==> npm ci (full install for build)"
npm ci

echo "==> npm run build (vite -> dist/)"
npm run build

echo "==> npm ci --omit=dev (re-install runtime deps only)"
npm ci --omit=dev

echo "==> Building deploy.zip"
rm -f deploy.zip
"$PY" - <<'PYEOF'
import os, zipfile
with zipfile.ZipFile('deploy.zip', 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for root_dir in ('dist', 'node_modules'):
        for root, _, files in os.walk(root_dir):
            for f in files:
                p = os.path.join(root, f)
                z.write(p, p.replace(os.sep, '/'))
    for f in ('server.js', 'package.json', 'package-lock.json'):
        z.write(f)
PYEOF

# Sanity-check: a real zip will list a non-zero file count.
ZIPSIZE=$(du -h deploy.zip | cut -f1)
ZIPCOUNT=$("$PY" -c "import zipfile; print(len(zipfile.ZipFile('deploy.zip').namelist()))")
echo "    deploy.zip = $ZIPSIZE ($ZIPCOUNT files)"
if [[ "$ZIPCOUNT" -lt 100 ]]; then
  echo "ERROR: deploy.zip has only $ZIPCOUNT files — node_modules likely missing." >&2
  exit 1
fi

echo "==> Fetching Kudu credentials"
CREDS=$(az webapp deployment list-publishing-credentials \
  --name "$APP" --resource-group "$RG" \
  --query "{user:publishingUserName, pwd:publishingPassword}" -o tsv)
KUDU_USER=$(echo "$CREDS" | cut -f1)
KUDU_PASS=$(echo "$CREDS" | cut -f2)

echo "==> Uploading via Kudu /api/zipdeploy (synchronous)"
HTTP_CODE=$(curl -s -o /tmp/deploy-response.txt -w "%{http_code}" \
  -u "$KUDU_USER:$KUDU_PASS" \
  -X POST --data-binary @deploy.zip \
  -H "Content-Type: application/zip" \
  "https://${APP}.scm.azurewebsites.net/api/zipdeploy?isAsync=false")

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "ERROR: zipdeploy returned HTTP $HTTP_CODE" >&2
  cat /tmp/deploy-response.txt >&2 || true
  exit 1
fi

echo "==> Restoring devDeps for local development"
npm ci

URL="https://${APP}.azurewebsites.net"
echo
echo "==> Done. URL: $URL"
echo "    Smoke-test:  curl -fsS ${URL}/healthz"
echo "    Watch logs:  az webapp log tail --name $APP --resource-group $RG"
