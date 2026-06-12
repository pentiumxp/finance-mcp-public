# Finance MCP 架构边界

## 1. 总原则

Finance MCP 是独立本地财务事实系统。Hermes Mobile 通过 `finance` MCP toolset 调用它，不嵌入 Finance UI，不把财务代码并入 Hermes Mobile。

业务逻辑必须 service-first：

- repository 负责 SQLite、schema、事务和查询。
- service 负责业务规则。
- MCP dispatcher 负责 schema、参数归一化和 service 调用。
- HTTP route 负责本地 UI API glue。
- 前端负责 projection 和交互，不做财务业务决策。

## 2. 文件边界

### 2.1 Repository

文件：`adapters/finance-repository.js`

允许：

- schema migration。
- seed。
- SQL query。
- DB transaction helper。
- 交易、账户、分类、成员、标签、商家、导入批次、原始字段的底层读写。

不允许：

- Hermes 权限决策。
- 自然语言解析。
- UI projection 决策。

### 2.2 Services

文件：

- `adapters/finance-transaction-service.js`
- `adapters/finance-report-service.js`
- `adapters/finance-member-binding-service.js`
- `adapters/finance-wacai-import-service.js`
- `adapters/finance-recurring-service.js`
- `adapters/finance-recurring-scheduler-service.js`
- `adapters/finance-reference-service.js`
- `adapters/finance-owner-asset-service.js`
- `adapters/finance-owner-stock-service.js`
- `adapters/finance-attachment-input-service.js`
- `adapters/finance-attachment-service.js`
- `adapters/finance-transaction-attachment-service.js`

Recurring scheduler ownership: automatic posting, timer state, no-overlap control, and restart catch-up live in `finance-recurring-scheduler-service.js`; `server.js` only wires runtime dependencies and starts/stops it.

允许：

- 金额和货币规则。
- 账户余额影响。
- idempotency。
- 审计策略。
- 报表聚合口径。
- Wacai 导入映射。
- 成员绑定规则。
- Home AI Reference / Memory Graph 的 permission-checked bounded object refs。
- Owner-only 资产快照的权限、结构化组件、收益率/复合增长率和导入投影。
- 按 Finance user 分区的股票持仓快照、自然语言增减仓、实时股票价格/汇率估值投影和私有股票 UI/MCP 投影。
- 附件 payload 来源归一化、上传路径 allowlist、图片 SQLite 存储、缩略图派生和交易附件绑定。

不允许：

- 直接处理 HTTP response。
- 直接依赖 DOM。
- 泄露本地文件路径到普通 projection。
- 让 Note 或图谱层复制完整财务事实，或绕过 Finance 权限读取交易细节。

### 2.3 MCP

文件：

- `mcp/finance-mcp-server.js`
- `mcp/finance-tool-contract.js`
- `mcp/finance-mcp-args.js`
- `mcp/finance-mcp-context.js`
- `mcp/finance-mcp-dispatcher.js`
- `mcp/dispatchers/*.js`

允许：

- `finance-mcp-server.js` 只做 runtime 创建、register/CLI glue 和导出兼容。
- `finance-tool-contract.js` 声明 `finance.*` tool schema 和共享 schema 常量。
- `finance-mcp-args.js` 归一化 snake_case/camelCase。
- `finance-mcp-context.js` 从 context 读取 role、actor、ledger，并解析 Hermes identity / scoped ledger。
- `finance-mcp-dispatcher.js` 组合 domain dispatchers 并统一 register/dispatch 返回格式。
- `mcp/dispatchers/*.js` 按交易、报表、账本、主数据、周期账单、引用对象等领域调用 service。
- 返回受控 projection。

不允许：

- 直接写 SQL。
- 直接更新账户余额。
- 跳过 service 写交易。
- 返回本地绝对路径、密钥、完整原始导入文件。
- 在 `finance-mcp-server.js` 重新内联 tool schema、参数归一化、身份解析或具体业务 dispatch。

### 2.4 HTTP/UI API

文件：`server-routes/finance-api-routes.js`

允许：

- 解析 query/body。
- 本地 UI API 返回 JSON。
- 调用 runtime service/repository 读接口。
- 格式化 `{ ok, result }` 或 `{ ok, error }`。

不允许：

- 成为 Hermes Mobile 的财务写入集成路径。
- 直接写 SQL。
- 绕过 transaction service 写交易。

### 2.5 Frontend

文件：

