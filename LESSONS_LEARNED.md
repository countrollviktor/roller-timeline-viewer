# Lessons Learned

Technical lessons discovered while building the Roller Asset Timeline Viewer.

---

## 1. vis-timeline strips HTML attributes from tooltips

**Problem:** Tooltip content passed via the `title` property is sanitized by vis-timeline. All `style` and `class` attributes are stripped from the HTML before rendering. This is an XSS protection mechanism built into the library.

**Symptoms:** Inline styles and CSS classes applied to tooltip HTML have zero effect. The HTML elements render, but without any styling. This was extremely confusing because the HTML looked correct in the source code.

**Discovery:** Only identified by inspecting the rendered tooltip DOM in DevTools. The output showed `<div>` and `<span>` elements with all attributes removed.

**Solution:** Use semantic HTML elements (e.g., `<mark>`, `<strong>`, `<em>`) and style them via CSS selectors targeting the tooltip container:

```css
.vis-tooltip mark {
  font-weight: 700;
  background-color: #fef3c7;
  /* ... */
}
```

```typescript
// In tooltip HTML generation:
if (event.type === 'PICTURE') {
  lines.push(`<mark>${event.description}</mark>`);
}
```

**Takeaway:** When a library renders user-provided HTML, always check the actual DOM output to verify what the library preserves or strips.

---

## 2. OAuth token race condition with parallel requests

**Problem:** The app fetches asset data and pictures in parallel on page load. Both requests need an OAuth token. Without protection, both would simultaneously try to fetch a new token, causing duplicate auth requests and potential failures.

**Solution:** Implemented a mutex pattern using a shared promise (`tokenPromise`). The first caller creates the token request; subsequent callers await the same promise:

```typescript
let tokenPromise: Promise<string> | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry - 10000) {
    return cachedToken;
  }
  if (tokenPromise) {
    return tokenPromise; // Wait for in-flight request
  }
  tokenPromise = fetchNewToken();
  try {
    return await tokenPromise;
  } finally {
    tokenPromise = null;
  }
}
```

**Takeaway:** When multiple parts of an app can trigger the same async initialization, use a shared promise as a lock to deduplicate requests.

---

## 3. vis-timeline `setWindow()` causes visible zoom animation

**Problem:** Using `timeline.setWindow(start, end)` after creating the timeline causes a visible zoom/pan animation from the default view to the target view. This creates a jarring user experience on page load.

**Solution:** Pass the initial time range as `start` and `end` in the options object when constructing the timeline, not as a separate `setWindow()` call:

```typescript
const options = {
  start: initialStart,  // Set here, not via setWindow()
  end: initialEnd,
  // ...
};
const timeline = new VisTimeline(container, items, groups, options);
```

**Takeaway:** Prefer declarative initialization (constructor options) over imperative updates (method calls) to avoid visual artifacts on first render.

---

## 4. Vite proxy for CORS with external APIs

**Problem:** The browser blocks cross-origin requests from `localhost` to external APIs (`api.countroll.com`, `sso.countroll.com`) during development.

**Solution:** Configure Vite's dev server proxy to route API requests through the local server:

```typescript
// vite.config.ts
server: {
  proxy: {
    '/api': {
      target: 'https://api.countroll.com',
      changeOrigin: true,
    },
    '/auth': {
      target: 'https://sso.countroll.com',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/auth/, ''),
    },
  },
}
```

The API client then uses relative URLs in dev mode (`/api/thing/123`) and absolute URLs in production.

**Takeaway:** Vite's proxy is a clean way to avoid CORS during development, but the code must handle both dev (relative) and production (absolute) URL patterns.

---

## 5. Vite HMR fails for files exporting non-component values

**Problem:** Hot Module Replacement (HMR) would not apply changes to `Timeline.tsx`. The browser console showed: "Could not Fast Refresh (EVENT_TYPE_CONFIG export is incompatible)".

**Cause:** Vite's React Fast Refresh plugin requires that modules export only React components. `Timeline.tsx` also exports `EVENT_TYPE_CONFIG` (a plain object) and `MAIN_EVENT_TYPES` (an array), which makes the module ineligible for fast refresh.

**Impact:** Any change to `Timeline.tsx` triggers a full page reload instead of an in-place HMR update. This slows down the development feedback loop, especially when debugging tooltip styling.

**Possible fix:** Move non-component exports to a separate file (e.g., `eventConfig.ts`). We chose to keep things co-located for simplicity since the reload is acceptable.

**Takeaway:** If HMR isn't working for a React component file, check if it exports non-component values. Fast Refresh requires component-only exports.

---

## 6. CSS `!important` on parent overrides all children

**Problem:** The `.vis-tooltip` CSS rule had `font-size: 13px !important` and `color: #374151 !important`. These overrode all child element styling, making it impossible to highlight specific text within tooltips at different sizes or colors.

