# Finance MCP Harness Required Matrix

日期：2026-05-28

本文把 Hermes Mobile 的 H1/H2/H3 验证规则适配到独立 Finance MCP 项目。任何变更如果同时触发多个等级，按最高等级执行。

## 1. 等级定义

### Mandatory Documentation Gate

This gate applies before H1/H2/H3 completion.

- Any product, API/MCP, data schema, permission, UI behavior, Harness, deployment, import/export, or Hermes integration change must update the smallest matching project document in the same work item.
- Code changes under `adapters/`, `server-routes/`, `mcp/`, `public/`, `scripts/`, `gateway-plugins/`, or `tests/` normally require a paired `docs/` or `.agent-context/HANDOFF.md` update.
- If no document update is needed, record the docs-neutral reason in the final response.
- This gate is mandatory even when all automated tests pass.

### H1 production deployment / hot restart

Triggers:

- Changing NAS or Mac Studio deployment, restart, hot-restart, backup, or
  production source sync scripts.
- Changing Finance MCP wrapper restart behavior for Hermes Gateway processes.

Must verify:

- Restart scripts must not embed passwords, tokens, access keys, cookies, or raw
  finance data.
- Mac Studio deploy scripts must read any temporary sudo password from a local
  password file or stdin; they must not print or persist the password.
- Mac Studio production deploys to
  `/Users/hermes-host/HermesMobile/plugins/finance`, preserves production
  `data/` and `node_modules/`, creates source and SQLite backups, restores
  ownership to `hermes-host:staff`, restarts
  `system/com.hermesmobile.plugin.finance`, and verifies the expected static
  and service-worker versions.
- NAS hot restart must scope process termination to
  `finance_mcp_stdio.py` wrapper processes.
- Container restart may use direct Docker access or `sudo -n` only when the SSH
  account is already authorized; if Docker access is unavailable, the script must
  report a bounded `container_restart=unavailable_*` result instead of hanging
  for a password.
- Production source syntax checks must include the Python wrapper, Node stdio
  compatibility wrapper, and MCP bridge route file.
- Handoff must record backup path, deployed commit/source state, and whether the
  launchd/container/Gateway process restart completed or was blocked.

Minimum commands:

```powershell
powershell.exe -NoProfile -Command "$null = [scriptblock]::Create([IO.File]::ReadAllText('scripts\deploy-mac-finance.ps1'))"
powershell.exe -NoProfile -Command "$null = [scriptblock]::Create([IO.File]::ReadAllText('scripts\nas-finance-hot-restart.ps1'))"
node tests\finance-nas-hot-restart-script.test.js
npm run check
git diff --check
```

### H1 Required Harness

H1 适用于会改变持久化财务状态、权限、安全边界、MCP toolset、导入导出、备份恢复、余额或审计的变更。完成前必须有 workflow harness 或等价端到端服务场景。

H1 不能只靠静态断言。至少要覆盖一个真实 service/API/MCP 调用链，并验证持久化结果。

### H2 Contract/Projection Harness

H2 适用于 UI 投影、报表口径、筛选、下钻、导航、静态客户端、自动刷新、返回手势、移动端布局等变更。完成前必须有 contract/projection/DOM 级覆盖，必要时补浏览器视觉 smoke。

### H3 Focused Tests Only

H3 适用于不影响持久化状态、权限、MCP schema、报表口径、导航、导入导出和安全边界的小变更。可以只用 focused test、语法检查和 `git diff --check`。

## 2. H1 财务交易工作流

触发条件：

- 新增、修改、作废交易。
- 改变账户余额影响。
- 改变 idempotency。
- 改变交易标签、成员、商家、分类解析。
- 改变审计写入。
- 改变 `finance.create_transaction`、`finance.update_transaction`、`finance.void_transaction`。

必须验证：

- 同一 `idempotency_key` 重复提交不重复入账。
- expense/income/transfer 对余额影响正确。
- transfer 不进入收入/支出统计。
- update 时 reverse old impact 再 apply new impact。
- update 必须覆盖 UI/API 常用的 `amount` 字符串输入，不能因为旧行 `amountMinor` 合并而忽略新金额。
- void 时 reverse balance impact，统计排除。
- audit row 写入 actor/action/entity/before/after。
- 金额仍使用 integer minor units；前端展示必须保留非零小数 minor units，不能把 `amountMinor` 统一格式化为整数。

最低命令：

```powershell
node --check adapters\finance-transaction-service.js
node tests\finance-transaction-service.test.js
node tests\finance-money.test.js
node tests\finance-mcp-server.test.js
npm run check
git diff --check
```

如果 route 或 MCP schema 也变更，追加：

