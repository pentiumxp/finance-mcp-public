# HANDOFF

Last compacted: 2026-06-03T13:37:44.648Z

This active handoff was automatically compacted before a Codex Mobile continuation.
The previous full handoff was archived and should be opened only when old provenance is explicitly needed.

## Compaction Summary

- Workspace: `C:\Users\xuxin\Documents\财务`
- Original active handoff bytes: `110667`
- Archived full handoff: `C:\Users\xuxin\Documents\财务\.agent-context\archive\context-compaction-20260603_133744\HANDOFF.full.md`
- Preserved recent active context chars: `17123`

## Startup Guidance

- Read `.agent-context/PROJECT_CONTEXT.md` first.
- Read this compact `.agent-context/HANDOFF.md` for current status.
- Do not load the archived full handoff unless the user asks for old provenance or the compact handoff is insufficient.
- Keep future handoff updates concise: current state, changed files, validation, risks, and next steps.
- Do not store raw secrets, tokens, one-time approvals, hidden UI state, long logs, or bulky generated output.

## 2026-06-11 Local Bookkeeping Draft Restore

- Status: committed and deployed to Mac production.
- Commit: `589ec2a2a089` (`fix: restore finance entry drafts after reload`).
- Push status: not pushed in this turn; local branch is ahead of origin.
- Production deploy:
  - Target: `plugin:finance`.
  - Script:
    `/Users/hermes-dev/HermesMobileDev/app/scripts/deploy-macos-production.js`.
  - Backup:
    `/Users/hermes-host/HermesMobile/backups/deploy/20260611T131119Z-plugin-finance-finance-entry-draft-restore-v123`.
  - Restarted launchd label: `com.hermesmobile.plugin.finance`.
  - Health URL passed:
    `http://127.0.0.1:8791/api/v1/hermes/plugin/manifest`.
- User-visible behavior:
  - The create-entry page now persists an unsaved local draft after amount,
    type, category, account, target account, member, tags, note, date, or
    `再记` changes.
  - Drafts are scoped by ledger and standalone/Hermes embedded mode, stored only
    in browser `localStorage`, expire after seven days, and are restored after
    full PWA/WebView reloads.
  - If a valid draft exists on startup, the UI opens the bookkeeping page after
    overview/ledger context loads and restores the draft fields.
  - Successful save and explicit entry-page back clear the draft.
  - Attachments are not restored because browser file handles cannot be safely
    persisted.
- Static versions:
  - frontend `finance-replica-20260611d`;
  - service worker `finance-mcp-pwa-v123`.
- Changed files:
  - `public/app-finance-ui.js`
  - `public/finance.html`
  - `public/service-worker.js`
  - `adapters/finance-hermes-embedded-plugin-service.js`
  - `tests/app-finance-ui.test.js`
  - `tests/finance-hermes-embedded-plugin-service.test.js`
  - `docs/MODULES/finance-mcp.md`
  - `docs/finance-mcp-implementation-plan.md`
  - `docs/TEST_MATRIX.md`
  - `docs/IMPLEMENTATION_NOTES/harness-required-matrix.md`
- Validation passed:
  - `node --check public/app-finance-ui.js`
  - `node --test tests/app-finance-ui.test.js`
  - `node --test tests/finance-hermes-embedded-plugin-service.test.js`
  - `npm run check`
  - `npm test`
  - `git diff --check`
  - local Playwright reload smoke on `http://127.0.0.1:18791/finance.html`:
    enter amount `123`, reload, restored view `entry`, amount `123`, status
    `已恢复未保存草稿`.
  - production checks after deploy:
    - `finance.html` references `finance-replica-20260611d`;
    - `service-worker.js` uses cache `finance-mcp-pwa-v123`;
    - plugin manifest entry references `finance-replica-20260611d`.

## 2026-06-11 Hermes Plugin Action Route Redirect Fix

- Problem:
  - Home AI Dock quick actions passed `pluginActionId/pluginRoute` to the
    Finance iframe launch URL, but Finance uses a two-step launch flow.
  - The one-time `GET /api/v1/hermes/plugin/launch/<token>` redirect set the
    session cookie and redirected to `/finance.html?embed=hermes&v=...`
    without preserving the quick-action route metadata, so actions such as
    `record` opened the Finance homepage.
- Fix:
  - `server-routes/finance-api-routes.js` now appends only the approved
    non-secret route metadata allowlist (`pluginActionId`, `pluginRoute`,
    `pluginItemId`, `pluginThreadId`, `pluginTaskId`, `sourceTurnId`,
    `pluginId`) to the final `finance.html` redirect.
  - Workspace keys, access keys, raw launch tokens, and arbitrary query
    parameters are not forwarded.
- Docs updated:
  - `docs/MODULES/finance-mcp.md`;
  - `docs/IMPLEMENTATION_NOTES/hermes-embedded-plugin.md`.
- Validation passed:
  - `node --check server-routes/finance-api-routes.js`;
  - `node --test tests/finance-server.test.js`;
  - `node --test tests/finance-hermes-embedded-plugin-service.test.js`;
  - `node --test tests/app-finance-ui.test.js`;
  - `npm test`;
  - `npm run check`;
  - `git diff --check`.

## 2026-06-12 Owner Asset Live USD Projection

- Status: committed, pushed to origin/public, and deployed to Mac production.
- Commit: `9677e836aa49` (`feat: refresh owner asset USD projection`).
- User-visible behavior:
  - The Owner-only `资产` page now shows a current USD total-assets projection
    beside the existing RMB total and USD return metrics.
  - Owner asset summary reads refresh live USD/CNY through the shared market
    quote provider, persist the current FX rate, update time, source, and
    computed USD total on the latest asset snapshot, and return those fields to
    UI/MCP callers.
  - Historical workbook `fx_usd_cny_rate` / `fx_usd_cny_ppm` fields are not
    overwritten by live summary reads.
  - Live FX failure is surfaced as a bounded summary error; no fixed exchange
    rate fallback is used.
- Static versions:
  - frontend `finance-replica-20260612g`;
  - service worker `finance-mcp-pwa-v131`.
- Changed areas:
  - shared market quote provider for stock and asset live FX reads;
  - owner asset service/repository/runtime current USD projection fields;
  - owner asset MCP contract description and HTTP summary route;
  - asset page UI/CSS;
  - product, MCP, architecture, harness, and test documentation.
- AI Ops:
  - Intake classified the task as H1 for Plugin Platform/MCP.
  - Evidence ledger written to
    `$HOME/.homeai-qa/finance-evidence-ledger.jsonl`.
  - The generic required-checks output named
    `tests/architecture-code-test-harness-map.test.js`, which does not exist in
    this Finance repo; the local equivalent `tests/architecture-boundary.test.js`
    passed via `npm run check`.
- Production deploy:
  - Command:
    `cd /Users/hermes-dev/HermesMobileDev/app && npm run --silent deploy:macos -- --plugin finance --source /Users/hermes-dev/HermesMobileDev/plugins/finance --reason finance-owner-asset-live-usd-projection-20260612 --execute --json`
  - Source ref: `9677e836aa49`, dirty false.
  - Backup:
    `/Users/hermes-host/HermesMobile/backups/deploy/20260612T090202Z-plugin-finance-finance-owner-asset-live-usd-projection-20260612`.
  - Restarted launchd label: `com.hermesmobile.plugin.finance`.
  - Health URL passed:
    `http://127.0.0.1:8791/api/v1/hermes/plugin/manifest`.
  - Production smoke passed from local loopback:
    `/finance.html` contains `finance-replica-20260612g`,
    `/service-worker.js` contains `finance-mcp-pwa-v131`,
    plugin manifest entry contains `finance-replica-20260612g`, and
    `/api/finance/overview` returned HTTP `200`.
  - Deploy validation returned `codexIssueCount: 0`; profile audit retained
    non-Codex issues outside this Finance deploy.

## 2026-06-16 Wacai Category Icon Alignment And Live Refresh Retry

- Status: committed, pushed to origin/public `main`, and deployed to Mac
  production.
- Commit: `e044a28b1caf` (`fix: align finance category icons and quote refresh`).
- User-visible target:
  - bookkeeping/category/report icons should use stable Wacai-style category
    icons instead of falling back to generic icons for imported history;
  - asset FX and stock quote refresh failures should leave a small retry icon
    button on the page.
- Implementation notes:
  - `adapters/finance-category-icons.js` maps imported Wacai category paths to
    stable icon keys.
  - Wacai import passes the path-derived icon into `finance_categories.icon`.
  - Runtime startup calls `repository.backfillCategoryIcons()`; backfill only
    fills empty or `category-generic` icons and does not overwrite an explicit
    non-generic icon.
  - Transaction/report projections carry category icon fields so frontend rows,
    quick category chips, category picker rows, and report rows can prefer stored
    icon keys.
  - Asset and stock tabs render compact refresh icon buttons wired to the
    existing live FX/quote endpoints.
  - Market quote provider now tries domestic stock sources first (Eastmoney,
    Tencent, then Sina) before Yahoo/public fallbacks; FX still uses live
    providers only and does not substitute fixed rates.
  - Stock live summary and natural-language delta refresh quote rows in
    parallel instead of serializing all holdings.
  - Static frontend version: `finance-replica-20260616c`; service worker cache:
    `finance-mcp-pwa-v143`.
- Validation passed so far:
  - `node --check adapters/finance-repository.js`;
  - `node --check adapters/finance-wacai-import-service.js`;
  - `node --check adapters/finance-category-icons.js`;
  - `node --check adapters/finance-transaction-service.js`;
  - `node --check adapters/finance-report-service.js`;
  - `node --check adapters/finance-market-quote-provider.js`;
  - `node --check public/app-finance-ui.js`;
  - `node --test tests/finance-market-quote-provider.test.js tests/finance-wacai-import-service.test.js tests/app-finance-ui.test.js tests/finance-owner-asset-service.test.js tests/finance-owner-stock-service.test.js tests/finance-server.test.js`;
  - Home AI center check:
    `cd /Users/hermes-dev/HermesMobileDev/app && node tests/architecture-code-test-harness-map.test.js`.
  - Live provider probes during implementation:
    - Eastmoney direct probes returned `0700.HK` in 51 ms and `TSLA` in 8 ms in
      one run.
    - Later aggregate provider probe returned `CNY=X` in 362 ms while stock
      symbols timed out at the bounded 5 s limit, indicating intermittent
      external quote availability rather than a local DB issue.
- Production deployment:
  - Command:
    `cd /Users/hermes-dev/HermesMobileDev/app && npm run --silent deploy:macos -- --plugin finance --source /Users/hermes-dev/HermesMobileDev/plugins/finance --reason finance-category-icons-quote-refresh-20260616 --execute --json`.
  - Backup:
    `/Users/hermes-host/HermesMobile/backups/deploy/20260616T092823Z-plugin-finance-finance-category-icons-quote-refresh-20260616`.
  - Restarted launchd label: `com.hermesmobile.plugin.finance`; deploy
    validation returned `codexIssueCount: 0`.
  - Production smoke passed for static version, service worker cache, manifest
    entry, overview, and category icon backfill:
    `/finance.html` contains `finance-replica-20260616c`,
    `/service-worker.js` contains `finance-mcp-pwa-v143`, manifest entry
    contains `finance-replica-20260616c`,
    `/api/finance/overview?summary_only=1` returned `ok:true`, and production
    `finance_categories` had `empty:0` icon rows.
  - Production live quote smoke at the end of deployment returned bounded
    timeouts for `0700.HK`, `TSLA`, and `CNY=X` in that run. Earlier same-turn
    probes showed Eastmoney stock quotes returning quickly and `CNY=X` returning
    in 248-362 ms, so provider availability is external/intermittent; UI retry
    remains available and no fixed quote fallback is used.

## 2026-06-17 Stock Quote Refresh Failure Diagnosis

- Status: local fix in progress; not yet deployed at this handoff write.
- Finding:
  - Production `/api/finance/owner-stocks/summary?live=1` did call the live
    summary path, but Tencent HK quote parsing used field index `6` for
    `hk00700`.
  - Tencent quote payload field index `3` is the current price (`447.400`);
    field index `6` is a large volume/amount-like value (`24323142.0`). Using
    index `6` made current Tencent HK prices and market values explode, which
    made refresh appear broken even when a source returned data.
  - Some quote endpoints were also unstable without browser-like headers.
- Local fix:
  - `adapters/finance-market-quote-provider.js` now sends bounded browser-like
    `User-Agent` and `Referer` headers for quote requests.
  - Tencent HK parsing now uses field index `3` for current price.
  - Added a regression test ensuring Tencent HK current price is not parsed from
    the volume field.
- Local validation:
  - `node --check adapters/finance-market-quote-provider.js`;
  - `node --test tests/finance-market-quote-provider.test.js tests/finance-owner-stock-service.test.js tests/finance-server.test.js`;
  - live local provider probes returned:
    `0700.HK = 447.4` in 70-143 ms, `TSLA = 404.07` in 59 ms, and
    `CNY=X = 6.7557` in 222 ms.

## 2026-06-13 Stock Position Current Price Visibility Fix

- Status: committed, pushed to origin/public `main`, and deployed to Mac
  production.
- Commit: `21f89c3b1664` (`fix: show stock position prices`).
- User-visible behavior:
  - The 股票 page now shows each holding's current price on its own visible line
    (`当前价格 <price>`), instead of embedding it in the ticker/quantity metadata
    line where narrow mobile widths truncated it.
  - Ticker and quantity remain on the metadata line; market value and
    allocation remain on the right side of the row.
- Static versions:
  - frontend `finance-replica-20260613a`;
  - service worker `finance-mcp-pwa-v139`.
- Changed files:
  - `public/app-finance-ui.js`;
  - `public/styles.css`;
  - `public/finance.html`;
  - `public/service-worker.js`;
  - `adapters/finance-hermes-embedded-plugin-service.js`;
  - `scripts/deploy-mac-finance.ps1`;
  - `tests/app-finance-ui.test.js`;
  - `tests/finance-hermes-embedded-plugin-service.test.js`;
  - `docs/TEST_MATRIX.md`.
- Validation passed:
  - `node --check public/app-finance-ui.js`;
  - `node --check tests/app-finance-ui.test.js`;
  - `node --test tests/app-finance-ui.test.js tests/finance-hermes-embedded-plugin-service.test.js`;
  - `npm run check`;
  - `npm test`;
  - `git diff --check`;
  - Home AI deploy script checks:
    `node --check scripts/deploy-macos-production.js`,
    `node tests/macos-production-deploy-script.test.js`,
    `node tests/production-status-smoke-harness.test.js`.
- AI Ops:
  - Intake classified the task as H3.
  - Test evidence ledger record:
    `evidence-5f29bd9e-08df-42e2-8d21-36d1d2ecdcef`.
  - Deploy evidence ledger record:
    `evidence-08664c97-168d-4fe3-a0da-8d2951a9578e`.
- Production deploy:
  - Command:
    `cd /Users/hermes-dev/HermesMobileDev/app && npm run --silent deploy:macos -- --plugin finance --source /Users/hermes-dev/HermesMobileDev/plugins/finance --reason finance-stock-position-price-visible-20260613 --execute --json`.
  - Backup:
    `/Users/hermes-host/HermesMobile/backups/deploy/20260613T013241Z-plugin-finance-finance-stock-position-price-visible-20260613`.
  - Restarted launchd label: `com.hermesmobile.plugin.finance`.
  - Production smoke passed:
    `/finance.html` references `finance-replica-20260613a`,
    `/app-finance-ui.js` contains `class="finance-stock-price"` and
    `当前价格`, `/styles.css` contains `.finance-stock-price`,
    `/service-worker.js` contains `finance-mcp-pwa-v139`, plugin manifest entry
    contains `finance-replica-20260613a`, and `/api/finance/overview` returned
    HTTP `200`.
  - Deploy validation returned `codexIssueCount: 0`; profile audit retained
    non-Codex issues outside this Finance deploy.

## 2026-06-13 Shared-User Entry Keypad Direct Binding Fix

- Status: committed, pushed to origin/public `main`, and deployed to Mac
  production.
- Commit: `5638eb554f36` (`fix: bind finance entry keypad directly`).
- Problem:
  - A shared-user bookkeeping session could show keypad button touch animation
    while the amount text stayed unchanged.
  - The previous keypad handler depended on form-level `click` delegation only,
    which is brittle in embedded/shared-user WebView delivery paths.
- User-visible behavior:
  - The amount keypad now keeps the existing form `click` delegation and also
    handles direct `.wacai-keypad` `pointerup` / `touchend` events.
  - A short duplicate guard suppresses duplicate synthetic events without
    blocking normal rapid repeated digit input.
- Static versions:
  - frontend `finance-replica-20260613b`;
  - service worker `finance-mcp-pwa-v140`.
- Changed files:
  - `public/app-finance-ui.js`;
  - `public/finance.html`;
  - `public/service-worker.js`;
  - `adapters/finance-hermes-embedded-plugin-service.js`;
  - `scripts/deploy-mac-finance.ps1`;
  - `tests/app-finance-ui.test.js`;
  - `tests/finance-hermes-embedded-plugin-service.test.js`;
  - `docs/TEST_MATRIX.md`.
- Validation passed before commit:
  - `node --check public/app-finance-ui.js`;
  - `node --check tests/app-finance-ui.test.js`;
  - `node --test tests/app-finance-ui.test.js tests/finance-hermes-embedded-plugin-service.test.js`;
  - `npm run check`;
  - `npm test`;
  - `git diff --check`.
- AI Ops:
  - Intake classified the task as H3.
  - Test evidence ledger record:
    `evidence-15568d68-a92d-498e-8a7e-663ad77d69e9`.
  - Deploy evidence ledger record:
    `evidence-a953e96e-543f-4980-b34c-5191ad6d6dda`.
- Production deploy:
  - Command:
    `cd /Users/hermes-dev/HermesMobileDev/app && npm run --silent deploy:macos -- --plugin finance --source /Users/hermes-dev/HermesMobileDev/plugins/finance --reason finance-entry-keypad-direct-bind-20260613 --execute --json`.
  - Backup:
    `/Users/hermes-host/HermesMobile/backups/deploy/20260613T040625Z-plugin-finance-finance-entry-keypad-direct-bind-20260613`.
  - Restarted launchd label: `com.hermesmobile.plugin.finance`.
  - Production smoke passed:
    `/finance.html` references `finance-replica-20260613b`,
    `/app-finance-ui.js` contains direct `.wacai-keypad` `pointerup` /
    `touchend` handlers, `/service-worker.js` contains
    `finance-mcp-pwa-v140`, plugin manifest entry contains
    `finance-replica-20260613b`, and `/api/finance/overview` returned HTTP
    `200`.
  - Deploy validation returned `codexIssueCount: 0`; profile audit retained
    non-Codex issues outside this Finance deploy.

## 2026-06-16 Recurring Rule Dark-Mode Contrast Fix

- Status: committed, pushed to origin/public `main`, and deployed to Mac
  production.
- Commit: `794c1839c675` (`fix: improve recurring form dark contrast`).
- User-visible behavior:
  - The 周期账新增 full-screen form now uses theme-aware recurring-rule surface
    variables instead of hard-coded white fields.
  - Dark mode fields, selects, date/time inputs, end-mode toggle, close button,
    and save button use high-contrast dark surfaces and explicit native control
    `color-scheme`.
  - Chrome headless visual smoke showed contrast ratios: input/select/date/time
    `14.61`, active end toggle `11.47`, close `13.54`, save `5.72`.
- Static versions:
  - frontend `finance-replica-20260616a`;
  - service worker `finance-mcp-pwa-v141`.
- Changed files:
  - `public/styles.css`;
  - `public/finance.html`;
  - `public/app-finance-ui.js`;
  - `public/service-worker.js`;
  - `adapters/finance-hermes-embedded-plugin-service.js`;
  - `scripts/deploy-mac-finance.ps1`;
  - `tests/app-finance-ui.test.js`;
  - `tests/finance-hermes-embedded-plugin-service.test.js`;
  - `docs/TEST_MATRIX.md`.
- Validation passed:
  - `node --check public/app-finance-ui.js`;
  - `node --check tests/app-finance-ui.test.js`;
  - `node --test tests/app-finance-ui.test.js tests/finance-hermes-embedded-plugin-service.test.js`;
  - `npm run check`;
  - `npm test`;
  - `git diff --check`;
  - local Chrome headless visual computed-style smoke on
    `http://127.0.0.1:18791/finance.html?embed=hermes`.
- AI Ops:
  - Intake classified the task as H3.
  - Required-checks returned the center generic
    `tests/architecture-code-test-harness-map.test.js`, which does not exist
    in this Finance repo; the local equivalent `npm run check` passed.
  - Test evidence ledger record:
    `evidence-de3c76af-64a5-4134-872e-61d87305050c`.
  - Deploy evidence ledger record:
    `evidence-6188495f-2407-4c36-9f93-3551310ef5ec`.
- Production deploy:
  - Command:
    `cd /Users/hermes-dev/HermesMobileDev/app && npm run --silent deploy:macos -- --plugin finance --source /Users/hermes-dev/HermesMobileDev/plugins/finance --reason finance-recurring-dark-contrast-20260616 --execute --json`.
  - Backup:
    `/Users/hermes-host/HermesMobile/backups/deploy/20260616T044031Z-plugin-finance-finance-recurring-dark-contrast-20260616`.
  - Restarted launchd label: `com.hermesmobile.plugin.finance`.
  - Production smoke passed:
    `/finance.html` references `finance-replica-20260616a`,
    `/styles.css` contains the recurring Dark-mode contrast variables,
    `/service-worker.js` contains `finance-mcp-pwa-v141`, plugin manifest entry
    contains `finance-replica-20260616a`, and `/api/finance/overview` returned
    HTTP `200`.
  - Deploy validation returned `codexIssueCount: 0`; profile audit retained
    non-Codex issues outside this Finance deploy.

## 2026-06-16 Embedded WebKit First-Screen Loading Fix

- Status: committed, pushed to origin/public `main`, and deployed to Mac
  production.
- Commit: `d3e9bc9713be` (`fix: unblock embedded finance first screen`).
- Problem:
  - Embedded WebKit plugin opens could wait a long time or remain blank because
    the first-screen `loadOverview()` called full `/api/finance/overview`.
  - Production timing before the fix: static files and manifest returned in
    about 1 ms, `/api/finance/overview?summary_only=1` returned in about 0.11 s,
    but full `/api/finance/overview` took about 10.65 s due to live asset FX
    refresh.
- User-visible behavior:
  - First-screen embedded loading now uses
    `/api/finance/overview?limit=30&currency=<code>&summary_only=1`, so the
    home page renders from local persisted data and does not wait on external
    quote providers.
  - Opening the `资产` tab refreshes live USD/CNY through
    `/api/finance/owner-assets/summary?refresh_live_fx=1`; opening the `股票`
    tab keeps the existing live stock refresh path.
  - Yahoo/market quote fetches are bounded by
    `FINANCE_MARKET_QUOTE_TIMEOUT_MS`, default `2500` ms, so stalled quote
    providers return bounded refresh errors instead of blocking WebKit.
- Static versions:
  - frontend `finance-replica-20260616b`;
  - service worker `finance-mcp-pwa-v142`.
- Validation passed:
  - `node --check public/app-finance-ui.js`;
  - `node --check adapters/finance-market-quote-provider.js`;
  - `node --test tests/app-finance-ui.test.js tests/finance-hermes-embedded-plugin-service.test.js tests/finance-server.test.js tests/finance-market-quote-provider.test.js`;
  - `npm run check`;
  - `npm test`;
  - `git diff --check`;
  - local patched service timing:
    `summary_only` overview `0.006 s`, full overview `0.725 s`, asset live
    refresh `0.244 s`;
  - local Chrome embedded smoke rendered home in `38 ms` and only requested
    `/api/finance/overview?limit=30&currency=CNY&summary_only=1`.
- AI Ops:
  - Intake classified the task as H3.
  - Test evidence ledger record:
    `evidence-468a6dd1-6e7d-4302-aff6-abfd32c2cafe`.
  - Deploy evidence ledger record:
    `evidence-9b4da678-adbe-48d7-b3dd-f744ef61f3b4`.
- Production deploy:
  - Command:
    `cd /Users/hermes-dev/HermesMobileDev/app && npm run --silent deploy:macos -- --plugin finance --source /Users/hermes-dev/HermesMobileDev/plugins/finance --reason finance-embedded-first-screen-fast-overview-20260616 --execute --json`.
  - Backup:
    `/Users/hermes-host/HermesMobile/backups/deploy/20260616T085404Z-plugin-finance-finance-embedded-first-screen-fast-overview-20260616`.
  - Restarted launchd label: `com.hermesmobile.plugin.finance`.
  - Production smoke passed:
    `/finance.html` references `finance-replica-20260616b`,
    `/app-finance-ui.js` contains `summary_only: 1` first-screen overview and
    `refreshOwnerAssetsLive`, `/service-worker.js` contains
    `finance-mcp-pwa-v142`, plugin manifest entry contains
    `finance-replica-20260616b`.
  - Production timing after deploy:
    `summary_only` overview `0.116 s`, full overview `2.59 s`, and Chrome
    embedded first-screen smoke rendered in `187 ms` while requesting only
    `/api/finance/overview?limit=30&currency=CNY&summary_only=1`.
  - Deploy validation returned `codexIssueCount: 0`; profile audit retained
    non-Codex issues outside this Finance deploy.

## 2026-06-12 Transaction Row Wacai Date-Time Fix

- Status: committed, pushed to origin/public `main`, and deployed to Mac
  production.
- Commit: `acdbbbb260f6` (`fix: show transaction row dates`).
- User-visible behavior:
  - Home, all-bills, search, and report-detail transaction rows now show
    Wacai-style row metadata with full date-time text (`YYYY/MM/DD HH:mm`)
    before account/member metadata.
  - The row no longer shows only clock time such as `13:52`.
  - Transaction detail still keeps the existing full date-time field.
- Static versions:
  - frontend `finance-replica-20260612m`;
  - service worker `finance-mcp-pwa-v137`.
- Changed files:
  - `public/app-finance-ui.js`;
  - `public/finance.html`;
  - `public/service-worker.js`;
  - `adapters/finance-hermes-embedded-plugin-service.js`;
  - `scripts/deploy-mac-finance.ps1`;
  - `tests/app-finance-ui.test.js`;
  - `tests/finance-hermes-embedded-plugin-service.test.js`;
  - `docs/TEST_MATRIX.md`.
- Validation passed:
  - `node --check public/app-finance-ui.js`;
  - `node --check tests/app-finance-ui.test.js`;
  - `node --test tests/app-finance-ui.test.js tests/finance-hermes-embedded-plugin-service.test.js`;
  - `npm run check`;
  - `npm test`;
  - `git diff --check`;
  - Home AI deploy script checks:
    `node --check scripts/deploy-macos-production.js`,
    `node tests/macos-production-deploy-script.test.js`,
    `node tests/production-status-smoke-harness.test.js`.
