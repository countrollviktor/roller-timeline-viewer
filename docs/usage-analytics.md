# Usage Analytics

How to see who's using the app, which assets they look at, and how often.

## Where the data lives

- **Resource:** Application Insights `hannecard-locations-ai-prod` (resource group `hannecard-locations`)
- **Shared with:** `hannecard-locations-prod`. Always filter by `cloud_RoleName == "roller-timeline-viewer-prod"` to scope queries to this app.
- **Role-name caveat:** App Service auto-instrumentation overrides whatever `server.js` sets via the SDK and stamps every record with the App Service name (`roller-timeline-viewer-prod`), not `roller-timeline-viewer`. If you change the App Service name, every saved query needs updating.
- **Retention:** workspace default (90 days unless changed on the linked Log Analytics workspace).

The connection string is injected as `APPLICATIONINSIGHTS_CONNECTION_STRING` on the App Service. If it's missing, `server.js` no-ops on telemetry — check this first if a query returns no rows.

## What we track

All events are emitted from `server.js` on the server side, so they survive ad-blockers and never appear in the bundled JS.

| Event | When | Key properties |
|-------|------|----------------|
| `Login` | First `/api/*` call from a new Keycloak session (deduped per container instance via `sid` or `sub+iat`) | `user`, `sub`, `email`, `sid`, `jti`, `iat`, `ip`, `userAgent` |
| `AssetLookup` | Every `GET /api/thing/{id}` (no dedupe — repeat views are the engagement signal) | `user`, `sub`, `assetId`, `ip`, `userAgent` |
| Exceptions | Auto-collected from unhandled errors | (default schema) |

Per-instance dedupe means a single browser session that hits two different App Service workers will produce two `Login` events. Treat `Login` counts as a soft estimate, not exact.

## How to query

**Portal:** Azure Portal → `hannecard-locations-ai-prod` → Logs. Run KQL against the `customEvents` table.

**CLI:**
```bash
az monitor app-insights query \
  -g hannecard-locations \
  --app hannecard-locations-ai-prod \
  --analytics-query "<KQL>" \
  -o table
```

(`--app` accepts the App Insights component name, not its appId.)

## Useful queries

All queries below assume the `cloud_RoleName == "roller-timeline-viewer-prod"` filter — copy that line into anything you write.

**Reserved-word gotcha:** don't use `user` or `users` as a column alias — they're reserved in this workspace's KQL flavor and the parser will blame the next line ("Token: views, Line: 7"). Use `username` / `unique_users` instead.

**Logins in the last 30 days, by user:**
```kusto
customEvents
| where timestamp > ago(30d)
| where cloud_RoleName == "roller-timeline-viewer-prod"
| where name == "Login"
| extend username = tostring(customDimensions["user"])
| summarize login_count = count(), first_seen = min(timestamp), last_seen = max(timestamp) by username
| order by login_count desc
```

**Daily active users:**
```kusto
customEvents
| where timestamp > ago(30d)
| where cloud_RoleName == "roller-timeline-viewer-prod"
| where name in ("Login", "AssetLookup")
| extend username = tostring(customDimensions["user"])
| summarize dau = dcount(username) by bin(timestamp, 1d)
| order by timestamp asc
```

**Top viewed assets:**
```kusto
customEvents
| where timestamp > ago(30d)
| where cloud_RoleName == "roller-timeline-viewer-prod"
| where name == "AssetLookup"
| extend assetId  = tostring(customDimensions["assetId"]),
         username = tostring(customDimensions["user"])
| summarize view_count = count(), unique_users = dcount(username) by assetId
| order by view_count desc
| take 25
```

**Activity for one user (lookups over time):**
```kusto
customEvents
| where timestamp > ago(30d)
| where cloud_RoleName == "roller-timeline-viewer-prod"
| where name == "AssetLookup"
| extend username = tostring(customDimensions["user"])
| where username == "<preferred_username>"
| extend assetId = tostring(customDimensions["assetId"])
| project timestamp, assetId
| order by timestamp desc
```

**New users this week (first-ever login):**
```kusto
customEvents
| where cloud_RoleName == "roller-timeline-viewer-prod"
| where name == "Login"
| extend username = tostring(customDimensions["user"])
| summarize first_login = min(timestamp) by username
| where first_login > ago(7d)
| order by first_login desc
```

**Engagement funnel — logins vs. asset lookups:**
```kusto
customEvents
| where timestamp > ago(30d)
| where cloud_RoleName == "roller-timeline-viewer-prod"
| where name in ("Login", "AssetLookup")
| extend username = tostring(customDimensions["user"])
| summarize login_count   = countif(name == "Login"),
            lookup_count  = countif(name == "AssetLookup"),
            assets_seen   = dcountif(tostring(customDimensions["assetId"]), name == "AssetLookup")
            by username
| order by lookup_count desc
```

**Where users come from (IP, with caveat that Countroll office IPs dominate):**
```kusto
customEvents
| where timestamp > ago(30d)
| where cloud_RoleName == "roller-timeline-viewer-prod"
| where name == "Login"
| extend ip = tostring(customDimensions["ip"])
| summarize sessions = count(), unique_users = dcount(tostring(customDimensions["user"])) by ip
| order by sessions desc
```

**Server-side exceptions:**
```kusto
exceptions
| where timestamp > ago(7d)
| where cloud_RoleName == "roller-timeline-viewer-prod"
| project timestamp, type, outerMessage, operation_Name
| order by timestamp desc
```

## Adding a new event

In `server.js`, inside the request middleware:

```js
appInsights.defaultClient.trackEvent({
  name: 'YourEventName',
  properties: { /* string-valued fields only */ },
});
```

Keep names PascalCase and stable — KQL filters break silently when a name is renamed. Property values must be strings (the SDK coerces, but explicit is safer). Avoid PII beyond what's already captured (`user`, `email`, `ip`).

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