**Solution:** Removed the `!important` declarations from the parent tooltip rule and applied specific styles only to child selectors (`.vis-tooltip mark`, etc.).

**Takeaway:** Avoid blanket `!important` on container elements. It cascades down and prevents child-specific overrides, creating debugging headaches.

---

## 7. Dynamic timeline height based on visible groups

**Problem:** A fixed timeline height wastes space when few event types are visible, or clips content when many are shown.

**Solution:** Calculate height dynamically from the number of active timeline groups:

```typescript
const activeGroups = TIMELINE_GROUPS.filter(g =>
  g.types.some(t => eventTypes.has(t))
);
const calculatedHeight = Math.max(200, activeGroups.length * 50 + 40);
```

**Takeaway:** When the content is dynamic, derive layout dimensions from the data rather than using fixed values.

---

## 8. Group related event types into shared timeline rows

**Problem:** LINKED and UNLINKED events are semantically related (position changes) but would each get their own row, wasting vertical space.

**Solution:** Define group mappings that combine related types into a single row:

```typescript
{ id: 'POSITION', types: ['LINKED', 'UNLINKED'] }
```

Events are assigned to groups via a lookup function, and the group uses the styling of the primary type.

**Takeaway:** Timeline readability improves when related events share a row. Design the grouping model separately from the event type model.

---

## 9. Token caching needs an expiry buffer

**Problem:** Using the token right up to its expiry time means some requests arrive at the server after the token has expired, causing intermittent 401 errors.

**Solution:** Subtract a buffer (10 seconds) from the expiry time:

```typescript
if (cachedToken && Date.now() < tokenExpiry - 10000) {
  return cachedToken;
}
```

**Takeaway:** Always refresh tokens before they actually expire. Network latency and clock drift mean the token may be invalid by the time the request reaches the server.

---

## 10. Use `useEffect` cleanup to prevent state updates on unmounted components

**Problem:** When navigating between assets quickly, the previous asset's API response could arrive after the new asset's page has mounted, causing stale data to overwrite the current view.

**Solution:** Use a `cancelled` flag in the effect cleanup:

```typescript
useEffect(() => {
  let cancelled = false;
  async function loadData() {
    const data = await fetchAsset(assetId);
    if (!cancelled) {
      setAsset(data);
    }
  }
  loadData();
  return () => { cancelled = true; };
}, [assetId]);
```

**Takeaway:** Always guard async state updates with a cleanup flag when the triggering dependency can change before the async operation completes.

---

## 11. vis-timeline `align` option only works for `box` items, not `point`

**Problem:** Point items (`type: 'point'`) always align their left edge to the event date. The `align: 'center'` timeline option has no effect on point items — it only applies to `box`, `range`, and `background` types.

**Failed attempt:** Using CSS `transform: translateX(-50%)` to shift point items. vis-timeline positions items using inline `transform` styles, so any CSS transform override (even with `!important`) either gets overridden or breaks positioning entirely (items stuck to the left border).

**Solution:** Switch from `type: 'point'` to `type: 'box'` and set `align: 'center'`. Then hide the box's decorative line and dot via CSS:

```css
.vis-item.vis-box .vis-line,
.vis-item.vis-box .vis-dot {
  display: none !important;
}
```

**Takeaway:** Don't fight a library's inline positioning styles with CSS overrides. Use the library's own layout options (item types, alignment) to get the desired positioning.

---

## 12. Dynamic timeline groups for data-driven rows

**Problem:** RECOVERED events all shared a single row, making it hard to distinguish between different cover materials. The static group configuration (`TIMELINE_GROUPS` array) didn't support data-driven grouping.

**Solution:** Handle RECOVERED groups dynamically by extracting unique `coverMaterial` values from the events and creating a separate group per material:

```typescript
function getRecoveredMaterials(events: AssetEvent[]): string[] {
  const materials = new Set<string>();
  for (const e of events) {
    if (e.type === 'RECOVERED' && e.state === 'VISIBLE') {
      materials.add(e.coverMaterial || 'Unknown');
    }
  }
  return Array.from(materials).sort();
}
```

Group IDs use a prefix pattern (`RECOVERED:Rubber`, `RECOVERED:PU`) to avoid collisions with static group IDs.

**Takeaway:** When timeline rows need to represent data values rather than fixed categories, generate groups dynamically from the event data. Keep a clear ID naming convention to avoid collisions with static groups.

---

## 13. API responses may omit expected fields

**Problem:** The app crashed with "Cannot read properties of undefined (reading 'filter')" when `asset.events` was undefined. The API sometimes returns asset objects without the `events` array.

**Solution:** Add defensive fallbacks wherever `asset.events` is accessed:

```typescript
(asset.events || []).filter(...)
```

**Takeaway:** Never assume API responses contain all fields defined in your TypeScript interface. Add runtime guards for any field accessed in render paths, especially arrays that get `.filter()`, `.map()`, or `.length`.
