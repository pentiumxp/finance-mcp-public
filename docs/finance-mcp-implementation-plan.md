# Finance MCP 实施文档

日期：2026-05-28

## 1. 当前实现状态

项目已经进入可运行原型阶段：

- Node.js CommonJS runtime。
- SQLite 持久化，使用 `node:sqlite`。
- 独立 HTTP/UI 服务：`server.js`。
- MCP contract/dispatcher：`mcp/finance-tool-contract.js`、`mcp/finance-mcp-dispatcher.js`、`mcp/dispatchers/*.js`。
- 服务层：`adapters/`。
- API route：`server-routes/finance-api-routes.js`。
- 原生前端：`public/finance.html`、`public/app-finance-ui.js`、`public/styles.css`。
- 测试：`tests/*.test.js`。

启动：

```powershell
npm install
npm run migrate
$env:FINANCE_MCP_HOST='0.0.0.0'
$env:FINANCE_MCP_PORT='8791'
npm start
```

访问：

```text
http://127.0.0.1:8791/finance.html
```

## 2. 目录职责

```text
adapters/
  finance-repository.js              # SQLite schema, seed, query, transaction helper
  finance-money.js                   # amount parsing, minor unit formatting, percentage basis points
  finance-transaction-service.js     # create/list/update/void, balance impact, audit
  finance-attachment-input-service.js # attachment payload normalization, upload-root allowlist, schema helpers
  finance-attachment-service.js      # attachment persistence, image store, thumbnails, audit
  finance-transaction-attachment-service.js # create transaction with bounded attachments
  finance-report-service.js          # summary/report aggregation
  finance-owner-asset-service.js     # Owner-only annual asset snapshots and components
  finance-member-binding-service.js  # Hermes member binding
  finance-plugin-registration-service.js # Hermes callback URL registration
  finance-reference-service.js       # Home AI Reference Contract V1 refs
  finance-wacai-import-service.js    # Wacai XLSX import mapping
  finance-runtime.js                 # runtime wiring

mcp/
  finance-mcp-server.js              # thin runtime/register/CLI compatibility glue
  finance-tool-contract.js           # finance tool schemas and shared contract constants
  finance-mcp-dispatcher.js          # MCP dispatcher core and domain dispatcher routing
  finance-mcp-args.js                # MCP snake_case/camelCase argument normalization
  finance-mcp-context.js             # Hermes identity and scoped ledger context helpers
  dispatchers/*.js                   # domain-specific MCP tool dispatchers

server-routes/
  finance-api-routes.js              # local UI API glue

public/
  finance.html                       # standalone Finance UI shell
  app-finance-ui.js                  # UI state, API calls, report drilldown, auto refresh
  styles.css                         # Hermes-like local UI styling
  manifest.webmanifest               # PWA install metadata
  service-worker.js                  # PWA static shell cache, excludes API calls
  icons/finance-icon.svg             # PWA launcher icon

scripts/
  finance-migrate.js                 # migration runner
  finance-smoke.js                   # runtime smoke
  finance-platform-contract-smoke.js # local Home AI platform/MCP contract smoke
  import-wacai-xlsx.js               # Wacai import CLI
  import-owner-asset-xlsx.js         # Owner asset workbook import CLI
  import-owner-stock-xlsx.js         # Stock holding initialization import CLI

tests/
  architecture-boundary.test.js
  privacy-scan.test.js
  finance-*.test.js
  app-finance-ui.test.js
```

## 3. 服务初始化

`createFinanceRuntime` 负责组装运行时：

1. 解析 DB path：`options.dbPath` -> `FINANCE_MCP_DB_PATH` -> `data/finance.sqlite3`。
2. 创建 repository。
3. 执行 `repository.migrate()`。
4. 执行 `repository.seedDefaults()`。
5. 创建 transaction/report/ownerAsset/memberBinding/reference/wacaiImport services。
6. 返回可关闭的 runtime。

规则：

- 入口文件只做 wiring，不放业务决策。
- 新业务默认放到 `adapters/<domain>-service.js`。
- route 和 MCP dispatcher 只做参数归一化、权限上下文、service 调用和 projection。

## 4. 数据库实施

### 4.1 migration

`finance-repository.js` 当前创建：