- AI Ops:
  - Intake classified the task as H3.
  - Test evidence ledger record:
    `evidence-ea2ec730-93bf-47f4-b7a8-98f64fddba5d`.
  - Deploy evidence ledger record:
    `evidence-1d43bbea-3f1e-4f8e-8a4c-2cdc1c54d641`.
- Production deploy:
  - Command:
    `cd /Users/hermes-dev/HermesMobileDev/app && npm run --silent deploy:macos -- --plugin finance --source /Users/hermes-dev/HermesMobileDev/plugins/finance --reason finance-transaction-row-wacai-date-20260612 --execute --json`.
  - Backup:
    `/Users/hermes-host/HermesMobile/backups/deploy/20260612T151954Z-plugin-finance-finance-transaction-row-wacai-date-20260612`.
  - Restarted launchd label: `com.hermesmobile.plugin.finance`.
  - Production smoke passed:
    `/finance.html` references `finance-replica-20260612m`,
    `/app-finance-ui.js` contains `function formatTransactionRowDateTime` and
    the transaction-row call, `/service-worker.js` contains
    `finance-mcp-pwa-v137`, plugin manifest entry contains
    `finance-replica-20260612m`, and `/api/finance/overview` returned HTTP
    `200`.
  - Deploy validation returned `codexIssueCount: 0`; profile audit retained
    non-Codex issues outside this Finance deploy.

## 2026-06-12 Stock Summary Light-Mode Contrast Fix

- Status: committed, pushed to origin/public, and deployed to Mac production.
- Commit: `ddf8b2f37db9` (`fix: improve stock summary contrast`).
- User-visible behavior:
  - The 股票 page valuation hero now has explicit high-contrast white text and
    muted-white metadata on the dark green summary background in Light and Dark
    themes.
  - The fix adds a real `.finance-asset-hero` layout instead of letting the
    stock summary inherit page `--ink` text color.
- Static versions:
  - frontend `finance-replica-20260612l`;
  - service worker `finance-mcp-pwa-v136`.
- Changed files:
  - `public/styles.css`;
  - `public/finance.html`;
  - `public/app-finance-ui.js`;
  - `public/service-worker.js`;
  - `adapters/finance-hermes-embedded-plugin-service.js`;
  - `scripts/deploy-mac-finance.ps1`;
  - `tests/app-finance-ui.test.js`;
  - `tests/finance-hermes-embedded-plugin-service.test.js`;
  - `docs/TEST_MATRIX.md`.
- Validation passed:
  - `node --check public/app-finance-ui.js`;
  - `node --check tests/app-finance-ui.test.js`;
  - `node --test tests/app-finance-ui.test.js tests/finance-hermes-embedded-plugin-service.test.js`;
  - `npm run check`;
  - `npm test`;
  - `git diff --check`;
  - Home AI deploy script checks:
    `node --check scripts/deploy-macos-production.js`,
    `node tests/macos-production-deploy-script.test.js`,
    `node tests/production-status-smoke-harness.test.js`.
- AI Ops:
  - Intake classified the task as H3.
  - Test evidence ledger record:
    `evidence-6042a91d-8fdc-4247-9445-2b5c30eb16a5`.
  - Deploy evidence ledger record:
    `evidence-e204793c-3fe0-4899-b0e8-91279bcfa99c`.
- Production deploy:
  - Command:
    `cd /Users/hermes-dev/HermesMobileDev/app && npm run --silent deploy:macos -- --plugin finance --source /Users/hermes-dev/HermesMobileDev/plugins/finance --reason finance-stock-summary-contrast-20260612 --execute --json`.
  - Backup:
    `/Users/hermes-host/HermesMobile/backups/deploy/20260612T110853Z-plugin-finance-finance-stock-summary-contrast-20260612`.
  - Restarted launchd label: `com.hermesmobile.plugin.finance`.
  - Production smoke passed:
    `/finance.html` references `finance-replica-20260612l`,
    `/styles.css` contains `.finance-asset-hero` and `color: #ffffff`,
    `/service-worker.js` contains `finance-mcp-pwa-v136`, plugin manifest entry
    contains `finance-replica-20260612l`, and `/api/finance/overview` returned
    HTTP `200`.
  - Deploy validation returned `codexIssueCount: 0`; profile audit retained
    non-Codex issues outside this Finance deploy.
  - Current dev shell could not resolve SSH alias `homeai-macstudio-prod` and
    does not expose the live `gateway-pool-manifest-mac.json`; Gateway callable
    schema smoke was therefore not run from this shell. This change did not add
    or rename MCP callable names; existing Gateway calls to Owner asset summary
    route through the updated Finance service.
- Validation passed:
  - `node --check adapters/finance-owner-asset-service.js`
  - `node --check adapters/finance-repository.js`
  - `node --check mcp/finance-tool-contract.js`
  - `node --check public/app-finance-ui.js`
  - `node --check adapters/finance-market-quote-provider.js`
  - `node --check adapters/finance-owner-stock-service.js`
  - `node --check server-routes/finance-api-routes.js`
  - `node --test tests/finance-owner-asset-service.test.js tests/finance-server.test.js tests/app-finance-ui.test.js tests/finance-tool-contract.test.js`
  - `npm test`
  - `npm run check`
  - `git diff --check`
  - platform checks in `/Users/hermes-dev/HermesMobileDev/app`:
    `node tests/hermes-plugin-service.test.js`,
    `node tests/hermes-plugin-authorization-service.test.js`,
    `node tests/plugin-capability-activation-service.test.js`,
    `node tests/plugin-workspace-platform-contract-check.test.js`.

## 2026-06-12 Entry Draft Empty-Restore Fix

- Status: committed, pushed to origin/public, and deployed to Mac production.
- Commit: `7e20c670fece` (`fix: ignore empty finance entry drafts`).
- Root cause:
  - The entry-draft content predicate treated initialized/default fields such as
    date, category, account, member, and `再记` as user content.
  - Opening the bookkeeping page and leaving with amount `0` or no amount could
    therefore persist a draft and make the next normal Finance plugin entry
    reopen the bookkeeping page instead of the ledger home.
  - In preserved iframe mode, an empty entry page could also remain as the
    active view without a reload.
- Fix:
  - A restorable draft now requires user-authored content: a non-zero amount,
    note, merchant, or tags.
  - Default date/category/account/member/currency, amount `0`, and `再记` alone
    do not restore a draft.
  - If a restored draft is exited/hidden without a new edit, the draft is
    cleared. Empty entry-page exits also reset the preserved plugin view to the
    ledger home.
- Static versions:
  - frontend `finance-replica-20260612h`;
  - service worker `finance-mcp-pwa-v132`.
- Production deploy:
  - Command:
    `cd /Users/hermes-dev/HermesMobileDev/app && npm run --silent deploy:macos -- --plugin finance --source /Users/hermes-dev/HermesMobileDev/plugins/finance --reason finance-entry-empty-draft-restore-20260612 --execute --json`
  - Backup:
    `/Users/hermes-host/HermesMobile/backups/deploy/20260612T091335Z-plugin-finance-finance-entry-empty-draft-restore-20260612`.
  - Restarted launchd label: `com.hermesmobile.plugin.finance`.
  - Health URL passed:
    `http://127.0.0.1:8791/api/v1/hermes/plugin/manifest`.
  - Production smoke passed:
    `/finance.html` contains `finance-replica-20260612h`,
    `/service-worker.js` contains `finance-mcp-pwa-v132`,
    plugin manifest entry contains `finance-replica-20260612h`, and
    `/api/finance/overview` returned HTTP `200`.
  - Deploy validation returned `codexIssueCount: 0`; profile audit retained
    non-Codex issues outside this Finance deploy.
- Validation passed:
  - `node --check public/app-finance-ui.js`
  - `node --check tests/app-finance-ui.test.js`
  - `node --test tests/app-finance-ui.test.js tests/finance-hermes-embedded-plugin-service.test.js`
  - `npm run check`
  - `npm test`
  - `git diff --check`

## 2026-06-12 Owner Asset Total Cards FX Display Fix

- Status: committed, pushed to origin/public, and deployed to Mac production.
- Commit: `364fe2468366` (`fix: align owner asset total cards`).
- Problem:
  - The asset page still rendered the historical workbook
    `fx_usd_cny_rate` under the RMB total card, which made the visible rate
    look stale after live FX refresh.
  - RMB total assets were shown as a hero card while USD total assets were a
    smaller metric card.
- Fix:
  - RMB total assets and current-FX USD total assets now render as same-level
    summary cards.
  - The asset page current FX label uses `current_usd_cny_rate` /
    `current_fx_error`; historical workbook `fx_usd_cny_rate` is no longer
    displayed as the current rate in the total-assets area.
- Static versions:
  - frontend `finance-replica-20260612i`;
  - service worker `finance-mcp-pwa-v133`.
- Production deploy:
  - Command:
    `cd /Users/hermes-dev/HermesMobileDev/app && npm run --silent deploy:macos -- --plugin finance --source /Users/hermes-dev/HermesMobileDev/plugins/finance --reason finance-owner-asset-total-cards-20260612 --execute --json`
  - Backup:
    `/Users/hermes-host/HermesMobile/backups/deploy/20260612T092520Z-plugin-finance-finance-owner-asset-total-cards-20260612`.
  - Restarted launchd label: `com.hermesmobile.plugin.finance`.
  - Health URL passed:
    `http://127.0.0.1:8791/api/v1/hermes/plugin/manifest`.
  - Production smoke passed:
    `/finance.html` contains `finance-replica-20260612i`,
    `/app-finance-ui.js` contains `finance-asset-total-tabs` and
    `current_usd_cny_rate`, `/service-worker.js` contains
    `finance-mcp-pwa-v133`, plugin manifest entry contains
    `finance-replica-20260612i`, and `/api/finance/overview` returned HTTP
    `200`.
  - Deploy validation returned `codexIssueCount: 0`; profile audit retained
    non-Codex issues outside this Finance deploy.
- Validation passed:
  - `node --check public/app-finance-ui.js`
  - `node --check tests/app-finance-ui.test.js`
  - `node --test tests/app-finance-ui.test.js tests/finance-hermes-embedded-plugin-service.test.js`
  - `npm run check`
  - `npm test`
  - `git diff --check`

## 2026-06-12 Owner Asset Total Cards Stacked Layout

- Status: committed, pushed to origin/public, and deployed to Mac production.
- Commit: `ba40e0ff8123` (`fix: stack owner asset total cards`).
- Problem:
  - RMB and USD total assets were same-level cards but rendered as two columns.
    Long total amounts wrapped heavily inside half-width cards.
- Fix:
  - Keep RMB and USD total assets as same-level cards, but stack them in a
    single column on the mobile-first asset page.
- Static versions:
  - frontend `finance-replica-20260612j`;
  - service worker `finance-mcp-pwa-v134`.
- Production deploy:
  - Command:
    `cd /Users/hermes-dev/HermesMobileDev/app && npm run --silent deploy:macos -- --plugin finance --source /Users/hermes-dev/HermesMobileDev/plugins/finance --reason finance-owner-asset-total-cards-stacked-20260612 --execute --json`
  - Backup:
    `/Users/hermes-host/HermesMobile/backups/deploy/20260612T094532Z-plugin-finance-finance-owner-asset-total-cards-stacked-20260612`.
  - Restarted launchd label: `com.hermesmobile.plugin.finance`.
  - Health URL passed:
    `http://127.0.0.1:8791/api/v1/hermes/plugin/manifest`.
  - Production smoke passed:
    `/finance.html` contains `finance-replica-20260612j`,
    `/styles.css` contains single-column total-card grid,
    `/service-worker.js` contains `finance-mcp-pwa-v134`, plugin manifest entry
    contains `finance-replica-20260612j`, and `/api/finance/overview` returned
    HTTP `200`.
  - Deploy validation returned `codexIssueCount: 0`; profile audit retained
    non-Codex issues outside this Finance deploy.
- Validation passed:
  - `node --check public/app-finance-ui.js`
  - `node --check tests/app-finance-ui.test.js`
  - `node --test tests/app-finance-ui.test.js tests/finance-hermes-embedded-plugin-service.test.js`
  - `npm run check`
  - `npm test`
  - `git diff --check`

## Preserved Recent Handoff Tail

## 2026-06-02 Floating Bottom Navigation

- Finance bottom root navigation was changed from a flush-bottom fixed bar to a
  floating capsule tab bar. It keeps the five root views (`账本`, `计划`, `记账`,
  `报表`, `我的`) but renders each as a compact pill inside a rounded floating
  container.
- In `?embed=hermes` mode, `body.finance-embed` raises the bottom navigation
  above Hermes Mobile host bottom chrome and increases page bottom padding so
  the host input/tab UI does not cover Finance navigation or list content.
- Static frontend assets are `finance-replica-20260602e`; service worker cache
  is `finance-mcp-pwa-v55`.
- Harness expectations were updated in `tests/app-finance-ui.test.js`,
  `docs/TEST_MATRIX.md`, and
  `docs/IMPLEMENTATION_NOTES/harness-required-matrix.md` to require the floating
  embedded bottom-nav contract.
- Follow-up phone verification showed the first embedded style still read as a
  raised dark bottom bar. The embedded-only navigation style was revised again
  to `finance-replica-20260602f` / `finance-mcp-pwa-v56`: it uses a light
  rounded floating tag container, text-only pill tabs, a muted active tag, and a
  larger bottom offset above Hermes Mobile host chrome.
- Plugin-cache follow-up: Hermes plugin iframe lifecycle can preserve the old
  `/finance.html?embed=hermes` shell even after static resources change. Finance
  manifest and one-time launch redirect now use
  `/finance.html?embed=hermes&v=finance-replica-20260602f` so a frontend
  deployment changes the iframe URL without exposing any workspace key, launch
  token, cookie, or user key.
- Follow-up plugin screenshot showed the `finance-replica-20260602f` embedded
  bottom nav was positioned too high in the plugin iframe and its tab row could
  be horizontally dragged past the rounded container. The embedded layout was
  revised to `finance-replica-20260602g` / `finance-mcp-pwa-v57`: bottom offset
  is reduced to sit nearer the iframe bottom above Hermes host chrome, the tab
  row is a five-column grid, horizontal overflow is hidden, and the versioned
  manifest/launch entry now points to `finance-replica-20260602g`.
- Follow-up Wardrobe reference screenshot showed the desired plugin shape is a
  bottom fixed dock, not a capsule floating over the content. The embedded
  layout was revised again to `finance-replica-20260602h` /
  `finance-mcp-pwa-v58`: `body.finance-embed::after` renders a fixed bottom
  dock, the Finance page content reserves bottom padding above it, and the five
  root tabs stay in a non-scrolling capsule inside the dock. The versioned
  manifest/launch entry now points to `finance-replica-20260602h`.
- Follow-up phone screenshot showed `finance-replica-20260602h` still made the
  embedded dock too tall because it added `env(safe-area-inset-bottom)` inside
  the plugin iframe while Hermes Mobile already owns the host safe area. The
  embedded dock was revised to `finance-replica-20260603b` /
  `finance-mcp-pwa-v60`: fixed 122px dock height, fixed 34px nav bottom offset,
  fixed 132px content bottom padding, no embedded safe-area bottom addition, and
  an opaque dock background so transaction rows do not show through the dock.
- Follow-up feedback said the dock was still too tall, the capsule was too wide,
  and dark/light modes were not distinguished. The embedded dock was revised to
  `finance-replica-20260603c` / `finance-mcp-pwa-v61`: fixed 82px dock height,
  8px nav bottom offset, 92px content bottom padding, narrower capsule width
  `calc(100vw - 52px)`, 46px capsule height, 36px buttons, and theme-aware
  dock colors for host-provided `dark` and `light` themes only.
- Hermes plugin launch appearance now accepts only host-resolved `dark` and
  `light` theme tokens. `system` / `auto` are ignored for plugin launch; the
  standalone Finance UI may still keep its local `system` preference.

## 2026-06-03 NAS Deployment for Compact Plugin Dock

- User explicitly requested NAS deployment and then commit/push after the
  compact plugin dock update.
- Deployed local commit `bbe43cd` to NAS source path
  `\\192.168.10.99\docker\finance-mcp\source` using a clean `git archive HEAD`
  release directory. Runtime data, `.git`, `.codegraph`, `data`, and
  `node_modules` were not copied.
- Pre-deploy NAS source backup:
  `\\192.168.10.99\docker\finance-mcp\backups\source-20260603-003231-before-bbe43cd`.
- Ran `npm run restart:nas:hot` after deployment. Result:
  `syntax_check=ok`, `gateway_wrapper_restart=terminating count=1`,
  `gateway_wrapper_restart=ok`, `container_restart=unavailable_permission_denied`,
  and `client_version_http=200`.
- NAS source verification confirmed `public/finance.html` contains
  `finance-replica-20260603c`, `public/service-worker.js` contains
  `finance-mcp-pwa-v61`, and the embedded plugin service source contains
  `EMBEDDED_APP_VERSION = "finance-replica-20260603c"`.
- NAS runtime HTTP verification confirmed `/finance.html` serves
  `finance-replica-20260603c`. The current SSH account still cannot access the
  Docker socket without elevated credentials; do not record or request NAS
  secrets in docs or handoff.

## 2026-06-03 NAS Transaction Pagination Fallback

- User reported that the NAS ledger plugin still did not append rows after
  re-login. Investigation showed re-login cannot reload the Finance HTTP Node
  process: NAS runtime static files were updated, but `/api/finance/transactions`
  still ignored `offset`, so `limit=30&offset=30` returned duplicate first-page
  rows.
- Finance source already supports `LIMIT ? OFFSET ?`; the issue is stale NAS
  backend runtime while Docker restart remains unavailable to the current SSH
  account.
- The home/all transaction list now uses `30` as the page size. It first calls
  the normal `/api/finance/transactions?limit=30&offset=<n>` path; when the
  returned page contains no unseen rows, it falls back to a bounded larger
  first-window request and appends only unseen rows. This lets updated static JS
  recover pagination on NAS until the container is restarted.
- Static frontend assets are `finance-replica-20260603d`; service worker cache
  is `finance-mcp-pwa-v62`. Embedded plugin entry URLs also carry
  `finance-replica-20260603d` so Hermes iframe/cache lifecycle should load the
  new JS path.
- Deployed commit `24a235d` to NAS source with backup
  `\\192.168.10.99\docker\finance-mcp\backups\source-20260603-074642-before-24a235d`.
- The NAS account was authorized by the user to use the local desktop NAS
  credential file once. The credential was not printed, written to the repo, or
  persisted in docs. It was used to install a root-owned helper
  `/usr/local/bin/finance-mcp-restart-container` and a minimal sudoers rule that
  allows the SSH user to run only that fixed Finance container restart helper
  plus `docker ps` without storing a reusable secret.
- `scripts/nas-finance-hot-restart.ps1` now detects that helper as
  `container_restart=ok method=sudo_helper` when direct Docker or `sudo -n
  docker restart` is unavailable.
- NAS container restart succeeded through the helper. Runtime smoke returned:
  first page `limit=30&offset=0` count 30, second page `limit=30&offset=30`
  count 30, second page first row differs from first page, and the 60-row window
  row 31 matches the second-page first row. The smoke logged only counts and
  bounded identity comparison booleans, not transaction bodies.

## 2026-06-03 Embedded Dock Theme/Height Tuning

- User screenshot showed the embedded bottom dock still occupying too much
  vertical space and rendering as a black area in a light host context.
- Embedded `?embed=hermes` dock was compressed again: iframe-local dock height
  is now 64px, content bottom padding 74px, capsule width `calc(100vw - 72px)`,
  bottom offset 6px, capsule min-height 38px, and tab button min-height 30px.
- The embedded dock background now defaults to theme variables, has an explicit
  dark rule, and has an explicit light rule using the light page background so
  host-provided `dark` / `light` appearance changes the bottom dock area as well
  as the capsule/buttons.
- Static frontend assets are `finance-replica-20260603e`; service worker cache
  is `finance-mcp-pwa-v63`; embedded plugin entry URLs carry
  `finance-replica-20260603e`.

## 2026-06-03 Embedded Bottom Tab State

- User asked to follow the Wardrobe project's bottom tab implementation for the
  Finance embedded plugin bottom labels, especially `dark` / `light` theme
  separation and the active button's filled outline state.
- Finance now uses Wardrobe-style theme tokens for embedded bottom tabs:
  `--bottom-tabs-*` for dock/capsule surfaces and `--bottom-tab-*` for normal
  and active tab fills, ink, borders, and inset outline.
- The embedded dock dimensions remain unchanged from the compact tuned version:
  iframe-local dock height 64px, content bottom padding 74px, capsule width
  `calc(100vw - 72px)`, bottom offset 6px, capsule min-height 38px, and tab
  button min-height 30px.
- Static frontend assets are `finance-replica-20260603f`; service worker cache
  is `finance-mcp-pwa-v64`; embedded plugin entry URLs carry
  `finance-replica-20260603f`.
- Default rule remains unchanged: this is a local workspace update only. Do not
  sync or restart NAS unless the user explicitly requests NAS deployment in the
  current thread.

## 2026-06-03 Embedded Bottom Tab Outer Frame Removal

- Follow-up screenshot showed the Finance embedded bottom nav still had a
  visible outer capsule/frame behind the individual buttons.
- The embedded `.finance-bottom-nav` is now layout-only in plugin mode:
  transparent background, transparent border, no outer radius, and no shadow.
- Each root tab button remains individually opaque and outlined, with active
  state using the Wardrobe-style filled state and inset outline.
- Static frontend assets are `finance-replica-20260603g`; service worker cache
  is `finance-mcp-pwa-v65`; embedded plugin entry URLs carry
  `finance-replica-20260603g`.
- Local-only rule remains unchanged; NAS was not updated.

## 2026-06-05 Bookkeeping Note Completion and Copied Amount Fix

- User reported that after entering other fields and then focusing the note input, the bottom completion area disappeared and the entry could not be completed from that screen.
- User also reported that copying a bill with an existing amount and then typing a new amount appended to the copied amount instead of starting from zero.
- Local UI fix:
  - ADB device `e0cd9d2b` was used to launch Wacai `com.wacai365` v13.0.13 after following the archived full handoff pointer and enabling the package.
  - Wacai note-focus evidence showed: category area compresses, full-width note row and meta chips move upward, and the original custom numeric keypad plus bottom-right save key remain visible. Test text `testnote` was entered only as a bounded UI probe.
  - Finance note-focus mode follows that shape when no native Web/PWA keyboard is visible.
  - Follow-up iOS/PWA screenshots showed `visualViewport` timing was not reliable enough: the custom numeric keypad could still stack above the native keyboard, and a later attempt pushed the custom keypad into the top half of the screen.
  - User clarified the intended simple rule: on note focus, cancel Finance's amount keyboard and do not keep its reserved area; the note input should stick to the bottom edge or directly above the native keyboard.
  - Finance initially used a deterministic Web/PWA note-focus rule that hid the custom numeric keypad and meta/chip row and positioned the note row by `--finance-keyboard-bottom`; this was later superseded by the 2026-06-05 v95 visual-bottom correction after real iPhone evidence showed the raw keyboard height can be over-reported.
  - Follow-up repeated-focus bugfix: note blur resets `--finance-keyboard-bottom` to `0px` and clears native-keyboard state, so reopening the note input cannot reuse stale keyboard height or recreate the blank keypad reservation. Later v95 layout uses `--finance-visual-bottom` rather than keyboard-bottom for the actual note-row position.
  - Copy mode tracks the copied amount as pristine. The first numeric keypad input replaces the copied amount from an empty value; backspace clears the copied amount; operator input preserves normal calculator behavior against the displayed amount.
- Static frontend assets are `finance-replica-20260605j`; service worker cache is `finance-mcp-pwa-v90`.
- Validation planned/completed in this work item:
  - `node --check public\app-finance-ui.js`
  - `node tests\app-finance-ui.test.js`
  - `npm run check`
  - `git diff --check`
- Local-only rule remains unchanged; NAS was not updated.

## 2026-06-05 Bookkeeping Amount Keyboard UI Fix

- User reported from an uploaded iPhone screenshot that tapping the bookkeeping amount caused the native system keyboard to appear, while Finance also showed its custom Wacai-style keypad; the amount display became effectively unusable.
- Fix:
  - `public/finance.html` now marks the amount field `readonly` with `inputmode="none"` so it remains a submitted form field but does not summon the native keyboard.
  - `public/app-finance-ui.js` prevents amount-field pointer/touch/focus from entering native keyboard focus mode and continues to write amounts through the custom keypad.
  - `public/styles.css` hides the caret and keeps the amount display stable/visible.
  - Static frontend version bumped to `finance-replica-20260605a`; service worker cache bumped to `finance-mcp-pwa-v81`.
- Docs updated:
  - `docs/MODULES/finance-mcp.md`
  - `docs/TEST_MATRIX.md`
- Validation:
  - `node --check public\app-finance-ui.js`
  - `node tests\app-finance-ui.test.js`
  - `npm run check`
- Local-only rule remains unchanged; NAS was not updated.

## 2026-06-05 Bookkeeping Copy and Meta Choice UI Fix

- User reported four entry usability defects:
  - copied bills reused the source transaction time instead of defaulting to the current time;
  - the visible `标签` control did not open any tag selector, and member/tag controls should behave like Wacai-style selectable chips;
  - focusing note text pushed/placed the typed content too high and nearly out of view;
  - the custom amount calculator/amount display could still enter page text-selection/callout behavior.
- Fix:
  - `copy` now pre-fills amount/account/category/member/merchant/note/tags but sets `occurred_at` to the current local date/time; `edit` still preserves source `occurred_at`.
  - `/api/finance/overview` returns tag master data and transaction list projection includes bounded tag names for edit/copy prefill.
  - The entry member and tag buttons open a shared Wacai-style choice sheet; member writes back to the hidden `member_hint` select, tags submit as a `tags` array.
  - Note focus gets a narrow layout state that hides the custom keypad/meta row only while the note field is focused, keeping the note input visible above the native keyboard without hiding merchant/member controls during other input focus.
  - Amount display and keypad now disable text selection and long-press callouts.
  - Static frontend version bumped to `finance-replica-20260605b`; service worker cache bumped to `finance-mcp-pwa-v82`.
- Docs updated:
  - `docs/finance-mcp-requirements-design.md`
  - `docs/MODULES/finance-mcp.md`
  - `docs/TEST_MATRIX.md`
- Validation:
  - `node --check public\app-finance-ui.js`
  - `node --check adapters\finance-transaction-service.js`
  - `node --check adapters\finance-repository.js`
  - `node --check server-routes\finance-api-routes.js`
  - `node tests\app-finance-ui.test.js`
  - `$env:NODE_NO_WARNINGS='1'; node tests\finance-server.test.js`
  - `node tests\finance-transaction-service.test.js`
- Local-only rule remains unchanged; NAS was not updated.

