# Finance MCP 测试矩阵

## 1. 通用门禁

任何实质代码变更至少运行：

```powershell
npm test
npm run check
git diff --check
```

涉及前端 JS：

```powershell
node --check public\app-finance-ui.js
```

涉及 route/MCP/service：

```powershell
node --check server-routes\finance-api-routes.js
node --check mcp\finance-mcp-server.js
node --check mcp\finance-tool-contract.js
node --check mcp\finance-mcp-dispatcher.js
Get-ChildItem mcp\dispatchers -Filter *.js | ForEach-Object { node --check $_.FullName }
node --check adapters\<changed-file>.js
```

## 2. 当前测试文件

| 文件 | 覆盖范围 |
| --- | --- |
| `tests/architecture-boundary.test.js` | service-first 边界、入口文件禁止 SQL、service 测试存在性 |
| `tests/privacy-scan.test.js` | 常见 secret/raw data 泄露扫描 |
| `tests/finance-money.test.js` | 金额解析、minor units、basis points |
| `tests/finance-transaction-service.test.js` | 创建、更新、作废、转账、余额影响、统计排除、更新保留成员/标签、Wacai member/tag repair |
| `tests/finance-report-service.test.js` | category/subcategory/tag/report filters |
| `tests/finance-member-binding-service.test.js` | Hermes member binding owner 权限 |
| `tests/finance-plugin-registration-service.test.js` | Hermes callback URL 持久化和更新 |
| `tests/finance-reference-service.test.js` | Home AI Reference Contract V1 object refs, summaries, and ledger access |
| `tests/finance-owner-asset-service.test.js` | Owner-only asset snapshots, component replacement, MCP dispatch, and non-Owner denial |
| `tests/finance-owner-asset-import.test.js` | Owner asset workbook grouped-year import, yearly FX source, and missing-component omission |
| `tests/finance-owner-stock-service.test.js` | Stock holding snapshots, user partitioning, live valuation MCP summary, and natural-language position deltas |
| `tests/finance-mcp-server.test.js` | MCP dispatcher 和 tool schema |
| `tests/finance-tool-contract.test.js` | MCP tool contract registry、server glue 边界、attachment schema 常量复用 |
| `tests/finance-attachment-input-service.test.js` | 附件 payload source 归一化、上传路径 allowlist、`MEDIA:<path>` 兼容和错误码 |
| `tests/finance-hermes-plugin.test.js` | Hermes Gateway plugin declaration, localhost bridge, callback registration, and identity forwarding |
| `tests/finance-nas-hot-restart-script.test.js` | NAS hot restart script scope, no embedded credentials, wrapper/process restart contract |
| `tests/finance-platform-contract-smoke.test.js` | Finance-local platform/MCP contract smoke script |
| `tests/finance-server.test.js` | LAN listen 默认值、client-version、loopback bridge、callback URL policy |
| `tests/finance-wacai-import-service.test.js` | Wacai import mapping/source fields |
| `tests/app-finance-ui.test.js` | UI shell、导航、报表、下钻、自动刷新 contract |

## 3. H1 对应测试

### 3.1 交易和余额

运行：

```powershell
node tests\finance-money.test.js
node tests\finance-transaction-service.test.js
node tests\finance-mcp-server.test.js
```

覆盖：

- expense/income/transfer。
- idempotency。
- account balance impact。
- update amount strings and reapply old/new account balance impact。
- amount strings support up to two decimal places and persist as integer minor units.
- UI display preserves non-zero fractional minor units in transaction lists,
  details, account balances, and report rows; whole amounts may omit `.00`.
- void reverse。
- transfer excluded from report totals。

### 3.2 成员绑定

运行：

```powershell
node tests\finance-member-binding-service.test.js
node tests\finance-mcp-server.test.js
```

覆盖：

- owner 可以绑定。
- non-owner 拒绝。
- MCP tool 暴露绑定能力。

待补：

- access policy service。
- 解绑后默认成员解析。
- 普通成员跨成员查询拒绝。

### 3.3 MCP Toolset

运行：

```powershell
node tests\finance-mcp-server.test.js
node tests\finance-tool-contract.test.js
node tests\finance-attachment-input-service.test.js
node tests\finance-member-binding-service.test.js
node tests\finance-plugin-registration-service.test.js
node tests\finance-mcp-workspace-config.test.js
node tests\finance-python-mcp-stdio.test.js
node tests\finance-hermes-plugin.test.js
node tests\finance-reference-service.test.js
node tests\finance-owner-asset-service.test.js
node tests\finance-platform-contract-smoke.test.js
node scripts\finance-platform-contract-smoke.js --require-tool finance.reference_get --require-tool finance.reference_summarize --require-tool finance.reference_object_types --json
node tests\architecture-boundary.test.js
node tests\privacy-scan.test.js
```

覆盖：