- schema migration 表。
- ledger/member/member binding。
- currency/account/category/merchant/tag。
- transaction/participant/tag/attachment。
- plan。
- audit。
- Wacai import batch/source fields。
- Owner asset snapshots/components。
- Stock holding snapshots/positions。

当前 schema version：`12`。

### 4.2 seed

默认 seed：

- ledger：`daily`。
- accounts：现金、银行卡、应付。
- members：自己、家庭公用。
- expense categories：餐饮、交通、居家、服饰、医疗。
- income categories：工资薪水、奖金、退款。
- currencies：CNY、HKD、USD、EUR、JPY。

### 4.3 过滤实现

交易查询支持：

- `ledgerId`
- `type`
- `startDate`
- `endDate`
- `includeVoided`
- `memberId`
- `categoryId`
- `categoryParentId`
- `accountId`
- `merchantId`
- `tagId`
- `limit`

`categoryParentId` 语义：

- 命中交易分类本身等于该 ID。
- 或交易分类的父分类等于该 ID。

`tagId=untagged` 语义：

- 仅返回没有任何标签的交易。

## 5. 金额与货币实施

`finance-money.js` 是唯一金额工具入口。

规则：

- 外部输入金额使用 string，例如 `"86.50"`。
- 内部存储使用 `amount_minor` integer。
- `scale` 按货币确定，CNY/HKD/USD/EUR 默认为 2，JPY 为 0。
- 报表百分比返回 basis points，避免浮点聚合污染。
- 交易保留原始 `currency`，当前不做自动汇率折算。

Wacai 2025 导入：

- 输入金额实际缩小 100 倍。
- 运行导入时设置 `FINANCE_WACAI_AMOUNT_MULTIPLIER=100`。
- 导入后交易仍保留源币种。

## 6. 交易服务实施

文件：`adapters/finance-transaction-service.js`

### 6.1 createTransaction

输入归一化：

- `ledger_id` -> `ledgerId`
- `occurred_at` -> `occurredAt`
- `account_hint` -> `accountHint`
- `category_hint` -> `categoryHint`
- `member_hint` -> `memberHint`
- `idempotency_key` -> `idempotencyKey`

执行流程：

1. 检查写权限，`readOnly` context 拒绝。
2. 校验 `type`。
3. 解析货币和金额 minor units。
4. 解析账户、目标账户、分类、成员。
5. upsert 商家和标签。
6. 检查 idempotency key。
7. 在 DB transaction 内写交易。
8. 写交易标签。
9. 更新账户余额。
10. 写审计。
11. 返回 public projection。

余额影响：

- expense：来源账户减少。
- income：来源账户增加。
- transfer：来源账户减少，目标账户增加。

### 6.2 updateTransaction

执行流程：

1. 读取原交易。
2. 拒绝不存在或 voided 交易。
3. 用 patch 重新 resolve 输入。
4. 在同一 DB transaction 内 reverse old impact。
5. 更新交易。
6. apply new impact。
7. 替换 tags。
8. 写审计。

### 6.3 voidTransaction

执行流程：

1. 读取原交易。
2. 如果已 voided，返回 alreadyVoided。
3. reverse balance impact。
4. 设置 `status=voided` 和 `voided_at`。
5. 写审计。

## 7. 报表服务实施

文件：`adapters/finance-report-service.js`

### 7.1 getSummary

输入：

- `period`
- `date`
- `startDate`
- `endDate`
- `ledgerId`
- 其他过滤条件

输出：

- income/expense/net minor。
- income/expense/net display string。
- count。
- period bounds。
- timezone。
- aggregation basis。

### 7.2 getReport

输入：

- `period`
- `metric`
- `dimension`
- `filters`

当前维度：

- `trend`
- `category`
- `subcategory`
- `member`
- `account`
- `merchant`
- `tag`

实现细节：

- `tag` 使用 `repository.reportTagRows`。
- 其他维度使用 `repository.reportRows`。
- `metric=net` 时支出取负。
- `category` 按父分类汇总。
- `subcategory` 按实际交易分类汇总。
- `trend` 当前以日期 key 形成 series。
- totals 复用 `getSummary` 并带同样 filters。

## 8. Wacai 导入实施

文件：

