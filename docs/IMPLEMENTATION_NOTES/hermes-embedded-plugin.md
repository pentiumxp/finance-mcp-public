# Hermes Embedded Plugin Integration

This document records the Finance side of the Hermes Mobile embedded-app plugin contract.

## Endpoints

- Manifest: `GET /api/v1/hermes/plugin/manifest`
- Launch exchange: `POST /api/v1/hermes/plugin/launch`
- One-time launch entry: `GET /api/v1/hermes/plugin/launch/<one-time-token>`
- Embedded app entry: `/finance.html?embed=hermes&v=<static-version>`

The service can run on plain HTTP locally. Hermes Mobile may embed it through a same-origin proxy; Finance does not require the user to configure an extra HTTPS reverse proxy for local development.

## Manifest Shape

The manifest uses:

- `id`: `finance`
- `title`: `记账`
- `type`: `embedded-app`
- `toolsets`: `["finance"]`
- `mcpServer`: `finance`
- `permissions`: `["finance:read", "finance:write"]`

Embedding message types:

- navigation: `finance.plugin.navigation`
- host back request: `hermes.plugin.back`
- back result: `finance.plugin.back_result`
- refresh request: `finance.plugin.refresh_required`
- optional host viewport update: `hermes.plugin.viewport`

The manifest derives browser-facing URLs from `x-hermes-public-origin`, `x-forwarded-origin`, or `x-forwarded-proto` + `x-forwarded-host` when present. This lets Hermes same-origin proxy publish the plugin under the Hermes origin.

## Launch And Session

Hermes Mobile server calls `POST /api/v1/hermes/plugin/launch` with a workspace id and workspace key. Finance returns only:

```json
{
  "ok": true,
  "entry_path": "/api/v1/hermes/plugin/launch/<one-time-token>"
}
```

The long workspace key is never copied into the iframe URL. The one-time token is short lived and consumed by `GET /api/v1/hermes/plugin/launch/<one-time-token>`, which sets `finance_hermes_session` and redirects to `/finance.html?embed=hermes&v=<static-version>`. If Home AI appended plugin quick-action route metadata to that one-time launch URL, Finance preserves only the bounded allowlist (`pluginActionId`, `pluginRoute`, `pluginItemId`, `pluginThreadId`, `pluginTaskId`, `sourceTurnId`, `pluginId`) on the final `finance.html` redirect so the frontend can open the requested in-plugin screen. Workspace keys, access keys, raw launch tokens, and arbitrary query parameters must not be forwarded. The static version query is required so Hermes iframe lifecycle and browser caches cannot keep an old Finance shell after a frontend deployment. The Finance server resolves this version from the current `public/finance.html` script/style query string and injects it into the embedded-plugin service; it must not remain a stale hard-coded manifest constant.

Hermes Mobile appearance sync v133:

- `POST /api/v1/hermes/plugin/launch` may include bounded `pluginTheme` and `pluginFontSize` values.
- Accepted embedded-plugin theme values are `light` and `dark`. `system` and `auto` are ignored for plugin launch because Hermes Mobile sends an already-resolved host theme.
- Accepted font size values are `compact`, `normal`, `large`, and `xlarge` (`small`, `medium/default`, and `xl/extra-large` normalize to these tokens).
- Finance stores only those bounded appearance tokens in the short-lived plugin session. Raw keys, launch tokens, cookies, transaction data, and private content are not copied into URLs, frontend messages, or bootstrap payloads.
- `/finance.html?embed=hermes&v=<static-version>` receives a server-rendered `window.__FINANCE_PLUGIN_APPEARANCE__` bootstrap before the normal theme script and before the stylesheet link. The bootstrap contains only `{ theme, fontSize }`, so the iframe applies theme/font before first visible render and avoids a light/dark flash.
- If the session has no host appearance values, standalone/PWA preferences in `localStorage` remain the fallback.

Cookie behavior:

- HTTPS or HTTPS-forwarded requests use `SameSite=None; Secure`.
- Local HTTP development uses `SameSite=Lax`.
- Cookie path is `/` so Hermes same-origin proxy paths remain compatible.

## Authorization Boundary

Finance does not authorize every workspace globally. The default authorized workspace is `FINANCE_HERMES_OWNER_WORKSPACE_ID` or `owner`. Additional workspaces must be explicitly listed in `FINANCE_HERMES_ALLOWED_WORKSPACES` as a comma-separated list.