- toolset 固定为 `finance`。
- dispatcher 创建和查询交易。
- currency list。
- route/MCP 不直接写 SQL。
- Hermes Gateway plugin 声明 `finance` toolset。
- Finance plugin 默认通过 `http://127.0.0.1:8791` 调用专用 bridge。
- Finance MCP HTTP bridge 限制 loopback 来源。
- WSL Gateway trusted source 只有在显式配置
  `FINANCE_MCP_TRUSTED_GATEWAY_ADDRESSES` 或
  `FINANCE_MCP_TRUSTED_GATEWAY_CIDRS` 后才可访问 MCP bridge，且仍必须带
  workspace id/key。
- Finance MCP wrapper 从 `<Hermes user root>/.hermes-finance/config.json` 和
  `access-key.txt` 读取 workspace-local identity/key。
- Hermes Mobile Gateway 正式注册入口是 Python wrapper
  `scripts/finance_mcp_stdio.py`；Node wrapper 仅保留为本地开发兼容路径。
- Python wrapper 的 `tools/list` 工具名必须与 Node wrapper 保持兼容，并返回
  raw local tool name，例如 `list_ledgers`、`get_summary`、`create_transaction`。
  Hermes Agent 会在 callable schema 层自动补 `mcp_finance_...` 前缀。
- Python wrapper 必须支持 Hermes Agent SDK 的 newline-delimited JSON framing，
  并保留传统 MCP `Content-Length` framing；响应 framing 跟随请求 framing。
- `tools/call` 必须兼容 raw local name 和旧 `mcp_finance_...` name。
- `--no-workspace-override` 拒绝模型参数中的 workspace/root override。
- wrapper 和 Gateway plugin 都会从工具参数中剥离 key/token/cookie/workspace override
  字段，不把 raw key 传给模型。
- Gateway plugin 读取 schema 和 dispatch 时必须把 workspace-local id/key 作为
  服务端请求头转发给 Finance bridge；缺少该转发时，Owner-only asset tools
  不应被视为已完成 Gateway callable 暴露。
- 缺 config/key 时返回 bounded diagnostic error，不回退 Owner。
- Finance plugin 可把 `FINANCE_HERMES_CALLBACK_URL` /
  `HERMES_MOBILE_CALLBACK_URL` 写入 `POST /api/finance/mcp/register`。
- callback URL policy：HTTPS 域名允许；HTTP 只允许 loopback；URL userinfo
  凭据拒绝。
- Hermes workspace user key 经 handler context 转为 workspace-scoped hash。
- 同一 Hermes workspace 下不同 user key 会映射到不同 Finance member。
- Reference Contract V1 exposes `transaction`, `account`, and `category`
  object refs through `finance.reference_object_types`,
  `finance.reference_get`, and `finance.reference_summarize`.
- Reference reads enforce ledger access and return bounded projections/summaries
  without raw source fields, local file paths, keys, full receipts, or ledger
  dumps.
- Owner asset tools are Owner-only. Non-Owner contexts fail closed with
  `finance_owner_assets_owner_required`, and asset imports persist only
  structured snapshots/components plus bounded source metadata.
- Owner asset UI is also gated: overview exposes `ownerAssetSummary` only for
  Owner, the `资产` bottom tab stays hidden otherwise, and direct
  `/api/finance/owner-assets/*` reads fail closed for non-Owner access tokens.
- Owner asset UI summary includes bounded annual snapshots and renders a
  yearly selector ordered newest first; selecting a year updates the displayed
  RMB headline total, return metrics, and component list, scrolls the selected
  year into view, displays component rows in component currency, and keeps the
  tab hidden for non-Owner contexts.
- Owner asset summary reads must refresh current USD/CNY through the shared
  market quote provider and persist current USD total projection fields on the
  latest snapshot. The asset page must show current USD total assets and the
  current USD/CNY rate. RMB and USD total assets must be same-level summary
  cards stacked in one column on the mobile asset page, and the UI must not use
  historical `fx_usd_cny_rate` as the current rate label. Tests must not allow a
  fixed FX fallback when live FX fails.
- Manual/MCP Owner asset upserts recalculate current-year USD annual return,
  total return multiple, and CAGR from the updated USD component and prior
  annual USD return history, while `owner_asset_xlsx` imports preserve the
  workbook's explicit metrics.
- Stock holding tools are partitioned by Finance user. Summary queries and the
  stock UI refresh live prices and FX before calculating current market value;
  natural-language position deltas persist a new live-priced snapshot.
- Stock holding rows must display each position's current price on its own
  visible line; ticker/quantity metadata must not truncate or hide the price.
- Stock UI summary hero text must keep explicit high-contrast foreground colors
  in Light and Dark themes; it must not inherit the page `--ink` color on the
  dark green valuation background.

待补：

- Hermes Mobile authorized catalog routing。
- 缺少 `finance` 时不得 HTTP fallback。
- MCP filter schema 与 service filter parity。