- `scripts/import-wacai-xlsx.js`
- `adapters/finance-wacai-import-service.js`

流程：

1. 读取 xlsx。
2. 解析列名。
3. 标准化日期、类型、金额、币种。
4. 解析分类路径，创建父/子分类。
5. upsert 账户、成员、商家、标签。
6. 生成确定性 idempotency key。
7. 调用 transaction service 写入交易。
8. 写入 source fields。
9. 更新 import batch 计数。

当前本地导入结果：

- 1035 条 Wacai 交易。
- 1024 条 expense。
- 11 条 income。
- 交易币种包含 CNY/HKD/USD。
- 原始字段全部保存在 `finance_transaction_source_fields`。

注意：

- 原始 xlsx 文件不写入 git。
- 导入后的 `data/finance.sqlite3` 不写入 git。
- 任何导入重跑前要确认 multiplier。

## 9. MCP 实施

文件：

- `mcp/finance-mcp-server.js`
- `mcp/finance-tool-contract.js`
- `mcp/finance-mcp-args.js`
- `mcp/finance-mcp-context.js`
- `mcp/finance-mcp-dispatcher.js`
- `mcp/dispatchers/*.js`
- `scripts/finance-plugin-dispatch.js`
- `gateway-plugins/hermes-mobile-finance/plugin.yaml`
- `gateway-plugins/hermes-mobile-finance/__init__.py`

当前实现：

- `mcp/finance-tool-contract.js` 是 `TOOL_SCHEMAS` 的唯一声明位置。
- `finance.create_transaction.attachments[]` 和 `finance.add_transaction_attachment` 的 payload source schema 复用 `adapters/finance-attachment-input-service.js` 的字段注册表。
- `mcp/finance-mcp-args.js` 归一化 snake_case/camelCase。
- `mcp/finance-mcp-context.js` 解析 Hermes identity、actor、role 和 scoped ledger。
- `mcp/finance-mcp-dispatcher.js` 暴露 `dispatch` 和 `register`，并组合 `mcp/dispatchers/*.js` 的领域 dispatcher。
- `mcp/finance-mcp-server.js` 只保留 runtime 创建、导出兼容和 CLI 模式。
- Hermes Gateway plugin 声明 `finance` toolset，并通过本地 dispatcher 调用 Finance。
- 插件默认连接 `http://127.0.0.1:8791`，可用 `FINANCE_MCP_URL` 指定其他
  localhost 端口。
- `server-routes/finance-api-routes.js` 暴露 loopback-only bridge：
  `GET /api/finance/mcp/schemas`、`POST /api/finance/mcp/dispatch`、
  `POST /api/finance/mcp/register` 和 `GET /api/finance/mcp/registration`。
- `finance-plugin-registration-service.js` 持久化 Hermes Mobile callback URL。
  HTTPS 域名 URL 可保存；HTTP 只允许 loopback 开发地址；URL userinfo
  中不得携带凭据。
- Gateway plugin 启动时如果发现 `FINANCE_HERMES_CALLBACK_URL` 或
  `HERMES_MOBILE_CALLBACK_URL`，会先调用 registration endpoint，再拉取 tool
  schemas。
- Dispatcher 会根据 Hermes handler context 自动解析当前 workspace user key，
  缺少本地 member 时自动创建并绑定。
- `finance_member_bindings.external_user_id` 只保存 workspace-scoped `sha256:*`
  值，不保存 raw workspace user key。

当前工具：

- `finance.create_transaction`
- `finance.add_transaction_attachment`
- `finance.list_transactions`
- `finance.update_transaction`
- `finance.void_transaction`
- `finance.get_summary`
- `finance.get_report`
- `finance.reference_object_types`
- `finance.reference_get`
- `finance.reference_summarize`
- `finance.list_accounts`
- `finance.list_currencies`
- `finance.list_categories`
- `finance.list_members`
- `finance.resolve_current_member`
- `finance.bind_member`

Reference Contract V1:

- `finance.reference_object_types` lists supported object types:
  `transaction`, `account`, and `category`.
- `finance.reference_get` returns a permission-checked bounded object reference.
- `finance.reference_summarize` returns a permission-checked bounded summary.
- Stable identity follows
  `workspace_id + plugin_id + object_type + object_id`.