```powershell
node --check server-routes\finance-api-routes.js
node --check mcp\finance-mcp-server.js
npm test
```

## 3. H1 成员绑定与权限

触发条件：

- 改变 `finance_member_bindings`。
- 改变 Hermes workspace/user 到 finance member 的解析。
- 改变 owner/member/viewer 写权限。
- 改变跨成员查询策略。
- 改变 `finance.bind_member`。

必须验证：

- 非 owner 无法绑定成员。
- 同一 Hermes workspace 不会静默绑定多个 active finance member。
- 绑定后默认成员过滤使用绑定结果，不靠名称猜测。
- 解绑后默认“我的”查询不再落到旧成员。
- actor 写入审计或可追踪上下文。

最低命令：

```powershell
node tests\finance-member-binding-service.test.js
node tests\finance-mcp-server.test.js
npm run check
```

待补测试：

- `tests/finance-access-policy-service.test.js`
- `tests/finance-mcp-permissions.test.js`

## 4. H1 MCP Toolset 和 Hermes 集成边界

触发条件：

- 新增、删除或重命名 `finance.*` MCP tool。
- 改变 MCP tool schema。
- 改变 dispatcher 参数归一化。
- 改变 Hermes Mobile 注册或 access policy 约定。
- 允许或禁止某类 write tool。
- 改变 `gateway-plugins/hermes-mobile-finance` 插件声明或 handler。
- 改变 Hermes workspace user key 到 Finance member 的解析/创建规则。
- 改变 Hermes callback URL 注册、校验、持久化或读取规则。
- 改变 Finance MCP wrapper、workspace-local key 读取、`mcp_servers.finance`
  注册命令或 workspace override 策略。
- 改变 Python stdio wrapper `scripts/finance_mcp_stdio.py` 或 Node 兼容
  wrapper `scripts/finance-mcp-stdio.js`。
- 改变 WSL Gateway trusted source、MCP bridge loopback/trusted-host 规则。
- 新增或改变 Home AI Reference Contract MCP methods。
- 新增或改变 Owner-only 资产快照表、资产 MCP 工具、资产导入脚本、资产访问权限或实时汇率资产投影。
- 新增或改变股票持仓快照表、股票 MCP 工具、股票导入/自然语言增减仓脚本、实时行情/汇率估值或股票访问权限。

必须验证：

- tool schema 中 `toolset` 固定为 `finance`。
- 缺少 `finance` 授权时不能用通用 HTTP fallback 写账。
- MCP 返回 summary/projection，不泄露 raw local path、密钥、完整原始账单。
- Reference Contract tools must enforce Finance ledger access and return only
  bounded refs/summaries for `transaction`, `account`, and `category`; Note or
  graph layers must not receive copied full Finance facts.
- Owner asset tools must require Owner context for reads and writes. Non-Owner
  Finance users and member contexts must fail closed with a bounded error and
  must not receive asset totals or components.
- Owner asset imports may persist only structured snapshots/components plus
  bounded source hash metadata; tests/docs/handoff must not include full raw
  asset spreadsheets.
- Owner asset summary reads must refresh current USD/CNY through the shared
  market quote provider, persist only the current projection fields on the
  latest snapshot, and surface live FX failures instead of using a fixed
  fallback. Historical workbook FX fields must not be overwritten by live
  summary reads.
- Stock holding summary tools and the stock UI must refresh live prices and FX
  before calculating current value. Stock rows are partitioned by Finance user;
  Owner personal holdings must not leak through ledger sharing, and future
  opt-in users may only access their own stock snapshots.
- `finance.get_report` 和 `finance.list_transactions` schema 与 service 支持的 filters 一致。
- Gateway profile/schema 变更时记录 Gateway Pool restart 要求。
- raw Hermes workspace user key 不出现在 MCP schema、持久化表、文档或测试明细中。
- Finance MCP HTTP bridge 只接受 loopback 来源。
- `POST /api/finance/mcp/register` 只接受 loopback 来源，但允许保存 Hermes
  Mobile 的 HTTPS callback URL。
- callback URL 不允许 HTTP 非 loopback 地址，也不允许 URL userinfo 凭据。
- 同一 Hermes workspace 下不同 user key 会创建不同 Finance member。
- 同一 Hermes workspace/user key 重复调用会稳定解析到同一 Finance member。
- 手动 `finance.bind_member` 仍为 owner-only。
- 每个 Hermes workspace 从自己的 `.hermes-finance/config.json` 和
  `access-key.txt` 读取 Finance identity/key。