### 3.4 Wacai / 随手记导入

运行：

```powershell
node tests\finance-wacai-import-service.test.js
node --check scripts\import-mymoney-csv.js
node tests\privacy-scan.test.js
```

覆盖：

- Excel 浮点 artifact 归一化。
- Wacai hierarchy/source fields。
- import batch。
- source currency。
- Transaction updates that only change amount/note preserve existing `booked_by_member_id` and existing tags.
- `scripts/repair-wacai-member-tags.js` restores Wacai source-field member/tag dimensions from aggregate-safe source fields and writes audit rows.
- `scripts/import-mymoney-csv.js` parses 随手记 CSV with multiline remarks, maps 项目 to tags/source fields, treats signed amounts as reversals, and reports only aggregate counts plus row numbers/error codes.

真实导入 smoke 需手工记录数量，不记录原始明细。

### 3.5 NAS deployment and hot restart

### 3.6 Recurring Bookkeeping

Run:

```powershell
node --check adapters\finance-recurring-service.js
node --check adapters\finance-recurring-scheduler-service.js
node tests\finance-recurring-service.test.js
node tests\finance-recurring-scheduler-service.test.js
node tests\finance-mcp-server.test.js
node tests\finance-server.test.js
node tests\app-finance-ui.test.js
```

Coverage:

- Recurring rules generate normal audited Finance transactions through the transaction service.
- Due generation is idempotent for the same rule and due timestamp.
- Automatic posting starts from the backend runtime, not page refresh, and drains missed occurrences after downtime or a stopped timer.
- Pause/resume affects future generation only.
- Non-schedule recurring-rule updates preserve `next_due_at`; schedule updates recalculate it and derive day/month from a newly supplied start date when explicit day/month fields are absent.
- Deleting a rule keeps generated transactions by default; explicit generated cleanup uses soft void.
- MCP schemas expose recurring tools under the `finance` toolset.
- The plan UI lists recurring rules. The bookkeeping entry date field opens a Wacai-style date panel with separate normal save and `保存为周期账` actions; the recurring editor uses the active-entry overlay shape instead of a detached generic settings sheet, exposes visible save/error feedback, and supports `永续` as the no-end-date mode.

Run:

```powershell
powershell.exe -NoProfile -Command "$null = [scriptblock]::Create([IO.File]::ReadAllText('scripts\nas-finance-hot-restart.ps1'))"
node tests\finance-nas-hot-restart-script.test.js
```

Coverage:

- `scripts/nas-finance-hot-restart.ps1` uses SSH to run a short-lived remote
  script and removes that remote script by default.
- The default hot restart terminates only `finance_mcp_stdio.py` Gateway wrapper
  processes, so new Gateway MCP server processes reload the deployed wrapper
  file.
- If the SSH account can access Docker directly or through `sudo -n`, the script
  restarts the `finance-mcp` container. If not, it reports a bounded unavailable
  result instead of waiting for a password.
- The script runs NAS-side syntax checks for `scripts/finance_mcp_stdio.py`,
  `scripts/finance-mcp-stdio.js`, and `server-routes/finance-api-routes.js`.
- The script must not contain passwords, tokens, access keys, cookies, or raw
  finance data.

Mac Studio production command:

```powershell
npm run deploy:mac
```

Mac Studio deployment must preserve production `data/` and `node_modules/`,
create source and SQLite backups, run focused production UI checks, restart
`system/com.hermesmobile.plugin.finance`, and verify `finance.html` plus
`service-worker.js` versions through `http://127.0.0.1:8791`.

The Mac production Finance service is loopback-bound. Direct phone access to
`http://192.168.10.110:8791` is not expected unless the launchd host binding is
explicitly changed.

Manual production command:

```powershell
npm run restart:nas:hot
```

## 4. H2 对应测试

### 4.1 报表和下钻

运行：

```powershell
node tests\finance-report-service.test.js
node tests\app-finance-ui.test.js
```

覆盖：

- category/subcategory 口径。
- tag 口径。
- category parent filter。
- filtered transaction detail list。
- UI report action sheet、趋势页、占比页、明细页 DOM contract。