- Full Finance details remain owned by Finance and must be read through Finance
  permission-checked MCP/API paths; Note or graph layers may cache only bounded
  display snapshots.

## 10. HTTP/UI API 实施

文件：`server-routes/finance-api-routes.js`

当前 endpoint：

- `GET /api/finance/client-version`
- `GET /api/finance/overview`
- `GET /api/finance/transactions`
- `GET /api/finance/report`
- `POST /api/finance/transactions`
- `POST /api/finance/transactions/:id/void`

过滤解析：

- `category_id` -> `categoryId`
- `category_parent_id` -> `categoryParentId`
- `member_id` -> `memberId`
- `account_id` -> `accountId`
- `merchant_id` -> `merchantId`
- `tag_id` -> `tagId`

注意：

- HTTP/UI API 是本地管理投影，不是 Hermes 集成路径。
- Finance 写入集成必须走 MCP。
- 当前 HTTP 服务阶段性默认 `0.0.0.0`，只适合可信 LAN。
- `GET /api/finance/owner-assets/summary` and
  `GET /api/finance/owner-assets/snapshots` expose Owner-only asset projections
  for the local UI. Non-Owner contexts fail closed through
  `finance-owner-asset-service`.

## Owner 资产快照实施

- `adapters/finance-owner-asset-service.js` 负责 Owner-only 资产快照业务规则。它只允许 `role="owner"` 且 Finance user 为 `user_xuxin` 的上下文读写；非 Owner 返回 `finance_owner_assets_owner_required`，read-only 写入返回 `finance_write_denied`。
- `finance_owner_asset_snapshots` 保存年度快照主记录；`finance_owner_asset_components` 保存美元账户、人民币银行余额、证券余额、家托、国内总额、其它投资等组件。
- 金额字段使用 minor units；汇率使用 ppm；年度回报率、复合增长率和总回报倍数使用 basis points。
- 手工/MCP 更新 Owner 资产快照时，服务层会根据当前 USD 组件、上一年度 USD 账户余额、可选的当年 USD/CNY 净投入字段和既有年度收益历史，重算 USD 年度回报率、总回报倍数和复合增长率。`source="owner_asset_xlsx"` 的导入保留工作簿显式指标，避免缺少原表投入行时改写历史口径。
- Owner asset summary reads fetch current USD/CNY through the shared market quote provider, calculate `current_total_assets_usd_minor` from the latest RMB total, persist the current FX rate/source/update time on the latest snapshot, and return those fields to UI/MCP callers. This does not overwrite the historical workbook `fx_usd_cny_rate`; live FX failures are surfaced instead of using a fixed fallback rate.
- MCP 暴露 `finance.upsert_owner_asset_snapshot`、`finance.list_owner_asset_snapshots` 和 `finance.get_owner_asset_summary`。这些工具不走普通 ledger sharing，不对非 Owner Finance user 暴露。
- `scripts/import-owner-asset-xlsx.js` 只用于将 Owner 上传的资产统计工作簿解析为结构化快照；输出限制为导入数量、年份范围和最新年份，不打印完整原始资产表。该 importer 按工作簿年度分组读取每年的汇率、美元总额、人民币国内总额和总资产，而不是只读取年份标题列；这允许历史美元资产来源在不同银行账户之间切换。缺失的组件行不会生成 0 组件。
- The standalone UI renders an `资产` bottom tab only after overview returns an
  Owner asset summary. The tab defaults to the latest snapshot and exposes a
  yearly selector for all returned snapshots so Owner can switch to a specific
  year and see that year's RMB total assets, USD-account CAGR, annual return,
  total return multiple, and component rows. The yearly selector is ordered
  latest first and scrolls the selected year into view after selection.
  Current static frontend version `finance-replica-20260612e` and service
  worker `finance-mcp-pwa-v129` also include the stock tab described below.

## 股票持仓实施