- 缺 config/key 必须失败为 bounded diagnostic error，不允许回退 Owner。
- `--no-workspace-override` 必须拒绝模型参数中的 workspace/root override。
- 模型参数中的 workspace key、Owner key、launch token、cookie 必须被剥离或拒绝。
- stdio wrapper 的 `tools/list` 必须返回 raw local tool name，例如
  `list_ledgers`、`get_summary`、`create_transaction`；Hermes Agent 会在 callable
  schema 层自动补 `mcp_finance_...` 前缀。
- 为兼容旧调用，stdio wrapper 的 `tools/call` 可接受 raw local name 和
  `mcp_finance_...`，但都必须映射回 `finance.*` dispatcher tool。
- Python wrapper 的 `tools/list` 必须与 Node wrapper 的核心工具名兼容；Hermes
  Mobile Gateway 正式注册入口使用 Python wrapper。
- Python wrapper 必须支持 Hermes Agent SDK 的 newline-delimited JSON framing，
  同时保留传统 MCP `Content-Length` framing；响应 framing 跟随请求 framing。
- 非 loopback trusted Gateway 来源默认关闭；启用后也必须携带 workspace-local
  id/key。非 trusted 来源访问 `/api/finance/mcp/*` 必须仍被拒绝。
- Python wrapper 的 `tools/list` schemas 请求必须带 workspace id/key header，
  以便 WSL Gateway 非 loopback 调用通过服务端校验。

最低命令：

```powershell
node --check mcp\finance-mcp-server.js
node --check mcp\finance-tool-contract.js
node --check mcp\finance-mcp-args.js
node --check mcp\finance-mcp-context.js
node --check mcp\finance-mcp-dispatcher.js
Get-ChildItem mcp\dispatchers -Filter *.js | ForEach-Object { node --check $_.FullName }
node --check server-routes\finance-api-routes.js
node --check adapters\finance-attachment-input-service.js
node --check adapters\finance-member-binding-service.js
node --check adapters\finance-plugin-registration-service.js
node --check adapters\finance-mcp-workspace-config.js
node --check adapters\finance-reference-service.js
node --check scripts\finance-mcp-stdio.js
node --check scripts\finance-platform-contract-smoke.js
python -m py_compile scripts\finance_mcp_stdio.py
python -m py_compile gateway-plugins\hermes-mobile-finance\__init__.py
node tests\finance-mcp-server.test.js
node tests\finance-tool-contract.test.js
node tests\finance-attachment-input-service.test.js
node tests\finance-mcp-workspace-config.test.js
node tests\finance-python-mcp-stdio.test.js
node tests\finance-member-binding-service.test.js
node tests\finance-plugin-registration-service.test.js
node tests\finance-reference-service.test.js
node tests\finance-platform-contract-smoke.test.js
node scripts\finance-platform-contract-smoke.js --require-tool finance.reference_get --require-tool finance.reference_summarize --require-tool finance.reference_object_types --json
node tests\finance-hermes-plugin.test.js
node tests\finance-owner-asset-service.test.js
node tests\finance-owner-stock-service.test.js
node tests\finance-server.test.js
node tests\architecture-boundary.test.js
node tests\privacy-scan.test.js
```

待补测试：

```text
tests/finance-hermes-toolset-routing.test.js
tests/finance-mcp-privacy.test.js
```

## 5. H1 Recurring Bookkeeping

Triggers:

- Adding or changing recurring rule persistence.
- Adding or changing due-generation behavior.
- Adding or changing automatic recurring posting, startup catch-up, scheduler interval, or missed-occurrence recovery.
- Changing generated transaction idempotency keys, source metadata, account balance impact, or audit behavior.
- Changing recurring rule MCP/API/UI contracts.

Must verify:

- Rules are scoped to the resolved ledger and cannot write into another user's ledger.
- Generated transactions use integer minor units and the normal transaction service.
- Re-running due generation for the same due timestamp is idempotent.
- Automatic posting is backend-owned, not page-refresh-owned, and restart/startup drains missed occurrences until no due rows remain for the current timestamp.
- Paused rules do not generate transactions; resumed rules can generate due transactions.
- Editing a rule does not mutate historical generated transactions.
- Deleting a rule retains generated transactions by default; optional generated-transaction cleanup uses soft void and reverses balances.
- Audit rows are written for rule create/update/status/delete and generated transaction writes.

Minimum commands:

```powershell
node --check adapters\finance-recurring-service.js
node --check adapters\finance-recurring-scheduler-service.js
node tests\finance-recurring-service.test.js
node tests\finance-recurring-scheduler-service.test.js
node tests\finance-mcp-server.test.js
node tests\finance-server.test.js
node tests\app-finance-ui.test.js
npm run check
git diff --check
```