Raw workspace keys and user keys are not stored in URLs, docs, handoff, or route projections. The launch service hashes keys internally where it needs a stable comparison handle.

## Embedded UI Mode

`?embed=hermes` enables iframe mode in the existing Finance frontend:

- opens on the normal Finance `home` root page;
- keeps the same Wacai-like Finance topbar and bottom navigation used by the standalone PWA;
- avoids an intermediate prompt or marketing page;
- uses existing mobile-first layouts;
- keeps initial dark theme state from the HTML root, or the host-provided v133 theme/font bootstrap, to avoid a white flash before JavaScript loads.

Finance still owns its UI, API, DB, and MCP runtime. Hermes Mobile only hosts the iframe and calls the manifest/launch contracts.

### Embedded Home Navigation

Hermes Mobile may keep host bottom chrome or a collapsed plugin-dock handle visible while a Finance plugin iframe is active. Finance therefore keeps a compact in-iframe bottom navigation without a separate opaque backing: the page content ends above the fixed bottom tab area, the nav frame itself is transparent, each tab button remains individually opaque and outlined, and horizontal dragging must not scroll the tab row or push tabs outside the available width. In embedded mode the dock must not add `env(safe-area-inset-bottom)` again because Hermes Mobile already owns the host safe area and bottom chrome. The visible tab buttons follow the host-provided theme token: `dark` uses dark button fills and `light` uses light button fills.

The embedded bottom navigation uses a 6px bottom offset, matching Wardrobe's
mobile bottom-tabs placement, so the Finance tab row sits close to the host
bottom chrome without adding another safe-area inset.

The embedded bottom tab state follows the same bottom-tab token model for normal and active tab states. Finance keeps `--bottom-tab-*` variables for normal/active tab fills, ink, borders, and inset outlines; `--bottom-tabs-*` variables still define sizing and spacing but must not create a large opaque host-adjacent backing. Active tabs must show a filled state plus a visible solid/inset outline in both `dark` and `light` host themes. Finance still reserves page bottom space for pages that show the tabs; working pages that hide the tabs, including `entry` and detail/report detail routes, must also hide the embedded nav area so it cannot cover fixed bookkeeping controls.

The bookkeeping `entry` page is a fixed-screen workflow. The page itself must not vertically drag; only the middle quick-category list may scroll when there are more categories than the visible area can hold. The left current-category button opens a Wacai-like full category picker backed by the same scoped category list and hidden `category_hint` field, while the amount input remains dedicated to numeric entry. The picker defaults to top-level category rows; child categories stay collapsed until their parent is expanded, and the search field filters the full category set for quick location.

When any input/search field is focused, Finance hides the bottom floating navigation and embedded tab area and compresses the shell bottom padding so the keyboard does not leave the result list behind redundant chrome. The ledger root topbar keeps the left slot as an invisible spacer, leaves the ledger switch centered, and uses the right icon as a bill-search shortcut into the all-bills search page.

When a Finance-owned note/search input inside the iframe summons the native
keyboard, Finance derives the visible work area from its own iframe document and
`window.visualViewport`, then stores that height in `--finance-app-height` and
the iframe-local `visualViewport.offsetTop` or iOS-induced iframe `scrollY` in
`--finance-app-top`. This keeps bottom sheets such as the bookkeeping `备注`
editor attached to the Finance-owned visible bottom instead of letting the
system keyboard pan the iframe into a blank scrolled area.

Home AI host client `20260608-plugin-viewport-bridge-v619` may post
`hermes.plugin.viewport` messages with bounded host viewport, iframe, footer,
and keyboard-shaped metrics. Finance stores those messages only as host chrome /
bottom-reservation diagnostics and future host-bottom-occupancy input. Finance
must not treat host `viewport.offsetTop`, host visible height, or
`keyboard.bottomInset` as the native system keyboard rectangle for the Finance
note editor.

Starting with the settled host viewport broadcast update, Finance must also keep
the note overlay in note-focus layout while the overlay is open even if mobile
iOS/iframe keyboard transition temporarily clears `document.activeElement`. This
prevents host viewport messages from downgrading the note sheet to the normal
page layout during keyboard animation.

Finance uses this route model:

- `home`, depth `0`: plugin root. Shows the normal Finance ledger home and Finance bottom navigation. `canGoBack=false`.
- `entry`, `transactions`, `reports`, `accounts`, `plan`, and `settings`: Finance working pages reached from the Finance navigation or content links. They are inside-plugin pages, not host exit points, and must report `canGoBack=true`.
- secondary detail/report pages, depth `1`: keep the existing left-top and swipe-back behavior.
- A host back request or edge-swipe on any non-`home` Finance page returns to `home` first. Hermes Mobile should leave the plugin iframe active until Finance reports `canGoBack=false` on `home`.
- In embedded mode, Finance also captures the left-edge swipe on `home` and reports `finance.plugin.back_result` with `handled:false` plus a fresh root navigation state. This prevents the iframe/WebView native history stack from returning to the device desktop after a secondary page has returned to the plugin root; Hermes Mobile remains responsible for leaving the Finance plugin.

This keeps plugin and standalone PWA behavior aligned and avoids maintaining a separate plugin-only home surface.

## Iframe Message Contract

Finance sends navigation state only when embedded:

```js
window.parent.postMessage({
  type: "finance.plugin.navigation",
  canGoBack: true,
  route: { name: "ledger-detail", depth: 1, itemId: "..." }
}, "*");
```

Route metadata is bounded to `name`, `depth`, and optional `itemId`. It must not include transaction body, amount, notes, receipts, keys, tokens, cookies, raw source fields, or long logs.

Finance listens for:

```js
{ type: "hermes.plugin.back" }
```

Finance also listens for the host viewport bridge in embedded mode:

```js
{
  type: "hermes.plugin.viewport",
  version: 1,
  pluginId: "finance",
  viewport: { height: 624, offsetTop: 0, layoutHeight: 844 },
  keyboard: { visible: true, bottomInset: 274 },
  iframe: { top: 0, height: 570 },
  footer: { visible: true }
}
```

The message is layout metadata only. Finance must ignore payloads for other
`pluginId` values and must not expect transaction data, workspace keys, launch
tokens, cookies, or route URLs in this event.

The plugin consumes back in this order:

1. close settings or report action overlays;
2. close transaction or report secondary pages;
3. return transaction list to ledger when applicable;
4. return any other non-root Finance working page, including `entry`, to `home`;
5. otherwise report `handled: false`.

Back result:

```js
window.parent.postMessage({
  type: "finance.plugin.back_result",
  handled: true,
  route: { name: "ledger" }
}, "*");
```

Refresh request:

```js
window.parent.postMessage({
  type: "finance.plugin.refresh_required",
  reason: "static_assets_changed",
  route: { name: "ledger", depth: 0 }
}, "*");
```

Finance throttles refresh messages and only sends bounded route hints.

## Resource And Proxy Compatibility

Finance uses root-relative static URLs such as `/styles.css`, `/app-finance-ui.js`, `/manifest.json`, `/icons/...`, and `/assets/...`. API endpoints are structured paths. Text content is not treated as a resource URL.

Static responses preserve content types through `server.js`.

## PWA Verification Rule

Finance plugin and mobile validation must not treat Chrome/Safari address-bar loading as PWA evidence.

For mobile functionality, embedded-plugin navigation/back behavior, service worker/cache, manifest, Web Push, file/image preview, or proxy/resource validation, use the installed PWA flow documented in `docs/IMPLEMENTATION_NOTES/android-pwa-harness.md`.

Required evidence:

- emulator/device id;
- whether the Finance PWA shortcut was installed/refreshed or reused;
- launch method: `Launcher PWA icon`;
- screenshot path showing no browser address bar;
- page or feature verified;
- failure class if failed.

Browser-mode URL loading is allowed only as a diagnostic step.

## Tests

Focused coverage:

- `tests/finance-hermes-embedded-plugin-service.test.js`
- `tests/finance-server.test.js`
- `tests/app-finance-ui.test.js`
- `tests/privacy-scan.test.js`

v133 appearance sync coverage:

- launch/session tests verify unbounded values are rejected and long keys/tokens are not copied into `entry_path`;
- server tests verify `window.__FINANCE_PLUGIN_APPEARANCE__` is inserted before the normal bootstrap script and before the stylesheet link;
- UI tests verify host theme/font values are applied before app initialization and are not included in iframe postMessage payloads.

Minimum commands after touching this contract:

```powershell
node --check adapters\finance-hermes-embedded-plugin-service.js
node --check server-routes\finance-api-routes.js
node --check public\app-finance-ui.js
node tests\finance-hermes-embedded-plugin-service.test.js
node tests\finance-server.test.js
node tests\app-finance-ui.test.js
npm run check
git diff --check
```