- `public/finance.html`
- `public/app-finance-ui.js`
- `public/styles.css`

允许：

- 管理 UI state。
- 调用本地 UI API。
- 渲染列表、图表、明细页。
- 处理 Hermes-like 返回、右滑返回、设置和主题。

不允许：

- 自行计算持久化余额。
- 自行修正金额精度。
- 根据 UI 状态绕过后端权限和审计。

## 3. 数据边界

- 金额统一为 `amount_minor` + `currency` + `scale`。
- `currency` 是交易一级字段。
- `transfer` 不进入收入/支出统计。
- `voided` 默认不进入统计。
- Wacai 导入必须保留 source fields。
- Owner 资产快照独立于普通 ledger sharing；只允许 `user_xuxin` Owner 上下文访问。资产金额仍用 integer minor units；收益率、复合增长率和总回报倍数用 basis points。Owner 资产 summary 读取可刷新并保存当前 USD/CNY 投影字段，但不得覆盖历史工作簿汇率字段。
- 股票持仓快照按 `finance_user_id` 分区，不参与普通 ledger sharing。当前 Owner 个人股票数据只对 Owner 上下文可见；其他 Finance user 未来开通后只能访问自己的股票快照。股票金额用 integer minor units，数量用 micro-units，比例用 basis points，汇率用 ppm。
- `data/finance.sqlite3` 是运行时数据，禁止提交。
- 原始账单文件禁止提交。

## 4. Hermes Mobile 边界

Hermes Mobile 侧要做的事：

- 注册 Finance MCP runtime。
- 在 authorized toolset catalog 中允许 `finance`。
- 让模型选择器在财务场景选择 `finance`。
- Gateway profile/schema 变化后重启 Gateway Pool。
- 可通过 `gateway-plugins/hermes-mobile-finance/` 声明 Finance Gateway plugin；
  该插件通过 `http://127.0.0.1:<port>` 调用 Finance 专用 MCP bridge endpoint，
  并在设置 `FINANCE_MCP_WORKSPACE` 时读取该 Hermes 用户根目录下的
  `.hermes-finance/config.json` 和 `.hermes-finance/access-key.txt`。
- 标准 Hermes Agent MCP 注册应优先使用 Python wrapper
  `scripts/finance_mcp_stdio.py`，
  并固定传入 `--workspace <Hermes user root>` 和 `--no-workspace-override`。
- Node wrapper `scripts/finance-mcp-stdio.js` 仅保留为本地开发兼容入口，不作为
  Hermes Mobile Gateway 的正式注册入口。
- Finance MCP bridge endpoint 必须 loopback-only；即使 UI 服务绑定 `0.0.0.0`，
  局域网来源也不能调用该 dispatch endpoint。
- Windows 本机 WSL Gateway 是例外但必须显式配置：`FINANCE_MCP_TRUSTED_GATEWAY_ADDRESSES`
  或 `FINANCE_MCP_TRUSTED_GATEWAY_CIDRS`。默认关闭；只影响
  `/api/finance/mcp/schemas` 和 `/api/finance/mcp/dispatch`；受信非 loopback
  来源仍必须带 workspace-local Finance key/context，否则失败关闭。
- Finance MCP wrapper 负责读取 workspace-local key；模型工具参数不得传 raw key、
  Owner key、launch token、cookie 或数据库路径。
- 未配置 `.hermes-finance` 的 workspace 不允许回退到 Owner，也不应暴露 `finance`
  toolset。
- `--no-workspace-override` 下，任何工具参数试图切换 workspace/root 都必须返回
  `workspace_override_not_allowed`。
- Hermes Mobile 可以通过 `POST /api/finance/mcp/register` 写入自己的回调地址。
  该写入接口仍然只接受 loopback 来源；被保存的 callback URL 可以是
  Hermes Mobile 的 HTTPS 域名地址。
- callback URL 只能是 HTTPS，或者开发用 loopback HTTP；不得在 URL userinfo
  中携带账号、密码、access key 或 token。
- 将当前 Hermes workspace user key 作为 handler context 传给 Finance plugin。

Hermes Mobile 侧不能做的事：

- 把 Hermes Owner Access Key 传给 Finance MCP。
- 让模型在工具参数中传 Finance workspace key。
- 在目标 workspace 缺少 Finance profile/schema/key 时回退 Owner 的 Finance MCP。
- 用通用 HTTP 工具写账。
- 在未授权 workspace 暴露 finance tools。
- 把 Finance UI 作为 Hermes 内嵌页面发布。