## 6. H1 Wacai/Excel 导入

触发条件：

- 改变 Wacai 解析字段。
- 改变导入金额 multiplier。
- 改变 source fields 保存。
- 改变导入 idempotency key。
- 改变 import batch 计数。
- 改变分类、成员、标签、商家 upsert 规则。

必须验证：

- 2025 Wacai 文件金额按 `FINANCE_WACAI_AMOUNT_MULTIPLIER=100` 还原。
- 源币种保留到 `finance_transactions.currency`。
- raw fields 写入 `finance_transaction_source_fields`。
- 每次导入有 `finance_import_batches`。
- 重跑不会重复创建同一来源交易。
- 导入失败不得留下余额半更新。
- 文档、handoff、测试不保存原始账单全文。

最低命令：

```powershell
node --check adapters\finance-wacai-import-service.js
node --check scripts\import-wacai-xlsx.js
node tests\finance-wacai-import-service.test.js
npm run check
git diff --check
```

真实数据导入后追加 smoke：

```powershell
$env:FINANCE_WACAI_AMOUNT_MULTIPLIER='100'
npm run import:wacai -- "<xlsx path>"
```

导入结果只记录数量和字段结构，不记录原始明细。

## 6. H1 导出、备份和恢复

触发条件：

- 新增导出功能。
- 新增备份/恢复脚本。
- destructive migration。
- 批量修复或批量删除。

必须验证：

- destructive 操作前有备份。
- 备份包含 SQLite 主文件及 WAL/SHM 相关文件。
- 导出只包含授权账本和授权成员范围。
- 导出/备份路径不暴露到普通 UI projection。
- 批量失败不留下半提交状态。

最低命令：

```powershell
npm test
npm run check
git diff --check
```

待实现测试：

```text
tests/finance-export-service.test.js
tests/finance-backup-service.test.js
```

## 7. H2 报表与统计投影

触发条件：

- 改变 `finance-report-service.js`。
- 改变 `/api/finance/report`。
- 改变 report filters。
- 改变 category/subcategory/member/account/merchant/tag/trend 口径。
- 改变报表下钻。
- 改变 UI 图表、排行、总额、笔数、占比。

必须验证：

- 报表返回 period、timezone、metric、dimension、filters、aggregationBasis。
- voided 排除。
- transfer 排除收入/支出统计。
- category 使用父分类汇总。
- subcategory 使用实际分类汇总。
- tag 支持未标签。
- 下钻保留当前筛选条件。
- 明细列表与当前统计项一致。
- totals 与 breakdown 加总口径一致。

最低命令：

```powershell
node --check adapters\finance-report-service.js
node --check adapters\finance-repository.js
node --check server-routes\finance-api-routes.js
node tests\finance-report-service.test.js
node tests\app-finance-ui.test.js
git diff --check
```