## 2026-06-05 Bookkeeping Meta Strip and Note Focus Layout Fix

- User reported that the date/account/member/tag/attachment meta strip could drag vertically, the visible merchant field should be removed, long member labels such as `家庭公用` pushed the tag chip onto a second row, and note focus still placed the note input badly while reducing visible quick-category rows.
- Fix:
  - Removed the visible merchant input from the current bookkeeping page.
  - The meta strip is now a fixed-height, no-wrap horizontal scroller with `touch-action: pan-x`, hidden vertical overflow, and tighter member/tag chip widths.
  - Note focus initially used `visualViewport` to set `--finance-keyboard-bottom`; the v95 correction now records `--finance-visual-bottom` and uses that for the note-row position, while the custom keypad/meta row is hidden and the quick-category grid keeps about three rows visible.
  - Static frontend version bumped to `finance-replica-20260605c`; service worker cache bumped to `finance-mcp-pwa-v83`.
- Docs updated:
  - `docs/finance-mcp-requirements-design.md`
  - `docs/MODULES/finance-mcp.md`
  - `docs/TEST_MATRIX.md`
- Validation:
  - `node --check public\app-finance-ui.js`
  - `node tests\app-finance-ui.test.js`
- Local-only rule remains unchanged; NAS was not updated.

## 2026-06-05 Bridge-Scope Test Isolation Follow-up

- Resolved the two residual `tests/finance-server.test.js` bridge-scope failures from the recurring auto-post rollout.
- Root cause: the test process inherited local `FINANCE_MCP_TRUSTED_GATEWAY_*` environment variables, so trusted gateway helper and route assertions depended on the developer machine's current LAN/WSL configuration.
- Fix: `tests/finance-server.test.js` now clears and restores trusted-gateway environment variables around the bridge-scope tests, so the tests assert only their explicit fixture configuration.
- Product/API behavior is unchanged; this is test isolation only.
- Validation:
  - `node --check tests\finance-server.test.js`
  - `$env:NODE_NO_WARNINGS='1'; node tests\finance-server.test.js`
  - `npm run check`
- Local-only rule remains unchanged; NAS was not updated.

## 2026-06-03 Embedded Bottom Tabs Match Wardrobe Code

- User clarified to follow the Wardrobe project code exactly rather than using
  a Finance-specific interpretation of the button area.
- Finance embedded bottom tabs now mirror the Wardrobe `web/styles.css`
  structure: centered backing via `body.finance-embed::after`, compact capsule
  using `--bottom-tabs-*`, and individual tab buttons using `--bottom-tab-*`.
- The active button uses the Wardrobe filled state with theme-specific active
  ink, active border, and inset outline. The transition no longer applies the
  extra Finance-specific upward shift.
- Static frontend assets are `finance-replica-20260603h`; service worker cache
  is `finance-mcp-pwa-v66`; embedded plugin entry URLs carry
  `finance-replica-20260603h`.
- Local-only rule remains unchanged; NAS was not updated.

## 2026-06-03 Embedded Bottom Tabs Avoid Entry Controls

- Follow-up screenshot showed a fully Wardrobe-floating backing can remain on
  Finance working pages such as bookkeeping entry, where Finance hides the
  bottom navigation and uses fixed note/meta/keypad controls near the bottom.
- Finance keeps the Wardrobe visual token/state model for embedded bottom tabs,
  but no longer treats it as a pure overlay for every route. Pages that show the
  root tabs reserve bottom space above the tab area; pages that hide the tabs,
  including `entry` and detail/report detail routes, also hide the embedded
  backing so it cannot cover fixed controls.
- Static frontend assets are `finance-replica-20260603i`; service worker cache
  is `finance-mcp-pwa-v67`; embedded plugin entry URLs carry
  `finance-replica-20260603i`.
- Local-only rule remains unchanged; NAS was not updated.

## 2026-06-03 Bookkeeping Entry Category Picker

- User clarified the Wacai behavior: tapping the large current-category button
  on the left side of the amount card opens a full category selection panel.
  The visible quick categories are only shortcuts and are not the complete list
  of registrable categories.
- Finance entry page now treats the bookkeeping surface as a fixed-screen
  workflow: the page itself and shell do not vertically drag; only the middle
  quick-category grid scrolls when category shortcuts exceed the visible area.
- The current-category icon/name area opens a Wacai-like category picker overlay
  backed by the scoped current-type category list. Picking a category writes
  back to the existing hidden `category_hint` select used by transaction submit.
  The amount input remains separate and does not open the picker.
- Static frontend assets are `finance-replica-20260603j`; service worker cache
  is `finance-mcp-pwa-v68`; embedded plugin entry URLs carry
  `finance-replica-20260603j`.
- Local-only rule remains unchanged; NAS was not updated.

## 2026-06-03 Bookkeeping Category Picker Hierarchy/Search

- User compared Wacai category selection screenshots and clarified that the full
  category picker should not flatten every child category. It should show
  top-level categories first, allow child category lists to stay collapsed, and
  let the user expand a parent to choose a child.
- Finance category picker now renders top-level category rows by default. Parent
  rows with children expand/collapse their child grid; parent rows without
  children are directly selectable. The current selected parent is expanded when
  the picker opens.
- Added a search field at the top of the picker. Search bypasses the collapsed
  tree view and lists matching categories directly so users can quickly locate
  any registrable category.
- Static frontend assets are `finance-replica-20260603k`; service worker cache
  is `finance-mcp-pwa-v69`; embedded plugin entry URLs carry
  `finance-replica-20260603k`.
- Local-only rule remains unchanged; NAS was not updated.

## 2026-06-03 Bill Search Copy Workflow

- User described the Wacai bill-search workflow: search for an existing bill,
  left-swipe the matching row, tap copy, then edit the prefilled bookkeeping
  form, usually changing only the amount.
- Added bounded text search to `repository.listTransactions()` /
  `finance.list_transactions` / `/api/finance/transactions?search=<text>`.
  Search remains scoped to the resolved ledger and matches note/source/ref,
  amount text, category/parent category, account/target account, member, and
  merchant names.
- The all-bills page now has a search field and status line. Search results
  render with the same transaction row DOM and left-swipe action injection as
  normal bill rows, so `copy` reuses `openEntryFromTransaction(row, "copy")`
  and opens the existing bookkeeping form prefilled from the selected bill.
- Static frontend assets are `finance-replica-20260603l`; service worker cache
  is `finance-mcp-pwa-v70`; embedded plugin entry URLs carry
  `finance-replica-20260603l`.
- Local-only rule remains unchanged; NAS was not updated.

## 2026-06-03 Bill Search Runtime and Picker Icon Fix

- Follow-up local smoke showed `/api/finance/transactions?search=<unlikely>`
  still returned the latest 100 rows because the local Finance HTTP Node process
  had not been restarted after adding backend search filtering. Static assets
  update from disk, but backend JS requires a local service restart.
- Restarted the local Finance service on port 8791. Post-restart smoke:
  `search=__unlikely_search_smoke__` returned 0 rows, while real terms such as
  dinner categories can still return up to the bounded `limit=100` when enough
  matching bills exist.
- The full category picker icons were reduced inside picker rows so icon circles
  no longer cover category text: parent row icons are 32px, child item icons are
  30px, and their inner SVG glyphs are smaller.
- Static frontend assets are `finance-replica-20260603m`; service worker cache
  is `finance-mcp-pwa-v71`; embedded plugin entry URLs carry
  `finance-replica-20260603m`.
- Local-only rule remains unchanged; NAS was not updated.

## 2026-06-03 Bill Search Topbar and Keyboard Focus

- Follow-up embedded screenshot showed the bill-search shortcut must remain in
  the top-right icon slot, while the ledger switch must stay centered. The
  root top-left control is now an invisible disabled spacer instead of a
  collapsed element, so it no longer shows a meaningless settings icon and no
  longer shifts the ledger dropdown.
- The top-right root icon opens the all-bills search page and focuses the bill
  search field. Search still uses the bounded scoped
  `/api/finance/transactions?search=<text>` path and keeps the same row
  left-swipe copy/edit/delete actions.
- When any input/search field is focused, Finance hides the bottom floating
  navigation and embedded backing, and also compresses shell bottom padding so
  the keyboard does not leave a large empty reserved area above the result
  list.
- Static frontend assets are `finance-replica-20260603o`; service worker cache
  is `finance-mcp-pwa-v73`; embedded plugin entry URLs carry
  `finance-replica-20260603o`.
- Local-only rule remains unchanged; NAS was not updated.

## 2026-06-04 Recurring Bookkeeping Local Work

- User asked to support Wacai recurring bookkeeping and noted that Wacai can also create recurring rules from the date selector while adding a bill.
- Research evidence:
  - Wacai public help documents recurring rules for repeated income, expense, transfer, and loan-like bills, with daily/weekly/monthly/yearly recurrence, start/end dates, pause/resume, deletion, and generated-bill independence from the rule.
  - Wacai public web page confirms a browser version exists for account data management and Excel export, but public pages do not expose recurring-rule management details.
  - Local Android Wacai package `com.wacai365` version `13.0.13` initially had a broken launcher resolver. Reinstalling the current `base.apk` with `adb install -r` repaired launcher resolution without uninstalling app data.
  - After relaunch, the Wacai home service grid exposed a `周期账` entry. Opening it reached the login page. A later prompt showed push notification text including recurring-entry reminders. No login credentials were stored or used by automation.
- Finance implementation direction:
  - Add `finance_recurring_rules` as a dedicated rule table rather than overloading `finance_plans`.
  - Add `adapters/finance-recurring-service.js` as the service owner.
  - Generate due transactions through `transactionService.createTransaction()` with `source="recurring"` and deterministic idempotency keys.
  - Expose recurring rule management through HTTP, MCP, and the local plan UI.
  - Open the bookkeeping date field as a Wacai-style full date panel with normal `保存` and `保存为周期账` paths.
  - When `保存为周期账` is selected, show a Wacai-style active-entry recurring overlay with a `周期账` badge, a `关闭` control, visible save/error status, an explicit `永续` end mode, and fields ordered as type, cycle, interval, start, end, and time.
- Static frontend assets are `finance-replica-20260604c`; service worker cache is `finance-mcp-pwa-v76`; embedded plugin entry URLs carry `finance-replica-20260604c`.
- Local-only rule remains unchanged; NAS was not updated.
- Documentation policy note from user: future durable docs should use English except user-facing content and UI copy. Existing historical Chinese docs were not fully rewritten in this work item.

## 2026-06-04 Wacai 2026 Import Operation

- User uploaded a Wacai export zip and asked to import it into the local database.
- Archive contained one XLSX file exported from the Wacai daily ledger.
- A local SQLite backup was created before import: `data\finance.sqlite3.before-wacai-20260604-20260604211813.bak`.
- Parsed source summary, without recording raw rows:
  - row count: 357
  - date range: 2026-01-01 through 2026-11-25
  - buckets: CNY expense 290, HKD expense 57, USD expense 6, CNY income 4
- Amounts in this export were already normal-scale values, so the import used default `FINANCE_WACAI_AMOUNT_MULTIPLIER=1`, not the old 2025 multiplier.
- Import result:
  - batch id: `import_02db2c628ac2d322`
  - ledger: `daily`
  - imported: 357
  - skipped: 0
  - errors: 0
- Post-import aggregate state:
  - active transactions: 9093
  - active Wacai transactions: 9090
  - import batches: 2
- Validation after import:
  - `node tests\finance-wacai-import-service.test.js`
  - `node tests\finance-transaction-service.test.js`
- Local-only rule remains unchanged; NAS was not updated.

## 2026-06-04 Wacai Recurring Rules Import Operation

- User manually logged in to the Wacai Android app after launcher repair; automation did not store or use credentials.
- Wacai package `com.wacai365` again required a preserving-data reinstall with the current `base.apk` before launcher resolution worked.
- Captured Wacai recurring-rule detail screens one by one from `周期账管理`; source summary, without recording raw rule descriptions:
  - captured rules: 38
  - unique rules: 38
  - missing key fields: 0
  - frequency buckets: monthly 26, every 2 months 1, every 3 months 2, every 6 months 1, yearly 8
  - account buckets: CNY/cash 28, HKD 8, USD 2
  - end modes: forever 37, fixed date 1
- A local SQLite backup was created before recurring-rule import: `data\finance.sqlite3.before-wacai-recurring-20260604-20260604213757.bak`.
- Created 38 active Finance recurring rules with deterministic `recurring_wacai_` ids in ledger `daily`.
- Set each imported rule's `next_due_at` from Wacai `下次入账` so the local system does not replay historical start dates.
- Post-import aggregate state:
  - active recurring rules: 38
  - Wacai recurring rules: 38
  - generated recurring transactions: 0
  - end modes: forever 37, fixed date 1
  - next due range: 2026-06-06 23:46 UTC through 2027-03-30 06:34 UTC
- Validation after recurring import:
  - `node tests\finance-recurring-service.test.js`
  - `node tests\finance-mcp-server.test.js`
- A later `node tests\finance-server.test.js` run still had two bridge-scope expectation failures unrelated to the recurring import; keep them as residual server-test follow-up until rechecked.
- Local-only rule remains unchanged; NAS was not updated.

## 2026-06-04 Wacai Home Service Grid Local Work

- User asked to adjust Finance's home/bill page closer to Wacai and noted that the bill page lacked a recurring bookkeeping button.
- Wacai Android home observation showed a five-entry service row in this order: quick entry, details, calendar, recurring bookkeeping, and all services.
- Finance home now exposes the same five-entry icon service row:
  - quick entry opens expense bookkeeping
  - details opens all bills
  - calendar opens reports
  - recurring bookkeeping opens the recurring-rule management page
  - all services opens settings/services
- The all-bills page now has a compact shortcut row with quick entry, calendar, and recurring bookkeeping.
- Static frontend assets are `finance-replica-20260604d`; service worker cache is `finance-mcp-pwa-v77`; embedded plugin entry URLs carry `finance-replica-20260604d`.
- Validation:
  - `node --check public\app-finance-ui.js`
  - `node tests\app-finance-ui.test.js`
- Local-only rule remains unchanged; NAS was not updated.
## 2026-06-04 Wacai Amount Scale Repair and Year Summary Local Work

- User corrected the amount scale for both the imported 2026 Wacai batch and imported Wacai recurring rules: they must be multiplied by 100.
- Created local SQLite backup before repair: `data\finance.sqlite3.before-wacai-scale-repair-20260604-20260604215909.bak`.
- Restored that backup once after an initial service-layer repair attempt hit zero-amount transactions, then reran the repair deterministically.
- Repaired data scope:
  - Wacai import batch: `import_02db2c628ac2d322`
  - target transactions: 357
  - updated non-zero transactions: 355
  - zero-amount transactions left unchanged: 2
  - Wacai recurring rules updated: 38
- The transaction repair used `transactionService.updateTransaction()`, so account balances and per-transaction audit entries were updated through the existing service path.
- The recurring-rule repair used `recurringService.updateRecurringRule()`, so recurring-rule audit entries were recorded through the existing service path.
- Import batch metadata now records `amountMultiplier=100` and bounded scale-repair metadata.
- Finance overview now returns `yearSummary`, and the home card uses current-year expense/income/net to match Wacai's home emphasis.
- Static frontend assets are `finance-replica-20260604e`; service worker cache is `finance-mcp-pwa-v78`; embedded plugin entry URLs carry `finance-replica-20260604e`.
- Local-only rule remains unchanged; NAS was not updated.

## 2026-06-04 Home Search Button Reload Guard

- Fixed a home top-right search-button regression where opening bill search could be interrupted by the client-version poll and immediately return to the home page.
- Client-version changes now request a refresh but defer `window.location.reload()` while the UI is on a secondary/backable view or overlay. The pending reload is applied after the user returns to the root home view.
- The top-right button's static label now identifies the action as bill search before JavaScript finishes binding events.
- Static frontend assets are `finance-replica-20260604f`; service worker cache is `finance-mcp-pwa-v79`; embedded plugin entry URLs carry `finance-replica-20260604f`.
- Local-only rule remains unchanged; NAS was not updated.

## 2026-06-04 Homepage and Report Currency Switch Local Work

- User rejected automatic FX conversion and asked for direct currency switching instead.
- The standalone UI now has one current currency state for the home summary and report views.
- The home summary sends the selected currency to `/api/finance/overview`, so yearly income, expense, net, and recent home transactions follow the visible currency.
- The report page shows a current-currency button in the top filter row. The same currency is sent to report totals, breakdowns, trend drilldowns, and filtered bill-detail drilldowns.
- No FX conversion was added; CNY, HKD, USD, and other supported currencies remain separate original-currency ledgers for reporting.
- Static frontend assets are `finance-replica-20260604g`; service worker cache is `finance-mcp-pwa-v80`; embedded plugin entry URLs carry `finance-replica-20260604g`.
- Local-only rule remains unchanged; NAS was not updated.

## 2026-06-04 Recurring Next-Due Repair and Runtime Confirmation

- User asked whether the imported recurring rules are only stored or whether the due-generation mechanism is active.
- Current mechanism:
  - `adapters/finance-recurring-service.js` owns recurring rule creation, update, due generation, idempotency, and generated-transaction writes.
  - HTTP, MCP, and UI entrypoints call that service; they do not implement recurring business logic themselves.
  - There is no background scheduler in the current local runtime. Due generation is explicit through the UI action, HTTP endpoint, or MCP `finance.generate_due_recurring_transactions`.
- A local SQLite backup was created before repairing imported Wacai rule schedules: `data\finance.sqlite3.before-recurring-next-due-repair-20260604-20260604-234624.bak`.
- Finding: the Wacai recurring amount scale repair had used the service update path correctly for audit, but non-schedule updates recalculated `next_due_at` from historical `start_at`. This made all 38 active Wacai recurring rules appear due if generation were triggered.
- Repair:
  - Restored all 38 Wacai recurring rules' current `next_due_at` values from the pre-scale-repair recurring-rule audit `before_json`.
  - Wrote 38 bounded audit rows with action `recurring_rule.repair_next_due` and actor `recurring-next-due-repair-20260604`.
  - Updated recurring rule input normalization so non-schedule updates preserve `next_due_at` unless an explicit `next_due_at` is provided.
  - Updated schedule edits so a changed start date derives day/month from the new start date when explicit day/month fields are absent.
- Current local database state after repair:
  - active recurring rules: 38
  - due as of 2026-06-04T15:52:20Z: 0
  - generated recurring transactions: 0
  - next due range by currency: HKD starts 2026-06-06T23:46:00Z; CNY starts 2026-06-08T07:21:00Z; USD starts 2026-06-15T04:16:00Z.
- Local service on port 8791 was restarted after the code fix: old PID 28876, new PID 136332.
- Live HTTP validation:
  - `GET /api/finance/recurring-rules?ledger_id=daily&status=active` returned 38 active rules grouped as CNY 28, HKD 8, USD 2.
  - `POST /api/finance/recurring-rules/generate-due` with the current UTC time returned `count=0` and generated no transactions.
- Validation:
  - `node --check adapters\finance-recurring-service.js`
  - `node tests\finance-recurring-service.test.js`
  - `node tests\finance-mcp-server.test.js`
  - `npm run check`
  - `git diff --check` only reported existing CRLF normalization warnings for `docs/MODULES/finance-mcp.md` and `public/service-worker.js`.
- Local-only rule remains unchanged; NAS was not updated.

## 2026-06-04 Recurring Auto-Post Scheduler Local Work

- User rejected page-refresh-triggered recurring generation and required backend automatic posting. User also required restart catch-up so a stopped timer or downtime does not lose recurring entries.
- Added `adapters/finance-recurring-scheduler-service.js` as the service owner for automatic recurring posting.
- Added `repository.listLedgerIdsWithDueRecurringRules(throughAt)` so scheduler ticks query only ledgers that currently have due active recurring rules.
- Local HTTP runtime behavior:
  - `server.js` wires the scheduler only in the `require.main` startup path, after the HTTP server begins listening.
  - Scheduler is enabled by default and runs one immediate startup tick, then repeats every five minutes.
  - Page refresh is not the posting trigger.
  - Manual UI/API/MCP due generation remains available and shares the same idempotency keys.
- Restart catch-up behavior:
  - Each scheduler run calls the existing `recurringService.generateDueTransactions()` path.
  - For each due ledger, it repeatedly generates and rechecks due state until no `next_due_at <= now` rows remain.
  - This drains missed occurrences after downtime or a stopped timer. One generation call remains capped, but scheduler catch-up loops across calls.
- Runtime knobs:
  - `FINANCE_RECURRING_AUTO_POST=0` disables automatic posting.
  - `FINANCE_RECURRING_AUTO_POST_INTERVAL_MS` controls the timer interval; default is 300000.
  - `FINANCE_RECURRING_AUTO_POST_MAX_OCCURRENCES` caps one generation call per ledger; default is 100.
  - `FINANCE_RECURRING_AUTO_POST_CATCH_UP_PASSES` caps repeated catch-up calls per due ledger per tick; default is 1000.
- Tests added:
  - `tests/finance-recurring-scheduler-service.test.js` verifies multi-ledger auto-posting, idempotent rerun, downtime backlog draining, and rescheduling after a run error.
  - `tests/architecture-boundary.test.js` now includes recurring service and scheduler service focused-test guardrails.
- Validation:
  - `node --check adapters\finance-recurring-scheduler-service.js`
  - `node --check adapters\finance-recurring-service.js`
  - `node --check adapters\finance-repository.js`
  - `node --check server.js`
  - `node tests\finance-recurring-scheduler-service.test.js`
  - `node tests\finance-recurring-service.test.js`
  - `node tests\finance-mcp-server.test.js`
  - `npm run check`
  - `git diff --check` only reported existing CRLF normalization warnings for `docs/MODULES/finance-mcp.md` and `public/service-worker.js`.
  - `node tests\finance-server.test.js` still has the same two bridge-scope failures recorded earlier, unrelated to recurring auto-post: `finance MCP HTTP bridge is loopback scoped` and `Finance MCP bridge allows trusted WSL Gateway source only with workspace context`.
- Local-only rule remains unchanged; NAS was not updated.

## 2026-06-05 Mac Studio iOS Simulator Note Input Validation

- User stated the old NAS production environment is canceled and the new production direction is Mac Studio. During this run, Windows SSH config alias `homeai-macstudio-prod` reached `xuxindeMac-Studio.local` at `192.168.10.110`; direct SSH to the user-stated literal `192.168.10.100` timed out, so verify the current IP before IP-specific deployment steps.
- Mac Studio has Xcode/iOS Simulator available. The booted target used for validation was `HomeAI iPhone 17 Pro` UDID `C2EB6D31-F485-4DAE-BFB4-25E27FC65389`.
- The local Windows Finance service on `0.0.0.0:8791` was reachable from the Mac at `http://192.168.10.108:8791/finance.html`.
- Added a query-only visual probe path for UI validation: `finance_ui_probe=entry-note` opens bookkeeping and enters the note-focus visual state; optional `finance_ui_keyboard_bottom=<px>` simulates native keyboard height for screenshot validation. This probe is explicit and does not change the normal user path.
- Fixed Web/PWA bookkeeping note focus:
  - the custom numeric keypad and meta/chip row are hidden while the note field is focused;
  - stale `--finance-keyboard-bottom` is reset to `0px` when note focus is not active;
  - v94 positioned the note row from `--finance-keyboard-bottom`; this was superseded by v95, which positions from `--finance-visual-bottom` after real iPhone evidence showed keyboard-bottom can over-report;
  - the save action is now an in-row note save button, not a fixed child of the hidden keypad;
  - the focused shortcut category area uses a compact three-row layout so rows remain visible above the note row.
- Static frontend assets are `finance-replica-20260605n`; service worker cache is `finance-mcp-pwa-v94`.
- iOS Simulator screenshots saved locally:
  - `data\finance-pwa-screenshots\finance-ios-sim-entry-note-kb-v94.png`
  - `data\finance-pwa-screenshots\finance-ios-sim-entry-note-nokb-v94.png`
- Validation completed:
  - `node --check public\app-finance-ui.js`
  - `node tests\app-finance-ui.test.js`
  - `NODE_NO_WARNINGS=1 npm run check`
  - `NODE_NO_WARNINGS=1 npm test`
  - `git diff --check` (only existing CRLF normalization warnings for `docs/MODULES/finance-mcp.md` and `public/service-worker.js`)
- Local Windows service was restarted after the static asset update. Current listener: `0.0.0.0:8791`, PID `139388`; `/finance.html` serves `finance-replica-20260605n`.
- Production was not deployed in this run.

## 2026-06-05 iPhone Note Focus Correction From User Screenshot

- User connected physical iPhone `Pentium 2025` to the Mac Studio. `xcrun devicectl list devices` identified it as iPhone 17 Pro Max, id `AB6DD8FB-A18F-504F-B93B-2733F996F1D8`, but `devicectl device info apps` failed with `Developer Mode is disabled`, so Mac-side direct app launch/list/screenshot was not available in this run.
- User-provided physical-device screenshot `IMG_5796.jpg` showed the real failure: after tapping note input, the native iOS keyboard was visible but the note row had been pushed to the upper part of the page, leaving a large blank region above the keyboard.
- Root cause: real iOS can report a raw keyboard-height estimate that is too large for fixed layout positioning. Using that value as `bottom` moves the note row too high.
- Fix: note focus now records `--finance-visual-bottom = visualViewport.offsetTop + visualViewport.height` and positions the note row with `top: calc(var(--finance-visual-bottom) - 56px - safe-area)`. `--finance-keyboard-bottom` is still collected for diagnostics/native-keyboard state but no longer controls note-row position or form padding.
- Static frontend assets are `finance-replica-20260605o`; service worker cache is `finance-mcp-pwa-v95`.
- Simulator regression screenshot saved locally: `data\finance-pwa-screenshots\finance-ios-sim-entry-note-kb-v95.png`.
- Validation completed:
  - `node --check public\app-finance-ui.js`
  - `node tests\app-finance-ui.test.js`
  - `NODE_NO_WARNINGS=1 npm run check`
  - `NODE_NO_WARNINGS=1 npm test`
  - `git diff --check` (only existing CRLF normalization warnings for `docs/MODULES/finance-mcp.md` and `public/service-worker.js`)
- Local Windows service was restarted after v95. Current listener: `0.0.0.0:8791`, PID `123944`; `/finance.html` serves `finance-replica-20260605o` and `/service-worker.js` serves `finance-mcp-pwa-v95`.
- Production was not deployed in this run.

## 2026-06-05 iPhone Note Bottom-Edge v96 Local Work