- `adapters/finance-owner-stock-service.js` owns stock holding business rules. The table names retain the `owner_stock` prefix for compatibility with the first Owner rollout, but rows are partitioned by `finance_user_id` so future Finance users can opt in independently.
- `finance_owner_stock_snapshots` stores dated portfolio snapshots; `finance_owner_stock_positions` stores position rows with ticker, market, currency, quantity micro-units, price minor units, market value, allocation bps, and FX ppm.
- `finance.get_owner_stock_summary` and the `/api/finance/owner-stocks/summary?live=1` UI endpoint return live valuation projections. They refresh stock prices and FX before calculating current portfolio value, and do not persist the query result.
- `finance.apply_owner_stock_position_delta` is the preferred long-term MCP write path for natural-language updates such as buying, selling, or adjusting a holding quantity. It uses the latest persisted snapshot as the quantity/cost basis, refreshes prices and FX, and persists a new snapshot.
- `scripts/import-owner-stock-xlsx.js` is only an initialization/migration helper for uploaded holding workbooks. It parses structured holdings, fetches current prices and FX at runtime, writes a bounded snapshot, and prints only aggregate import metadata plus a source hash.

记账页安全交互：

- The fixed amount keypad keeps a 20px minimum left safe gutter so the `1/4/7`
  column remains tappable on mobile screen edges.
- The keypad `再记` control only toggles save-after-stay mode. It does not call
  form submit; a transaction is written only through the explicit `保存`
  submit action.

## 11. 前端实施

文件：

- `public/finance.html`
- `public/app-finance-ui.js`
- `public/styles.css`

### 11.1 全局状态

`app-finance-ui.js` 维护：

- 当前 view。
- 上一个 view。
- entry type。
- local bookkeeping entry draft state and save debounce.
- overview。
- Owner asset summary and Owner-only asset tab visibility.
- selected transaction。
- report period/dimension/full rows and current-date period anchor。
- selected report item。
- report detail transactions。
- touch start 坐标。

### 11.2 导航

规则：

- root views 使用底部导航。
- secondary views 不激活底部导航。
- topbar 左侧在 root view 是设置，在 secondary view 是返回。
- 右滑返回只在 secondary view 生效。

secondary views：

- `transactions`
- `transaction-detail`
- `report-trend`
- `report-breakdown`
- `report-detail`

### 11.3 报表下钻

流程：

1. `renderReport` 渲染排行按钮。
2. 点击排行按钮保存 `selectedReportItem`。
3. 打开 `data-report-action-overlay`。
4. 选择 action：
   - trend -> 请求 `dimension=trend` 并渲染趋势页。
   - breakdown -> 请求 `dimension=subcategory` 并渲染小类占比页。
   - detail -> 请求 `/api/finance/transactions` 并渲染明细页。

### 11.4 自动刷新

流程：

1. `checkClientVersion` 请求 `/api/finance/client-version`。
2. 首次记录到 localStorage。
3. 后续签名不同则记录 pending reload，并通知 Hermes 宿主需要刷新。
4. 若当前不是 root 首页、存在可返回视图、弹层或左滑菜单，则延迟刷新。
5. 回到 root 首页且无可返回状态后写入新签名并执行 `window.location.reload()`。
6. 每 30 秒执行一次。

限制：

- 需要服务端重启后静态签名才会变化。

### 11.5 Bookkeeping Draft Restore

The create-entry page keeps a local client draft:

1. When the user changes amount, type, category, account, target account,
   member, tags, note, date, or the `再记` toggle, the frontend debounces a
   write to `localStorage`.
2. The draft key is scoped by ledger and by standalone versus Hermes embedded
   mode, so drafts are not restored into the wrong ledger or entry surface.
3. After Android / iOS kills the PWA, a WebView reloads, or static assets cause
   a full page reload, `loadOverview()` resolves the ledger context first and
   then restores a valid unexpired draft while reopening the entry page. A
   restorable draft must contain user-authored content: a non-zero amount, note,
   merchant, or tags. Default date/category/account/member/currency values,
   amount `0`, and `再记` alone do not keep an entry restorable.
4. A valid startup draft takes precedence over an initial plugin route such as
   `pluginRoute=record`; otherwise the route can open a blank bookkeeping page
   before the draft restore pass. When a draft is restored, the initial route is
   marked handled for that page lifecycle.
5. Startup draft restore is checked once per page lifecycle. Later
   `loadOverview()`-like refreshes, including report currency switching, must
   not reopen the entry page from a stale local draft.