API smoke：

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8791/api/finance/report?period=all&metric=expense&dimension=category'
Invoke-RestMethod -Uri 'http://127.0.0.1:8791/api/finance/report?period=all&metric=expense&dimension=subcategory&category_parent_id=<id>'
Invoke-RestMethod -Uri 'http://127.0.0.1:8791/api/finance/transactions?type=expense&category_parent_id=<id>'
```

### 4.2 移动 UI

运行：

```powershell
node --check public\app-finance-ui.js
node tests\app-finance-ui.test.js
```

覆盖：

- fixed topbar。
- viewport no manual zoom。
- top-left back。
- edge swipe back。
- entry amount custom keypad has a decimal key, limits each numeric segment to two fractional digits, evaluates `+ - * /` expressions through the `=` key without dynamic code execution, keeps left/right safe touch gutters so the `1/4/7` column is not flush with the screen edge, and still keeps the amount field `inputmode="none"`/read-only so the native keyboard is not summoned.
- entry amount custom keypad must handle both the form `click` delegation path
  and direct keypad `pointerup`/`touchend` paths with a short duplicate guard, so
  embedded or shared-user WebViews still update the amount when button touch
  animation is visible but delegated click delivery is unreliable.
- entry keypad `再记` is a mode toggle only; tests must reject a regression
  where that button directly calls form submit or creates a transaction without
  an explicit `保存` action.
- transaction row left-swipe actions: edit, copy, delete.
- vertical page scrolling over transaction rows must not open the left-swipe menu.
- swipe action buttons are not present in row DOM until a deliberate left swipe passes the threshold; closing the row clears them again.
- edit/copy reuse the bookkeeping form; delete requires confirmation and calls soft void.
- bottom nav keeps five root views available and renders as a floating capsule tab bar; in `?embed=hermes` mode it follows a compact bottom-tab area: content ends above the fixed tab area, the nav frame is transparent, tabs use fixed equal columns, the row does not horizontally scroll or overflow past the available width, the embedded row uses a 6px bottom offset aligned with Wardrobe's mobile bottom-tabs placement, Finance does not add a second safe-area bottom inset inside the plugin iframe, host-provided `dark` / `light` themes use matching button fills, and light mode must not leave a full-width black footer behind the tab buttons.
- embedded bottom tab state keeps the bottom-tab token model: `--bottom-tabs-*` controls sizing/spacing only, `--bottom-tab-*` controls normal/active tab fills, and active tabs keep a visible solid/inset outline in both dark and light themes.
- embedded bottom-nav structure avoids large opaque backing: the nav frame and separate pseudo-element backing are transparent/hidden, while individual tab buttons remain opaque and outlined. Finance pages that hide the tabs, including `entry` and detail/report detail routes, must hide the embedded nav area as well so it cannot cover fixed controls.
- settings overlay。
- report UI。
- bookkeeping note/date UI: the entry meta strip shows fixed `备注` and `日期` controls; `备注` opens a bottom input sheet and writes back to hidden `note`, while `日期` writes to hidden `occurred_at` without displaying current time on the entry page.
- bookkeeping date sheet UI: in dark mode the date sheet must be a compact
  bottom sheet with high-contrast dark surfaces, white date/time input text,
  44px-or-taller controls, and no full-page blank spacer.
- recurring-rule create UI: in dark mode the full-screen create form, summary
  card, text fields, selects, date/time fields, end-mode segmented control, and
  close/save buttons must use dark surfaces with high-contrast text and explicit
  native control `color-scheme`; it must not render white fields with white or
  near-white text.
- delayed refresh protection: client-version polling must not immediately reload while the user is in the bookkeeping view, a note/date/member/tag sheet, or an open left-swipe action state.
- local bookkeeping draft restore: changing non-zero amount, tags, note, or
  merchant must persist a ledger-scoped local draft; default date, category,
  account, member, currency, amount `0`, or `再记` alone must not make an empty
  entry restorable. A PWA/WebView reload must restore a valid content-bearing
  draft and reopen the bookkeeping page after overview loads. A valid startup
  draft must take precedence over an initial `pluginRoute=record` route, and
  the route must be marked handled after the draft wins. Successful save,
  explicit entry-page back, and restored-then-exit-without-edit must clear it.
  Empty entry-page exits must also reset the preserved plugin view to the
  ledger home.
  The startup restore check runs once per page lifecycle, so later overview
  refreshes such as switching CNY/HKD/USD must not reopen bookkeeping from an
  old draft. The draft must remain client-local and must not create a
  transaction before `保存`.

视觉 smoke 待恢复：

- 移动 390x844。
- 桌面 960+。
- 当前 Playwright 依赖缺 `playwright-core`，暂不能作为必过门禁。

### 4.3 静态客户端自动刷新

运行：

```powershell
node tests\finance-server.test.js
node tests\app-finance-ui.test.js
```

覆盖：

- `/api/finance/client-version`。
- 前端轮询。
- 版本变化后 pending reload contract；只有 root 首页空闲状态才执行 reload。

## 5. H3 对应测试

纯文档或小 helper：

```powershell
git diff --check
npm run check
```

中文文档编辑后额外检查：

- 不使用 PowerShell `Set-Content`、`Out-File` 重写。
- 不引入新的乱码段落。
- 不写入 raw ledger data。

## 6. 发布前 smoke

服务重启：

```powershell
$env:FINANCE_MCP_HOST='0.0.0.0'
$env:FINANCE_MCP_PORT='8791'
npm start
```

检查：

```powershell
Get-NetTCPConnection -LocalPort 8791 -State Listen
Invoke-RestMethod -Uri 'http://127.0.0.1:8791/api/finance/client-version'
Invoke-RestMethod -Uri 'http://127.0.0.1:8791/api/finance/overview'
```

如果前端改动：

- 重启服务。
- 确认 client-version 返回 ok。
- 打开 `/finance.html` 手工检查受影响页面。

## 7. 待补测试清单

- `tests/finance-access-policy-service.test.js`
- `tests/finance-mcp-permissions.test.js`
- `tests/finance-hermes-toolset-routing.test.js`
- `tests/finance-mcp-privacy.test.js`
- `tests/finance-export-service.test.js`
- `tests/finance-backup-service.test.js`
- `tests/app-finance-report-ui.test.js`
- 浏览器视觉 smoke。

## Hermes Embedded Plugin Contract

Run these focused tests after changing the embedded-app plugin contract:

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

Coverage requirements:

- manifest shape includes `id=finance`, `type=embedded-app`, launch URL, toolsets, permissions, and embedding event names.
- launch exchange never copies long workspace or user keys into `entry_path`.
- `/finance.html?embed=hermes&v=<static-version>` hides duplicate app chrome and keeps direct main-function access. The static version query must change with frontend deployments so Hermes iframe lifecycle/cache cannot keep an old Finance shell.
- The embedded-plugin manifest and launch redirect must use the same current static version as `public/finance.html`; tests should fail if the manifest entry remains on an older hard-coded `finance-replica-*` value.
- iframe postMessage payloads contain only bounded route metadata.
- host back events produce `finance.plugin.back_result` and a fresh `finance.plugin.navigation` state after the result.
- non-home Finance pages inside the plugin, including the bookkeeping `entry` page, report `canGoBack=true` and consume host back before returning to Hermes Mobile.
- embedded root-page left-edge swipe must be captured by Finance and reported as `handled:false` with a fresh root navigation state, so Hermes Mobile exits the plugin instead of the WebView/native history returning to the device desktop.
- refresh requests are throttled and use a strict payload whitelist.
- same-origin proxy paths keep structured static/API/resource URLs.
- dark-mode and PWA restore must not introduce an initial white flash.
- appearance sync v133 accepts only bounded host `pluginTheme`/`pluginFontSize` values, applies them before first visible render, and does not leak keys/tokens/cookies/private data into URLs or postMessage payloads.
- embedded mobile layout covers root pages, secondary pages, overlays, and back behavior.
- tests and logs must not include raw keys, tokens, cookies, complete sensitive bills, receipt text, or long raw logs.

## Installed PWA Harness

Use this gate after mobile/PWA-affecting changes:

```powershell
adb devices
npm run verify:pwa:android -- --install
```

Rules:

- Start Finance from the Android Launcher PWA icon.
- Do not use `adb am start -d <url>` or Chrome/Safari address-bar loading as PWA pass/fail evidence.
- Screenshots must show standalone PWA shell with no browser address bar.
- If no Finance icon exists, install with Chrome `Install app` / `Add to Home Screen`, then return to Launcher and launch the icon.
- Bookkeeping entry screenshots and probes must validate the active theme and at least four full quick-category rows before the note/meta/keypad area.
- Bookkeeping entry meta chips must stay baseline-aligned; the account selector must not duplicate currency labels because currency is bound to the selected account; the `日期` chip should start close to the left edge, the `标签` text must not be covered by the sticky camera region, the `备注` button must sit before the camera/attachment button, and the camera/attachment button must remain pinned on the right side of the meta row with a vertically centered orange icon.
- Bookkeeping entry must not display a separate currency chip; transaction currency is derived from the selected source account's currency and kept in a hidden form field for API compatibility.
- Bookkeeping entry default category must be time-aware for meal periods: breakfast, lunch, dinner, and late-night snack are preferred only when the matching category exists.
- Bookkeeping quick category chips must sort by historical transaction count first, with the Wacai-style fallback order used only when usage counts tie or are missing.
- Bookkeeping entry must be a fixed-screen workflow: the page itself does not drag, only the middle category shortcut list scrolls, and the left current-category button opens a Wacai-like full category picker that writes back to the existing hidden `category_hint` field. The picker shows top-level categories first, expands parent rows to reveal child categories, and includes a search field for locating any category directly.
- Bookkeeping amount entry must use the fixed custom keypad and keep the amount visible; the keypad must keep a left/right safe touch gutter so the left numeric column remains tappable instead of sitting on the screen edge. Tapping the amount display must not open the native iOS/Android keyboard, put the shell into keyboard-focus padding mode, or show a text selection/callout box. Keypad buttons must not be page-selectable.
- Bookkeeping member and tag controls must open visible choice sheets. The meta strip containing date/account/member/tag/attachment controls must be a single-row horizontal scroller only: no vertical drag, no wrapping, and long member names such as `家庭公用` must not push the tag chip onto a second row. Member choice writes back to `member_hint`; tag choice submits a `tags` array. The current bookkeeping page does not expose a merchant input. Overview must expose tag master data for the selector, and transaction list projection must preserve bounded tag names for edit/copy prefill.
- Bill search must support the Wacai copy-entry workflow: searching `/api/finance/transactions?search=<text>` returns bounded scoped matches, the all-bills page renders those results, and each result keeps the same left-swipe edit/copy/delete actions so copy opens the bookkeeping form prefilled from the selected bill. Copy must default `occurred_at` to the current time instead of copying the source bill time; edit keeps the source bill time. If the copied amount is still pristine and the user taps a numeric key, the first numeric input must replace the copied amount from zero instead of appending to it. Submitting the bill-search input with the native keyboard must blur the input and collapse the native keyboard so results are not covered.
- Native Wacai observation is reference material, but the current Web/PWA bookkeeping rule avoids an always-visible inline note row. The page exposes a `备注` meta button before the camera button; tapping it opens a bottom note input sheet, and `完成` writes back to hidden `note`.
- The visible date control on the entry page must remain fixed text `日期`; current date/time is stored only in hidden `occurred_at` and edited through the date sheet.
- Repeated note open/close cycles must not leave stale keyboard offset, blank keypad reservation, or a full-page reload. While the note/date/member/tag sheet is open, client-version refresh remains pending until root-home idle state.
- Reload/resume checks must cover local bookkeeping draft recovery: after
  entering a partial non-zero amount or other user-authored content, a hard
  reload or PWA/WebView process restart should return to the entry page with
  the draft restored. Reloading an empty/default entry must not reopen the
  entry page, and a restored draft that is exited without edits must be cleared
  and return the preserved plugin view to the ledger home.
  Attachments are excluded because browser file handles cannot be restored.
- Dark-mode PWA resume must not flash a light canvas when returning from another app. The HTML shell must include the inline `finance-anti-flash` dark background before external CSS, and both manifests must keep `background_color: "#000000"` with dark `theme_color`.
- Note focus visual checks must validate the focused note overlay against the simulated/real Finance iframe visual viewport rectangle. The overlay height must match the visible work area (`--finance-app-height`), the overlay top must come from Finance's own `visualViewport.offsetTop` or iframe `scrollY` (`--finance-app-top`) when iOS pans the iframe, the sheet must stay above the keyboard, and the page must not jump to a blank top area. The check must also cover the mobile iframe case where the note overlay is open but `document.activeElement` is temporarily not the textarea during native keyboard transition. In `?embed=hermes` mode, Home AI `hermes.plugin.viewport` messages may be present for host chrome/bottom-reservation diagnostics, but Finance must not use those host viewport offsets as the native keyboard rectangle for note input.
- Input/search focus must hide bottom floating navigation and the embedded tab area while the keyboard is active, and must compress the shell bottom padding so search results are not hidden by an empty reserved area. The ledger root topbar left icon stays as an invisible spacer so the ledger switch remains centered, and the right icon opens bill search.
- The camera/attachment action sheet must expose camera capture, photo upload, and generic file upload. Attachments must upload only after the transaction exists, return structured `/api/finance/attachments/:id` URLs, and preserve the file response `Content-Type`.
- MCP `finance.create_transaction` may attach up to 6 photos/files in the same create call using bounded base64 payloads or allowed server-local upload paths, and `finance.add_transaction_attachment` may attach one photo/file later by `transaction_id`; focused tests must assert returned attachment metadata, image-store recovery, refreshed attachment counters, upload-path MIME inference, `MEDIA:<path>` data_url compatibility under the same upload-root allowlist, disallowed-path rejection, no duplicate attachment writes on idempotent create replay, and schema descriptions that tell Hermes callers to prefer `file_path` / `upload_path` for existing upload files instead of reading binary bytes into base64.
- Transaction list projection must expose bounded attachment counts and an image indicator for rows with image attachments. Detail projection must load attachment metadata, show image thumbnails, open a large preview, and provide an add-attachment action that reuses the camera/photo/file action sheet to upload directly to the current transaction without exposing raw file contents in tests or logs.
- Original attachment bytes must be recoverable from the independent image SQLite store keyed by `attachment_id`. Thumbnail bytes are derived cache artifacts and must not be stored in that image SQLite database.
- The top ledger selector must list user-owned ledgers, switch the active `ledger_id` for overview/report/transaction/entry calls, and allow creating a new ledger with default master data.
- Wacai import filename parsing must infer `日常账本` from `wacai_日常账本_...xlsx`; row-level Wacai data currently has no separate ledger column.
- Physical-device install evidence should use browser-facing HTTPS when possible. Local HTTP origins such as `127.0.0.1` through `adb reverse` or LAN `192.168.x.x` can load in Chrome but may fail to mint a real Launcher WebAPK on Samsung/Chrome; classify that separately from Finance UI rendering.
- If UIAutomator exposes only generic WebView, use bounded DevTools/WebView state as support and do not record keys, cookies, tokens, push endpoints, full bill contents, receipt OCR text, or long logs.

Finance plugin checks:

- standalone Finance PWA launches from Launcher;
- Hermes Mobile Finance iframe opens without manifest failure;
- plugin root page is not covered by Hermes input/bottom tab UI;
- secondary-page back behavior follows `hermes.plugin.back` / `finance.plugin.back_result`;
- same-origin proxy resources use browser-facing URLs.

## Finance User Binding and Access Tokens

Use this gate after user/auth changes:

```powershell
node tests\finance-transaction-service.test.js
node tests\finance-user-binding-service.test.js
node tests\finance-server.test.js
node tests\finance-mcp-server.test.js
node tests\architecture-boundary.test.js
npm test
npm run check
```

Coverage requirements:

- Home/all transaction lists load 30 rows initially and append the next 30 rows
  when scrolling reaches the bottom.
- Transaction row metadata in home/all/report detail lists follows Wacai-style
  row hierarchy: title and amount on the first line, optional note/merchant on
  the next line, and date-time (`YYYY/MM/DD HH:mm`) plus account/member on its
  own metadata line. It must not collapse note, date, account, and member into
  one wrapped line or show only the clock time.
- `finance.list_transactions` and `/api/finance/transactions` expose bounded
  `limit` plus `offset` pagination; report totals remain independent from this
  paginated list projection.
- The frontend keeps a bounded stale-runtime fallback: when an offset page
  returns only duplicate rows, it requests a larger first-window limit and
  appends only unseen rows. This protects NAS deployments whose static source is
  updated while the Finance container has not yet reloaded backend route code.
- Wacai-like category icon coverage checks that common imported category names
  map to specific colored circular glyphs, and that generic fallback remains
  only for unknown categories.
- `user_xuxin` owns the existing `daily` ledger and imported Wacai history.
- Hermes administrator workspace resolves to `user_xuxin`.
- Approved new Hermes workspace creates an isolated Finance user and default ledger.
- Unknown Hermes workspace must not silently fall back to `user_xuxin`.
- Independent access token creation stores only `sha256:*` hashes and resolves API requests to the token user's ledger.
- Scoped UI/API/MCP requests cannot override the resolved ledger with `ledger_id=daily`.
- Scoped overview rows for accounts, categories, and members come from the token/session ledger.
- Scoped transaction writes reject master-data ids from another ledger.
- Scoped update and void reject transaction ids from another ledger.
- `finance.list_transactions` and `finance.get_report` schemas stay in parity with service filter and dimension support.
- Hermes workspace user-binding administration is loopback-only until a stronger admin-auth contract is implemented.

## Report Totals and Historical Wacai Data

Use this gate after changing report aggregation, period selection, currency filters, Wacai import mapping, or the report UI request shape:

```powershell
node --check adapters\finance-report-service.js
node --check adapters\finance-repository.js
node --check mcp\finance-mcp-server.js
node --check public\app-finance-ui.js
node tests\finance-report-service.test.js
node tests\finance-mcp-server.test.js
node tests\app-finance-ui.test.js
npm test
npm run check
git diff --check
```

Required coverage:

- Report totals are not truncated by `listTransactions()` pagination.
- Year/quarter/month reports use ledger local-day boundaries, currently `Asia/Shanghai` for the default ledger.
- Report UI year/quarter/month shortcut tabs default to the current local year/current local quarter/current local month; manual picker selections remain explicit.
- Report UI renders the full breakdown list without a three-row cap or expand/collapse button.
- Report totals are currency-scoped and default to `CNY` for non-account dimensions; `HKD`, `USD`, and `EUR` are queried separately unless an explicit FX conversion service is added.
- MCP `finance.get_summary` and unfiltered `finance.get_report` totals include all members in the resolved workspace ledger by default; current Hermes member defaults still apply to write/list workflows unless an explicit member filter is supplied.
- Account-dimension report requests may omit `currency` and must include original-currency account rows without FX conversion.
- `finance.get_report`, `/api/finance/report`, and frontend report requests preserve the selected currency except for the original-currency account report path.
- Top-right UI currency switching must use
  `/api/finance/overview?summary_only=1&currency=<code>` and re-render the
  local overview, including the visible transaction list for the selected
  currency. This path must not fetch live stock prices/FX or trigger draft
  restore; visual evidence should show the view remains on home/reports and the
  selected currency appears within one second.
- Real historical import smoke may compare only aggregated counts and minor-unit sums by year/type/currency; do not record raw bill details in test evidence.

## Account UI and Foreign-Currency Accounts

Use this gate after changing account list projection, account selectors, account import mapping, or currency display:

```powershell
node --check public\app-finance-ui.js
node tests\app-finance-ui.test.js
npm test
npm run check
git diff --check
```

Required coverage:

- `/api/finance/overview` returns all active ledger accounts, including imported HKD/USD/EUR accounts.
- Account page rows are grouped or otherwise clearly labeled by currency.
- Entry account selectors show account names only. Currency is derived from the selected account and submitted through the hidden compatibility field.

## Ledger Harness

Minimum focused validation after ledger changes:

```powershell
node tests\finance-ledger-service.test.js
node tests\finance-server.test.js
node tests\finance-mcp-server.test.js
node tests\finance-wacai-import-service.test.js
node tests\app-finance-ui.test.js
```

Checks:

- `daily` display name is `日常账本`.
- New ledgers are isolated by `owner_user_id` and seed default accounts, members, and categories.
- Scoped users cannot force another user's ledger through HTTP or MCP.
- UI API `ledger_id` switches overview, transaction writes, and reports to the selected ledger.
- MCP includes `finance.list_ledgers` and `finance.create_ledger`.
- Wacai-like ledger templates are exposed by service/MCP/UI creation flow, and the UI also exposes a custom-name ledger creation path outside the template list.
- Ledger sharing uses `finance_ledger_memberships`; only Owner can share a ledger.
- Shared ledger access is full-ledger access. Ledger members are reporting dimensions; `finance_member_visibility` is legacy compatibility state and must not drive active permission behavior.
- Owner invite is Finance-user mediated: Finance UI must select a target Finance user from `finance_user_candidates`, keep ledger members as reporting dimensions only, create a bounded invitation event with the target Finance user, and accept only through that target user's current Hermes/Finance context.
- Target users must be able to list pending invitations through `GET /api/finance/ledger-invitations?status=pending` and accept from the Finance ledger menu `加入共享账本` panel. Hermes Inbox/postMessage delivery is optional evidence only and cannot be the only passing path.
- Ledger join does not expose QR/link invitation UI. Join requests create `finance_ledger_join_requests`, return a bounded Hermes Inbox event, and require Owner review before membership/visibility is written.
- Static asset version and service worker cache version are bumped after frontend account UI changes.

## Shared Ledger Harness Rule

Shared-ledger tests must assert that a non-owner shared Finance user can read all ledger member dimensions and receives `member_scope: "all_shared_ledger_members"`. Tests must not model `finance_members` as permission scopes.

## Ledger Invitation Acceptance Harness Rule

`tests/finance-ledger-service.test.js`, `tests/finance-server.test.js`, and `tests/app-finance-ui.test.js` must cover the Finance-native invitation acceptance path: create invitation, list pending invitations as the target Finance user, show `加入共享账本`, click `同意`, and verify the resulting shared-ledger membership. Optional Hermes Inbox delivery may remain, but Finance must not depend on it for invitation acceptance.

## Frontend Mojibake Harness Rule

`tests/app-finance-ui.test.js` must scan `public/finance.html` and `public/app-finance-ui.js` for common mojibake/replacement characters before UI changes are considered valid. This catches Windows encoding regressions in static menu labels such as ledger, entry, report, account, and settings controls.

## 2026-06-04 Wacai Home Service Grid Update

- `node --check public\app-finance-ui.js`
- `node tests\app-finance-ui.test.js`
- Verify that the home page exposes quick entry, details, calendar/report, recurring bookkeeping, and all-services icon buttons.
- Verify that the all-bills page exposes a visible recurring bookkeeping shortcut.
## 2026-06-04 Wacai Scale Repair and Year Summary Update

- Verify batch `import_02db2c628ac2d322` aggregate amounts after scale repair without logging raw rows.
- Verify `recurring_wacai_%` aggregate amounts after scale repair without logging raw rules.
- After any Wacai scale/member/tag data repair, verify `raw_participant_name` matches stored transaction member by aggregate count and that rows with `raw_tags` have stored tag links, without logging raw bill rows.
- `node --check public\app-finance-ui.js`
- `node tests\app-finance-ui.test.js`
- `node tests\finance-recurring-service.test.js`
- `node tests\finance-mcp-server.test.js`
- `npm run check`

## 2026-06-05 Bill Search and Transaction Detail Projection

Use this gate after changing the bill-search entry point, transaction write
responses, list projection, or transaction detail rendering:

```powershell
node --check adapters\finance-repository.js
node --check adapters\finance-transaction-service.js
node --check public\app-finance-ui.js
node tests\finance-transaction-service.test.js
node tests\finance-server.test.js
node tests\app-finance-ui.test.js
npm run check
git diff --check
```

Required coverage:

- Clicking the home search button opens the all-bills page and focuses the bill
  search input by default, with a short delayed retry for PWA/iOS rendering.
- `listTransactions()`, create, idempotent duplicate create, update, and void
  responses return the public joined transaction projection rather than a raw
  `finance_transactions` row.
- The public projection includes category, account, target account, member,
  merchant, tags, and bounded attachment counters. Transaction detail rendering
  must list the tag names, so a just-saved or copied transaction detail page
  does not show selected fields as unrecorded.