- User enabled Developer Mode on the physical iPhone. Mac-side `devicectl` can now see the connected iPhone and can launch `com.apple.webapp` with a Finance URL, but the available public `devicectl` commands still do not expose a screenshot capture command for the physical device.
- User-provided screenshot `IMG_5797.jpg` showed v95 was improved but still not visually correct: the note input row was usable, yet it remained hundreds of pixels above the native iOS keyboard/accessory area, leaving a large blank gap.
- Fix: note focus now uses `--finance-note-bottom-edge` for the row anchor. This value is derived from `--finance-visual-bottom` plus a capped keyboard-top estimate. If real iOS reports a visual viewport bottom that is too high on the screen while the native keyboard is visible, the row is moved down toward the keyboard top instead of floating in the upper half of the page.
- Diagnostics still collect `--finance-keyboard-bottom` and `--finance-visual-bottom`; the raw keyboard height still does not directly position the note row.
- Static frontend assets are `finance-replica-20260605p`; service worker cache is `finance-mcp-pwa-v96`.
- Simulator probe screenshot saved locally: `data\finance-pwa-screenshots\finance-ios-sim-entry-note-kb-v96.png`.
- Physical iPhone launch validation:
  - `xcrun devicectl device process launch --device AB6DD8FB-A18F-504F-B93B-2733F996F1D8 --payload-url 'http://192.168.10.108:8791/finance.html?finance_ui_probe=entry-note&finance_ui_keyboard_bottom=360&finance_probe_version=v96' com.apple.webapp` succeeded.
  - `xcrun devicectl device info processes` showed `/Applications/Web.app/Web` running.
  - `/api/finance/ui-probe/latest` still returned `result: null`, so physical-device visual evidence remains dependent on user screenshot or another screen-capture path.
- Validation completed:
  - `node --check public\app-finance-ui.js`
  - `node tests\app-finance-ui.test.js`
  - `NODE_NO_WARNINGS=1 npm run check`
  - `NODE_NO_WARNINGS=1 npm test`
  - `git diff --check` (only existing CRLF normalization warnings for `docs/MODULES/finance-mcp.md` and `public/service-worker.js`)
- Local Windows service was restarted after v96. Current listener: `0.0.0.0:8791`, PID `122876`; `/finance.html` serves `finance-replica-20260605p` and `/service-worker.js` serves `finance-mcp-pwa-v96`.
- Production was not deployed in this run.

## 2026-06-06 Bill Search Focus, Detail Projection, and Mac v97 Deploy

- User reported that tapping the home search button should place focus in the search input by default, and that transaction details were showing category/account/member/merchant fields as unrecorded immediately after bookkeeping even though those fields were selected.
- Fix:
  - `openBillSearch()` now switches to the all-bills view and focuses `[data-transaction-search]` immediately, with short delayed retries for PWA/iOS render timing.
  - `finance-repository` now owns `getTransactionProjection(id)` and shares the same joined projection with `listTransactions()`.
  - `finance-transaction-service` now returns the joined public projection for create, idempotent duplicate create, update, void, and already-voided paths, so details receive category/account/target/member/merchant/tag/attachment fields instead of a raw transaction row.
- Static frontend assets are `finance-replica-20260605q`; service worker cache is `finance-mcp-pwa-v97`.
- Local Windows service was restarted after v97. Current listener: `0.0.0.0:8791`, PID `67460`; `/finance.html` serves `finance-replica-20260605q` and `/service-worker.js` serves `finance-mcp-pwa-v97`.
- Validation completed:
  - `node --check adapters\finance-repository.js`
  - `node --check adapters\finance-transaction-service.js`
  - `node --check public\app-finance-ui.js`
  - `node --check server-routes\finance-api-routes.js`
  - `node tests\finance-transaction-service.test.js`
  - `node tests\app-finance-ui.test.js`
  - `node tests\finance-server.test.js`
  - `NODE_NO_WARNINGS=1 npm run check`
  - `NODE_NO_WARNINGS=1 npm test`
  - `git diff --check` only reported existing CRLF normalization warnings for `docs/MODULES/finance-mcp.md` and `public/service-worker.js`.
- Mac Studio production was deployed with `npm run deploy:mac`.
  - Launchd service: `system/com.hermesmobile.plugin.finance`.
  - Runtime smoke after deploy: `launchctl print` reported running PID `48609`; Mac loopback `/finance.html` contains `finance-replica-20260605q`; `/service-worker.js` contains `finance-mcp-pwa-v97`; `/api/finance/client-version` returned `ok: true`.
  - Source backup: `/Users/hermes-host/HermesMobile/backups/finance-deploy/finance-source-20260606-001621.tar.gz`.
  - SQLite backup: `/Users/hermes-host/HermesMobile/plugins/finance/data/finance.sqlite3.before-mac-deploy-20260606-001621.bak`.
  - Image SQLite backup: `/Users/hermes-host/HermesMobile/plugins/finance/data/finance-images.sqlite3.before-mac-deploy-20260606-001621.bak`.
- After the deployment produced backup paths, `docs/IMPLEMENTATION_NOTES/mac-studio-deployment.md` and `.agent-context/HANDOFF.md` were synced into the Mac production source directory without restarting the service or changing data.
- Mac production remains loopback-bound at `127.0.0.1:8791`; phone access should continue through Home AI / Hermes plugin routing unless the plist host binding is intentionally changed.

## 2026-06-06 Workspace Summary Member Scope and Quarter Reports

- User clarified that MCP summary totals for a workspace must include all bookkeeping members in the resolved workspace ledger by default. Current Hermes user/member is a reporting dimension, not the default summary permission scope.
- Fix:
  - `finance.get_summary` now returns `memberBreakdown` alongside all-member totals.
  - MCP dispatcher now defaults the current Hermes member only for member-owning write/list tools (`finance.create_transaction`, `finance.list_transactions`, and `finance.create_recurring_rule`) plus explicit `finance.resolve_current_member`; it no longer injects the current member into `finance.get_summary` or unfiltered `finance.get_report`.
  - `finance.get_summary` / `finance.get_report` schemas now support `period=quarter`.
  - Report UI now exposes the compact period tabs `全部 / 年 / 季 / 月 / 更多`; quarter uses the anchor date's natural quarter and left/right arrows shift by three months.
- Static frontend assets are `finance-replica-20260605r`; service worker cache is `finance-mcp-pwa-v98`.
- Local Windows service was restarted after v98. Current listener: `0.0.0.0:8791`, PID `46096`; `/finance.html` serves `finance-replica-20260605r` and includes `data-report-period="quarter"`; `/service-worker.js` serves `finance-mcp-pwa-v98`.
- Validation completed:
  - `node --check adapters\finance-report-service.js`
  - `node --check mcp\finance-mcp-server.js`
  - `node --check public\app-finance-ui.js`
  - `node tests\finance-report-service.test.js`
  - `node tests\finance-mcp-server.test.js`
  - `node tests\app-finance-ui.test.js`
  - `NODE_NO_WARNINGS=1 npm run check`
  - `NODE_NO_WARNINGS=1 npm test`
  - PowerShell AST parse for `scripts\deploy-mac-finance.ps1`
  - BOM check for edited source/docs files
  - `git diff --check` only reported existing CRLF normalization warnings for `docs/MODULES/finance-mcp.md` and `public/service-worker.js`.
- Mac Studio production was not redeployed for this v98 local change in this run. The deploy script expected versions were updated to `finance-replica-20260605r` / `finance-mcp-pwa-v98` for the next deployment.

## 2026-06-06 Report Current Period Anchor and Full Rows

- User reported that report quarter/year tabs were opening on 2025, and that category/subcategory breakdown rows were capped with a click-to-expand control.
- Fix:
  - `state.reportAnchorDate` now initializes from `new Date().toISOString()` instead of the old fixed 2025 date.
  - Top report shortcut tabs for `year`, `quarter`, and `month` reset the report anchor to the current local date on click, so they open current year/current quarter/current month. Manual date picker selections still use the selected date.
  - `renderReport()` now renders the complete breakdown list and the hidden `data-report-expand` button was removed from `finance.html`.
- Static frontend assets are `finance-replica-20260605s`; service worker cache is `finance-mcp-pwa-v99`.
- Local Windows service was restarted after v99. Current listener: `0.0.0.0:8791`, PID `68288`; `/finance.html` serves `finance-replica-20260605s`, includes `data-report-period="quarter"`, and no longer includes `data-report-expand`; `/service-worker.js` serves `finance-mcp-pwa-v99`.
- Desktop PWA visual smoke completed with `npm run verify:pwa:desktop`; screenshot: `data\finance-pwa-screenshots\desktop-pwa-entry-1780706333477.png`.
- Validation completed:
  - `node --check public\app-finance-ui.js`
  - `node tests\app-finance-ui.test.js`
  - `node tests\finance-report-service.test.js`
  - `node tests\finance-mcp-server.test.js`
  - `NODE_NO_WARNINGS=1 npm run check`
  - `NODE_NO_WARNINGS=1 npm test`
  - `npm run verify:pwa:desktop`
  - PowerShell AST parse for `scripts\deploy-mac-finance.ps1`
  - BOM check for edited source/docs files
  - HTTP smoke: `/finance.html`, `/service-worker.js`, and `/api/finance/client-version`.
  - `git diff --check` only reported existing CRLF normalization warnings for `docs/MODULES/finance-mcp.md` and `public/service-worker.js`.
- Mac Studio production was not redeployed for this v99 local change in this run. The deploy script expected versions were updated to `finance-replica-20260605s` / `finance-mcp-pwa-v99` for the next deployment.

## 2026-06-06 Mac Production Direct Data Copy

- User accidentally created three active transactions on the Windows local runtime and asked to copy them to Mac production.
- A Mac production SQLite snapshot was saved before the direct table write:
  - `/Users/xuxin/finance-backups/finance.sqlite3.before-local-windows-copy-20260606-085544.bak`
  - matching image DB snapshot: `/Users/xuxin/finance-backups/finance-images.sqlite3.before-local-windows-copy-20260606-085544.bak`
- Direct table transaction inserted these active transactions into Mac production `daily`:
  - `txn_4b34af59deb19b20`
  - `txn_45692af8a85be322`
  - `txn_672a249c3333d94f`
- The same transaction inserted their tag links, adjusted `acct_cash` balance for the inserted expense total, and added `finance_audit_log` rows with actor `direct-table-copy:windows-local`.
- Validation: Mac SQLite query, tag query, audit query, and Mac loopback `/api/finance/transactions?limit=10` all showed the three copied active transactions.

## 2026-06-06 Bill Search Keyboard Submit v100 Deploy

- User reported that after entering a query in the bill-search input and tapping the mobile keyboard confirm/search key, the native keyboard remained focused and covered search results.
- Fix:
  - `data-transaction-search` now has `enterkeyhint="search"`.
  - `commitTransactionSearch()` handles native `search` events and `Enter`, clears the debounce timer, runs the search immediately, calls `input.blur()`, and refreshes input-focus state so mobile native keyboard collapses.
- Static frontend assets are `finance-replica-20260605t`; service worker cache is `finance-mcp-pwa-v100`.
- Windows local service was restarted and deployed after v100. Current listener: `0.0.0.0:8791`, PID `77664`; `/finance.html` serves `finance-replica-20260605t` and includes `enterkeyhint="search"`; `/service-worker.js` serves `finance-mcp-pwa-v100`.
- Mac Studio production was deployed with `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-mac-finance.ps1 -PasswordFile <local password file>`.
  - Launchd service: `system/com.hermesmobile.plugin.finance`, running PID `72910`.
  - Source backup: `/Users/hermes-host/HermesMobile/backups/finance-deploy/finance-source-20260606-090839.tar.gz`.
  - SQLite backup: `/Users/hermes-host/HermesMobile/plugins/finance/data/finance.sqlite3.before-mac-deploy-20260606-090839.bak`.
  - Image SQLite backup: `/Users/hermes-host/HermesMobile/plugins/finance/data/finance-images.sqlite3.before-mac-deploy-20260606-090839.bak`.
  - Mac loopback `/finance.html` contains `finance-replica-20260605t` and `enterkeyhint="search"`; `/service-worker.js` contains `finance-mcp-pwa-v100`; `/api/finance/client-version` returned `ok: true`.
  - Mac SQLite still contained the three direct-copied active transaction ids after deploy: `txn_4b34af59deb19b20`, `txn_45692af8a85be322`, and `txn_672a249c3333d94f`.
- Validation completed:
  - `node --check public\app-finance-ui.js`
  - `node tests\app-finance-ui.test.js`
  - `NODE_NO_WARNINGS=1 npm run check`
  - `NODE_NO_WARNINGS=1 npm test`
  - `npm run verify:pwa:desktop` after Windows restart; screenshot: `data\finance-pwa-screenshots\desktop-pwa-entry-1780708108582.png`
  - PowerShell AST parse for `scripts\deploy-mac-finance.ps1`
  - BOM check for edited source/docs files
  - `git diff --check` only reported existing CRLF normalization warnings for `docs/MODULES/finance-mcp.md` and `public/service-worker.js`.

## 2026-06-06 MCP Create Transaction Inline Attachments

- User requested that Finance MCP support attaching photos directly during bookkeeping entry.
- Fix:
  - Added `adapters/finance-transaction-attachment-service.js` to orchestrate `createTransaction` plus bounded attachment writes through the existing attachment service.
  - `finance.create_transaction` now accepts optional `attachments` with max 6 items; each item uses `file_name`, `mime_type`, and either `data_base64` or `data_url`.
  - The attachment service now exposes `validateAttachmentInput()` so payload shape/size is checked before creating the transaction.
  - Direct create returns refreshed transaction projection plus bounded attachment metadata/structured URLs; raw bytes are stored through the existing file/image SQLite path and are not embedded in transaction projections.
  - Idempotent duplicate create replay does not attach the same payloads again.
- Docs updated:
  - `docs/MODULES/finance-mcp.md`
  - `docs/finance-mcp-requirements-design.md`
  - `docs/TEST_MATRIX.md`
  - `docs/IMPLEMENTATION_NOTES/harness-required-matrix.md`
- Validation completed:
  - `node --check adapters\finance-transaction-attachment-service.js`
  - `node --check adapters\finance-attachment-service.js`
  - `node --check adapters\finance-runtime.js`
  - `node --check mcp\finance-mcp-server.js`
  - `node --test tests\finance-transaction-attachment-service.test.js tests\finance-mcp-server.test.js`
  - `NODE_NO_WARNINGS=1 npm run check`
  - `NODE_NO_WARNINGS=1 npm test`
  - BOM check for edited source/docs files
  - `git diff --check` only reported the existing CRLF normalization warning for `docs/MODULES/finance-mcp.md`.
- Static frontend assets were not changed; service worker/cache versions remain `finance-replica-20260605t` / `finance-mcp-pwa-v100`.
- Windows and Mac production services were not redeployed for this MCP/backend-only change in this run.

## 2026-06-06 MCP Existing Transaction Attachment Upload

- User requested MCP support for uploading a photo/image attachment to an already-created bill by transaction id.
- Fix:
  - Added `finance.add_transaction_attachment` to MCP schemas.
  - Tool parameters: required `transaction_id`, optional `ledger_id`, `file_name`, `mime_type`, and either `data_base64` or `data_url`.
  - MCP dispatcher now normalizes attachment field aliases and delegates directly to `runtime.attachmentService.addAttachment()`.
  - Existing attachment service remains the owner of transaction existence checks, scoped ledger access, payload size validation, image SQLite storage, thumbnail generation, and audit logging.
- Docs updated:
  - `docs/MODULES/finance-mcp.md`
  - `docs/finance-mcp-requirements-design.md`
  - `docs/finance-mcp-implementation-plan.md`
  - `docs/TEST_MATRIX.md`
  - `docs/IMPLEMENTATION_NOTES/harness-required-matrix.md`
- Validation completed:
  - `node --check mcp\finance-mcp-server.js`
  - `node --test tests\finance-mcp-server.test.js tests\finance-python-mcp-stdio.test.js tests\finance-mcp-workspace-config.test.js`
  - `NODE_NO_WARNINGS=1 npm run check`
  - `NODE_NO_WARNINGS=1 npm test`
  - BOM check for edited source/docs files
  - `git diff --check` only reported the existing CRLF normalization warning for `docs/MODULES/finance-mcp.md`.
- Static frontend assets were not changed; service worker/cache versions remain `finance-replica-20260605t` / `finance-mcp-pwa-v100`.
- Windows and Mac production services were not redeployed for this MCP/backend-only change in this run.

## 2026-06-06 Deploy Finance MCP Attachment Tools To Windows And Mac

- Cross-thread deployment task completed for commit `a855011` (`支持MCP为已有账单上传附件`) on branch `codex/finance-mcp-design`.
- Windows local:
  - Repository was already at `a855011`; `git pull --ff-only` reported up to date.
  - Validation passed:
    - `node --check mcp\finance-mcp-server.js`
    - `node --test tests\finance-mcp-server.test.js tests\finance-python-mcp-stdio.test.js tests\finance-mcp-workspace-config.test.js`
    - `NODE_NO_WARNINGS=1 npm run check`
  - Existing stale Windows service on `0.0.0.0:8791` was restarted. Current listener PID is `87288`.
  - `/api/finance/client-version` returned `ok: true`.
  - Authenticated local `/api/finance/mcp/schemas` check with the owner workspace-local Finance config/key returned 29 schemas and confirmed:
    - `finance.create_transaction` has `attachments` with `maxItems: 6`.
    - `finance.add_transaction_attachment` is present with required `transaction_id`.
- Mac Studio production:
  - Deployed with `scripts\deploy-mac-finance.ps1`; production source directory is `/Users/hermes-host/HermesMobile/plugins/finance`.
  - Production source is not a git checkout, so the deployed commit should be tracked as the local source commit `a855011`.
  - Launchd service `system/com.hermesmobile.plugin.finance` is running with PID `16420`.
  - Mac loopback `/api/finance/client-version` returned `ok: true`.
  - Mac authenticated `/api/finance/mcp/schemas` check with owner workspace-local Finance config/key returned 29 schemas and confirmed:
    - `finance.create_transaction` has `attachments` with `maxItems: 6`.
    - `finance.add_transaction_attachment` is present with required `transaction_id`.
  - Mac deploy backups:
    - Source backup: `/Users/hermes-host/HermesMobile/backups/finance-deploy/finance-source-20260606-150642.tar.gz`
    - SQLite backup: `/Users/hermes-host/HermesMobile/plugins/finance/data/finance.sqlite3.before-mac-deploy-20260606-150642.bak`
    - Image SQLite backup: `/Users/hermes-host/HermesMobile/plugins/finance/data/finance-images.sqlite3.before-mac-deploy-20260606-150642.bak`
- Gateway/Hermes verification:
  - Mac Gateway-side wrapper directory `/Users/hermes-host/HermesMobile/gateway-worker/finance-mcp` was also synchronized from the deployed Finance source after backing up the old tree to `/Users/hermes-host/HermesMobile/backups/finance-deploy/finance-gateway-worker-mcp-20260606-151815.tar.gz`.
  - `diff -q` confirmed the deployed Finance service source and Gateway-side wrapper match for `mcp/finance-mcp-server.js` and `scripts/finance_mcp_stdio.py`.
  - Direct Gateway-side stdio wrapper `tools/list` for the owner workspace returned 29 tools and confirmed:
    - `create_transaction` has `attachments` with `maxItems: 6`.
    - `add_transaction_attachment` is present.
  - Mac Gateway schema smoke passed for both:
    - `hm-owner-openai-1`
    - `hm-wuping-openai-1`
  - Required tools in both schema smokes:
    - `mcp_finance_create_transaction`
    - `mcp_finance_add_transaction_attachment`
  - Evidence mode: `agent-schema-probe`.
  - Gateway Pool was not restarted; service schema and wrapper schema were already visible through fresh agent schema probes. Finance launchd was restarted by the deploy script.
- Documentation updated:
  - `docs/IMPLEMENTATION_NOTES/mac-studio-deployment.md`
  - `docs/MODULES/finance-mcp.md`
- Important harness note:
  - `gateway-tool-schema-smoke.js` must use the correct Mac profile root, for example `/Users/hm-owner/HermesWorkspace/.hermes-gateway/profiles` for `hm-owner-openai-1`.
  - A raw worker `/v1/responses` smoke without Home AI plugin activation can omit Finance tools even when plugin-topic Finance MCP is available.
  - The smoke path that used only manifest inline `api_key` produced `Invalid API key`; Mac profiles use `apiKeyFile`, so future harnesses must read the key file without printing it.

## 2026-06-06 MCP Attachment Upload Path Support

- User reported that Hermes tried to attach `/Users/hermes-host/HermesMobile/data/drive/users/owner/Hermes-徐欣/.hermes-mobile/uploads/thread_mph4k4oy_3074b516/1780735372277-447fed-IMG_5805.png` to transaction `txn_f8d41ab3f60a2d16`, but Finance returned `attachment_data_url_invalid` because the path had been passed where a base64 `data_url` was expected.
- Boundary decision:
  - Vision analysis belongs in Hermes/model multimodal input when the model needs to inspect the image.
  - Finance attachment persistence should not require Hermes/model to read PNG bytes or convert them to base64.
  - Finance MCP now accepts server-local upload paths and reads them in the attachment service under an allowlist.
- Fix:
  - `finance.create_transaction.attachments[]` and `finance.add_transaction_attachment` now accept `file_path` / `upload_path`.
  - Legacy callers that accidentally pass an absolute upload path in `data_url` are also supported, but only after the same upload-root allowlist check.
  - Default allowed roots include Finance `data/uploads`, Hermes Mobile `data/drive/users`, and `<HERMES_MOBILE_DATA_ROOT>/drive/users`; `FINANCE_ATTACHMENT_UPLOAD_ROOTS` can add explicit roots.
  - Paths under Hermes `data/drive/users` must be inside `.hermes-mobile/uploads` to avoid turning Finance MCP into a generic file-read tool.
  - MIME type is inferred from extension when `mime_type` is omitted.
- Validation completed:
  - `node --check adapters\finance-attachment-service.js`
  - `node --check adapters\finance-runtime.js`
  - `node --check mcp\finance-mcp-server.js`
  - `node --check tests\helpers.js`
  - `node --check tests\finance-mcp-server.test.js`
  - `node --check tests\finance-transaction-attachment-service.test.js`
  - `node --test tests\finance-mcp-server.test.js tests\finance-transaction-attachment-service.test.js`
  - `NODE_NO_WARNINGS=1 npm run check`
  - `NODE_NO_WARNINGS=1 npm test`
  - BOM check for edited source/docs files
  - `git diff --check` only reported the existing CRLF normalization warning for `docs/MODULES/finance-mcp.md`.
- Commit pushed: `36df5c7` (`支持MCP附件读取上传路径`).
- Windows local deployment:
  - Old listener PID `87288` was stopped and Windows Finance service was restarted.
  - Current listener: `0.0.0.0:8791`, PID `127952`.
  - `/api/finance/client-version` returned `ok: true`.
  - Local source schema has 29 schemas and includes `finance.add_transaction_attachment`, `file_path`, and `upload_path`.
- Mac Studio production deployment:
  - Deployed with `scripts\deploy-mac-finance.ps1 -PasswordFile <local password file>`.
  - Launchd `system/com.hermesmobile.plugin.finance` is running, PID `22264`.
  - Mac loopback `/api/finance/client-version` returned `ok: true`.
  - Deploy backups:
    - Source backup: `/Users/hermes-host/HermesMobile/backups/finance-deploy/finance-source-20260606-170408.tar.gz`
    - SQLite backup: `/Users/hermes-host/HermesMobile/plugins/finance/data/finance.sqlite3.before-mac-deploy-20260606-170408.bak`
    - Image SQLite backup: `/Users/hermes-host/HermesMobile/plugins/finance/data/finance-images.sqlite3.before-mac-deploy-20260606-170408.bak`
- Production data repair for the user's parking-fee bill:
  - Target transaction: `txn_f8d41ab3f60a2d16`.
  - Upload file was found by suffix under the owner Hermes upload tree: `1780735372277-447fed-IMG_5805.png`.
  - Attachment write was executed as production user `hermes-host` through the Finance MCP dispatcher with `file_path`.
  - Before attachment count: `0`; after attachment count: `1`.
  - Added attachment id: `attachment_75a0e96d6bd4d687`, MIME `image/png`.
  - `firstImageAttachmentId` is `attachment_75a0e96d6bd4d687`.
- Gateway/Hermes verification:
  - Mac hm-owner Finance stdio wrapper `tools/list` returned `add_transaction_attachment`.
  - The wrapper schema for `create_transaction.attachments[]` and `add_transaction_attachment` includes `file_path` and `upload_path`.
  - Gateway Pool was not restarted; the stdio wrapper fetches live Finance service schemas and already surfaced the new fields in a fresh `tools/list` probe.

## 2026-06-06 Wacai Member and Tag Repair

- User reported that imported Wacai rows for spouse/self appeared as `家庭公用`.
- Root cause:
  - `updateTransaction()` merged an existing repository row back through `resolveInput()` during the 2026 Wacai amount scale repair.
  - The existing row used `bookedByMemberId`, but `resolveInput()` only recognized `memberId` / `member_id`; absent member input fell back to the first sorted member, which is `家庭公用`.
  - The same update path replaced tags with `[]` whenever the patch omitted `tags`.
- Code fix:
  - `adapters/finance-transaction-service.js` now recognizes `bookedByMemberId` / `booked_by_member_id` as the existing member id.
  - Transaction tags are replaced only when the update patch explicitly contains `tags`.
  - Added `scripts/repair-wacai-member-tags.js`; default mode is dry-run, `--apply` creates a DB backup, restores `booked_by_member_id` from Wacai source fields, restores missing tags only when no stored tags exist, and writes bounded audit rows.
- Local Windows data repair:
  - Dry-run for batch token `202606042114425`: candidate rows 341, member updates 275, tag restores 170.
  - Applied repair locally. Backup: `data\finance.sqlite3.before-wacai-member-tag-repair-20260606T092154Z.bak`.
  - Post-repair aggregate check for the batch: mismatched source/member rows `0`; active stored members include `自己` 173, `家庭公用` 80, `配偶` 18; source-tag rows 171 and stored-tag rows 171.
- Mac Studio production:
  - Deployed current Finance source with `npm run deploy:mac`.
  - Deploy backups:
    - Source backup: `/Users/hermes-host/HermesMobile/backups/finance-deploy/finance-source-20260606-172227.tar.gz`
    - SQLite backup: `/Users/hermes-host/HermesMobile/plugins/finance/data/finance.sqlite3.before-mac-deploy-20260606-172227.bak`
    - Image SQLite backup: `/Users/hermes-host/HermesMobile/plugins/finance/data/finance-images.sqlite3.before-mac-deploy-20260606-172227.bak`
  - Mac repair first failed under the SSH user due expected production file permissions; reran as production user `hermes-host`.
  - Mac apply backup: `/Users/hermes-host/HermesMobile/plugins/finance/data/finance.sqlite3.before-wacai-member-tag-repair-20260606T092256Z.bak`.
  - Post-repair aggregate check for the batch: mismatched source/member rows `0`; active stored members include `自己` 173, `家庭公用` 80, `配偶` 18; source-tag rows 171 and stored-tag rows 171.