6. Drafts expire after seven days. Successful save, explicit entry-page back,
   or restoring a draft and then exiting/hiding the plugin without a new edit
   clears the draft. Exiting/hiding an empty create-entry page also clears any
   empty draft state and resets the preserved plugin view to the ledger home.
7. Drafts are browser-local only and do not call HTTP/MCP writes. A transaction
   is created or updated only after the user explicitly taps `保存`.
8. File attachments are outside draft restore because browsers cannot safely
   persist user-selected local file handles.

### 11.6 Currency Switch And Live Stock Refresh

The top-right report/home currency switch is a local summary/report filter, not
a full app reload:

1. Frontend currency switching calls
   `GET /api/finance/overview?summary_only=1&currency=<code>` and renders the
   returned overview, including the selected-currency transaction list.
2. `summary_only=1` may return local overview data such as transactions, master
   data, asset summary, and persisted stock summary. It must not call live quote
   or FX providers.
3. Normal overview returns persisted stock snapshot metadata only for tab
   visibility. The stock page itself refreshes
   `/api/finance/owner-stocks/summary?live=1` when opened, preserving the
   product rule that current stock valuation is live-priced while keeping
   unrelated currency switching sub-second.

## 12. 测试实施

常用命令：

```powershell
node --check public\app-finance-ui.js
node --check server-routes\finance-api-routes.js
node --check adapters\finance-repository.js
node --check adapters\finance-report-service.js
npm test
npm run check
git diff --check
```

当前测试覆盖：

- UI shell、报表下钻 DOM contract、自动刷新 contract。
- service-first 架构边界。
- privacy scan。
- money helper。
- transaction create/void/transfer。
- report category/subcategory/tag/filter。
- member binding。
- MCP dispatcher。
- server listen/client-version。
- Wacai import。

视觉验证状态：

- 曾尝试 Playwright smoke。
- 当前 bundled runtime 缺 `playwright-core`，因此暂未完成浏览器截图验证。
- 后续修复依赖后应验证移动宽度和桌面宽度。

## 13. 运行和验证流程

### 13.1 重启局域网服务

```powershell
$env:FINANCE_MCP_HOST='0.0.0.0'
$env:FINANCE_MCP_PORT='8791'
npm start
```

验证监听：

```powershell
Get-NetTCPConnection -LocalPort 8791 -State Listen
```