API smoke：

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8791/api/finance/report?period=all&metric=expense&dimension=category'
Invoke-RestMethod -Uri 'http://127.0.0.1:8791/api/finance/report?period=all&metric=expense&dimension=subcategory&category_parent_id=<id>'
Invoke-RestMethod -Uri 'http://127.0.0.1:8791/api/finance/transactions?type=expense&category_parent_id=<id>'
```

## 8. H2 移动 UI 和 Hermes 风格继承

触发条件：

- 改变 `public/finance.html`。
- 改变 `public/app-finance-ui.js`。
- 改变 `public/styles.css`。
- 改变底部导航、页眉、返回、右滑返回、设置、主题、自动刷新。
- 改变报表 action sheet 或二级页。

必须验证：

- 页眉 fixed，不随页面滚动。
- viewport 禁止手动缩放。
- 二级页左上角返回。
- 二级页支持左边缘右滑返回。
- 记账页必须继承当前 light/dark/system 主题；夜晚模式下卡片、备注按钮/弹层、元信息胶囊和快捷分类图标不得固定为浅色。
- Dark/PWA 前后台恢复不能出现浅色白屏闪动；HTML shell 必须在外部 CSS 前提供内联深色 anti-flash 背景，PWA manifest 的 `background_color` 必须与 dark 默认画布一致。
- 记账页快捷分类区域必须在目标移动视口中显示至少四行完整快捷项，不能被元信息条或键盘区域遮挡；备注输入必须通过底部弹层打开，不能常驻为内联备注行；备注输入获得焦点时，或备注弹层打开但移动 iframe 键盘切换短暂丢失 `document.activeElement` 时，必须使用 Finance iframe 自身的 `visualViewport` / 文档尺寸计算 `--finance-app-height`，并在 iOS 平移 iframe 时使用 Finance 自身的 `visualViewport.offsetTop` 或 iframe `scrollY` 写入 `--finance-app-top` 定位遮罩，弹层贴近 Finance 可视 viewport 底边并高于原生键盘，不能把页面拉到顶部空白区域。`?embed=hermes` 插件模式可以接收 Home AI 宿主 `hermes.plugin.viewport` 消息用于宿主 chrome / 底部占用诊断，但不能把宿主 `viewport.offsetTop` 当成系统输入法面板位置来定位备注输入。
- 记账页整体必须是固定屏幕工作流，不允许整页拖动；只有中间快捷类目列表在类目过多时允许纵向滚动。底部金额计算器必须保留左右安全触控 gutter，左侧 `1/4/7` 数字列不能贴屏幕边缘导致点不中。
- 左侧当前类目大按钮必须打开挖财式完整类目选择面板；面板选择结果写回既有隐藏 `category_hint` 字段，快捷类目仍只是快捷入口。完整选择面板默认显示大类行，点大类展开小类，并提供搜索框快速定位任意类目。
- 账单搜索必须支持挖财式复制建账工作流：`/api/finance/transactions?search=<text>` 返回 bounded scoped matches，全部账单页显示搜索结果，搜索结果仍使用同一套左滑编辑/复制/删除动作，复制必须打开已预填的记账页。搜索框通过移动端键盘提交后必须让输入框失焦并收起原生输入法，避免遮挡结果列表。
- 任意输入框/搜索框聚焦时必须隐藏底部悬浮导航和嵌入 tab 区域，并压缩 shell 底部预留，避免键盘弹出后搜索结果仍被空白区域挤走；账本 root 顶栏左侧保持不可见占位以维持账本下拉居中，右侧图标打开账单搜索。
- 账目行左滑操作菜单必须保持三段动作：编辑、复制、删除；删除必须二次确认并走软删除/作废。
- 账目行左滑菜单必须只在明确横向左滑时打开；手势必须先通过横向方向锁和最小左滑距离，垂直滚动占优时必须锁定为滚动并禁止本次触摸打开菜单。
- 左滑操作按钮层默认必须 `visibility:hidden` 且 `pointer-events:none`；默认 DOM 不预渲染编辑/复制/删除按钮，只有通过明确左滑阈值并进入 `actions-open` 后才动态生成按钮，关闭时必须清空按钮 DOM，避免移动端触摸/滚动时露出背后操作层。
- 编辑和复制必须复用记账页表单，不另造一套独立表单。
- 不提供单独退出按钮。
- 底部导航 root views 可用，并且主导航必须是浮动胶囊标签；`?embed=hermes` 模式下必须上浮到 Hermes Mobile 宿主底栏之上，不能固定贴住 viewport 底边。
- action sheet 不破坏当前统计筛选。
- 文字不重叠、不溢出控件。
- 无横向滚动。
- 自动刷新通过 `/api/finance/client-version`。
- 静态资源变更导致的自动刷新必须延迟到 root 首页空闲状态；记账页、备注/日期/标签/成员等弹层或左滑菜单打开时不能立即整页 reload。
- The create-entry page must persist unsaved local drafts: amount, type,
  category, account, target account, member, tags, note, date, and `再记` write
  only to a ledger-scoped localStorage draft. After Android/iOS PWA or Hermes
  iframe reload, the app should restore the draft and return to the entry page.
  A valid startup draft must take precedence over an initial `pluginRoute=record`
  route, and the route must be marked handled after the draft wins. Successful
  save or explicit entry-page back must clear the draft. The startup
  draft restore check must run once only; later overview refreshes such as
  CNY/HKD/USD switching must not reopen bookkeeping from a local draft. The
  draft must not write a transaction through HTTP/MCP, and attachment files are
  not required to restore.
- Top-right report/home currency switching must be a lightweight local overview
  refresh. It must update the visible selected-currency transaction list, must
  not load live stock quotes/FX, and must not leave the current home/report
  view. Visual evidence should verify the selected currency appears within one
  second.
- Embedded Finance bottom navigation must use the compact host-owned-safe-area
  placement: 6px bottom offset, no added `env(safe-area-inset-bottom)`, no
  opaque full-width backing, and individual tab buttons remain visible.
- Dark-mode bookkeeping date sheet must be visually validated as a compact
  bottom sheet with high-contrast controls and no large blank spacer.

最低命令：

```powershell
node --check public\app-finance-ui.js
node tests\app-finance-ui.test.js
npm run check
git diff --check
```

视觉 smoke：

- 移动宽度 390x844。
- 桌面宽度 960+。
- 报表页、action sheet、趋势页、明细页至少各截一张图。

当前限制：

- 本机 bundled Playwright 缺 `playwright-core`，因此浏览器截图验证暂不可用。
- 修复依赖后，UI H2 变更应补视觉 smoke 证据。

## 9. H2 静态客户端与自动刷新

触发条件：

- 改变 `computeClientVersion` 或静态文件 serving。
- 改变前端轮询频率。
- 改变缓存头。
- 改变 service worker 或 PWA 相关行为。

必须验证：

- `/api/finance/client-version` 返回稳定非空签名。
- 修改静态资源并重启服务后签名变化。
- 前端发现签名变化后记录 pending reload；只有回到 root 首页且无可返回视图、弹层或左滑菜单时才调用 `window.location.reload()`。
- 静态响应保持 `no-store` 或明确缓存策略。

最低命令：

```powershell
node tests\finance-server.test.js
node tests\app-finance-ui.test.js
```

## 10. H2 HTTP/UI API

触发条件：

- 新增或修改 `/api/finance/*` endpoint。
- 改变 query 参数解析。
- 改变 JSON projection。

必须验证：

- route 不写 SQL。
- route 不直接改余额。
- route 只调用 runtime service/repository 的读接口。
- 错误返回 `{ ok: false, error }`。
- filter snake_case/camelCase 兼容。
- 本地 UI API 不是 Hermes 集成写入路径。

最低命令：

```powershell
node --check server-routes\finance-api-routes.js
node tests\architecture-boundary.test.js
npm test
```

## 11. H3 文档和小改动

可按 H3 的条件：

- 只改 docs。
- 只改注释。
- 只补测试名称或小型 fixture。
- 只改不影响布局语义的局部 CSS。

最低命令：

```powershell
git diff --check
npm run check
```

如果中文文档被编辑：

- 使用 UTF-8 safe workflow。
- 不用 PowerShell `Set-Content` 或 `Out-File` 重写。
- 检查没有出现新的乱码段落。

## 12. 完成前通用清单

所有等级都适用：

- 工作区 context 已读取。
- 相关文档已更新。
- `.agent-context/HANDOFF.md` 已更新。
- `git diff --check` 通过。
- 没有提交 `data/finance.sqlite3`。
- 没有提交原始 Wacai/银行账单。
- 没有提交 access key、token、密码、push endpoint。
- 如果服务需要前端自动刷新，已重启服务。
- 如果已 commit，最终回复包含 commit hash 和验证结果。

## H1 Hermes Embedded-App Plugin

Trigger this section when changing Finance embedded-app integration for Hermes Mobile:

- `/api/v1/hermes/plugin/manifest`
- `/api/v1/hermes/plugin/launch`
- `/api/v1/hermes/plugin/launch/<token>`
- `/finance.html?embed=hermes&v=<static-version>`
- iframe navigation/back/refresh postMessage contracts
- workspace authorization for embedded plugin sessions
- session cookie policy for same-origin proxy or HTTPS iframe hosting
- Hermes Mobile appearance sync v133 (`pluginTheme` / `pluginFontSize`)

Required verification:

- manifest shape is stable and browser-facing URLs can be derived from forwarded/proxy headers.
- launch exchange returns only a short one-time path and never includes a long workspace key, user key, cookie, or bearer value in the iframe URL.
- one-time tokens expire or consume once; failed launch shows a diagnostic JSON error rather than silently returning to a login shell.
- cookie policy supports local HTTP and HTTPS/proxy embedding (`SameSite=None; Secure` when HTTPS-forwarded).
- launch/session appearance accepts only bounded theme/font tokens and does not copy workspace keys, user keys, launch tokens, cookies, or private finance data into URL, frontend message, or bootstrap payload.
- `finance.html` applies host theme/font before app initialization and before stylesheet-visible render; the bootstrap script must appear before the normal theme script and stylesheet link.
- `?embed=hermes&v=<static-version>` hides duplicate Finance shell navigation and opens directly to usable Finance content. The static version query must bump with frontend deployments so Hermes iframe lifecycle/cache cannot preserve an old Finance shell.
- navigation/back/refresh messages expose only bounded route metadata.
- Every handled or unhandled `hermes.plugin.back` result must be followed by a fresh `finance.plugin.navigation` state so Hermes Mobile can release its own back/edge-swipe handling when Finance returns to root.
- non-`home` Finance pages inside the plugin, including `entry`, must report `canGoBack=true` and handle host back before Hermes Mobile exits the iframe.
- embedded `home` edge-swipe must be captured and reported as unhandled (`handled:false`) instead of letting the WebView/native history stack return to the device desktop.
- refresh messages are throttled.
- static/API/resource URLs remain structured for Hermes same-origin proxy rewriting.
- tests and scans reject raw keys, tokens, cookies, sensitive bill body, receipt text, or long raw logs.

Minimum commands:

```powershell
node --check adapters\finance-hermes-embedded-plugin-service.js
node --check adapters\finance-runtime.js
node --check server-routes\finance-api-routes.js
node --check server.js
node --check public\app-finance-ui.js
node tests\finance-hermes-embedded-plugin-service.test.js
node tests\finance-server.test.js
node tests\app-finance-ui.test.js
npm test
npm run check
git diff --check
```

For transaction-list pagination changes, the gate must also verify that:

- `/api/finance/overview` returns the first bounded page with default `limit=30`.
- `repository.listTransactions()` / `finance.list_transactions` support `offset`
  for the next page while preserving the 200-row hard cap.
- The home/all transaction UI appends the next 30 rows when the page bottom is
  reached and does not replace the already-rendered rows.
- The frontend keeps a bounded fallback for stale NAS runtimes that ignore
  `offset`: if the next page returns only already-loaded rows, it requests a
  larger first-window `limit` and appends only unseen rows without exposing raw
  transaction bodies in logs or tests.

If the change affects mobile/PWA behavior, add installed-PWA evidence:

```powershell
adb devices
npm run verify:pwa:android -- --install
```

Do not count `adb am start -d <url>` or Chrome/Safari address-bar loading as installed PWA evidence.

## H1 Finance User Binding / Auth

Trigger this section when changing Finance user ownership, Hermes workspace binding, launch/session context, or independent access-token behavior.

Required verification:

- Existing `daily` ledger is owned by `user_xuxin`.
- Hermes administrator workspace resolves to `user_xuxin`.
- New approved Hermes workspace creates a new Finance user and isolated default ledger.
- Bound workspace launch is accepted.
- Unknown workspace must not silently fall back to `user_xuxin`.
- Direct access tokens are stored only as `sha256:*` hashes.
- Scoped contexts cannot override `context.ledgerId` with caller-supplied `ledger_id`.
- Ledger-sharing changes must verify Owner-only share writes, shared-ledger read access, Finance-user invitation targets, and member-candidate filtering where Owner sees all ledger members as visibility scope but non-Owner sees only `finance_member_visibility` grants.
- Ledger-join changes must verify no QR/link invite surface is introduced, join requests persist as `finance_ledger_join_requests`, Hermes Inbox payloads stay bounded, and Owner review is required before membership/visibility is written.

## H2 Report Totals / Currency / Period Harness

Trigger this section when changing report totals, `finance-report-service`, `repository.reportRows`, `/api/finance/report`, `finance.get_report`, report UI query construction, or Wacai historical validation.

Required verification:

- Report totals must use the full filtered active set and must not be capped by transaction list pagination.
- `listTransactions()` remains bounded for list projection; do not increase that limit to fix reports.
- Year/quarter/month bounds must follow the ledger timezone. The default ledger currently uses `Asia/Shanghai`.
- Report UI year/quarter/month shortcut tabs must use the current local year/current local quarter/current local month as their default anchor.
- Report UI breakdown lists must render all rows without a three-row cap or expand/collapse control.
- Trend day keys must use the same ledger-local day as period filtering.
- Report totals must be currency-scoped. Default is `CNY`; other currencies are separate reports unless a future FX conversion service exists.
- MCP summary/report totals must include all members in the resolved workspace ledger by default; member breakdowns may expose the split, and explicit `member_id` filters remain valid.
- MCP schema, HTTP query parsing, and frontend report requests must keep `currency` in parity.
- Historical Wacai validation should compare aggregate buckets by year/type/currency/minor amount only; do not persist raw bill rows in docs or logs.

Minimum commands:

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
- Scoped overview and master-data reads return rows from the resolved ledger.
- Scoped transaction writes reject account/category/member ids from another ledger.
- Scoped update/void reject transaction ids from another ledger.
- User-binding administration endpoint is loopback-only unless a stronger Hermes admin-auth contract is implemented.

Minimum commands:

```powershell
node --check adapters\finance-user-binding-service.js
node --check adapters\finance-transaction-service.js
node --check adapters\finance-report-service.js
node --check adapters\finance-repository.js
node --check adapters\finance-runtime.js
node --check server-routes\finance-api-routes.js
node --check mcp\finance-mcp-server.js
node tests\finance-transaction-service.test.js
node tests\finance-user-binding-service.test.js
node tests\finance-server.test.js
node tests\finance-mcp-server.test.js
node tests\architecture-boundary.test.js
npm test
npm run check
git diff --check
```

## Shared Ledger Harness Correction

Any future ledger sharing, invitation, or join-request change is H1 when it can affect data visibility. Required checks: shared Finance user has full-ledger read scope, ledger members remain reporting dimensions only, invitation targets are Finance users, and no per-member visibility selector is reintroduced in UI/MCP schema.

Ledger invitation acceptance harness requirement:

- Service/API tests must cover creating an invitation for a target Finance user, listing it through `GET /api/finance/ledger-invitations?status=pending` as that target user, accepting it through `POST /api/finance/ledger-invitations/:id/accept`, and verifying the resulting `finance_ledger_memberships` row grants full shared-ledger access.
- UI projection tests must cover the Finance ledger menu `加入共享账本` panel, `data-ledger-invitation-accept`, and the accept action. Hermes Inbox/postMessage delivery is optional and cannot be the only passing evidence.
- The invitation projection must remain bounded and must not include raw keys, tokens, cookies, transaction bodies, attachments, or bank details.

## Attachment Display Harness

Attachment UI or API changes are H1 when they alter stored files, access checks, or file response behavior, and H2 when they alter list/detail projection only.

Required checks:

- `POST /api/finance/attachments` stores attachment metadata and returns a structured `/api/finance/attachments/:id` URL.
- `finance.create_transaction` supports direct bounded base64 attachments or allowed server-local upload paths for MCP entry, and `finance.add_transaction_attachment` attaches one bounded base64 or upload-path photo/file to an existing transaction by `transaction_id`; validate the service/MCP path for metadata-only responses, image-store recovery, refreshed counters, upload-path MIME inference, `MEDIA:<path>` data_url compatibility under the same upload-root allowlist, disallowed-path rejection, and idempotent duplicate replay without repeated create-time attachment writes.
- `GET /api/finance/transactions/:id/attachments` returns bounded metadata only: id, transaction id, MIME type, filename, image flag, created time, hash, and structured URL.
- `GET /api/finance/attachments/:id` preserves the stored `Content-Type`.
- Original attachment bytes must be stored in the independent image SQLite database and recoverable by `attachment_id`.
- Thumbnail bytes must remain derived cache files only; do not store thumbnails in the image SQLite database.
- Transaction list projection includes bounded attachment counts and image indicator fields without embedding raw file bytes.
- Transaction detail UI shows thumbnails for image attachments and opens a large preview from the structured attachment URL.
- Tests and docs must not store raw receipt text, image bytes, bank details, keys, tokens, cookies, or long logs.

## Frontend Encoding Harness

Any change to `public/finance.html` or `public/app-finance-ui.js` must keep the mojibake scan in `tests/app-finance-ui.test.js` passing. The scan blocks common UTF-8/GBK corruption characters and the Unicode replacement character in visible frontend shell/menu text.

## Embedded Bottom Navigation Harness

Any change to the Finance root bottom navigation is H2, and H1 when it affects
Hermes embedded plugin layout. Required checks:

- Embedded `?embed=hermes` bottom navigation uses a compact fixed bottom tab
  area: content ends above the fixed tab area, while the nav frame and separate
  pseudo-element backing do not create a large opaque host-adjacent block.
- The embedded dock must use fixed iframe-local bottom dimensions and must not
  add `env(safe-area-inset-bottom)` again; Hermes Mobile owns the host safe area.
- The embedded tabs must remain compact and theme-aware: host-provided `dark`
  uses dark button fills, while host-provided `light` uses light button fills.
- The embedded tab area must not leave a full-width black footer or a wide
  opaque capsule behind the buttons; only individual tab buttons should be
  visibly filled.
- Embedded bottom tab visual state must stay aligned with the Wardrobe internal
  bottom-tab contract: use theme-scoped `--bottom-tabs-*` and `--bottom-tab-*`
  tokens; default tabs use the theme tab surface, and the active tab uses a
  filled state plus a clear solid/inset outline for both `dark` and `light`.
- The embedded bottom-nav structure should preserve individually opaque outlined
  tab buttons without a visible outer backing. Finance must still reserve bottom
  space on pages that show the tabs, and pages that hide the tabs, such as
  bookkeeping entry and detail/report detail routes, must also hide the embedded
  nav area.
- The five root tabs use fixed equal columns inside the tab area.
- Horizontal dragging must not scroll the tab row or push buttons outside the
  available width.
- Static asset version and service worker cache version are bumped after the
  frontend change.

Minimum commands:

```powershell
node --check public\app-finance-ui.js
node tests\app-finance-ui.test.js
node tests\finance-hermes-embedded-plugin-service.test.js
node tests\finance-server.test.js
npm run check
git diff --check
```