Finance 侧身份规则：

- `finance_member_bindings` 以 `provider + external_workspace_id + external_user_id`
  绑定 Hermes 用户；同一个 Hermes workspace 可以对应多个 Finance member。
- `external_user_id` 由 workspace id 和 workspace user key 哈希得到，格式为
  `sha256:*`。
- raw workspace user key 不进入数据库、文档、handoff、测试 fixture 或日志。
- 第一次收到新 Hermes 用户上下文时，Finance 自动创建一个本地 member 并绑定。

## 5. 局域网 HTTP 边界

当前 HTTP/UI 服务默认绑定 `0.0.0.0`，仅作为可信 LAN 阶段性调试能力。

限制：

- 不是公网发布形态。
- 不是 Hermes 集成路径。
- 后续公网或跨网访问前必须增加鉴权、CSRF/写入保护和网络边界审查。

## 6. 架构测试要求

必须保留：

- `tests/architecture-boundary.test.js`
- `tests/privacy-scan.test.js`

新 service 应增加 focused test。入口文件变更后必须确认：

- route/MCP 不包含 SQL DDL/DML。
- route/MCP 不直接改余额。
- money helper 不使用浮点聚合。
- docs/tests/handoff 不包含密钥或原始账单全文。

## Hermes Embedded-App Boundary

The embedded-app plugin is an integration boundary, not a UI code migration into Hermes Mobile.

Finance owns:

- manifest and launch/session endpoints under `/api/v1/hermes/plugin/*`;
- embedded UI mode at `/finance.html?embed=hermes&v=<static-version>`;
- session creation and workspace authorization;
- all Finance UI, API, SQLite data, MCP dispatcher, and resource serving;
- iframe navigation/back/refresh message payload sanitization.

Hermes Mobile owns:

- plugin catalog registration and visibility;
- same-origin proxying when needed;
- server-side launch call with the workspace key;
- parent-frame origin checks;
- bottom plugin tab hosting and iframe lifecycle.

Boundary rules:

- Long keys must stay server-side and never enter iframe URL, frontend JavaScript, route metadata, screenshots, docs, or logs.
- The embedded iframe URL may include only a bounded static version query. It must not include workspace keys, launch tokens, cookies, user keys, raw transaction data, or other secrets.
- PostMessage payloads may contain only bounded route hints.
- Finance does not copy its UI code into Hermes Mobile; Hermes only hosts the embedded app.
- Finance must support local HTTP plus Hermes same-origin proxy embedding without requiring a user-managed HTTPS reverse proxy for local development.

## Finance User Boundary

Finance user identity is the data ownership boundary.

- `finance_users` owns ledgers.
- `finance_ledgers.owner_user_id` separates one user's facts from another user's facts.
- `finance_members` remain ledger participants and must not be used as login users.
- The current imported Wacai history remains under `user_xuxin` and ledger `daily`.
- Hermes administrator workspace is bound to `user_xuxin`.
- A newly approved Hermes workspace must be explicitly registered before it can open or write Finance data.
- Unknown Hermes workspace context must fail with a binding error instead of reading `user_xuxin` data.
- Independent Finance access tokens are bearer credentials for direct login; only token hashes may be persisted.
- When request context already resolves a Finance user or Hermes workspace, `context.ledgerId` is authoritative.
- Scoped requests must ignore or reject caller-supplied `ledger_id` values that point at another ledger.
- Scoped transaction writes must verify explicit account/category/member ids belong to the resolved ledger.
- Scoped update/void operations must reject transaction ids from another ledger.
- `/api/finance/overview` must read accounts/categories/members from the resolved ledger, not hardcoded `daily`.
- `POST /api/v1/hermes/plugin/users/bind` is an administration boundary and must be loopback-only unless a stronger Hermes admin authentication contract is added.

## Report Aggregation Boundary

- Report totals are service-owned financial projections, not list-page projections.
- `repository.listTransactions()` is intentionally paginated and must not be reused for report totals.
- `repository.reportRows()` and report-specific repository readers may return the full filtered active set needed by `finance-report-service`.
- Time period selection belongs in `finance-report-service`; it must use ledger local-day boundaries, currently `Asia/Shanghai` for the default ledger.
- Currency separation belongs in `finance-report-service` and repository filters. Reports default to `CNY`, and cross-currency conversion must be a separate explicit service before mixed-currency totals are allowed.