- Windows local service:
  - Restarted after code fix; current listener is `0.0.0.0:8791`, PID `103320`; `/api/finance/client-version` returned `ok: true`.
- Validation:
  - `node --check adapters\finance-transaction-service.js`
  - `node --check scripts\repair-wacai-member-tags.js`
  - `node --check tests\finance-transaction-service.test.js`
  - `NODE_NO_WARNINGS=1 node tests\finance-transaction-service.test.js`
  - `NODE_NO_WARNINGS=1 npm test`
  - `NODE_NO_WARNINGS=1 npm run check`

## 2026-06-06 Home AI Platform Contract Pointer

- Added `docs/HOME_AI_PLATFORM_CONTRACT.md`.
- Contract version: `20260606-v1`.
- Scope: Finance is treated as a standard inserted Home AI plugin for the
  cross-workspace platform contract rollout.
- This was a documentation-only update. No Finance code, local service, Mac
  production files, Gateway workers, ledger data, or credentials were changed.
- The pointer records `pointer_added_at_snapshot` instead of a current-branch
  field, so `d8d0a5b` is explicitly the historical snapshot when the pointer was
  added.
- Next steps:
  - extend Reference Contract coverage if attachments/search/resolution become
    part of the graph workflow;
  - keep Home AI MCP tool upgrade closure mandatory for future Finance schema
    changes;
  - add embedded Appium/iOS Simulator evidence when Finance UI behavior changes
    inside Home AI.

## 2026-06-06 Home AI Platform Contract Checker Closure

- Home AI main workspace added and ran:
  `node scripts\plugin-workspace-platform-contract-check.js --plugin finance --json`.
- Mac read-only platform probe passed through `homeai-mac`:
  - source path `/Users/hermes-host/HermesMobile/plugins/finance` exists;
  - launchd `com.hermesmobile.plugin.finance` is loaded;
  - manifest `http://127.0.0.1:8791/api/v1/hermes/plugin/manifest` returned
    HTTP 200;
  - `/api/finance/client-version` returned HTTP 200;
  - `/api/finance/mcp/schemas` correctly requires workspace id/key without
    printing any key.
- No Finance code, service, production data, Gateway worker, ledger data, or
  credential material was changed by this checker closure.

## 2026-06-06 Finance Reference Contract V1 and Platform Smoke

- Implemented Finance Reference Contract V1 source support:
  - service: `adapters/finance-reference-service.js`;
  - MCP tools: `finance.reference_object_types`, `finance.reference_get`, and
    `finance.reference_summarize`;
  - object types: `transaction`, `account`, and `category`.
- Runtime wiring now injects `referenceService`; MCP dispatcher remains glue and
  delegates reference reads/summaries to the service.
- Reference reads enforce ledger access through `finance-ledger-service` and
  return bounded projections/summaries only. Transaction references omit raw
  source fields, local file paths, attachment URLs, keys, receipt bytes, and
  ledger dumps.
- Added Finance-local platform/MCP contract smoke:
  `scripts/finance-platform-contract-smoke.js`.
  The `npm run platform:check` script requires the three Reference V1 tools,
  checks service schema/toolset consistency, checks stdio raw tool names, and
  runs the Home AI finance pointer checker when available.
- Home AI source-level sync:
  - instruction hints now include
    `mcp_finance_reference_object_types`, `mcp_finance_reference_get`, and
    `mcp_finance_reference_summarize`;
  - Home AI `GATEWAY_TOOL_SCHEMA_EPOCH` was bumped to
    `20260606-finance-reference-mcp-v1`.
- Test isolation follow-up:
  - `tests/finance-server.test.js` now points `server.js` module import at a
    temporary SQLite DB before requiring it, so all tests can pass while the
    local Windows Finance service keeps `data/finance.sqlite3` open.
- Documentation updated:
  - `docs/HOME_AI_PLATFORM_CONTRACT.md`;
  - `docs/ARCHITECTURE_BOUNDARY.md`;
  - `docs/finance-mcp-implementation-plan.md`;
  - `docs/finance-mcp-requirements-design.md`;
  - `docs/MODULES/finance-mcp.md`;
  - `docs/IMPLEMENTATION_NOTES/harness-required-matrix.md`;
  - `docs/TEST_MATRIX.md`.
- Validation completed locally:
  - `node --check adapters\finance-reference-service.js`
  - `node --check adapters\finance-runtime.js`
  - `node --check mcp\finance-mcp-server.js`
  - `node --check scripts\finance-platform-contract-smoke.js`
  - `python -m py_compile scripts\finance_mcp_stdio.py`
  - `python -m py_compile gateway-plugins\hermes-mobile-finance\__init__.py`
  - `node --test tests\finance-reference-service.test.js tests\finance-platform-contract-smoke.test.js tests\finance-mcp-server.test.js`
  - `npm run platform:check`
  - `npm run check`
  - `npm test`
- No production deploy, Mac launchd restart, Gateway worker restart, or ledger
  data mutation was performed in this step.

## 2026-06-06 Parking Receipt Attachment Follow-Up

- User reported a new Mac production transaction `txn_90fe26d28e4ac042` for a CNY 45 parking fee had been created, but the image attachment remained missing because the Hermes run believed it needed base64/data_url bytes.
- Production state before repair:
  - `attachmentCount=0`, `imageAttachmentCount=0`.
  - The note contained a Hermes upload path for `1780749811007-6f8064-IMG_5805.png` and a temporary `票据待补附件` tag.
- Data repair:
  - Ran Finance MCP dispatcher on Mac production as `hermes-host` with `finance.add_transaction_attachment` and `file_path`.
  - Added attachment `attachment_21ba4e33b871e314`, MIME `image/png`, file size 229064 bytes.
  - Post-repair `attachmentCount=1`, `imageAttachmentCount=1`, `firstImageAttachmentId=attachment_21ba4e33b871e314`.
  - Removed the temporary pending note suffix and `票据待补附件` tag; retained the normal `停车费` tag and receipt metadata.
- Schema diagnosis:
  - Mac Finance service schema and Mac Gateway-side Python wrapper both expose `file_path` and `upload_path` for `finance.create_transaction.attachments[]` and `finance.add_transaction_attachment`.
  - The old schema description still said attachment payloads use base64 data, which can mislead Hermes/model runs even when path fields exist.
- Code follow-up:
  - Updated `mcp/finance-mcp-server.js` schema descriptions to tell callers to prefer `file_path` / `upload_path` for server-local Hermes upload files and use base64 only when bytes are already available.
  - Added MCP schema description regression assertions in `tests/finance-mcp-server.test.js`.
- Deployment/verification:
  - Mac production deployed with `npm run deploy:mac`.
  - Mac deploy backups:
    - Source backup: `/Users/hermes-host/HermesMobile/backups/finance-deploy/finance-source-20260606-205238.tar.gz`
    - SQLite backup: `/Users/hermes-host/HermesMobile/plugins/finance/data/finance.sqlite3.before-mac-deploy-20260606-205238.bak`
    - Image SQLite backup: `/Users/hermes-host/HermesMobile/plugins/finance/data/finance-images.sqlite3.before-mac-deploy-20260606-205238.bak`
  - Mac launchd `system/com.hermesmobile.plugin.finance` is running, PID `32342`; loopback `/api/finance/client-version` returned `ok: true`.
  - Windows local Finance service restarted; listener is `0.0.0.0:8791`, PID `87736`; `/api/finance/client-version` returned `ok: true`.
  - Mac owner workspace schema and Gateway-side Python wrapper `tools_list` both expose `file_path` and `upload_path`; Mac schema descriptions now explicitly mention using path fields instead of reading binary bytes into base64.

## 2026-06-06 MEDIA-Wrapped Attachment Path Compatibility

- User retested Mac production and confirmed the Finance attachment callable was
  present but the model passed a Hermes `MEDIA:<path>` upload reference in
  `data_url`, producing `attachment_data_url_invalid`.
- Root cause:
  - Finance already accepted `file_path`, `upload_path`, and legacy absolute
    upload paths in `data_url`;
  - it did not strip the `MEDIA:` wrapper before checking whether the value was
    an absolute allowed upload path.
- Code change:
  - Attachment payload normalization moved into shared helper
    `adapters/finance-attachment-input-service.js` so create-time and
    post-create attachment paths use the same source-field normalization,
    upload-root allowlist, and schema description helpers.
  - The in-progress MCP entrypoint extraction was completed enough for the
    architecture harness: `mcp/finance-mcp-server.js` is now thin glue,
    `mcp/finance-tool-contract.js` owns tool schemas, `mcp/finance-mcp-args.js`
    normalizes arguments, `mcp/finance-mcp-context.js` owns Hermes identity /
    scoped ledger helpers, and `mcp/dispatchers/*.js` own domain dispatch.
  - `adapters/finance-attachment-service.js` now normalizes
    `data_url: "MEDIA:<absolute_path>"` to the existing upload-path path after
    stripping the wrapper.
  - The same allowlist remains enforced: allowed upload roots only, and Hermes
    `data/drive/users` paths must still be inside `.hermes-mobile/uploads`.
  - `mcp/finance-mcp-server.js` schema descriptions now explicitly mention the
    legacy `MEDIA:<path>` wrapper compatibility while still recommending
    `file_path` / `upload_path` for new callers.
- Harness/docs updated:
  - `tests/finance-mcp-server.test.js` covers
    `finance.add_transaction_attachment` with `data_url: MEDIA:<path>`.
  - `tests/finance-transaction-attachment-service.test.js` covers create-time
    attachments with `data_url: MEDIA:<path>`.
  - `docs/MODULES/finance-mcp.md`,
    `docs/IMPLEMENTATION_NOTES/harness-required-matrix.md`, and
    `docs/TEST_MATRIX.md` record the compatibility rule and harness
    requirement.
- Local validation passed:
  - `node --check adapters\finance-attachment-service.js`
  - `node --check mcp\finance-mcp-server.js`
  - `node --test tests\finance-mcp-server.test.js tests\finance-transaction-attachment-service.test.js`
  - `npm run check`
  - `npm test` (149 tests passed)
  - `git diff --check` only warned about the existing CRLF-to-LF conversion
    behavior for `docs/MODULES/finance-mcp.md`.
- Mac production deployed with `npm run deploy:mac`.
- Mac deploy backups:
  - Source backup:
    `/Users/hermes-host/HermesMobile/backups/finance-deploy/finance-source-20260606-223424.tar.gz`
  - SQLite backup:
    `/Users/hermes-host/HermesMobile/plugins/finance/data/finance.sqlite3.before-mac-deploy-20260606-223424.bak`
  - Image SQLite backup:
    `/Users/hermes-host/HermesMobile/plugins/finance/data/finance-images.sqlite3.before-mac-deploy-20260606-223424.bak`
- Mac production validation passed:
  - loopback `/api/finance/client-version` returned `ok: true`;
  - production source `node --check adapters/finance-attachment-service.js`;
  - production source `node --check mcp/finance-mcp-server.js`;
  - production source `node --check mcp/finance-tool-contract.js`;
  - production source `node --check adapters/finance-attachment-input-service.js`;
  - production source
    `node --test tests/finance-mcp-server.test.js tests/finance-transaction-attachment-service.test.js tests/finance-tool-contract.test.js tests/finance-attachment-input-service.test.js`
    passed 26 tests, including `MEDIA:<path>` compatibility and MCP contract
    registry coverage.

## 2026-06-07 WuPing Wacai Import To Mac Production

- User provided a Wacai export zip for WuPing and explicitly requested import
  into Mac production.
- Target production environment:
  - SSH alias: `homeai-macstudio-prod`.
  - Finance source: `/Users/hermes-host/HermesMobile/plugins/finance`.
  - Runtime user: `hermes-host`.
  - Target Finance user: `user_f1e18d65624cdcf6` (`吴萍`).
  - Target ledger: `ledger_43831ef44be451ed` (`吴萍账本`).
- Source file handling:
  - Zip contained one XLSX Wacai export.
  - The XLSX was copied to a Mac temp path under
    `/tmp/finance-wuping-wacai-20260607/`.
  - The Mac temp directory and local temp extraction directory were removed
    after import validation.
  - No raw bill rows were written to docs/handoff/tests.
- Import decision:
  - Pre-import aggregate check found 1961 rows, date span 2023-04-01 through
    2026-06-04, all CNY expenses.
  - Source amount aggregate was already normal currency scale, so
    `amountMultiplier=1` was used. Applying the historical 2025 `*100` rule
    would have inflated this file incorrectly.
- Safety:
  - Dry run against a production DB copy imported 1961 rows with 0 errors and
    aggregate CNY expense `24078684` minor units.
  - Production SQLite backup before import:
    `/Users/hermes-host/HermesMobile/plugins/finance/data/finance.sqlite3.before-wuping-wacai-import-20260607-174055.bak`.
  - Image SQLite was not changed by this import; if present, a matching
    timestamped image-store backup was attempted by the same backup script.
- Production import result:
  - Import batch: `import_2c66149c3ad6900d`.
  - `row_count=1961`, `imported_count=1961`, `skipped_count=0`.
  - Target ledger transaction count changed from 0 to 1961.
  - `finance_transaction_source_fields` rows for this batch: 1961.
  - Aggregate active Wacai transactions in the target ledger:
    CNY expense count 1961, amount minor `24078684` (`240786.84`).
- Post-import validation:
  - `reportService.getSummary({ period: "all", currency: "CNY" })` for
    WuPing ledger returned expense `240786.84`, income `0.00`, count 1961.
  - Member household flag check showed only `家庭公用` has `is_household=1`;
    imported person members are not all converted to household.
  - Mac loopback `/api/finance/client-version` still returned `ok: true`.
- No Finance source code, Gateway profile, launchd plist, or service restart was
  changed for this data-only import.

## 2026-06-07 WuPing Early Wacai Import To Mac Production

- User provided a second Wacai export zip for WuPing and said it was early
  data. User requested importing all of it into Mac production.
- Target production environment remained:
  - SSH alias: `homeai-macstudio-prod`.
  - Finance source: `/Users/hermes-host/HermesMobile/plugins/finance`.
  - Runtime user: `hermes-host`.
  - Target Finance user: `user_f1e18d65624cdcf6` (`吴萍`).
  - Target ledger: `ledger_43831ef44be451ed` (`吴萍账本`).
- Source file handling:
  - Zip contained one XLSX Wacai export.
  - XLSX was copied to a Mac temp path under
    `/tmp/finance-wuping-wacai-early-20260607/`.
  - Mac temp directory and local temp extraction directory were removed after
    import validation. This removed the dry-run production DB copy and temp
    scripts.
  - No raw bill rows were written to docs/handoff/tests.
- Import decision:
  - Pre-import aggregate check found 11605 rows, date span 2012-04-14 through
    2025-09-04.
  - Type counts: expense 11430, income 139, transfer 36.
  - Currencies: CNY 11603 rows, HKD 2 rows.
  - Source amounts were already normal currency scale, so `amountMultiplier=1`
    was used.
  - Existing generic Wacai importer did not handle old Wacai transfer account
    strings shaped like `source:-amount,target:+amount`; a temporary production
    import script parsed those 36 transfer rows into source and target accounts
    before calling the normal transaction service. No repository/source code was
    changed.
- Safety:
  - Initial dry run without transfer parsing showed 36 transfer-account errors
    and did not touch production data.
  - Dry run against a production DB copy with transfer parsing imported 11605
    rows with 0 errors.
  - Production SQLite backup before import:
    `/Users/hermes-host/HermesMobile/plugins/finance/data/finance.sqlite3.before-wuping-wacai-early-import-20260607-175202.bak`.
- Production import result:
  - Import batch: `import_59c76afa04904676`.
  - `row_count=11605`, `imported_count=11605`, `skipped_count=0`.
  - Target ledger transaction count changed from 1961 to 13566.
  - `finance_transaction_source_fields` rows for this batch: 11605.
  - Batch aggregate:
    - CNY expense count 11429, amount minor `1821522552`.
    - HKD expense count 1, amount minor `249330`.
    - CNY income count 138, amount minor `246054368`.
    - HKD income count 1, amount minor `308000`.
    - CNY transfer count 36, amount minor `323880300`.
- Post-import validation:
  - Exact raw source-field duplicate count between the first WuPing import batch
    `import_2c66149c3ad6900d` and this early batch was 0, despite overlapping
    date ranges.
  - `reportService.getSummary({ period: "all", currency: "CNY" })` for the
    WuPing ledger returned income `2460543.68`, expense `18456012.36`, net
    `-15995468.68`, count 13528.
  - HKD summary returned income `3080.00`, expense `2493.30`, net `586.70`,
    count 2.
  - Member household flag check still showed only `家庭公用` has
    `is_household=1`.
  - Mac loopback `/api/finance/client-version` still returned `ok: true`.
- No Finance source code, Gateway profile, launchd plist, or service restart was
  changed for this data-only import.

## 2026-06-07 WuPing Ledger Split Correction

- User clarified that WuPing's first imported Wacai file, the later data from
  2023 onward, belongs to `家庭账本`, while the second/early import belongs to
  `日常账本`.
- Production correction target:
  - Finance user: `user_f1e18d65624cdcf6` (`吴萍`).
  - Original ledger before correction: `ledger_43831ef44be451ed` (`吴萍账本`).
  - First/later batch: `import_2c66149c3ad6900d`, 1961 rows.
  - Second/early batch: `import_59c76afa04904676`, 11605 rows.
- Safety:
  - Dry run on a production DB copy succeeded before touching production.
  - Production backup before repair:
    `/Users/hermes-host/HermesMobile/plugins/finance/data/finance.sqlite3.before-wuping-ledger-split-20260607-182244.bak`.
  - Temporary repair scripts and dry-run DB copies were removed from Mac `/tmp`
    after validation.
- Production repair:
  - Created new WuPing-owned ledger `ledger_4427e96f86b8f100` named
    `家庭账本`.
  - Renamed original WuPing ledger `ledger_43831ef44be451ed` from `吴萍账本` to
    `日常账本`.
  - Moved first batch `import_2c66149c3ad6900d` to `家庭账本`.
  - Left second batch `import_59c76afa04904676` in `日常账本`.
  - Cloned the first batch's used account/category/member/merchant master data
    into `家庭账本`, remapped transaction foreign keys/source fields, and
    recalculated account balances for both ledgers.
- Post-repair validation:
  - WuPing ledgers now include:
    - `日常账本` (`ledger_43831ef44be451ed`) with 11605 transactions.
    - `家庭账本` (`ledger_4427e96f86b8f100`) with 1961 transactions.
    - existing shared `汽车账本` remains visible through membership.
  - First batch source fields and transactions in `家庭账本`: 1961.
  - Second batch source fields and transactions in `日常账本`: 11605.
  - `家庭账本` CNY summary: income `0.00`, expense `240786.84`, net
    `-240786.84`, count 1961.
  - `日常账本` CNY summary: income `2460543.68`, expense `18215225.52`, net
    `-15754681.84`, count 11567.
  - `日常账本` HKD summary: income `3080.00`, expense `2493.30`, net `586.70`,
    count 2.
  - Household flag remains bounded: each WuPing ledger has only `家庭公用` as
    `is_household=1`.
  - Mac loopback `/api/finance/client-version` still returned `ok: true`.
- No Finance source code, Gateway profile, launchd plist, or service restart was
  changed for this data-only repair.

## 2026-06-07 WuPing MyMoney Daily Ledger Import To Mac Production

- User provided a 随手记 CSV export and clarified it should be merged into
  WuPing's `日常账本`, not the `家庭账本`.
- Target production environment:
  - SSH alias: `homeai-macstudio-prod`.
  - Finance source: `/Users/hermes-host/HermesMobile/plugins/finance`.
  - Runtime user: `hermes-host`.
  - Target Finance user: `user_f1e18d65624cdcf6` (`吴萍`).
  - Target ledger: `ledger_43831ef44be451ed` (`日常账本`).
- Source file:
  - Local upload:
    `C:\Users\xuxin\.codex-mobile-web\uploads\2026-06-07\019e936c-d163-75b3-adf4-d5ae69e46936\1780840527550-8510d2d7a4d1-mymoney_data_20260607214904.csv`.
  - Mac temp path used during import:
    `/tmp/finance-mymoney-import-20260607/mymoney_data_20260607214904.csv`.
  - SHA-256:
    `1e1ce49734cd614d8a79ba66bcd192050d9b704072da60b63365cbfa617de72d`.
  - The export is 随手记 Android CSV v5: first line metadata, second line
    header, multiline remarks supported.
  - No raw bill rows were written to docs/handoff/tests.
- Code/docs added:
  - Added `scripts/import-mymoney-csv.js` for controlled MyMoney CSV imports.
  - Updated `docs/finance-mcp-requirements-design.md`,
    `docs/MODULES/finance-mcp.md`, and `docs/TEST_MATRIX.md`.
  - Mapping: `类别/子类别` to parent/child categories, `项目` to Finance tags
    plus source fields, blank member to `吴萍`, and only `家庭公用` to
    `is_household=1`.
  - One negative HKD amount was treated as a reversal: negative expense imports
    as income, preserving the original signed amount and raw type in source
    fields.
- Safety:
  - Read-only analysis found 10494 rows, date span 2021-02-01 through
    2026-06-07, currencies CNY and HKD, and no transfer rows.
  - Exact duplicate analysis against the production daily ledger found 0
    pre-existing exact matches.
  - Dry run against production SQLite copy:
    `/tmp/finance-mymoney-import-20260607/finance-dry.sqlite3`.
  - Dry run result: imported 10494 rows, skipped 0, errors 0; source fields
    10494; resulting daily ledger count 22099; only `家庭公用` had
    `is_household=1`.
  - Production backup before import:
    `/Users/hermes-host/HermesMobile/plugins/finance/data/finance.sqlite3.before-mymoney-import-20260607-2208.bak`.
- Production import result:
  - Import batch: `import_cc20d9a9ce346295`.
  - `row_count=10494`, `imported_count=10494`, `skipped_count=0`.
  - `finance_transaction_source_fields` rows for this batch: 10494.
  - `日常账本` active transaction count is now 22099.
  - Daily ledger active sources:
    - `wacai`: 11605.
    - `mymoney`: 10494.
  - Batch aggregate:
    - CNY expense `13778767.11`.
    - HKD expense `233000.37`.
    - CNY income `226632.45`.
    - HKD income `1943.00`.
- Post-import validation:
  - Re-running analyze after production import showed
    `exactDuplicateCount=10494` and `candidateImportCount=0`, proving rerun
    duplicate protection for this file.
  - Production DB checks confirmed batch/source-field counts and that only
    `家庭公用` has `is_household=1` in the target ledger.
  - Runtime service smoke with WuPing ledger context returned summaries for CNY
    and HKD and read transactions from `ledger_43831ef44be451ed`.
  - The local UI HTTP smoke without a WuPing session falls back to the default
    `daily` ledger; it is not valid evidence for this WuPing ledger.
- Production service was not restarted; this was a data import through the
  existing runtime repository/transaction service.
- Mac temp directory `/tmp/finance-mymoney-import-20260607` was removed after
  validation.

## 2026-06-08 Amount Decimal Support Local Update

- User requested that the data structure and bookkeeping flow support two
  decimal places.
- Current data model already stores transaction and recurring amounts as integer
  `amount_minor` with `currency` and `scale`; the local update focused on the
  bookkeeping UI path and durable tests/docs.
- Changed local frontend behavior:
  - Added a `.` key to the fixed custom amount keypad.
  - The amount field remains `readonly` with `inputmode="none"` so it does not
    summon the native iOS/Android keyboard.
  - Amount normalization now allows one decimal point per numeric segment and
    limits fractional input to two digits.
  - Calculator `=` now rounds to cents instead of whole yuan.
  - Static asset version changed to `finance-replica-20260608a` and service
    worker cache to `finance-mcp-pwa-v101`.
- Changed tests/docs:
  - Added `parseAmountToMinor("12.34", "CNY") === 1234` coverage.
  - Updated UI tests for decimal keypad and static version.
  - Updated product/module/test docs with the two-decimal rule.
- This was local development only; Mac production was not deployed in this
  update.

## 2026-06-08 Amount Decimal Support Mac Deployment

- User explicitly requested Mac deployment after local two-decimal amount
  support was committed and pushed.
- Deployed local source state:
  - Branch: `codex/finance-mcp-design`.
  - Commit deployed: `83396a3` (`支持记账金额两位小数`).
  - Static frontend version: `finance-replica-20260608a`.
  - Service worker cache: `finance-mcp-pwa-v101`.
- Command:
  - `npm run deploy:mac`.
- Deployment target:
  - SSH alias: `homeai-macstudio-prod`.
  - Production source: `/Users/hermes-host/HermesMobile/plugins/finance`.
  - Runtime user: `hermes-host`.
  - launchd service: `system/com.hermesmobile.plugin.finance`.
- Deployment script output:
  - Source backup:
    `/Users/hermes-host/HermesMobile/backups/finance-deploy/finance-source-20260608-003617.tar.gz`.
  - SQLite backup:
    `/Users/hermes-host/HermesMobile/plugins/finance/data/finance.sqlite3.before-mac-deploy-20260608-003617.bak`.
  - Image SQLite backup:
    `/Users/hermes-host/HermesMobile/plugins/finance/data/finance-images.sqlite3.before-mac-deploy-20260608-003617.bak`.
  - The deploy script reported one transient `curl` failure to
    `127.0.0.1:8791` during the restart window, then completed with exit code
    0 after remote focused UI tests and version checks.
- Post-deploy validation:
  - `GET http://127.0.0.1:8791/api/finance/client-version` returned `ok:true`.
  - `GET http://127.0.0.1:8791/finance.html` contained
    `finance-replica-20260608a`.
  - `GET http://127.0.0.1:8791/service-worker.js` contained
    `finance-mcp-pwa-v101`.
  - `GET http://127.0.0.1:8791/api/finance/overview` returned `ok:true` and
    daily ledger metadata.
  - `launchctl print system/com.hermesmobile.plugin.finance` showed
    `state = running`, `last exit code = 0`, pid `6312`.
- Gateway-side Finance MCP wrapper was not changed by this deployment; this was
  a Finance service/frontend deployment.

## 2026-06-08 Entry Note Button UI Local Update

- User requested a bookkeeping UI change:
  - Remove the always-visible inline note input from the entry page.
  - Add a `备注` button in the entry meta strip before the camera button.
  - Tapping `备注` opens a bottom note input sheet; `完成` writes back to the
    hidden `note` field.
  - Simplify the visible date control to fixed text `日期`; the page no longer
    shows the current date/time in that chip.