### 13.2 API smoke

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8791/api/finance/client-version'
Invoke-RestMethod -Uri 'http://127.0.0.1:8791/api/finance/report?period=all&metric=expense&dimension=category'
```

报表下钻 smoke：

1. 请求 category report。
2. 取第一项 key。
3. 请求 subcategory report with `category_parent_id=<key>`。
4. 请求 transactions with `category_parent_id=<key>`。

## 14. 下一阶段实施顺序

优先级从高到低：

1. MCP schema 补齐 report/list filters。
2. update transaction balance recomputation 增加更细测试。
3. UI 增加成员、分类、账户管理页。
4. 计划/周期账单 service 和 MCP tools。

## 2026-06-04 Recurring Rule Implementation

- `adapters/finance-recurring-service.js` owns recurring bookkeeping business logic. HTTP, MCP, and UI callers are glue only.
- `finance_recurring_rules` stores the recurring rule template separately from `finance_plans` so scheduled bookkeeping and future plan/todo features do not share one state model.
- Due generation calls `transactionService.createTransaction()` with `source="recurring"` and a deterministic `idempotency_key` / `source_ref` derived from the rule id and due timestamp.
- `adapters/finance-recurring-scheduler-service.js` owns automatic recurring posting for the local HTTP runtime. `server.js` only wires and starts it after the server is listening.
- Automatic posting runs one immediate startup tick and then repeats on a timer. It queries only ledgers with active due recurring rules, calls the existing idempotent generation path, and drains missed occurrences until no due rows remain for the current timestamp. This makes service restart the catch-up path after downtime or a stopped timer.
- The local UI plan page lists recurring rules and can trigger bounded due generation. The bookkeeping entry date field opens a Wacai-style full date panel; saving there only applies the selected date/time, while `保存为周期账` switches into a Wacai-style recurring-entry overlay with the current entry form as the template. The overlay reports save/errors in place and treats an empty end date as a visible `永续` choice.
- Manual due generation through the UI/API/MCP path remains available and shares the same idempotency keys as automatic posting.
5. 导入 dry-run 和确认应用流程。
6. 备份/恢复脚本。
7. HTTP/UI 鉴权和 LAN exposure hardening。
8. Hermes Mobile 侧注册 Finance MCP toolset 和 access policy。

## 15. 完成定义

每个非文档功能完成前必须满足：

- 业务逻辑位于 service/repository，不在 route/MCP/UI 事件处理器内。
- 有 focused tests。
- 入口文件仍是 glue。
- 敏感数据不进入 docs/tests/handoff。
- 相关文档和 `.agent-context/HANDOFF.md` 已更新。
- 如果影响 UI，检查 Hermes Mobile UI 规则。
- 如果影响静态前端，重启服务并验证 `/api/finance/client-version`。
## 2026-05-30 Finance User Implementation

- Add `finance_users`, `finance_user_bindings`, and `finance_access_tokens`.
- Add `finance_ledgers.owner_user_id`.
- Seed `user_xuxin` and bind the Hermes administrator workspace to that user.
- Preserve existing imported history under ledger `daily`.
- Add `adapters/finance-user-binding-service.js` for approved workspace registration and direct access-token issuance.
- Add `POST /api/v1/hermes/plugin/users/bind` for Hermes administrator approved workspace onboarding.
- Add `POST /api/v1/finance/users/access-tokens` for direct Finance access-token issuance.
- Store only access-token hashes.
- Resolve MCP and embedded UI context to the bound Finance user/ledger; do not allow unknown Hermes workspace fallback to `user_xuxin`.

## 2026-05-30 Compliance Remediation

- Scoped ledger resolution was tightened in the transaction/report services. If a Finance user or Hermes workspace has already resolved to a ledger, request-provided `ledger_id` cannot switch to another ledger.
- Transaction create now validates explicit account/category/member ids against the resolved ledger.
- Transaction update and void now reject transaction ids outside the resolved ledger.
- `/api/finance/overview` now reads accounts, categories, and members from the resolved context ledger.
- `POST /api/v1/hermes/plugin/users/bind` is loopback-only until a stronger Hermes admin authentication contract is added.
- MCP schemas for `finance.list_transactions` and `finance.get_report` now include the filter/dimension surface already supported by the services.
- Architecture and focused tests were added so these constraints remain executable rather than documentation-only.

## 2026-05-30 Report Total Correction

- `repository.reportRows()` is now the report aggregation reader and no longer delegates to the paginated transaction list reader.
- `repository.listTransactions()` remains capped for UI/MCP list projection and must not be used for totals.
- `finance-report-service` now applies `Asia/Shanghai` ledger-day boundaries for year/quarter/month/all report periods on the default ledger.
- Report totals and breakdowns are currency-scoped for non-account dimensions. Default currency is `CNY`; `HKD`, `USD`, and `EUR` can still be requested as separate report currencies.
- Account-dimension reports may omit `currency` to show all account rows using original transaction currencies without FX conversion.
- `finance.get_summary`, `finance.get_report`, `finance.list_transactions`, and the frontend report request contract include `currency`; the frontend omits it only for account-dimension reports and account drilldown trend requests.
- Historical Wacai validation compares aggregate year/type/currency/minor-unit buckets only. The current two imported Wacai files aggregate to 8676 rows with zero source-vs-database aggregate diffs; the parsed raw source span is 2010-01-01 through 2025-12-31.

## 2026-05-30 Windows Autostart

- `scripts/windows-start-finance-service.ps1` starts the HTTP/UI backend in the background, defaults to `FINANCE_MCP_HOST=0.0.0.0` and port `8791`, writes PID/logs under `data/`, and verifies `/api/finance/client-version`.
- `scripts/windows-install-autostart.ps1` first tries to register the current Windows user scheduled task `Finance MCP Backend` with an `AtLogOn` trigger. If Task Scheduler registration is denied by local policy, it falls back to a current-user Startup folder shortcut. Both modes start after user logon rather than before logon.
- `scripts/windows-uninstall-autostart.ps1` removes the scheduled task.
- npm wrappers:
  - `npm run start:windows`
  - `npm run autostart:windows:install`
  - `npm run autostart:windows:uninstall`