- Local frontend changes:
  - Replaced the inline note row with hidden `note` storage plus the `备注`
    meta button.
  - Added a `data-entry-note-overlay` sheet and included it in overlay lock,
    back handling, Hermes navigation state, and delayed client-reload
    protection.
  - Changed the visual probe and desktop PWA harness to validate the new note
    button path instead of the removed inline note row.
  - Static frontend version changed to `finance-replica-20260608d`; service
    worker cache changed to `finance-mcp-pwa-v104`.
  - Follow-up after physical-device screenshot `IMG_5870.jpg`:
    - after comparing Codex Mobile Web's `viewport-metrics` / composer model,
      Finance now derives `--finance-app-height` from
      `visualViewport.height + visualViewport.offsetTop` while the note editor
      has keyboard focus, shrinks the note overlay to that visible work area,
      and anchors the note sheet to the overlay bottom instead of calculating a
      fixed top position;
    - the meta strip is tightened so `日期` starts farther left and `标签` is
      less likely to be covered by the sticky camera region;
    - the camera button icon is centered in the 32px chip and uses the Wacai
      orange accent color.
- Focused validation completed:
  - `node --check public\app-finance-ui.js`
  - `node --check scripts\capture-desktop-pwa.js`
  - `node --test tests\app-finance-ui.test.js`
  - `npm run check`
  - `npm test` passed 149 tests.
  - `npm run verify:pwa:desktop` passed at 591x812 desktop mobile viewport:
    four full quick-category rows before the meta row, `备注` before the camera
    button, camera pinned right, and the simulated 320px-keyboard note focus
    layout kept the overlay height equal to the visible work area and the sheet
    above the keyboard with `scrollY=0`. Screenshot was written under ignored
    `data\finance-pwa-screenshots\`.
  - `git diff --check` returned exit code 0 with line-ending warnings for
    `docs/MODULES/finance-mcp.md` and `public/service-worker.js`.
- Windows local Finance service was restarted after the static update:
  - Old PID from `data\finance-server.pid`: `19904`.
  - New listener: `0.0.0.0:8791`, PID `43020`.
  - Smoke confirmed `/api/finance/client-version` returned `ok:true`,
    `/finance.html` contained `finance-replica-20260608d`, and
    `/service-worker.js` contained `finance-mcp-pwa-v104`.
- This is a local development update only so far; Mac production has not been
  redeployed for `finance-replica-20260608d` in this run.

## 2026-06-08 Entry Note Embedded Plugin Viewport Follow-up

- User requested Mac deployment for the `finance-replica-20260608d` note-button
  update. Deployment command `npm run deploy:mac` completed with exit code 0
  and deployed `finance-replica-20260608d` / `finance-mcp-pwa-v104`.
  - Source backup:
    `/Users/hermes-host/HermesMobile/backups/finance-deploy/finance-source-20260608-104749.tar.gz`.
  - SQLite backup:
    `/Users/hermes-host/HermesMobile/plugins/finance/data/finance.sqlite3.before-mac-deploy-20260608-104749.bak`.
  - Image SQLite backup:
    `/Users/hermes-host/HermesMobile/plugins/finance/data/finance-images.sqlite3.before-mac-deploy-20260608-104749.bak`.
  - Independent Mac smoke confirmed `/api/finance/client-version` returned
    `ok:true`, `/finance.html` contained `finance-replica-20260608d`,
    `/service-worker.js` contained `finance-mcp-pwa-v104`,
    `/api/finance/overview` returned `ok:true`, and launchd showed
    `state = running`, `last exit code = 0`, pid `7571`.
- User then reported that the independent Finance page was correct, but the
  Home AI plugin iframe still had the note-input keyboard problem.
- Root cause found in the local contracts:
  - Home AI host has its own `keyboard-viewport-active` app-height model for
    host composer focus.
  - Finance standalone can use child `visualViewport`, but an embedded iframe
    can see a stale iframe-local `100dvh` while the native keyboard belongs to
    the Home AI host viewport.
- Local frontend fix:
  - Static frontend version changed to `finance-replica-20260608e`; service
    worker cache changed to `finance-mcp-pwa-v105`.
  - In `?embed=hermes`, Finance now tries to derive the iframe-visible work
    area from same-origin `window.parent.visualViewport` and
    `window.frameElement.getBoundingClientRect()`, stores it in
    `--finance-app-height`, and falls back to iframe-local viewport only when
    the parent is unreadable.
  - Embedded note overlay fallback is `100%` instead of `100dvh`, so iframe
    mode does not use browser-window viewport units when the app-height var is
    missing.
- Local validation completed before Mac redeploy:
  - `node --check public\app-finance-ui.js`
  - `node --check scripts\capture-desktop-pwa.js`
  - `node --test tests\app-finance-ui.test.js`
  - `npm run verify:pwa:desktop`
  - `npm run check`
  - `npm test` passed 149 tests.
  - `git diff --check` returned exit code 0 with line-ending warnings for
    `docs/MODULES/finance-mcp.md` and `public/service-worker.js`.
  - A local same-origin iframe smoke using the Agent Playwright dependency set
    the parent `visualViewport.height` to `492px` while the Finance iframe
    remained `812px`; Finance wrote `--finance-app-height: 492px`, overlay
    height was `492px`, note sheet bottom was `482px`, and `scrollY=0`.
- Windows local Finance service was restarted after the static update:
  - New listener: `0.0.0.0:8791`, PID `23876`.
  - Smoke confirmed `/api/finance/client-version` returned `ok:true`,
    `/finance.html` contained `finance-replica-20260608e`, and
    `/service-worker.js` contained `finance-mcp-pwa-v105`.

## 2026-06-08 Entry Note Host Viewport Bridge Consumer

- Home AI host added an embedded plugin viewport bridge in static client
  `20260608-plugin-viewport-bridge-v619`. The host posts bounded
  `hermes.plugin.viewport` messages to the active embedded plugin iframe after
  iframe attach/load/render and after host keyboard/viewport/footer
  recalculation.
- Finance local code now treats `hermes.plugin.viewport` as the preferred
  embedded keyboard/viewport source. In `?embed=hermes`, note-sheet layout first
  consumes host `viewport`, `keyboard`, and `iframe` metrics, then falls back to
  same-origin `window.parent.visualViewport + window.frameElement` bounds, then
  iframe-local `visualViewport`.
- Finance ignores host viewport messages for other plugin ids and only stores
  bounded layout metadata. The message does not carry workspace keys, launch
  tokens, cookies, transaction data, or route URLs.
- Static frontend version changed to `finance-replica-20260608f`; service worker
  cache changed to `finance-mcp-pwa-v106`.
- Embedded manifest/launch redirect versioning now resolves from current
  `public/finance.html` script/style query string instead of a stale hard-coded
  manifest constant. This is required because Home AI iframe/cache lifecycle can
  otherwise keep loading an older Finance shell after frontend deployment.
- Local validation completed:
  - `node --check public\app-finance-ui.js`
  - `node --check scripts\capture-desktop-pwa.js`
  - `node --test tests\app-finance-ui.test.js`
  - `node --check adapters\finance-hermes-embedded-plugin-service.js`
  - `node --check adapters\finance-runtime.js`
  - `node --check server.js`
  - `node --test tests\finance-hermes-embedded-plugin-service.test.js tests\finance-server.test.js tests\app-finance-ui.test.js`
  - `powershell.exe -NoProfile -Command "$null = [scriptblock]::Create([IO.File]::ReadAllText('scripts\deploy-mac-finance.ps1'))"`
  - `powershell.exe -NoProfile -Command "$null = [scriptblock]::Create([IO.File]::ReadAllText('scripts\nas-finance-hot-restart.ps1'))"`
  - `node tests\finance-nas-hot-restart-script.test.js`
  - `npm run verify:pwa:desktop` passed at 591x812 desktop mobile viewport;
    simulated 320px-keyboard note focus kept overlay height at the visible
    work area, sheet bottom above the keyboard, and `scrollY=0`.
  - A local iframe smoke using the Agent Playwright dependency posted a
    synthetic `hermes.plugin.viewport` message to the Finance iframe. Finance
    wrote `--finance-app-height: 492px`, `--finance-keyboard-bottom: 320px`;
    overlay height was `492px`, note sheet bottom was `482px`, and `scrollY=0`.
  - `npm run check`
  - `npm test` passed 149 tests on rerun with a longer timeout.
  - `git diff --check` returned exit code 0 with line-ending warnings for
    `docs/MODULES/finance-mcp.md` and `public/service-worker.js`.
- Windows local service:
  - Listener: `0.0.0.0:8791`, PID `43564`.
  - Smoke confirmed manifest entry, `/finance.html`, and `/service-worker.js`
    all contain `finance-replica-20260608f` / `finance-mcp-pwa-v106`.
- Mac production deployment:
  - User explicitly requested Mac deployment after reporting the plugin-only
    issue.
  - `npm run deploy:mac` completed with exit code 0. A transient `curl` failure
    occurred during the launchd restart window before the script completed its
    remote checks.
  - Source backup:
    `/Users/hermes-host/HermesMobile/backups/finance-deploy/finance-source-20260608-111427.tar.gz`.
  - SQLite backup:
    `/Users/hermes-host/HermesMobile/plugins/finance/data/finance.sqlite3.before-mac-deploy-20260608-111427.bak`.
  - Image SQLite backup:
    `/Users/hermes-host/HermesMobile/plugins/finance/data/finance-images.sqlite3.before-mac-deploy-20260608-111427.bak`.
  - Remote smoke confirmed `/api/finance/client-version` returned `ok:true`,
    `/finance.html` contains `finance-replica-20260608f`,
    `/service-worker.js` contains `finance-mcp-pwa-v106`, the embedded plugin
    manifest entry is
    `/finance.html?embed=hermes&v=finance-replica-20260608f`, and
    `/api/finance/overview` returned HTTP `200`.
  - `launchctl print system/com.hermesmobile.plugin.finance` showed
    `state = running`, `last exit code = 0`, pid `8090`.

## 2026-06-08 Entry Note Host Scroll Finalization

- User clarified that the Home AI host viewport payload is for bottom-tab/footer
  reservation, not the system input method panel. Finance now treats the host
  `hermes.plugin.viewport` payload as embedded host geometry and diagnostics,
  while native note/amount keyboard positioning is derived from Finance's own
  local viewport state.
- Current Finance static frontend version: `finance-replica-20260608l`.
  Current service-worker cache: `finance-mcp-pwa-v112`.
- Finance local changes in this batch:
  - note/amount keyboard layout ignores Home AI host keyboard metrics for
    native system keyboard positioning;
  - Finance keeps local `visualViewport` and iframe `scrollY` fallbacks for
    note sheet positioning;
  - embedded manifest/launch version resolution continues to use the current
    script/style version from `public/finance.html`;
  - docs clarify that Home AI footer geometry is not raw system keyboard state.
- Focused validation completed:
  - `node --check public\app-finance-ui.js`
  - `node --test tests\app-finance-ui.test.js tests\finance-hermes-embedded-plugin-service.test.js tests\finance-server.test.js`
  - `npm test`
  - `npm run check`
  - `git diff --check`
- Windows Finance local service is deployed at `0.0.0.0:8791` and smoke
  confirmed `/finance.html`, `/service-worker.js`, and manifest output contain
  `finance-replica-20260608l` / `finance-mcp-pwa-v112`.
- Mac Finance production deployment completed with `npm run deploy:mac`.
  Backup paths:
  - `/Users/hermes-host/HermesMobile/backups/finance-deploy/finance-source-20260608-124503.tar.gz`
  - `/Users/hermes-host/HermesMobile/plugins/finance/data/finance.sqlite3.before-mac-deploy-20260608-124503.bak`
  - `/Users/hermes-host/HermesMobile/plugins/finance/data/finance-images.sqlite3.before-mac-deploy-20260608-124503.bak`
- Mac Finance smoke confirmed `/finance.html` contains
  `finance-replica-20260608l`, `/service-worker.js` contains
  `finance-mcp-pwa-v112`, `/api/finance/overview` returned HTTP `200`, and
  launchd showed the Finance plugin service running.
- Home AI host follow-up was required for the remaining "first entry pushed too
  high, app foreground fixes it" plugin symptom. Home AI static client
  `20260608-plugin-host-scroll-v622` now resets host page scroll before plugin
  viewport broadcasts, on app foreground, and on host `window` `scroll`.
- Appium iOS Simulator visual evidence against Mac Home AI + Finance production
  passed at:
  `/Users/xuxin/.homeai-qa/artifacts/finance-embedded-note-v622-l`.
  Local screenshot copies:
  `C:\Users\xuxin\AppData\Local\Temp\finance-note-appium-v622-l.png` and
  `C:\Users\xuxin\AppData\Local\Temp\finance-note-simctl-v622-l.png`.
  Bounded result: Home AI `20260608-plugin-host-scroll-v622`, Finance
  `finance-replica-20260608l`, note editor focused, iframe `scrollY=0`,
  iframe document `docTop=0`, and note sheet inside the visible overlay.

## 2026-06-08 Decimal Amount Display And Detail Attachments

- User reported that decimal amounts could be entered and stored, but displayed
  as integers. Finance frontend now formats amounts from `amount` + `scale`, or
  from `amountMinor` + `scale` as fallback, and preserves non-zero fractional
  minor units in transaction rows, detail rows, recurring rows, report rows,
  compact report rows, and edit/copy amount prefill.
- Service projections now expose `scale` for public transactions and report
  breakdown rows, so UI/API clients do not have to infer display scale.
- User also requested direct attachment upload from the bill detail page.
  Transaction detail now shows an `添加` attachment button, reuses the existing
  camera/photo/file action sheet, uploads selected files directly through
  `POST /api/finance/attachments`, refreshes the detail attachment list, and
  reloads overview state for row attachment badges.
- Current Finance static frontend version: `finance-replica-20260608n`.
  Current service-worker cache: `finance-mcp-pwa-v114`.
- Documentation updated:
  - `docs/finance-mcp-requirements-design.md`
  - `docs/MODULES/finance-mcp.md`
  - `docs/TEST_MATRIX.md`
  - `docs/IMPLEMENTATION_NOTES/harness-required-matrix.md`
- Validation completed:
  - `node --check public\app-finance-ui.js`
  - `node --check adapters\finance-report-service.js`
  - `node --check adapters\finance-transaction-service.js`
  - `node --test tests\finance-transaction-service.test.js tests\finance-report-service.test.js tests\app-finance-ui.test.js tests\finance-server.test.js tests\finance-transaction-attachment-service.test.js tests\finance-hermes-embedded-plugin-service.test.js`
  - `npm run check`
  - `git diff --check` returned exit code 0 with existing CRLF warnings for
    `docs/MODULES/finance-mcp.md` and `public/service-worker.js`.
  - `npm test` passed 149 tests.
  - `npm run verify:pwa:desktop` passed and reported the real probe assets as
    `finance-replica-20260608n` / `finance-mcp-pwa-v114`.
  - A CDP detail-page smoke opened the local Finance UI, clicked the first
    transaction, confirmed `transaction-detail`, confirmed the `添加` attachment
    button exists and is enabled, and saved screenshot
    `data\finance-pwa-screenshots\desktop-detail-attachment-1780912200108.png`.
  - Home AI platform checker passed:
    `node scripts\plugin-workspace-platform-contract-check.js --plugin finance --json`.
- Windows local service:
  - Restarted Finance backend so service-side `scale` projection changes are
    live. Listener: `0.0.0.0:8791`, PID `6472`.
  - Smoke confirmed `/finance.html` contains `finance-replica-20260608n`,
    `/service-worker.js` contains `finance-mcp-pwa-v114`, and
    `/api/finance/overview?limit=1` returns `scale: 2` plus amount strings.
- Mac production deployment:
  - `npm run deploy:mac` completed with exit code 0. A transient curl failure
    occurred during the launchd restart window before the script completed.
  - Source backup:
    `/Users/hermes-host/HermesMobile/backups/finance-deploy/finance-source-20260608-175338.tar.gz`.
  - SQLite backup:
    `/Users/hermes-host/HermesMobile/plugins/finance/data/finance.sqlite3.before-mac-deploy-20260608-175338.bak`.
  - Image SQLite backup:
    `/Users/hermes-host/HermesMobile/plugins/finance/data/finance-images.sqlite3.before-mac-deploy-20260608-175338.bak`.
  - Remote smoke confirmed `/finance.html` contains
    `finance-replica-20260608n`, `/service-worker.js` contains
    `finance-mcp-pwa-v114`, `/api/finance/overview?limit=1` returns `scale: 2`
    plus amount strings, and launchd shows
    `system/com.hermesmobile.plugin.finance` running with last exit code `0`.
- Appium/iOS Simulator:
  - Appium server was already running at `http://127.0.0.1:4723`.
  - Booted simulator `HomeAI iPhone 17 Pro`
    `C2EB6D31-F485-4DAE-BFB4-25E27FC65389`.
  - Appium smoke remained blocked before page load with
    `RBSRequestErrorDomain Code=5` / `OSLaunchdErrorDomain Code=125`
    "Launch failed"; this is a Simulator/XCUITest launch-layer failure, not a
    Finance HTTP or static-version failure. Desktop CDP and production smoke
    remain the current visual/runtime evidence for this batch.

## 2026-06-09 Bookkeeping Calculator Edge Gutter Local Update

- User reported the bookkeeping calculator's left numeric column (`1/4/7`) was
  too close to the screen edge and hard to tap.
- Local frontend fix: `.wacai-keypad` keeps the full-width fixed background but
  adds left/right safe touch gutters using
  `--entry-keypad-side-gutter: max(12px, env(safe-area-inset-left))` and
  `--entry-keypad-end-gutter: max(12px, env(safe-area-inset-right))`.
- Static frontend assets are `finance-replica-20260609a`; service worker cache
  is `finance-mcp-pwa-v115`.
- AI Ops v2 intake was run; it classified the task narrowly as H3, but this
  change was treated as H2 mobile layout because it affects touchability.
- Validation completed:
  - `node --check public\app-finance-ui.js`
  - `node --check public\service-worker.js`
  - `node --check tests\app-finance-ui.test.js`
  - `node --check adapters\finance-hermes-embedded-plugin-service.js`
  - `node tests\app-finance-ui.test.js`
  - `node tests\finance-hermes-embedded-plugin-service.test.js`
  - `npm run check`
  - `npm test` passed 149 tests.
  - `git diff --check`
  - Home AI architecture map guard:
    `node tests\architecture-code-test-harness-map.test.js`
  - `npm run verify:pwa:desktop` passed against the old 8791 runtime only as a
    historical-data smoke; the current checkout was then started on
    `http://127.0.0.1:8792/finance.html`, which served
    `finance-replica-20260609a` / `finance-mcp-pwa-v115`.
- Focused CDP measurement on 8792 confirmed the `1`, `4`, and `7` keypad
  buttons each start at `left=12px`, with keypad left/right padding `12px`.
- Superseded by the `finance-replica-20260609b` Mac production deployment
  below.

## 2026-06-09 Dark PWA Resume Anti-Flash Local Update

- User reported that in dark mode, switching to another app and returning to
  Finance showed a white flash.
- Root cause addressed locally: the PWA manifests still used light
  `background_color: "#f3f3f6"`, and the HTML shell had no pre-CSS dark
  background fallback before the external stylesheet repainted.
- Local frontend fix:
  - `public/finance.html` now includes a minimal inline
    `finance-anti-flash` style before the bootstrap script and external CSS.
  - `public/manifest.json` and `public/manifest.webmanifest` now use
    `background_color: "#000000"` to match the dark default launch/resume
    canvas.
  - Static frontend assets are `finance-replica-20260609b`; service worker
    cache is `finance-mcp-pwa-v116`.
- Validation completed:
  - `node --check public\app-finance-ui.js`
  - `node --check public\service-worker.js`
  - `node --check tests\app-finance-ui.test.js`
  - `node --check adapters\finance-hermes-embedded-plugin-service.js`
  - `node tests\app-finance-ui.test.js`
  - `node tests\finance-hermes-embedded-plugin-service.test.js`
  - `npm run check`
  - `npm test` passed 149 tests.
  - Static smoke on `http://127.0.0.1:8792/finance.html` confirmed
    `finance-anti-flash`, `finance-replica-20260609b`, manifest
    `background_color: "#000000"`, and `finance-mcp-pwa-v116`.
  - Focused Chrome CDP smoke on 8792 confirmed dark mode with
    `htmlBackground=rgb(0, 0, 0)`, `bodyBackground=rgb(0, 0, 0)`,
    `colorScheme=dark`, `metaThemeColor=#000000`, and service worker
    `finance-mcp-pwa-v116`.
- Mac production deployed through the Home AI central deploy path:
  - Command:
    `cd /Users/hermes-dev/HermesMobileDev/app && npm run --silent deploy:macos -- --plugin finance --source /Users/hermes-dev/HermesMobileDev/plugins/finance --restart-label com.hermesmobile.plugin.finance --health-url http://127.0.0.1:8791/api/finance/client-version --allow-dirty --reason finance-dark-keypad-20260609 --execute --password-file "$HOMEAI_MAC_SUDO_PASSWORD_FILE" --json`
  - Production path:
    `/Users/hermes-host/HermesMobile/plugins/finance`.
  - Backup path:
    `/Users/hermes-host/HermesMobile/backups/deploy/20260609T141459Z-plugin-finance-finance-dark-keypad-20260609`.
  - Launchd validation passed for `system/com.hermesmobile.plugin.finance`;
    the service restarted with pid `80990`.
  - Health validation passed on retry 2:
    `http://127.0.0.1:8791/api/finance/client-version` returned `ok=true`.
  - Production file smoke confirmed:
    `finance-anti-flash`, `finance-replica-20260609b`,
    manifest `background_color: "#000000"`, manifest `theme_color: "#000000"`,
    service worker `finance-mcp-pwa-v116`, and the keypad side gutter CSS are
    present under `/Users/hermes-host/HermesMobile/plugins/finance/public`.
  - AI Ops lane allocated for deployment validation:
    `ios-pwa-1` / `lane-e84e0bf4-ee0f-42d2-8da3-240306285350`.
  - Additional deployment-turn validation:
    `npm test` passed 149 tests; Home AI iOS live debug server harness, iOS
    visual harness, production status smoke harness, architecture map guard, and
    `git diff --check` passed. Home AI
    `tests/macos-production-deploy-script.test.js` was blocked by the intended
    dirty finance deploy source because it asserts a later unsafe-plugin guard
    that is only reachable with a clean plugin tree.

## 2026-06-10 Owner Asset Snapshot MCP Update

- User requested an Owner-only `资产` surface backed by the uploaded owner asset workbook. Durable access rule: Owner asset snapshots are available only to `user_xuxin` Owner-authenticated contexts; non-Owner contexts must fail closed with `finance_owner_assets_owner_required`.
- Added SQLite schema version `12` tables:
  - `finance_owner_asset_snapshots` for annual owner asset snapshots, USD/CNY FX rate, USD investment year, annual return, CAGR, total return multiple, and CNY total assets.
  - `finance_owner_asset_components` for structured components such as USD account, CNY bank balance, securities, trust, domestic total, and other investment.
- Added `adapters/finance-owner-asset-service.js` and MCP tools:
  - `finance.upsert_owner_asset_snapshot`
  - `finance.list_owner_asset_snapshots`
  - `finance.get_owner_asset_summary`
- Added `scripts/import-owner-asset-xlsx.js` for the owner asset workbook. The script parses the workbook into structured snapshots/components and prints only bounded aggregate evidence.
- Imported the uploaded workbook into the local development DB: 21 annual snapshots, covering 2006 through 2026. Do not copy the raw workbook rows or full asset values into docs, handoff, logs, or fixtures.
- Validation so far:
  - `node --check adapters/finance-repository.js`
  - `node --check adapters/finance-owner-asset-service.js`
  - `node --check adapters/finance-runtime.js`
  - `node --check mcp/finance-tool-contract.js`
  - `node --check mcp/finance-mcp-dispatcher.js`
  - `node --check mcp/dispatchers/finance-owner-asset-dispatcher.js`
  - `node --check scripts/import-owner-asset-xlsx.js`
  - `node tests/finance-owner-asset-service.test.js` passed 3 tests.
  - MCP smoke against local DB confirmed latest year coverage and non-Owner denial without printing raw asset rows.
  - `node scripts/finance-platform-contract-smoke.js --home-ai-root /Users/hermes-dev/HermesMobileDev/app --require-tool finance.upsert_owner_asset_snapshot --require-tool finance.list_owner_asset_snapshots --require-tool finance.get_owner_asset_summary --json` passed with Home AI platform contract `20260609-v2`.
  - `npm run check` passed.
  - `npm test` passed 152 tests.

## 2026-06-10 Owner Asset Tab Local Update

- User requested adding the visible Owner-only `资产` tab and deploying after
  first committing the work.
- Local UI/API update:
  - `/api/finance/overview` now includes `ownerAssetSummary` only when the
    current context can read Owner assets; non-Owner contexts keep overview
    usable with `ownerAssetSummary: null`.
  - Direct `GET /api/finance/owner-assets/summary` and
    `GET /api/finance/owner-assets/snapshots` remain Owner-only and fail closed
    through `finance-owner-asset-service`.
  - `public/finance.html` now contains an `assets` view and a default-hidden
    `资产` bottom tab.
  - `public/app-finance-ui.js` shows the tab only after overview returns an
    Owner asset summary, then renders latest total assets, USD CAGR, annual
    return, total return multiple, and component rows.
  - Static frontend assets are `finance-replica-20260610a`; service worker
    cache is `finance-mcp-pwa-v117`.
- Focused validation completed:
  - `node --check public/app-finance-ui.js`
  - `node --check server-routes/finance-api-routes.js`
  - `node tests/app-finance-ui.test.js`
  - `node tests/finance-server.test.js`
  - H1 focused MCP/asset/platform checks passed:
    `node tests/finance-owner-asset-service.test.js`,
    `node tests/finance-mcp-server.test.js`,
    `node tests/finance-tool-contract.test.js`,
    `node tests/architecture-boundary.test.js`,
    `node tests/privacy-scan.test.js`, and
    `node scripts/finance-platform-contract-smoke.js --home-ai-root /Users/hermes-dev/HermesMobileDev/app --require-tool finance.upsert_owner_asset_snapshot --require-tool finance.list_owner_asset_snapshots --require-tool finance.get_owner_asset_summary --json`.
  - `npm run check` passed.
  - `npm test` passed 153 tests.
  - `git diff --check` passed.
- Next required order from user: commit first, then deploy production.
- Commit before deploy completed:
  `76564fa add owner asset summary tab`.
- Mac production deployed through the Home AI central deploy path:
  - Command:
    `cd /Users/hermes-dev/HermesMobileDev/app && npm run --silent deploy:macos -- --plugin finance --source /Users/hermes-dev/HermesMobileDev/plugins/finance --restart-label com.hermesmobile.plugin.finance --health-url http://127.0.0.1:8791/api/finance/client-version --reason finance-owner-assets-20260610 --execute --password-file "$HOMEAI_MAC_SUDO_PASSWORD_FILE" --json`
  - Production path:
    `/Users/hermes-host/HermesMobile/plugins/finance`.
  - Backup path:
    `/Users/hermes-host/HermesMobile/backups/deploy/20260610T040351Z-plugin-finance-finance-owner-assets-20260610`.
  - Launchd validation passed for `system/com.hermesmobile.plugin.finance`;
    the service restarted with pid `32444`.
  - Health validation passed on retry 2:
    `http://127.0.0.1:8791/api/finance/client-version` returned `ok=true`.
- Production owner asset import completed after deploy using `hermes-host`
  identity against
  `/Users/hermes-host/HermesMobile/plugins/finance/data/finance.sqlite3`.
  Bounded result: 21 annual snapshots imported, covering 2006 through 2026.
- Production smoke confirmed:
  - `/api/finance/owner-assets/summary` returned `ok=true` with latest year
    2026 and `history_count=21`.
  - `/api/finance/overview` includes `ownerAssetSummary` for the Owner context.
  - Production static files contain `finance-replica-20260610a`, assets view,
    hidden Owner asset nav, and service worker `finance-mcp-pwa-v117`.

## 2026-06-10 Owner Asset Year Selector Update

- User confirmed the Owner-only `资产` page can show the 2026 snapshot and
  requested a yearly selector so the page can jump to any annual snapshot.
- Local update:
  - `finance-owner-asset-service.getSummary()` now returns bounded
    `snapshots` alongside `latest`, so the Owner UI can render annual choices
    without a second request.
  - `public/app-finance-ui.js` defaults the asset page to the latest year,
    renders a horizontal yearly selector for returned snapshots, and switches
    the total, USD return metrics, and component list when a year is selected.
  - Static frontend assets are `finance-replica-20260610b`; service worker
    cache is `finance-mcp-pwa-v118`.
  - Owner-only access rules are unchanged: non-Owner overview responses omit
    `ownerAssetSummary`, and direct asset endpoints fail closed.
- Validation completed:
  - `node --check adapters/finance-owner-asset-service.js`
  - `node --check public/app-finance-ui.js`
  - `node tests/finance-owner-asset-service.test.js`
  - `node tests/app-finance-ui.test.js`
  - `node tests/finance-server.test.js`
  - `npm run check`
  - `npm test` passed 153 tests.
  - `git diff --check`
  - Local HTTP smoke on `127.0.0.1:8792` using the development DB confirmed
    21 annual snapshots, covering 2006 through 2026, plus the new static and
    service-worker versions.
- Next required order if deploying: commit this change first, then deploy via
  the Home AI central Mac deploy path.
- Commit before deploy completed:
  `51f18a9 add owner asset year selector`.
- Mac production deployed through the Home AI central deploy path:
  - Command:
    `cd /Users/hermes-dev/HermesMobileDev/app && npm run --silent deploy:macos -- --plugin finance --source /Users/hermes-dev/HermesMobileDev/plugins/finance --restart-label com.hermesmobile.plugin.finance --health-url http://127.0.0.1:8791/api/finance/client-version --reason finance-owner-assets-year-selector-20260610 --execute --password-file "$HOMEAI_MAC_SUDO_PASSWORD_FILE" --json`
  - Production path:
    `/Users/hermes-host/HermesMobile/plugins/finance`.
  - Backup path:
    `/Users/hermes-host/HermesMobile/backups/deploy/20260610T042212Z-plugin-finance-finance-owner-assets-year-selector-20260610`.
  - Launchd validation passed for `system/com.hermesmobile.plugin.finance`;
    the service restarted with pid `37409`.
  - Health validation passed on retry 2:
    `http://127.0.0.1:8791/api/finance/client-version` returned `ok=true`.
- Production smoke confirmed:
  - `/api/finance/owner-assets/summary` returned `ok=true` with
    `history_count=21`, 21 bounded snapshots, and coverage from 2006 through
    2026.
  - `/api/finance/overview` includes Owner asset summary with 21 bounded
    snapshots for the Owner context.
  - Production static files contain `finance-replica-20260610b`,
    `data-asset-year-list`, Owner asset nav, and service worker
    `finance-mcp-pwa-v118`.
- AI Ops evidence ledger:
  - `evidence-d9dca77a-4ac0-4169-ac3f-70bcfed7d663` for tests.
  - `evidence-becf77d0-7b29-44b6-8f61-d229c229df19` for deploy.

## 2026-06-10 Owner Asset Import Grouped-Year Fix

- User reported many historical Owner asset years showed zero totals or wrong
  data after the year selector deployment, and clarified that USD asset source
  accounts changed over time while each year still has a workbook total.
- Root cause: `scripts/import-owner-asset-xlsx.js` read values from the year
  header column only. The workbook uses grouped year columns, and for many
  years the actual FX rate, USD total, return metrics, and RMB total asset
  values live inside the year group rather than in the header column.
- Secondary root cause: component creation treated missing cells as zero,
  causing missing historical component rows to appear as zero-value components.
- Local fix:
  - Importer now finds annual groups from row 1 and reads the last numeric
    value inside each annual group for FX, USD total, domestic total, total
    assets, annual return, CAGR, and total return multiple.
  - Missing component rows are omitted instead of persisted as 0 components.
  - Added `tests/finance-owner-asset-import.test.js` to cover grouped-year
    import and missing-component omission.
- Local data was re-imported from the uploaded workbook using the fixed
  importer. Bounded verification: 21 snapshots covering 2006 through 2026, all
  with non-zero total assets and annual FX present.
- Commit before deploy completed:
  `8e6f01e fix owner asset grouped year import`.
- Mac production deployed through the Home AI central deploy path:
  - Command:
    `cd /Users/hermes-dev/HermesMobileDev/app && npm run --silent deploy:macos -- --plugin finance --source /Users/hermes-dev/HermesMobileDev/plugins/finance --restart-label com.hermesmobile.plugin.finance --health-url http://127.0.0.1:8791/api/finance/client-version --reason finance-owner-assets-grouped-import-fix-20260610 --execute --password-file "$HOMEAI_MAC_SUDO_PASSWORD_FILE" --json`
  - Source commit: `8e6f01e`.
  - Backup path:
    `/Users/hermes-host/HermesMobile/backups/deploy/20260610T043118Z-plugin-finance-finance-owner-assets-grouped-import-fix-20260610`.
  - Launchd validation passed for `system/com.hermesmobile.plugin.finance`;
    the service restarted with pid `40345`.
  - Health validation passed on retry 2.
- Production DB backup before data repair:
  `/Users/hermes-host/HermesMobile/plugins/finance/data/finance.sqlite3.before-owner-assets-grouped-fix-20260610T0431.bak`;
  backup `PRAGMA quick_check` returned `ok`.
- Production owner asset workbook was re-imported using the fixed production
  script as `hermes-host`. Bounded production smoke: 21 snapshots covering 2006
  through 2026, no zero-total years, no missing-FX years, and production DB
  `PRAGMA quick_check` returned `ok`.
- Temporary copied workbook under `/private/tmp` was removed after import.
- AI Ops evidence ledger:
  - `evidence-cef70258-94ad-4635-ad69-a417f5afbb83` for tests and bounded smoke.
  - `evidence-225ce19e-d1f1-496e-8805-65fea5da9170` for deploy and production
    data repair.

## 2026-06-10 Owner Asset UI Currency and Year Ordering Fix

- User clarified Owner asset total should display USD assets plus RMB assets in
  RMB units, year selector should keep the selected year in view, and the year
  selector should start from the newest year such as 2026.
- Investigation confirmed historical totals are stored in RMB terms after the
  grouped-year import repair. User clarified USD component rows should continue
  to display USD original currency; only the headline total is RMB.
- Local UI update:
  - Asset hero label is now `人民币总资产`.
  - Component row amounts are displayed in their component currency; USD source
    components show USD, while the headline total remains RMB.
  - Year selector is ordered newest to oldest and scrolls the active year into
    view after selection so choosing an older year does not leave the selector
    visually reset to the front.
  - Static frontend assets are `finance-replica-20260610c`; service worker
    cache is `finance-mcp-pwa-v119`.
- Commit before deploy completed:
  `e4f2473 fix owner asset year UI display`.
- Mac production deployed through the Home AI central deploy path:
  - Command:
    `cd /Users/hermes-dev/HermesMobileDev/app && npm run --silent deploy:macos -- --plugin finance --source /Users/hermes-dev/HermesMobileDev/plugins/finance --restart-label com.hermesmobile.plugin.finance --health-url http://127.0.0.1:8791/api/finance/client-version --reason finance-owner-assets-year-ui-display-20260610 --execute --password-file "$HOMEAI_MAC_SUDO_PASSWORD_FILE" --json`
  - Source commit: `e4f2473`.
  - Backup path:
    `/Users/hermes-host/HermesMobile/backups/deploy/20260610T051617Z-plugin-finance-finance-owner-assets-year-ui-display-20260610`.
  - Launchd validation passed for `system/com.hermesmobile.plugin.finance`;
    the service restarted with pid `50194`.
  - Health validation passed on retry 2.
- Production smoke confirmed static version `finance-replica-20260610c`,
  service worker `finance-mcp-pwa-v119`, newest-first year sorting in JS,
  selected-year `scrollIntoView`, headline `人民币总资产`, and USD component
  original-currency display helper. Asset summary still reports 21 snapshots,
  no zero-total years, and no missing-FX years.
- AI Ops evidence ledger:
  - `evidence-ab7a2cf7-31e9-470f-b39d-48c470ee36ee` for tests and production
    smoke.
  - `evidence-4e86f055-f135-49cd-9a89-8d1b6f78b050` for deploy.

## 2026-06-10 Owner Asset MCP Gateway Closure Follow-up

- User reported Home AI could not find the Owner asset MCP interface and
  challenged whether the central MCP upgrade closure was followed.
- Finding: Finance service schema contains the Owner asset local tools, but the
  legacy Hermes Gateway plugin bridge fetched `/api/finance/mcp/schemas`
  without workspace-local request headers. Because the Finance bridge correctly
  requires workspace id/key for schema and dispatch, Gateway callable schema
  could miss `mcp_finance_get_owner_asset_summary`,
  `mcp_finance_list_owner_asset_snapshots`, and
  `mcp_finance_upsert_owner_asset_snapshot`.
- Local fix: `gateway-plugins/hermes-mobile-finance/__init__.py` now loads the
  workspace identity before schema registration and sends workspace id/key
  headers for both schema reads and dispatch calls. Tool arguments still strip
  key/token/cookie/workspace override fields before dispatch.
- Tests updated: `tests/finance-hermes-plugin.test.js` asserts the schema
  request context uses the workspace-local identity. Finance MCP docs and test
  matrix now record that Gateway schema smoke, not service health alone, is the
  required evidence for callable exposure.
- Commit before deploy completed:
  `09f066d fix finance gateway owner asset schema auth`.
- Local validation passed:
  `node tests/finance-hermes-plugin.test.js`,
  `node tests/finance-python-mcp-stdio.test.js`,
  `node tests/finance-mcp-server.test.js`,
  `python -m py_compile gateway-plugins/hermes-mobile-finance/__init__.py`,
  `node --check mcp/finance-tool-contract.js`, and `git diff --check`.
- Mac production deployed through the Home AI central deploy path:
  - Finance plugin source commit: `09f066d`.
  - Finance backup path:
    `/Users/hermes-host/HermesMobile/backups/deploy/20260610T065514Z-plugin-finance-finance-owner-assets-mcp-gateway-schema-20260610`.
  - Home AI source commit: `4a47722`, which includes
    `77d51d0 feat: add finance owner asset MCP hints`.
  - Home AI backup path:
    `/Users/hermes-host/HermesMobile/backups/deploy/20260610T065528Z-home-ai-finance-owner-assets-mcp-epoch-20260610`.
- Full MCP upgrade closure passed for selected profile `hm-owner-openai-1`:
  service schema includes `finance.get_owner_asset_summary`,
  `finance.list_owner_asset_snapshots`, and
  `finance.upsert_owner_asset_snapshot`; Gateway callable schema includes
  `mcp_finance_get_owner_asset_summary`,
  `mcp_finance_list_owner_asset_snapshots`, and
  `mcp_finance_upsert_owner_asset_snapshot`; schema epoch is
  `20260610-finance-owner-assets-mcp-v1`.
- AI Ops evidence ledger:
  - `evidence-0038f278-a668-42a4-b696-a2022a0e0480` for full MCP closure.
  - `evidence-e7f0bc65-ac47-48c1-aac8-57ed2d32afe1` for deploy.

## 2026-06-10 Owner Asset MCP Worker Lifecycle Refresh

- User retried Home AI and reported `mcp_finance_list_ledgers` worked while
  the actual callable schema still lacked the three Owner asset callables. This
  proved the remaining issue was not Finance ledger permission, but stale
  Gateway callable schema in the worker/run path.
- Production status before refresh reported `activeGlobal=0`.
- Refreshed Owner finance-capable Gateway profiles through
  `/Users/hermes-host/HermesMobile/gateway-worker/macos-launch-gateway-profile.sh`
  stop/start, rather than manually launching individual Python workers:
  `hm-owner-openai-1`, `hm-owner-openai-2`, `hm-owner-openai-3`,
  `officialclean1`, `officialclean2`, `deepseekgw1`, `deepseekgw2`,
  `deepseekgw99`, `grokgw1`, and `deepseekmaint1`.
- Bounded process check after refresh showed the old 2026-06-07/08/09 Owner
  Gateway run processes and Finance MCP wrapper children were gone; current
  Owner Gateway processes were started after the refresh.
- Standard full closure rerun for `hm-owner-openai-1` passed: service schema,
  Home AI source epoch/hints, docs, and Gateway `agent-schema-probe` all include
  `mcp_finance_get_owner_asset_summary`,
  `mcp_finance_list_owner_asset_snapshots`, and
  `mcp_finance_upsert_owner_asset_snapshot`.
- AI Ops evidence ledger:
  - `evidence-759b0660-618a-450f-bd93-09999ecbc72f` for the worker lifecycle
    refresh and rerun closure.

## 2026-06-10 Owner Asset USD Return Recalculation

- User updated the current-year USD asset amount through Finance MCP and noted
  that the current year's USD annual return, total return multiple, and CAGR
  must be recalculated instead of preserving stale summary values.
- Implemented in `3fd6965 fix owner asset USD return recalculation`:
  `adapters/finance-owner-asset-service.js` preserves
  existing snapshot scalar/component values when an upsert omits them, and
  manual/MCP upserts recalculate USD return metrics from the current USD
  component, prior-year USD component, optional net contribution inputs, and
  prior annual return history. `source="owner_asset_xlsx"` imports keep
  workbook-provided return metrics.
- Focused tests added in `tests/finance-owner-asset-service.test.js` to verify
  XLSX metric preservation and manual/MCP recalculation.
- Validation passed:
  `node tests/architecture-code-test-harness-map.test.js`;
  `node --check adapters/finance-owner-asset-service.js`;
  `node --check tests/finance-owner-asset-service.test.js`;
  `node tests/finance-owner-asset-service.test.js`;
  `node tests/finance-owner-asset-import.test.js`;
  `node tests/finance-mcp-server.test.js`;
  `node tests/finance-tool-contract.test.js`;
  `node tests/architecture-boundary.test.js`;
  `node tests/privacy-scan.test.js`; `git diff --check`.
- Production deploy completed through Home AI macOS deploy script from Finance
  commit `3fd6965d1dc9`; deploy backup:
  `/Users/hermes-host/HermesMobile/backups/deploy/20260610T073202Z-plugin-finance-finance-owner-asset-usd-return-recalc-20260610`.
- Production DB was backed up before the repair and passed `PRAGMA quick_check`;
  backup path:
  `/Users/hermes-host/HermesMobile/plugins/finance/data/finance.sqlite3.before-owner-asset-return-recalc-20260610T073238Z.bak`.
- Production 2026 Owner asset snapshot was repaired by re-upserting the latest
  snapshot with `recalculate_usd_return_metrics=true`; readback returned latest
  year `2026`, six asset components, annual USD return `-1338` bps, USD CAGR
  `2243` bps, and USD total return multiple `572768` bps.
- AI Ops evidence ledger:
  - `evidence-ff3dc536-3577-4489-a805-06a9508154e6` for validation.
  - `evidence-7a9673f9-17c8-4ec7-b139-7bdc2cb49bef` for deploy.
  - `evidence-52427f66-c4ee-447a-a949-cb710a20de64` for production repair
    and smoke readback.

## 2026-06-11 Entry Keypad Re-Record Safety Fix

- User reported two recent large `夜宵` expense rows that they did not intend
  to save while testing the left-side `1/4/7` keypad touch target.
- Read-only production triage found the two rows were active `daily` ledger
  transactions from embedded local UI (`source="local-ui"`) with audit actor
  `hermes:owner`, created a few seconds apart. They were not Wacai imports,
  recurring transactions, or Finance MCP writes.
- Root cause: the entry keypad `再记` action directly called form submit via
  `requestSubmit()`, so tapping it wrote a transaction even though the visible
  save key was not tapped.
- Implemented in `27bcca6 fix finance entry re-record safety`: `再记` is now a mode toggle for "save and keep entry
  open"; only the explicit `保存` submit writes a transaction. The keypad left
  gutter was increased to a 20px minimum so the left numeric column stays away
  from the screen edge. Static frontend version is
  `finance-replica-20260611a`; service worker cache is `finance-mcp-pwa-v120`.
- No production data repair has been applied in this change; the two existing
  rows remain active unless the user explicitly approves soft-voiding them.
- Validation passed:
  `node --check public/app-finance-ui.js`;
  `node --check adapters/finance-hermes-embedded-plugin-service.js`;
  `node tests/app-finance-ui.test.js`;
  `node tests/finance-hermes-embedded-plugin-service.test.js`;
  `node tests/finance-server.test.js`; `npm run check`;
  `node tests/architecture-code-test-harness-map.test.js`; `git diff --check`.
- Production deploy completed through Home AI macOS deploy script from Finance
  commit `27bcca6140da`; deploy backup:
  `/Users/hermes-host/HermesMobile/backups/deploy/20260611T022923Z-plugin-finance-finance-entry-re-record-safety-20260611`.
- Production smoke confirmed `/finance.html` and the embedded plugin manifest
  serve `finance-replica-20260611a`, and `/service-worker.js` serves
  `finance-mcp-pwa-v120`.
- AI Ops evidence ledger:
  - `evidence-7cfc12d5-a376-40e4-93bb-c987cb6bc5de` for validation.
  - `evidence-57683773-0cc1-4723-af45-76d903b8b3fe` for deploy.
  - `evidence-2bd6692e-588b-47db-8983-cde00346de8e` for production static
    smoke.

## 2026-06-11 Transaction Detail Tags

- User requested that bill/transaction detail information list all tags, then
  commit, push, and deploy.
- Implemented in `b282c90 show transaction tags in detail`:
  `public/app-finance-ui.js` now renders a `标签` detail row from the
  transaction projection's `tags` array, joined with `、`; empty tags continue
  to use the existing `未填写` detail fallback.
- Static frontend version is `finance-replica-20260611b`; service worker cache
  is `finance-mcp-pwa-v121`; embedded plugin manifest version was updated to
  the same static version.
- Validation passed:
  `node --check adapters/finance-repository.js`;
  `node --check adapters/finance-transaction-service.js`;
  `node --check public/app-finance-ui.js`;
  `node --check adapters/finance-hermes-embedded-plugin-service.js`;
  `node tests/finance-transaction-service.test.js`;
  `node tests/finance-server.test.js`;
  `node tests/app-finance-ui.test.js`;
  `node tests/finance-hermes-embedded-plugin-service.test.js`;
  `npm run check`; `git diff --check`; Home AI deployment script tests passed.
- Source commit `b282c90` was pushed to `origin/codex/finance-mcp-design` and
  `public/main` before deploy.
- Production deploy completed through Home AI macOS deploy script from Finance
  commit `b282c909204d`; deploy backup:
  `/Users/hermes-host/HermesMobile/backups/deploy/20260611T101718Z-plugin-finance-finance-transaction-detail-tags-20260611`.
- Production smoke confirmed `/finance.html` and the embedded plugin manifest
  serve `finance-replica-20260611b`, `/service-worker.js` serves
  `finance-mcp-pwa-v121`, and `/app-finance-ui.js` contains
  `detailRow("标签", tagNamesText(row))`.
- AI Ops evidence ledger:
  - `evidence-80dcc859-cc9e-4ecd-b451-f58c2ffde67c` for validation.
  - `evidence-773bc92c-de04-4c19-b8e5-339fc019006b` for deploy.
  - `evidence-694a2f41-53f0-410f-9fba-b87a2871ae3a` for production static
    smoke.

## 2026-06-11 Category Picker Expanded Parent Scroll

- User reported that in the bookkeeping category picker, scrolling down and
  opening a parent category re-rendered the list without keeping that parent in
  view, so the newly shown child category grid was off-screen and required
  another manual scroll. User also reported that on Android the bookkeeping
  meta row had partial overlap between the `备注` button and the camera button.
- Local UI fix: `public/app-finance-ui.js` now anchors the category picker
  scroll container to the toggled parent after render. `openCategoryPicker()`
  also focuses the initially expanded selected parent. The scroll adjustment is
  scoped to `.finance-category-picker-body`; it does not scroll the page or
  change transaction persistence behavior. `public/styles.css` now keeps the
  camera button absolutely pinned inside the meta row and reserves right-side
  scroll space so the `备注` chip cannot sit underneath the camera button.
- `scripts/capture-desktop-pwa.js` now treats less than 6px between `备注` and
  the camera button as a layout failure.
- Static frontend version is `finance-replica-20260611c`; service worker cache
  is `finance-mcp-pwa-v122`; embedded plugin manifest version was updated to
  the same static version.
- Validation passed:
  `node --check public/app-finance-ui.js`;
  `node --check scripts/capture-desktop-pwa.js`;
  `node --check adapters/finance-hermes-embedded-plugin-service.js`;
  `node tests/app-finance-ui.test.js`;
  `node tests/finance-hermes-embedded-plugin-service.test.js`;
  `npm run check`; `npm test`; Home AI
  `node tests/architecture-code-test-harness-map.test.js`; `git diff --check`.
- Android device validation was not available in this shell because `adb` was
  not installed. The local layout contract/probe now fails if `备注` and the
  camera button are closer than 6px.
- Source commit before deploy:
  `98c860d fix finance category picker scroll`.
- Mac production deploy completed through the Home AI central deploy path:
  - Finance source commit: `98c860d557e2`.
  - Backup path:
    `/Users/hermes-host/HermesMobile/backups/deploy/20260611T125121Z-plugin-finance-finance-category-picker-scroll-meta-overlap-20260611`.
  - Launchd validation passed for `system/com.hermesmobile.plugin.finance`;
    the service restarted with pid `75794`.
  - Health validation passed on retry 2.
- Production static smoke confirmed `/finance.html` and the embedded plugin
  manifest serve `finance-replica-20260611c`, `/service-worker.js` serves
  `finance-mcp-pwa-v122`, `/app-finance-ui.js` contains
  `focusCategoryPickerParent(parentId)` and focused category re-rendering, and
  `/styles.css` contains the right-side meta-row reserve plus absolute camera
  button pinning.
- AI Ops evidence ledger:
  - `evidence-655e78c2-a0ad-4986-a554-0787bb5e8a32` for local validation.

## 2026-06-11 Entry Draft Restore Notice And Dark Date Picker

- User requested removing the `已恢复未保存草稿` notice from the bookkeeping
  page while keeping draft restore behavior, and improving dark-mode contrast
  for the bookkeeping date picker.
- Local UI update:
  - `restoreEntryDraft()` no longer calls `setEntryStatus()` after restoring a
    local draft, so the entry page opens without the restored-draft toast/status
    text.
  - `public/styles.css` gives the entry date picker dedicated dark-mode
    variables for page, sheet, card, controls, inputs, borders, and shadow.
    The date/time controls now use dark cards and high-contrast text in dark
    mode instead of white surfaces.
  - Static frontend version is `finance-replica-20260611e`; service worker
    cache is `finance-mcp-pwa-v124`; embedded plugin manifest version was
    updated to the same static version.
- Validation passed:
  `node --check public/app-finance-ui.js`;
  `node --check adapters/finance-hermes-embedded-plugin-service.js`;
  `node tests/app-finance-ui.test.js`;
  `node tests/finance-hermes-embedded-plugin-service.test.js`;
  `npm run check`; `npm test`; Home AI
  `node tests/architecture-code-test-harness-map.test.js`; `git diff --check`.
- Source commit before deploy:
  `d880d57 fix finance entry draft and dark date picker`.
- Mac production deploy completed through the Home AI central deploy path:
  - Finance source commit: `d880d577ea64`.
  - Backup path:
    `/Users/hermes-host/HermesMobile/backups/deploy/20260611T151140Z-plugin-finance-finance-entry-draft-dark-date-picker-20260611`.
  - Launchd validation passed for `system/com.hermesmobile.plugin.finance`;
    the service restarted with pid `52941`.
  - Health validation passed on retry 2.
- Production static smoke confirmed `/finance.html` and the embedded plugin
  manifest serve `finance-replica-20260611e`, `/service-worker.js` serves
  `finance-mcp-pwa-v124`, `/app-finance-ui.js` no longer contains
  `已恢复未保存草稿`, and `/styles.css` contains the dark entry date picker
  variables and dark input color scheme.
- AI Ops evidence ledger:
  - `evidence-a7d84b6d-b2a8-4f89-ad6d-0c2a19014443` for local validation.
  - `evidence-78924059-e48b-4fd4-87a9-739613d81eb7` for deploy and production
    static smoke.

## 2026-06-12 Stock Holdings Live Valuation Work In Progress

- Added user-partitioned stock holding support in local source; not deployed yet.
- New service/repository path:
  `adapters/finance-owner-stock-service.js` plus SQLite tables
  `finance_owner_stock_snapshots` and `finance_owner_stock_positions` in
  `adapters/finance-repository.js`. Table names keep the `owner_stock` prefix
  for the first Owner rollout, but rows are keyed by `finance_user_id` so future
  Finance users can opt in independently.
- New MCP tools in local schema:
  `finance.apply_owner_stock_position_delta`,
  `finance.get_owner_stock_summary`, `finance.list_owner_stock_snapshots`, and
  low-level `finance.upsert_owner_stock_snapshot`.
- Product rule: stock total-value queries and the stock UI must refresh live
  stock prices and FX before calculating current valuation. Natural-language
  deltas such as buying/selling/adjusting shares are the intended ongoing MCP
  write path; users should not provide live market prices or FX manually.
- New UI path: `股票` bottom tab in `public/finance.html` and
  `public/app-finance-ui.js`. It is shown only when the current Finance user has
  a stock summary and refreshes `/api/finance/owner-stocks/summary?live=1` when
  the tab opens. Static version is `finance-replica-20260612a`; service worker
  is `finance-mcp-pwa-v125`.
- New initialization helper `scripts/import-owner-stock-xlsx.js` parses the
  uploaded holding workbook, fetches current prices and FX at runtime, writes a
  bounded structured snapshot, and prints only aggregate metadata plus source
  hash. It is for initialization/migration only, not the ongoing user workflow.
- Temporary import validation against the uploaded workbook succeeded on a temp
  DB: 4 positions parsed, USD-base snapshot created, bounded source ref
  `owner-stock-xlsx:9dc61a0826909159`.
- Local development DB initialization also imported the uploaded workbook into
  the default Finance DB with live prices and FX for 2026-06-12. No production
  DB write was performed.
- Focused validation passed so far:
  `node --check adapters/finance-owner-stock-service.js`;
  `node --check adapters/finance-repository.js`;
  `node --check public/app-finance-ui.js`;
  `node --check scripts/import-owner-stock-xlsx.js`;
  `node tests/finance-owner-stock-service.test.js`;
  `node tests/app-finance-ui.test.js`;
  `node tests/finance-server.test.js`;
  `node tests/finance-owner-asset-service.test.js`.

## 2026-06-12 Stock Holdings Production Deploy

- Source commit deployed: `f21a36e32d21 add live stock holdings valuation`.
- Finance Mac production deploy completed through Home AI central deploy path:
  backup path `/Users/hermes-host/HermesMobile/backups/deploy/20260612T025948Z-plugin-finance-finance-owner-stock-live-valuation-20260612`.
- Production static smoke confirmed `/finance.html` serves
  `finance-replica-20260612a`, `/service-worker.js` serves
  `finance-mcp-pwa-v125`, and `/app-finance-ui.js` contains the live stock
  refresh path `/api/finance/owner-stocks/summary?live=1`.
- Production DB was backed up before stock initialization:
  `/Users/hermes-host/HermesMobile/plugins/finance/data/finance.sqlite3.before-owner-stock-import-20260612T030047Z.bak`.
- Production Owner stock initialization imported the uploaded workbook through
  `scripts/import-owner-stock-xlsx.js` as user `hermes-host`: 4 positions,
  date `2026-06-12`, base currency `USD`, source ref
  `owner-stock-xlsx:9dc61a0826909159`. The import writes only structured stock
  snapshot/position rows and does not create ledger transactions.
- Production readback passed:
  `/api/finance/owner-stocks/summary?live=1` returned `live=true`,
  `persisted=false`, latest date `2026-06-12`, 4 positions, base `USD`.
  DB `PRAGMA quick_check` remained `ok`; stock table counts were 1 snapshot and
  4 positions.
- Authenticated Finance service schema and production Python wrapper
  `tools/list` both include `get_owner_stock_summary`,
  `list_owner_stock_snapshots`, and `apply_owner_stock_position_delta`.
- Home AI hints/epoch update was handled in the central app workspace commit
  `6bd0a546 add finance stock MCP hints`; listener production files contain
  schema epoch `20260612-finance-owner-stocks-mcp-v1`.
- Gateway profile `hm-owner-openai-1` was stop/start refreshed through
  `/Users/hermes-host/HermesMobile/gateway-worker/macos-launch-gateway-profile.sh`;
  launchd reports it running with pid `60903`, and the refreshed Finance MCP
  wrapper child started at `2026-06-12 11:08:54`.
- `gateway-tool-schema-smoke.js --schema-only` remains blocked by an existing
  profile probe environment issue: the probe tries to read a stale Windows
  telemetry allowlist path `C:/ProgramData/HermesMobile/.../.managed` on Mac.
  This is separate from Finance service/wrapper schema visibility, which passed.

## 2026-06-12 Currency Picker Opens Entry Bugfix

- Investigated a UI bug where switching the top-right report/home currency to
  HKD or USD could intermittently open the bookkeeping entry view.
- Root cause found in static UI layering: `.finance-bottom-nav` used
  `z-index: 44`, while `.finance-overlay` used `z-index: 40`; when the
  currency picker sheet was open, the bottom nav primary `记账` button could
  remain above the overlay and receive clicks/touch completion events.
- Local fix raises `.finance-overlay` above bottom navigation, disables bottom
  nav pointer events while any overlay is open, and stops propagation from
  report/home currency picker open/select/close clicks.
- Files changed locally: `public/styles.css`, `public/app-finance-ui.js`,
  `public/finance.html`, `public/service-worker.js`,
  `tests/app-finance-ui.test.js`, and
  `tests/finance-hermes-embedded-plugin-service.test.js`.
- Static version advanced to `finance-replica-20260612b`; service worker cache
  advanced to `finance-mcp-pwa-v126` so production clients refresh CSS/JS.
- Focused validation passed:
  `node --test tests/app-finance-ui.test.js`.
- Full local validation passed before deploy: `npm test` (163 tests),
  `node --check public/app-finance-ui.js`,
  `node --check tests/app-finance-ui.test.js`, and `git diff --check`.
- Source commit: `c6dfad6 fix currency picker overlay hit testing`.
- Deployed to Mac production with
  `node scripts/deploy-macos-production.js --plugin finance --reason finance-currency-overlay-hit-test-20260612 --execute --json`.
  Production backup:
  `/Users/hermes-host/HermesMobile/backups/deploy/20260612T031953Z-plugin-finance-finance-currency-overlay-hit-test-20260612`.
- Production validation passed: `com.hermesmobile.plugin.finance` launchd is
  running, plugin manifest health returned `finance-replica-20260612b`, served
  `/finance.html` references `finance-replica-20260612b`, served
  `/service-worker.js` contains `finance-mcp-pwa-v126`, and served
  `/app-finance-ui.js` / `/styles.css` contain the event propagation and overlay
  hit-testing fixes.
- AI Ops evidence ledger record:
  `evidence-23af97fc-ffe0-4b8b-bf24-5547ad746704`.

## 2026-06-12 Currency Switch And Date Sheet Follow-up

- User reported the prior currency-picker hotfix was insufficient: switching
  CNY/HKD/USD could still open bookkeeping, and currency switching could take
  several seconds. User also reported the bookkeeping date popup was poorly
  laid out and low contrast in dark mode.
- Visual lane allocated through Home AI AI Ops: `ios-pwa-1`, live debug URL
  `http://127.0.0.1:19073/`, requester
  `finance-currency-picker-entry-regression`.
- Visual reproduction on temporary Finance LAN test origin showed that, before
  this follow-up fix, a valid local draft plus top-right HKD switch changed
  `body[data-finance-view]` from `home` to `entry`. The root cause was
  `loadOverview()` calling `restoreEntryDraftOnStartup()` on every overview
  refresh, including report-currency switching.
- Performance root cause: `applyReportCurrency()` called full `loadOverview()`.
  Owner overview also fetched live stock prices/FX through
  `ownerStockService.getLiveSummary()`, so a currency-only report filter could
  block on market quote network calls.
- Follow-up fix:
  - frontend startup draft restore now runs once per page lifecycle;
  - top-right currency switching calls lightweight
    `/api/finance/overview?summary_only=1&currency=<code>`;
  - server `summary_only=1` returns only `summary`, `yearSummary`, and
    `report`, and does not fetch live stocks or transaction/master-data lists;
  - normal overview now returns persisted stock summary metadata, while the
    stock tab continues to refresh live prices/FX through
    `/api/finance/owner-stocks/summary?live=1`;
  - dark-mode bookkeeping date sheet is now a compact high-contrast bottom
    sheet without the previous large blank spacer; date/time inputs are fixed
    46px controls with dark color scheme.
- Static version advanced locally to `finance-replica-20260612c`; service
  worker cache advanced to `finance-mcp-pwa-v127`.
- Visual validation on live debug lane against temporary `18792` origin:
  - `finance-replica-20260612c` loaded;
  - with a seeded local draft, switching to HKD stayed on `home`;
  - switching to USD completed in about 445 ms and stayed on `home`;
  - date sheet metrics: `view=entry`, overlay visible, sheet `402x327`,
    dark background `rgb(18, 21, 29)`, white text, date input height `46`,
    color scheme `dark`;
  - screenshot:
    `/Users/xuxin/.homeai-qa/artifacts/finance-date-picker-20260612c.png`.
- Validation passed so far:
  `node --check public/app-finance-ui.js`,
  `node --check server-routes/finance-api-routes.js`,
  `node --check tests/app-finance-ui.test.js`,
  `node --check tests/finance-server.test.js`,
  `node --test tests/app-finance-ui.test.js tests/finance-server.test.js`,
  `npm test` (164 tests), and `git diff --check`.
- Source commit: `6af2335 fix finance currency refresh and date sheet`.
- Deployed to Mac production with
  `node scripts/deploy-macos-production.js --plugin finance --reason finance-currency-refresh-date-sheet-20260612 --execute --json`.
  Production backup:
  `/Users/hermes-host/HermesMobile/backups/deploy/20260612T033922Z-plugin-finance-finance-currency-refresh-date-sheet-20260612`.
- Production smoke passed: plugin manifest health returned
  `finance-replica-20260612c`, served `/finance.html` references
  `finance-replica-20260612c`, served `/service-worker.js` contains
  `finance-mcp-pwa-v127`, and served `/app-finance-ui.js` / `/styles.css`
  contain the one-time draft restore, lightweight currency summary refresh,
  and dark date sheet controls.
- AI Ops evidence ledger record:
  `evidence-f334673e-f8a7-4dc9-8938-8bf1ed82c584`.

## 2026-06-12 Currency Switch Transaction List Follow-up

- User reported that after switching the top-right currency to HKD or USD, the
  lower transaction list still showed the previous currency rows.
- Root cause: the prior fast path made
  `/api/finance/overview?summary_only=1&currency=<code>` return only summary
  and report payloads. That avoided live stock quote latency, but the frontend
  had no selected-currency transaction rows to render.
- Follow-up fix: currency switching now calls the same fast path with
  `limit=TRANSACTION_PAGE_SIZE` and renders the returned local overview. The
  server returns local overview data, including transactions and master data,
  while still avoiding live stock quote/FX provider calls. Startup draft restore
  remains one-time only and is not called by currency switching.
- Static version advanced locally to `finance-replica-20260612d`; service
  worker cache advanced to `finance-mcp-pwa-v128`.
- Validation passed:
  `node --check public/app-finance-ui.js`,
  `node --check server-routes/finance-api-routes.js`,
  `node --test tests/app-finance-ui.test.js tests/finance-server.test.js`,
  `npm test` (164 tests), `git diff --check`,
  Home AI `node tests/architecture-code-test-harness-map.test.js`, and AI Ops
  `required-checks`.
- Source commit: `e90ac47 fix finance currency list refresh`.
- Deployed to Mac production with
  `node scripts/deploy-macos-production.js --plugin finance --reason finance-currency-list-refresh-20260612 --execute --json`.
  Production backup:
  `/Users/hermes-host/HermesMobile/backups/deploy/20260612T034455Z-plugin-finance-finance-currency-list-refresh-20260612`.
- Production smoke passed: plugin manifest health returned
  `finance-replica-20260612d`, served `/finance.html` references
  `finance-replica-20260612d`, served `/service-worker.js` contains
  `finance-mcp-pwa-v128`, served `/app-finance-ui.js` contains the
  `summary_only=1` local overview refresh path, and a bounded
  `/api/finance/overview?currency=HKD&summary_only=1&limit=30` metadata smoke
  returned `currency=HKD`, `transactions=true`, `transactionCount=30`,
  `hasAccounts=true`, and no live stock summary flag.
- AI Ops evidence ledger record:
  `evidence-42636e79-c505-43d5-a1b2-1b42e53b3902`.

## 2026-06-12 Entry Draft Restore Route Precedence Fix

- User reported that the new bookkeeping flow again failed to restore the
  previously edited unsaved draft after reload/process kill, although this had
  been working in the earlier Home AI implementation.
- Finding: draft persistence was not removed. `localStorage` draft writes,
  `pagehide`, and `visibilitychange` persistence were still present. The
  regression risk was startup ordering: `loadOverview()` applied the initial
  plugin route before checking draft restore. If the URL still contained
  `pluginRoute=record`, the record route opened a blank bookkeeping page; the
  one-time startup draft check then saw the active view was no longer `home` and
  skipped restoration.
- Local fix: `loadOverview()` now calls `applyStartupNavigation()`. A valid
  startup draft is restored first and marks the initial plugin route handled for
  that page lifecycle. If no valid draft exists, the original plugin route
  behavior still runs. Later overview refreshes such as currency switching still
  cannot reopen bookkeeping from a stale draft.
- Validation passed:
  `node --check public/app-finance-ui.js`,
  `node --test tests/app-finance-ui.test.js`, `npm test` (164 tests),
  `git diff --check`, Home AI
  `node tests/architecture-code-test-harness-map.test.js`, and AI Ops intake.
- Source commit: `4a964c8 fix finance entry draft route restore`.
- Deployed to Mac production with
  `node scripts/deploy-macos-production.js --plugin finance --reason finance-entry-draft-route-restore-20260612 --execute --json`.
  Production backup:
  `/Users/hermes-host/HermesMobile/backups/deploy/20260612T051730Z-plugin-finance-finance-entry-draft-route-restore-20260612`.
- Production smoke passed: plugin manifest health returned
  `finance-replica-20260612e`, served `/finance.html` references
  `finance-replica-20260612e`, served `/service-worker.js` contains
  `finance-mcp-pwa-v129`, and served `/app-finance-ui.js` contains
  `applyStartupNavigation()`, the draft-first restore call, and
  `state.pluginRouteApplied = true` after a restored draft wins startup
  navigation.
- AI Ops evidence ledger record:
  `evidence-e55ceb4d-0555-4c4f-8433-1090514164c2`.

## 2026-06-12 Embedded Bottom Nav Lower Placement

- User reported from an iPhone screenshot that the embedded Finance floating
  bottom menu sat too high and should be closer to the bottom, like Wardrobe's
  floating menu.
- Reference check: Wardrobe `web/styles.css` uses `body.mobile`
  `--bottom-tabs-bottom: 6px` for its compact mobile bottom tabs. Finance
  embedded mode was still using `--bottom-tabs-bottom: 14px`.
- Local fix: Finance embedded bottom tabs now use `--bottom-tabs-bottom: 6px`
  for dark and system-light variable sets. Standalone PWA bottom nav still uses
  its own `bottom: calc(14px + env(safe-area-inset-bottom))`.
- Static version advanced locally to `finance-replica-20260612f`; service
  worker cache advanced to `finance-mcp-pwa-v130`.
- Validation passed:
  `node --check public/app-finance-ui.js`,
  `node --check adapters/finance-hermes-embedded-plugin-service.js`,
  `node --test tests/app-finance-ui.test.js tests/finance-hermes-embedded-plugin-service.test.js`,
  `npm test` (164 tests), Home AI
  `node tests/ios-pwa-live-debug-server.test.js`,
  `node tests/ios-pwa-visual-harness.test.js`, and `git diff --check`.
- Visual lane `ios-pwa-2` was allocated through AI Ops. Local live debug opened
  `http://192.168.10.110:18793/finance.html?embed=hermes&v=finance-replica-20260612f`.
  Bounded DOM measurement returned `bottomTabsBottom=6px`,
  `navBottomCss=6px`, `navRect.bottom=708`, and `viewport.h=714`, confirming a
  6px bottom gap. Screenshot:
  `/Users/xuxin/.homeai-qa/artifacts/finance-bottom-nav-20260612f.png`.
- AI Ops evidence ledger record:
  `evidence-ba4f134c-fb51-47c0-a517-dd3da1d6af6d`.
- Source commit: `dde0633 fix finance embedded bottom nav placement`.
- Deployed to Mac production with
  `node scripts/deploy-macos-production.js --plugin finance --reason finance-embedded-bottom-nav-placement-20260612 --execute --json`.
  Production backup:
  `/Users/hermes-host/HermesMobile/backups/deploy/20260612T055030Z-plugin-finance-finance-embedded-bottom-nav-placement-20260612`.
- Production smoke passed: plugin manifest health returned
  `finance-replica-20260612f`, served `/finance.html` references
  `finance-replica-20260612f`, served `/service-worker.js` contains
  `finance-mcp-pwa-v130`, served `/app-finance-ui.js` contains
  `finance-mcp-pwa-v130`, and served `/styles.css` contains
  `--bottom-tabs-bottom: 6px` plus embedded bottom-nav
  `bottom: var(--bottom-tabs-bottom)`.
- Deploy-time profile audit reported `codexIssueCount=0`.
- AI Ops production-smoke evidence ledger record:
  `evidence-03eb1c41-6e69-44f8-9339-9d5eac14cb2d`.

## 2026-06-12 Embedded Floating Dot Opaque Area Local Fix

- Status: local-only fix; not committed, pushed, deployed, or production-smoked.
- User-facing issue: when Finance/记账 runs as a Home AI embedded plugin, the
  host floating plugin control can appear to sit on a large opaque bottom area.
  Other plugins did not show the same visible block.
- Finding: the large visible area was plugin-local. In embedded mode Finance
  rendered both a fixed `body.finance-embed::after` backing and an opaque
  `.finance-bottom-nav` frame near the iframe bottom. Local CDP measurement
  before the fix showed the backing at about `430x40` and the nav frame at
  about `428x58`, while individual tab buttons were about `56x30`.
- Fix: Finance embedded bottom navigation now hides the separate pseudo-element
  backing and makes the nav frame transparent/no-shadow, leaving only the
  individual outlined tab buttons visibly filled. Static frontend version is
  `finance-replica-20260612e`; service worker cache is `finance-mcp-pwa-v129`.
- Changed files:
  - `public/styles.css`;
  - `public/finance.html`;
  - `public/service-worker.js`;
  - `public/app-finance-ui.js`;
  - `tests/app-finance-ui.test.js`;
  - `docs/IMPLEMENTATION_NOTES/hermes-embedded-plugin.md`;
  - `docs/IMPLEMENTATION_NOTES/harness-required-matrix.md`;
  - `docs/TEST_MATRIX.md`;
  - `docs/finance-mcp-implementation-plan.md`.
- Validation passed:
  - `node --check public/app-finance-ui.js`;
  - `node --test tests/app-finance-ui.test.js`;
  - `node --test tests/finance-hermes-embedded-plugin-service.test.js`;
  - `npm run check`;
  - `git diff --check`;
  - local non-production CDP measurement against
    `http://127.0.0.1:18791/finance.html?embed=hermes&v=probe-after` confirmed
    `body::after display=none`, nav frame background/border transparent, and
    individual tab buttons still visible.

## 2026-06-12 Embedded Floating Dot Opaque Area Deployment Closure

- Status: deployed to Mac production through the central Home AI macOS deployer;
  commit/push pending in this workspace at handoff update time.
- Additional fix before deploy: synchronized
  `DEFAULT_EMBEDDED_APP_VERSION`, `tests/finance-hermes-embedded-plugin-service.test.js`,
  and `scripts/deploy-mac-finance.ps1` defaults to
  `finance-replica-20260612e` / `finance-mcp-pwa-v129`.
- Deployment command surface: from `/Users/hermes-dev/HermesMobileDev/app`,
  `npm run --silent deploy:macos -- --plugin finance --source /Users/hermes-dev/HermesMobileDev/plugins/finance --reason finance-embedded-dot --allow-dirty --execute --password-file <private-local-password-file> --json`.
- Production backup:
  `/Users/hermes-host/HermesMobile/backups/deploy/20260612T041749Z-plugin-finance-finance-embedded-dot`.
- Production validation: `system/com.hermesmobile.plugin.finance` was running
  and the plugin manifest health endpoint returned
  `finance-replica-20260612e`.

## 2026-06-12 Entry Keypad Calculator Fix

- Status: committed, pushed to origin/public, and deployed to Mac production.
- Commit: `4a46fecaabbe` (`fix: calculate finance entry amounts`).
- User-visible behavior:
  - The bookkeeping amount keypad now evaluates `+ - * /` expressions when the
    user taps `=`, for example `1+1` becomes `2`.
  - The frontend no longer uses dynamic code execution for amount calculation;
    it tokenizes the normalized amount string, applies multiplication/division
    before addition/subtraction, rejects invalid expressions, and formats the
    result to at most two decimal places before saving.
  - Save and recurring-entry flows still call amount computation before reading
    the form, so an uncomputed expression is normalized before service write.
- Static versions:
  - frontend `finance-replica-20260612k`;
  - service worker `finance-mcp-pwa-v135`.
- Changed files:
  - `public/app-finance-ui.js`;
  - `public/finance.html`;
  - `public/service-worker.js`;
  - `adapters/finance-hermes-embedded-plugin-service.js`;
  - `scripts/deploy-mac-finance.ps1`;
  - `tests/app-finance-ui.test.js`;
  - `tests/finance-hermes-embedded-plugin-service.test.js`;
  - `docs/finance-mcp-requirements-design.md`;
  - `docs/MODULES/finance-mcp.md`;
  - `docs/TEST_MATRIX.md`.
- Validation passed:
  - `node --check public/app-finance-ui.js`;
  - `node --check tests/app-finance-ui.test.js`;
  - `node --test tests/app-finance-ui.test.js tests/finance-hermes-embedded-plugin-service.test.js`;
  - `npm run check`;
  - `npm test`;
  - `git diff --check`;
  - Home AI deploy script checks:
    `node --check scripts/deploy-macos-production.js`,
    `node tests/macos-production-deploy-script.test.js`,
    `node tests/production-status-smoke-harness.test.js`.
- AI Ops:
  - Intake classified the task as H3 and selected frontend static checks.
  - Test evidence ledger record:
    `evidence-74db252b-368a-4876-8b36-ca3608f59876`.
  - Deploy evidence ledger record:
    `evidence-6da36e1c-ce6d-442e-b4fa-e33a73e905cd`.
- Production deploy:
  - Command:
    `cd /Users/hermes-dev/HermesMobileDev/app && npm run --silent deploy:macos -- --plugin finance --source /Users/hermes-dev/HermesMobileDev/plugins/finance --reason finance-entry-keypad-calculator-20260612 --execute --json`.
  - Backup:
    `/Users/hermes-host/HermesMobile/backups/deploy/20260612T103009Z-plugin-finance-finance-entry-keypad-calculator-20260612`.
  - Restarted launchd label: `com.hermesmobile.plugin.finance`.
  - Health URL passed:
    `http://127.0.0.1:8791/api/v1/hermes/plugin/manifest`.
  - Production smoke passed:
    `/finance.html` references `finance-replica-20260612k`,
    `/app-finance-ui.js` contains `function evaluateEntryAmountExpression`,
    `/service-worker.js` contains `finance-mcp-pwa-v135`, plugin manifest entry
    contains `finance-replica-20260612k`, and `/api/finance/overview` returned
    HTTP `200`.
  - Deploy validation returned `codexIssueCount: 0`; profile audit retained
    non-Codex issues outside this Finance deploy.

## 2026-06-12 Main Branch Public Sync

- Status: completed; no code or product behavior changed in this step.
- Branch state:
  - product code content was aligned from `codex/finance-mcp-design` commit
    `1b5d042` onto `main`;
  - docs-only handoff commits on `main` record the branch sync state;
  - `codex/finance-mcp-design` remains at `1b5d042` for continuity;
  - GitHub default branch for `pentiumxp/finance-mcp` was changed to `main`;
  - `origin/HEAD` and `public/HEAD` both resolve to `refs/heads/main`.
- Validation:
  - remote fetch completed for `origin` and `public`;
  - `public/main` was fast-forwarded from `9f04cb8` to `1b5d042`;
  - `origin/main` was created at `1b5d042`;
  - docs-only handoff commits were pushed to both `origin/main` and
    `public/main`;
  - status checks showed `## main...origin/main` after branch alignment.

## 2026-06-12 Transaction Row Wacai Hierarchy Fix

- Status: committed, pushed to origin/public `main`, and deployed to Mac
  production.
- Commit: `0b727afb860b` (`fix: match wacai transaction row layout`).
- Correction from prior attempt:
  - The previous `acdbbbb` change replaced row time with full date-time but
    kept note, date, account, member, and merchant collapsed in one
    `.finance-row-meta` line. That did not match Wacai and could wrap the
    metadata unclearly.
  - This fix splits transaction rows into `.finance-row-body`,
    optional `.finance-row-detail`, and `.finance-row-meta`.
- User-visible behavior:
  - Transaction rows now follow Wacai-style hierarchy: icon, title, and amount
    are aligned on the first line; note/merchant appear on their own secondary
    line when present; `YYYY/MM/DD HH:mm · account · member` appears on its own
    metadata line.
  - Rows without note/merchant show date-time as the second text line.
- Static versions:
  - frontend `finance-replica-20260612n`;
  - service worker `finance-mcp-pwa-v138`.
- Changed files:
  - `public/app-finance-ui.js`;
  - `public/styles.css`;
  - `public/finance.html`;
  - `public/service-worker.js`;
  - `adapters/finance-hermes-embedded-plugin-service.js`;
  - `scripts/deploy-mac-finance.ps1`;
  - `tests/app-finance-ui.test.js`;
  - `tests/finance-hermes-embedded-plugin-service.test.js`;
  - `docs/TEST_MATRIX.md`.
- Validation passed:
  - `node --check public/app-finance-ui.js`;
  - `node --check tests/app-finance-ui.test.js`;
  - `node --test tests/app-finance-ui.test.js tests/finance-hermes-embedded-plugin-service.test.js`;
  - `npm run check`;
  - `npm test`;
  - `git diff --check`;
  - Home AI deploy script checks:
    `node --check scripts/deploy-macos-production.js`,
    `node tests/macos-production-deploy-script.test.js`,
    `node tests/production-status-smoke-harness.test.js`.
- AI Ops:
  - Intake classified the task as H3.
  - Test evidence ledger record:
    `evidence-c2485cf4-71fb-4116-83e5-7d2503f4fca8`.
  - Deploy evidence ledger record:
    `evidence-cab2d32c-83fc-4ba5-a809-d563c39cfa00`.
- Production deploy:
  - Command:
    `cd /Users/hermes-dev/HermesMobileDev/app && npm run --silent deploy:macos -- --plugin finance --source /Users/hermes-dev/HermesMobileDev/plugins/finance --reason finance-transaction-row-wacai-layout-20260612 --execute --json`.
  - Backup:
    `/Users/hermes-host/HermesMobile/backups/deploy/20260612T152618Z-plugin-finance-finance-transaction-row-wacai-layout-20260612`.
  - Restarted launchd label: `com.hermesmobile.plugin.finance`.
  - Production smoke passed:
    `/finance.html` references `finance-replica-20260612n`,
    `/app-finance-ui.js` contains `class="finance-row-body"`,
    `class="finance-row-detail"`, and the independent `dateLine`,
    `/styles.css` contains `.finance-row-body` and `.finance-row-detail`,
    `/service-worker.js` contains `finance-mcp-pwa-v138`, plugin manifest entry
    contains `finance-replica-20260612n`, and `/api/finance/overview` returned
    HTTP `200`.
  - Deploy validation returned `codexIssueCount: 0`; profile audit retained
    non-Codex issues outside this Finance deploy.
