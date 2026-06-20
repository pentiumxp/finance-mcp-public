# Module: Finance MCP

## 1. 模块职责

Finance MCP 管理本地财务事实数据，并向 Hermes Mobile 暴露受控 `finance` toolset。

当前职责：

- 账本、账户、货币、分类、成员、标签、商家主数据。
- 收入、支出、转账交易。
- 账户余额投影。
- 成员与 Hermes Mobile workspace/user 绑定。
- 月/季/年/全部/custom 汇总；UI 年/季/月快捷入口以当前本地日期作为默认锚点。
- 趋势、大类、小类、成员、账户、商家、标签报表。
- Owner-only 年度资产快照、美元账户历史收益率、复合增长率和人民币总资产汇总。
- 按 Finance user 分区的股票持仓快照、实时行情/汇率估值和自然语言增减仓。
- Wacai XLSX 导入和原始字段保留。
- 审计、idempotency、隐私扫描。
- 独立本地 Web UI。

非职责：

- 银行直连。
- 投资估值。
- 企业会计凭证。
- Hermes Mobile 内嵌页面。
- 通用 HTTP 写账集成。

## 2. Runtime 配置

环境变量：

- `FINANCE_MCP_HOST`: HTTP/UI listen host，默认 `0.0.0.0`。
- `FINANCE_MCP_PORT`: HTTP/UI listen port，默认 `8787`，当前常用 `8791`。
- `PORT`: `FINANCE_MCP_PORT` 未设置时的 fallback。
- `HOST`: `FINANCE_MCP_HOST` 未设置时的 fallback。
- `FINANCE_MCP_DB_PATH`: SQLite DB path，默认 `data/finance.sqlite3`。
- `FINANCE_WACAI_AMOUNT_MULTIPLIER`: Wacai 导入金额倍率，2025 文件使用 `100`。
- `FINANCE_WACAI_LEDGER_NAME`: optional Wacai import ledger name override.
- `FINANCE_WACAI_LEDGER_ID`: optional Wacai import target ledger id override.

安全规则：

- 不在文档、测试、handoff 中保存 raw access key、token、password。
- 不提交 `data/finance.sqlite3`。
- 不提交原始 Wacai/银行账单。
- `0.0.0.0` 仅表示可信 LAN 调试，不表示公网安全。

Windows local runtime helpers:

- `npm run start:windows` starts the local HTTP/UI backend in a hidden background process and verifies `http://127.0.0.1:8791/api/finance/client-version`.
- `npm run autostart:windows:install` registers the current Windows user scheduled task `Finance MCP Backend` with an `AtLogOn` trigger, or falls back to a Startup folder shortcut if Task Scheduler registration is denied.
- `npm run autostart:windows:uninstall` removes that scheduled task.
- The helper writes only runtime PID/log files under `data/`; do not commit those files.
- Current Mac Studio production deployment uses `npm run deploy:mac`, which
  calls `scripts/deploy-mac-finance.ps1`.
  The target source directory is
  `/Users/hermes-host/HermesMobile/plugins/finance`, and the launchd job is
  `system/com.hermesmobile.plugin.finance`.
- Mac Studio production keeps Finance bound to `http://127.0.0.1:8791`. Do not
  assume `http://192.168.10.110:8791` is reachable from a phone; mobile access
  should go through the Home AI / Hermes plugin route unless the launchd host
  binding is deliberately changed.
- Mac deployment details, backup paths, validation commands, and rollback rules
  are documented in `docs/IMPLEMENTATION_NOTES/mac-studio-deployment.md`.

## 3. 数据规则

- 金额使用 integer minor units。
- 交易保留 `currency` 和 `scale`。
- 记账金额支持小数点后两位；UI 金额键盘可输入 `+ - * /` 表达式并用 `=` 本地计算为最多两位小数，服务层仍只接收归一化金额并解析为 minor units 后写入。交易列表、详情、账户和报表展示必须保留非零小数位，不能因为 `amountMinor` 存在就四舍五入成整数。
- 交易和报表 API 对外返回 `amount` 字符串时，应同时提供 `amountMinor`、`currency` 和 `scale`；前端展示优先使用 `amount`/`scale`，仅在缺失时从 `amountMinor` 格式化。
- 货币主数据在 `finance_currencies`。
- `transfer` 只影响账户余额，不进入收入/支出统计。
- `voided` 交易默认排除统计。
- Wacai 和随手记导入交易保存 source fields。
- 导入批次保存数量和元数据，不保存完整原始文件。
- Owner 资产快照独立于普通 ledger/transaction 报表。资产金额使用 minor units；美元兑人民币汇率使用 ppm；年度回报率、复合增长率和总回报倍数使用 basis points。该资产表只允许 `user_xuxin` Owner 认证上下文访问，不能通过 ledger sharing 暴露给非 Owner。
- Owner asset workbook import reads annual grouped totals. It uses each year's
  grouped FX rate, USD total, domestic total, and RMB total asset rows, so
  historical USD account source changes do not zero out the annual total.
  Missing component rows are omitted instead of persisted as zero-value
  components.
- Standalone UI exposes `资产` only when overview returns an Owner asset summary.
  Non-Owner overview responses omit the asset summary; direct asset summary or
  snapshot endpoints fail with `finance_owner_assets_owner_required`.
- Owner asset summary responses include bounded annual snapshots for the Owner
  asset page. The page defaults to the latest year, orders years newest first,
  and lets Owner select any returned year to render that year's RMB total,
  current-FX USD total, USD return metrics, and structured components. RMB and
  USD total assets are rendered as same-level summary cards, stacked in one
  column on the mobile-first asset page so long totals do not wrap inside a
  half-width card. Component row amounts are displayed in their component
  currency, so USD source components show USD while the headline total remains
  RMB.
- Owner asset summary reads can refresh current USD/CNY through the shared
  market quote provider. Embedded first-screen overview loads must use
  `summary_only=1` and must not wait for live FX or stock quotes; the asset page
  calls `/api/finance/owner-assets/summary?refresh_live_fx=1` after the tab
  opens, and MCP `finance.get_owner_asset_summary` may refresh live FX. Live
  refresh persists `current_usd_cny_ppm`, `current_total_assets_usd_minor`,
  `current_fx_updated_at`, and `current_fx_source` on the latest snapshot before
  returning the summary. The service must not use a fixed exchange-rate fallback
  when live FX fails. The asset page must label current FX from
  `current_usd_cny_rate`, not the historical workbook `fx_usd_cny_rate`.
- Owner asset manual/MCP upserts recalculate USD-account annual return, total
  return multiple, and CAGR from the current USD component and prior annual USD
  return history. XLSX imports keep the workbook's explicit return metrics so
  historical years with source-specific contribution rows are not rewritten by
  missing in-app contribution metadata.
- 股票持仓快照按 Finance user 分区。当前 Owner 个人持仓只对 Owner 可见；未来其他用户开通后访问自己的持仓数据。查询股票总市值、MCP `finance.get_owner_stock_summary` 和 UI 股票页必须实时获取股票价格与汇率后计算当前估值投影；不能要求用户填写实时行情或汇率。写入类自然语言增减仓工具根据最新持仓数量、用户说明的买卖数量和实时行情/汇率生成并持久化新快照。

## 4. 当前 MCP Tools

### Hermes Mobile plugin declaration

Finance now ships a Hermes Gateway plugin declaration under
`gateway-plugins/hermes-mobile-finance/`.

- `plugin.yaml` declares one product toolset: `finance`.
- `__init__.py` registers the `finance.*` schemas exposed by the Finance service.
  The schema source of truth is `mcp/finance-tool-contract.js`; the thin
  `mcp/finance-mcp-server.js` entrypoint exports it for compatibility.
- The plugin calls the Finance service over `FINANCE_MCP_URL`, defaulting to
  `http://127.0.0.1:8791`.
- The bridge endpoints are `GET /api/finance/mcp/schemas` and
  `POST /api/finance/mcp/dispatch`; both are loopback-only and are not generic
  HTTP write APIs.
- Plugin registration endpoint:
  `POST /api/finance/mcp/register`.
  Hermes Mobile can write its own callback URL, for example an HTTPS domain
  callback, into Finance. The endpoint is still loopback-only; the stored
  callback URL may be remote HTTPS, but the registration write is expected to
  be performed by the local Gateway/plugin process.
- Registration readback endpoint:
  `GET /api/finance/mcp/registration`.
- Callback URL policy:
  HTTPS URLs are accepted; HTTP is accepted only for loopback development
  hosts (`localhost`, `127.0.0.1`, `::1`). URL username/password credentials
  are rejected and must not be used for secrets.
- Production Gateway profiles should set `FINANCE_MCP_URL` only when the
  Finance service uses a non-default localhost port.
- If Hermes Mobile knows its public callback address, set
  `FINANCE_HERMES_CALLBACK_URL` or `HERMES_MOBILE_CALLBACK_URL` in the Gateway
  plugin runtime so the plugin registers it on startup.
- Gateway Pool restart is required after copying or changing this plugin.

### Hermes workspace-local MCP wrapper

Finance MCP follows the Hermes workspace-local key isolation model:

- Each Hermes workspace that can use Finance must contain
  `.hermes-finance/config.json` and `.hermes-finance/access-key.txt` under that
  workspace's user root.
- `config.json` stores only non-sensitive metadata such as `api_base_url`,
  `workspace_id`, `display_name`, optional `finance_user_id` / `ledger_id`, and
  `access_key_file`.
- The raw Finance workspace key is read only from
  `.hermes-finance/access-key.txt`. It must not be passed by the model, stored
  in docs, emitted in screenshots, or copied into URLs.
- `scripts/finance_mcp_stdio.py` is the preferred stdio MCP wrapper for Hermes
  Agent style `mcp_servers.finance` registration. It supports `--workspace
  <Hermes user root>`, `--no-workspace-override`, and optional
  `--api-base-url <url>`.
- On Mac Studio production, Hermes Gateway launches this wrapper from
  `/Users/hermes-host/HermesMobile/gateway-worker/finance-mcp`, not directly
  from the Finance service source at
  `/Users/hermes-host/HermesMobile/plugins/finance`. MCP schema deployments
  must keep the Gateway-side wrapper tree synchronized or prove it is not
  needed for the changed behavior.
- The wrapper's `tools/list` reads the live Finance service schema through
  `/api/finance/mcp/schemas` with workspace-local request headers. Valid
  deployment evidence should include a bounded wrapper or Gateway schema smoke
  showing the expected `mcp_finance_*` callable names; a Finance plugin UI
  launch or HTTP service health check alone is not enough.
- `scripts/finance-mcp-stdio.js` is retained as a local Node development
  compatibility path only. Hermes Mobile Gateway registration should use the
  Python wrapper so Finance matches the Wardrobe plugin runtime model.
- `gateway-plugins/hermes-mobile-finance/__init__.py` reads the same
  workspace-local config when `FINANCE_MCP_WORKSPACE` is set, so the legacy
  Gateway plugin bridge and the stdio wrapper follow the same identity rule.
- The legacy Gateway plugin bridge must send the workspace id and workspace
  key as request headers when reading `/api/finance/mcp/schemas` and when
  dispatching `/api/finance/mcp/dispatch`. Otherwise the Finance service will
  correctly reject schema reads for Owner-only tools and Home AI will not see
  the `mcp_finance_*` callable names.
- In `--no-workspace-override` mode, tool arguments that try to provide a
  different workspace/root fail with `workspace_override_not_allowed`.
- The wrapper strips workspace/key/token/cookie override fields from model tool
  arguments before dispatching to `/api/finance/mcp/dispatch`.
- `/api/finance/mcp/dispatch` remains loopback-only. When the caller declares
  `source: "finance-mcp-wrapper"`, the route requires a workspace id and
  workspace key in server-side context, checks the workspace authorization, then
  removes the raw key before calling the service dispatcher.
- Windows local Hermes WSL Gateway can be allowed with explicit trusted source
  configuration. Default is closed. Set one or both:
  `FINANCE_MCP_TRUSTED_GATEWAY_ADDRESSES=<exact-ip[,ip...]>` and
  `FINANCE_MCP_TRUSTED_GATEWAY_CIDRS=<cidr[,cidr...]>`. These settings apply
  only to `/api/finance/mcp/schemas` and `/api/finance/mcp/dispatch`; trusted
  non-loopback calls still must include workspace id/key from
  `.hermes-finance`. The Python wrapper sends these values as bounded request
  headers for `tools/list` and in server-side context for tool calls.
- Missing config/key failures are bounded diagnostic errors such as
  `finance_mcp_workspace_config_missing`, `finance_mcp_workspace_key_missing`,
  and `finance_mcp_workspace_key_required`.

Local Hermes profile example:

```json
{
  "mcp_servers": {
    "finance": {
      "command": "C:/ProgramData/HermesMobile/gateway-worker/runtime/venv/Scripts/python.exe",
      "args": [
        "C:/Users/xuxin/Documents/财务/scripts/finance_mcp_stdio.py",
        "--workspace",
        "C:/ProgramData/HermesMobile/data/drive/users/<workspaceId>",
        "--no-workspace-override",
        "--api-base-url",
        "http://<finance-host-or-lan-ip>:8791"
      ]
    }
  },
  "toolsets": ["finance"],
  "platform_toolsets": {
    "api_server": ["finance"]
  }
}
```

NAS profile example:

```yaml
mcp_servers:
  finance:
    command: /opt/hermes-gateway-runtime/venv/bin/python
    args:
      - /volume1/docker/finance-mcp/source/scripts/finance_mcp_stdio.py
      - --workspace
      - /volume1/docker/hermes-mobile/data/drive/users/<workspaceId>
      - --no-workspace-override
      - --api-base-url
      - http://127.0.0.1:8791
toolsets:
  - finance
platform_toolsets:
  api_server:
    - finance
```

The stdio wrapper's `tools/list` returns raw local tool names, for example
`list_ledgers`, `get_summary`, `get_report`, `list_transactions`, and
`create_transaction`. Hermes Agent adds the MCP server prefix at the callable
schema layer, so the model-visible callable names become
`mcp_finance_list_ledgers`, `mcp_finance_get_summary`, and similar. Returning
prefixed names from `tools/list` is invalid because it can create double-prefix
or schema mismatch behavior. For compatibility, `tools/call` accepts both raw
local names and older `mcp_finance_*` names and maps them back to `finance.*`.

The Python wrapper supports both MCP `Content-Length` framing and Hermes Agent
SDK newline-delimited JSON framing. Responses follow the framing used by each
request.

For Windows + WSL Gateway, use the Finance host address that the Gateway can
reach as `--api-base-url`. On the current development machine this is
`http://192.168.10.108:8791`; other Windows/NAS/user deployments must have
Hermes provisioning write the environment-specific address instead of hardcoding
this value.

For a trusted home LAN development environment, Finance may set
`FINANCE_MCP_TRUSTED_GATEWAY_CIDRS=192.168.10.0/24` so Gateway workers on that
LAN can reach the MCP bridge. This still does not make the MCP bridge anonymous:
non-loopback callers must include the workspace id and workspace-local Finance
key, and access is limited to `/api/finance/mcp/schemas` and
`/api/finance/mcp/dispatch`.

For NAS or other production-like deployment, prefer loopback, Docker/internal
network service names, or a narrow container/Gateway subnet. Use a LAN-wide CIDR
only when the LAN is trusted and the host firewall/network policy matches that
assumption.

NAS hot restart helper:

```powershell
npm run restart:nas:hot
```

This runs `scripts/nas-finance-hot-restart.ps1` against the NAS deployment. The
default mode terminates only running `finance_mcp_stdio.py` Gateway wrapper
processes so new MCP server processes reload the deployed wrapper code. If the
SSH account can access Docker directly or through `sudo -n`, the helper also
restarts the `finance-mcp` container. If Docker access is unavailable, it reports
a bounded `container_restart=unavailable_*` result instead of prompting for a
password. The helper stores no password, token, access key, cookie, or finance
data.

Hermes identity rule:

- Hermes Mobile passes the current workspace user key through handler context.
- Finance hashes the key with the Hermes workspace id and stores only a
  `sha256:*` external user id in `finance_member_bindings`.
- The raw workspace user key is not stored in Finance tables, docs, handoff, or
  tests.
- The first call from a new Hermes workspace user automatically creates a
  Finance member and binds it to that hashed identity.
- Manual `finance.bind_member` remains owner-only.

### finance.resolve_current_member

Resolve or create the Finance member for the current Hermes Mobile handler
context. This tool is mainly for integration smoke/readback; normal finance
write tools also resolve the current member automatically when the Gateway
passes identity context.

### finance.upsert_owner_asset_snapshot

Owner-only. Create or update one annual Owner asset snapshot and replace its
structured components. Components include stable keys such as `usd_account`,
`cny_bank`, `cny_securities`, `cny_trust`, `cny_domestic_total`, and
`cny_other_investment`. Non-Owner contexts must fail with
`finance_owner_assets_owner_required`.

### finance.list_owner_asset_snapshots

Owner-only. List bounded annual asset snapshots with their structured
components. The projection returns structured minor-unit fields and rate basis
points; it does not return the original uploaded spreadsheet rows.

### finance.get_owner_asset_summary

Owner-only. Return the latest Owner asset snapshot plus bounded historical
coverage metadata such as first/latest year and history count.

### finance.apply_owner_stock_position_delta

按 Finance user 分区的股票持仓自然语言增减仓工具。调用方传入持仓提示、买入/卖出/调整动作和数量；工具运行时必须获取实时股票价格和汇率，重算组合估值后持久化新快照。

### finance.get_owner_stock_summary

按 Finance user 分区返回当前股票组合估值。该查询必须实时获取股票价格和汇率，返回当前估值投影；查询本身不持久化新快照。

### finance.list_owner_stock_snapshots

按 Finance user 分区列出已持久化的股票快照和结构化持仓行。用于历史审计；当前估值查询应使用 `finance.get_owner_stock_summary`。

### finance.create_transaction

创建收入、支出或转账。

关键参数：

- `type`
- `amount`
- `currency`
- `occurred_at`
- `category_hint`
- `account_hint`
- `target_account_hint`
- `member_hint`
- `merchant`
- `tags`
- `note`
- `attachments` (optional, max 6; each item accepts `file_name`, `mime_type`, and one payload source: `data_base64`, `data_url`, `file_path`, or `upload_path`)
- `idempotency_key`

返回：

- normalized transaction。
- duplicate flag。
- audit id。
- requiresConfirmation。
- resolutionWarnings。
- optional attachment metadata。

MCP callers may attach photos/files during the same `finance.create_transaction`
call by passing `attachments`. The service creates the transaction first,
stores attachment metadata in the finance database, stores original bytes in the
independent image SQLite database, and returns only bounded attachment metadata
and structured `/api/finance/attachments/:id` URLs. Payloads can be base64
(`data_base64` / `data_url`) or a server-local upload path (`file_path` /
`upload_path`). Idempotent duplicate creates do not add attachments again;
callers that need later attachment writes must use the dedicated attachment path
rather than replaying the create call.
The accepted attachment source fields, create-time attachment limit, schema
descriptions, upload-root allowlist, legacy upload-path-in-`data_url` handling,
and `MEDIA:<path>` wrapper handling are centralized in
`adapters/finance-attachment-input-service.js`; create-time attachments and
post-create `finance.add_transaction_attachment` must reuse that helper instead
of keeping parallel payload rules.

### finance.add_transaction_attachment

Attach one photo/file to an existing transaction.

Key parameters:

- `transaction_id`
- `file_name`
- `mime_type`
- `data_base64`, `data_url`, `file_path`, or `upload_path`
- `ledger_id` (optional; used for scoped access validation)

Returns bounded attachment metadata only: id, transaction id, ledger id, MIME
type, filename, image flag, hash, created time, and structured attachment /
thumbnail URLs. The tool reuses the same attachment service as
`POST /api/finance/attachments`, so transaction existence, scoped ledger access,
payload size, original image SQLite storage, thumbnail generation, and audit
logging stay centralized in the attachment service.

`file_path` / `upload_path` are for server-local files that already exist on the
Finance host, such as Hermes Mobile upload files. Finance reads only from
allowed upload roots: `FINANCE_ATTACHMENT_UPLOAD_ROOTS`, Finance `data/uploads`,
Hermes Mobile `data/drive/users`, or `<HERMES_MOBILE_DATA_ROOT>/drive/users`.
When a path is under Hermes `data/drive/users`, it must also be inside a
`.hermes-mobile/uploads` directory. This keeps Finance from becoming a generic
file-read tool while avoiding model-side base64 conversion for binary uploads.
MCP schema descriptions must say this explicitly so Hermes callers with an
existing upload path do not try to read PNG/JPEG bytes into base64.
For legacy callers that already put an absolute upload path, or a
`MEDIA:<path>` wrapped absolute upload path, in `data_url`, Finance treats that
value as an upload path only after the same allowlist check; new callers should
prefer `file_path` or `upload_path`.

### Finance Reference Contract V1

Finance exposes the minimal Home AI Reference / Memory Graph contract through
the `finance` toolset:

- `finance.reference_object_types`
- `finance.reference_get`
- `finance.reference_summarize`

Supported object types are `transaction`, `account`, and `category`. Object
identity is stable as `workspace_id + plugin_id + object_type + object_id`.
The implementation lives in `adapters/finance-reference-service.js`; the MCP
dispatcher only normalizes arguments and calls that service.

Reference reads are permission checked through the same ledger access service as
other Finance reads. `reference_get` returns bounded projections for the
requested object, and `reference_summarize` returns a deterministic bounded
summary. These tools must not return local file paths, raw source fields,
workspace keys, full receipt bytes, or full ledger dumps. Note and graph layers
may store bounded display snapshots, but full Finance facts remain owned by
Finance and must be resolved back through Finance.

### finance.list_transactions

返回授权账本下的 bounded transactions。

当前参数：

- `ledger_id`
- `type`
- `start_date`
- `end_date`
- `category_id`
- `category_parent_id`
- `member_id`
- `account_id`
- `merchant_id`
- `tag_id`
- `currency`
- `search`
- `include_voided`
- `limit`
- `offset`

Schema parity fields:

- `category_id`
- `category_parent_id`
- `account_id`
- `merchant_id`
- `tag_id`

List projection is paginated. UI and MCP callers default to `limit=50`; callers
may pass `offset` to fetch the next bounded page. Report totals must not use this
paginated reader. `search` is a bounded text filter for bill-copy workflows; it
matches transaction note/source/ref, amount text, category/parent category,
account/target account, member, and merchant names within the scoped ledger.

### finance.update_transaction

修改一条 active transaction。

规则：

- voided 交易不能修改。
- 修改余额相关字段时必须 reverse old impact + apply new impact。
- 写审计。

### finance.void_transaction

软删除交易。

规则：

- reverse balance impact。
- 设置 voided 状态。
- 写审计。

### finance.get_summary

返回指定周期收入、支出、净额、笔数和统计口径。MCP workspace 场景下，未显式传入 `member_id` 时，totals 覆盖 resolved ledger 下全部成员；`memberBreakdown` 返回按成员拆分的 bounded 明细。当前 Hermes user/member 只默认作用于写账和默认明细列表，不默认缩窄 summary totals。

### finance.get_report

返回趋势或 breakdown 报表。

当前 service 支持维度：

- `trend`
- `category`
- `subcategory`
- `member`
- `account`
- `merchant`
- `tag`

Schema parity: MCP schema advertises `subcategory`, `tag`, and structured
`filters`, matching the report service dimensions.

### finance.list_accounts

返回账户主数据。

### finance.list_currencies

返回货币主数据。

### finance.list_categories

返回分类主数据。

### finance.list_members

返回成员主数据。

### finance.bind_member

绑定 finance member 到 Hermes Mobile identity。

规则：

- owner only。
- provider 固定为 `hermes_mobile`。
- 支持 workspace 或 user 外部标识。

## 5. HTTP/UI API

本地 UI API：

- `GET /api/finance/client-version`
- `GET /api/finance/ledgers`
- `POST /api/finance/ledgers`
- `GET /api/finance/overview`
- `GET /api/finance/transactions`
- `GET /api/finance/transactions/:id/attachments`
- `GET /api/finance/attachments/:id`
- `GET /api/finance/report`
- `POST /api/finance/transactions`
- `POST /api/finance/attachments`
- `PATCH /api/finance/transactions/:id`
- `POST /api/finance/transactions/:id/void`

过滤参数：

- `category_id`
- `category_parent_id`
- `member_id`
- `account_id`
- `merchant_id`
- `tag_id`

HTTP/UI API 只服务独立本地 UI，不作为 Hermes Mobile 写账边界。

`GET /api/finance/overview?summary_only=1&currency=<code>` is the lightweight
UI path for embedded first-screen loading and for switching the report/home
currency. It returns the local overview payload, including the selected-currency
transaction list and master data, so the visible home list changes with the
selected currency. The fast path must not call live asset FX, stock quote, or
stock FX providers; normal overview may include persisted Owner asset/stock
snapshot metadata so the `资产` and `股票` tabs can be shown. Live asset FX is
fetched only through `/api/finance/owner-assets/summary?refresh_live_fx=1`, and
live stock prices/FX are fetched only through
`/api/finance/owner-stocks/summary?live=1` or the stock MCP summary tool.
Market quote provider calls are bounded by `FINANCE_MARKET_QUOTE_TIMEOUT_MS`
(default 2500 ms) so external quote stalls do not keep embedded WebKit blank.
The provider tries domestic no-key stock quote sources first (Eastmoney,
Tencent, then Sina), then Yahoo chart and public no-key FX/stock fallbacks where
applicable; if all live sources fail it surfaces a bounded error and never
substitutes fixed rates/prices. Stock summary refresh must request positions in
parallel so one slow quote does not multiply by the number of holdings.

## 6. UI 功能

当前独立 UI：

- 首页 summary。
- 顶部账本切换，支持当前用户账本列表和新建账本。
- 快速记账入口。
- 收入/支出/转账表单。
- Bookkeeping amount entry uses the fixed Wacai-style custom keypad, including
  a decimal key for up to two fractional digits. The keypad keeps a left/right
  safe touch gutter so the `1/4/7` column is not flush with the screen edge and
  remains tappable on mobile. The amount display field is read-only and must
  not summon the native iOS/Android keyboard, text selection box, or long-press
  callout; note/search/date fields may still use native input as appropriate.
- The entry keypad's `再记` control is a save-after-stay mode toggle only. It
  must not directly submit the form or create a transaction; `保存` is the only
  direct transaction write control on the entry page.
- Bookkeeping member and tag meta controls open visible Wacai-style choice sheets. The meta strip is a single-row horizontal scroller only; it must not vertically drag or wrap. Member selection writes back to the hidden `member_hint` field; tag selection writes a `tags` array into the transaction payload. The visible merchant entry is removed from the current bookkeeping page. `/api/finance/overview` returns tag master data for that UI selector, and list transaction projection includes bounded tag names for edit/copy prefill.
- Bill copy opens the bookkeeping form with copied amount/account/category/member/merchant/note/tags, but uses the current local date/time instead of the source transaction's `occurred_at`. Edit keeps the original `occurred_at`.
- Bill copy opens with the source amount visible, but the first numeric keypad input after copy replaces that prefilled amount from zero instead of appending to it.
- Note entry is not an inline form row. The meta strip shows a fixed `备注` button before the camera button; tapping it opens a bottom note input sheet. The sheet `完成` action writes back to the hidden `note` field, while cancel/back/overlay close leaves the current hidden value unchanged. This avoids resizing the bookkeeping page or hiding the custom amount keypad when notes use the native keyboard.
- When the note editor has focus, or when the note overlay is open and the mobile iframe temporarily drops `document.activeElement`, Finance derives the system-keyboard work area from its own `window.visualViewport` and iframe document dimensions, stores local visible height as `--finance-app-height`, and stores iframe-local `visualViewport.offsetTop` or iOS-induced iframe `scrollY` as `--finance-app-top` when iOS pans the iframe document. Home AI `hermes.plugin.viewport` payloads are still accepted for host chrome diagnostics and future bottom-reservation work, but they must not be treated as the native keyboard rectangle for the note editor. The sheet anchors to the Finance iframe's own visible bottom, and Finance repeats viewport sync plus document/overlay scroll reset so iOS Safari/PWA does not pan the iframe into a blank scrolled region above the sheet.
- The visible entry date control is a fixed `日期` button. It opens a compact
  bottom date sheet and writes the selected value to hidden `occurred_at`; the
  entry page itself must not show the current date/time text. In dark mode the
  sheet must use high-contrast dark surfaces, white input text, and stable
  44px-or-taller controls; it must not stretch into a full-page panel with a
  large blank spacer.
- Entry note/date/choice sheets are included in overlay/back-state and delayed client-refresh protection, so static asset polling cannot reload the page while a bookkeeping sheet is active.
- Embedded and standalone startup keeps the shell in a hidden `finance-booting`
  state until the first `summary_only=1` overview response is rendered and any
  startup route/draft navigation has completed. This avoids showing an
  intermediate or stale page before the homepage/final route appears; failures
  must also release the boot state before displaying the bounded error.
- In embedded mode, the top-right bill-search control also owns the compact
  plugin keyboard composer contract with `#composer`, `.composer`,
  `data-hermes-composer`, and a native single-line textarea `#messageInput`.
  It must not render a separate search box in the ledger home content because
  the visible search affordance is already the top-right icon. The textarea
  exists so the Home AI `embedded-plugin-keyboard-composer` harness can focus a
  real Finance-owned input and verify iOS keyboard geometry; submitting a
  non-empty value routes to the existing bill search rather than writing ledger
  data. Finance also mirrors its keyboard viewport state to the generic
  `keyboard-open`, `--app-top`, and `--app-height` plugin contract while
  retaining the Finance-specific
  `finance-keyboard-open` and `--finance-*` variables. Finance exposes
  `window.handleHermesPluginViewportMessage(data)` so the central Home AI visual
  harness and host shell can deliver the same bounded
  `hermes.plugin.viewport` payload used by the normal `message` listener.
- The bookkeeping create form persists a local unsaved draft in browser
  `localStorage`, scoped by ledger and standalone/embedded mode. The draft
  includes type, amount, category, account, target account, member, tags, note,
  date, and the `再记` toggle. It is restored automatically after a PWA/WebView
  reload and takes precedence over initial plugin routes such as
  `pluginRoute=record`; otherwise a record route can open a blank bookkeeping
  page before the draft restore pass. It can open the bookkeeping page directly
  only during the one startup draft-check pass when a valid draft exists. Later
  overview refreshes, such as
  switching report currency, must not re-run draft restore or navigate to the
  bookkeeping page. A draft is restorable only when it contains user-authored
  content: a non-zero amount, note, merchant, or tags. Default date, category,
  account, member, currency, amount `0`, or `再记` alone must not reopen the
  bookkeeping page. Drafts are client-only, expire after seven days, are cleared
  after successful save, explicit entry-page back, restored-then-exit without a
  new edit, or exiting an empty bookkeeping page; those empty exits also reset
  the preserved plugin view back to the ledger home. Drafts do not create or
  modify ledger transactions until the user taps `保存`. File attachments are
  not restored because browser file handles cannot be safely persisted.
- Dark-mode PWA resume must not flash a light canvas when returning from another app. The HTML shell carries a minimal inline `finance-anti-flash` background before external CSS loads, and both PWA manifests use a black `background_color` so the OS/browser launch or resume canvas matches the dark default.
- 记账页快捷分类按历史交易次数排序；无使用记录时按挖财式常用分类顺序补位。
- 记账页相机按钮支持拍照、上传照片、上传文件；附件在交易创建或编辑保存后通过附件 API 绑定到交易。
- 记账页类别优先布局：当前类别和快捷类别 chips 位于金额前，点击 chip 同步 `category_hint`。
- 交易列表：账目行左滑露出挖财式三段菜单：编辑、复制、删除。
- 交易列表：带图片附件的账目行显示图片标识；交易投影包含 bounded `attachmentCount`、`imageAttachmentCount`、`firstImageAttachmentId`、`firstImageUrl`。
- 账单搜索入口：点击首页搜索按钮后进入全部账单页，并把默认焦点放在搜索输入框；PWA/iOS 场景允许一次即时聚焦和短延迟重试，避免页面切换后焦点丢失。首页不再渲染独立搜索框；Home AI keyboard-composer 合约挂在右上角搜索控件内。搜索框提交搜索后必须 `blur()`，收起移动端原生输入法，避免遮挡结果列表。
- 首页交易列表：直接显示最近流水列表，不再显示“最近明细”标题和“全部”跳转提示；用户通过服务区“明细”或右上角搜索进入全部账单页。
- 交易公开投影：`listTransactions()`、创建/重复创建、更新、作废返回值必须使用同一套带 JOIN 的交易投影，包含 `categoryName`、`categoryIcon`、`parentCategoryName`、`parentCategoryIcon`、`accountName`、`targetAccountName`、`memberName`、`merchantName`、`tags` 和附件计数字段。交易详情页必须把 `tags` 完整列出来；不得用裸 `finance_transactions` 行作为展示源，否则刚记账或复制后的详情会把已选择的类别、账户、成员、标签、商家显示成未记录。
- 交易更新：`updateTransaction()` 合并既有交易行时必须识别 `bookedByMemberId` / `booked_by_member_id`，未显式传入成员时保留现有记账成员；未显式传入 `tags` 时保留现有标签，只有显式 `tags` 补丁才替换标签。UI/MCP PATCH 传入 `occurred_at` 时必须覆盖既有交易行的 `occurredAt`，不能因为旧行 camelCase 字段优先而丢弃日期修改。
- 交易附件：主账务 SQLite 只保存附件元数据和账目关联；原始附件 Blob 保存在独立 `finance-images.sqlite3`，用于和账务库按 `attachment_id` 对齐备份。服务启动时会把尚未入库的历史附件文件补写到图片 SQLite。缩略图是可再生成的派生文件，只保存 `thumbnail_ref` 元数据，不写入图片 SQLite。
- 交易详情二级页：提供编辑、复制、删除入口；编辑复用记账页并调用 update，复制复用记账页并创建新交易，删除走软删除/作废确认。
- 交易详情二级页：通过 `/api/finance/transactions/:id/attachments` 加载附件，图片附件显示缩略图，点击缩略图打开大图预览；非图片附件显示结构化文件链接。详情页也必须提供 `添加` 附件入口，复用拍照、上传照片和上传文件 action sheet，选择文件后直接调用 `POST /api/finance/attachments` 绑定当前交易并刷新附件列表。
- 报表页；排行列表一次显示完整 breakdown 结果，不折叠前三项，也不显示点击展开/收起入口。
- 报表行 action sheet。
- 趋势统计页。
- 大类到小类占比页。
- 过滤后的账单明细页。
- 账户列表。
- 设置和主题。
- 前端自动刷新。

Hermes UI 继承规则：

- fixed top header。
- 禁止手动缩放。
- 二级页左上角返回。
- 二级页左边缘右滑返回。
- 不提供退出按钮。

## 7. 测试入口

通用：

```powershell
npm test
npm run platform:check
npm run check
git diff --check
```

详见：

- `docs/TEST_MATRIX.md`
- `docs/IMPLEMENTATION_NOTES/harness-required-matrix.md`

## 8. 后续模块

待实现：

- access policy service。
- plan/recurring transaction service。

## 2026-06-04 Recurring Tools

Finance now exposes recurring bookkeeping through the `finance` toolset:

- `finance.create_recurring_rule`
- `finance.list_recurring_rules`
- `finance.update_recurring_rule`
- `finance.set_recurring_rule_status`
- `finance.delete_recurring_rule`
- `finance.generate_due_recurring_transactions`

Rules are ledger-scoped and follow the same access context as ordinary transaction tools. Generated transactions use the normal transaction service so account balances, audit rows, currency minor units, and soft-void behavior remain consistent.

`finance.generate_due_recurring_transactions` is idempotent. The generated transaction idempotency key is based on the recurring rule id and due timestamp. Deleting a rule keeps generated transactions unless `void_generated=true` is explicitly provided; that option uses `finance.void_transaction` semantics rather than physical deletion.

2026-06-04 recurring schedule correction:

- Recurring rules are present in the database as templates only until due generation is called.
- The local HTTP runtime starts `adapters/finance-recurring-scheduler-service.js` by default after the server begins listening. It runs one immediate tick, then repeats every `FINANCE_RECURRING_AUTO_POST_INTERVAL_MS` milliseconds. The default interval is five minutes.
- Automatic posting queries only ledger ids that currently have due active recurring rules, then calls the same idempotent generation path as `finance.generate_due_recurring_transactions`. Page refresh must not be the recurring posting trigger.
- On startup or restart, automatic posting drains missed occurrences by repeatedly generating and rechecking each due ledger until no `next_due_at <= now` rows remain. This is required so downtime or a stopped timer does not lose recurring entries.
- `FINANCE_RECURRING_AUTO_POST=0` disables automatic posting. `FINANCE_RECURRING_AUTO_POST_MAX_OCCURRENCES` caps one generation call per ledger and defaults to 100. `FINANCE_RECURRING_AUTO_POST_CATCH_UP_PASSES` caps repeated catch-up calls per due ledger per scheduler tick and defaults to 1000.
- Manual due generation through the UI action, HTTP endpoint, or MCP `finance.generate_due_recurring_transactions` remains available and uses the same idempotency keys.
- Updating non-schedule fields, such as amount, title, note, member, account, category, merchant, tags, or currency scale repair, must preserve `next_due_at` unless the caller explicitly supplies `next_due_at`.
- Updating schedule fields, such as frequency, interval, weekdays, day/month, start/end, or time of day, recalculates `next_due_at`. If a new start date is supplied without explicit day/month fields, the day/month are derived from the new start date so stale schedule fields do not pull the next due date backward.
- import dry-run service。
- export service。
- backup service。
- Hermes Mobile toolset routing registration。
- HTTP/UI access hardening。

## Hermes Embedded-App Plugin Module

Finance also exposes a UI embedding contract for Hermes Mobile while keeping UI/API/DB/MCP ownership inside this project.

Runtime service:

- `adapters/finance-hermes-embedded-plugin-service.js`

HTTP endpoints:

- `GET /api/v1/hermes/plugin/manifest`
- `POST /api/v1/hermes/plugin/launch`
- `GET /api/v1/hermes/plugin/launch/<one-time-token>`
- `/finance.html?embed=hermes`
- The manifest entry and launch redirect append the current static asset
  version from `public/finance.html` as `v=<static-version>`, so Home AI
  iframe/cache lifecycle reloads after frontend deployments. The version is
  resolved by the server and must not be left as a stale hard-coded manifest
  constant.
- When Home AI opens a plugin quick action, the one-time launch URL may include
  non-secret route metadata such as `pluginActionId`, `pluginRoute`, and
  `pluginItemId`. The token-consume redirect must preserve only the approved
  route metadata allowlist onto `/finance.html`; it must not forward workspace
  keys, access keys, raw launch tokens, or arbitrary query parameters.

Plugin identity:

- id: `finance`
- title: `记账`
- type: `embedded-app`
- toolsets: `finance`
- mcpServer: `finance`
- permissions: `finance:read`, `finance:write`

Authorization:

- default owner workspace id: `FINANCE_HERMES_OWNER_WORKSPACE_ID` or `owner`
- additional explicit workspaces: `FINANCE_HERMES_ALLOWED_WORKSPACES`
- long workspace/user keys are accepted only by the server-side launch exchange and are not placed in iframe URLs or route metadata.
- Hermes appearance sync v133 accepts only bounded `pluginTheme` and `pluginFontSize` launch/session values. Finance stores those as short-lived session appearance metadata and renders only `{ theme, fontSize }` into the `finance.html` bootstrap before the stylesheet loads.
- Accepted embedded-plugin appearance tokens: theme `light/dark`; font size `compact/normal/large/xlarge`. Standalone UI may still keep its local `system` preference, but Hermes plugin launch uses the resolved host theme only. Tokens, cookies, workspace keys, user keys, and private finance data must not be emitted in URLs, frontend messages, docs, or screenshots.

Iframe event names:

- `finance.plugin.navigation`
- `hermes.plugin.back`
- `finance.plugin.back_result`
- `finance.plugin.refresh_required`
- `hermes.plugin.viewport` (optional bounded host viewport metrics)

Embedded back behavior:

- non-root Finance pages report `canGoBack=true` and consume back/edge-swipe before returning to `home`;
- `home` reports `canGoBack=false`;
- in embedded mode, Finance still captures the root left-edge swipe and sends `finance.plugin.back_result` with `handled:false` plus a fresh root navigation state, so Hermes Mobile exits the plugin and the WebView/native history does not return to the device desktop.

## Finance User and Access Token Model

Finance now separates three identities:

- `finance_users`: product-level data owner. The current imported personal history belongs to `user_xuxin`.
- `finance_ledgers.owner_user_id`: ledger ownership boundary. Existing `daily` ledger is owned by `user_xuxin`.
- `finance_members`: participants inside one ledger, such as `自己`, `家庭公用`, `父母`, or `配偶`. Members are not login users.

Hermes binding:

- Existing administrator workspace is bound to `user_xuxin` through `finance_user_bindings`.
- New Hermes workspaces approved by the Hermes administrator call `POST /api/v1/hermes/plugin/users/bind`.
- Finance creates a new `finance_users` row, a new default ledger, default accounts, default members, and default categories.
- Later requests from that Hermes workspace resolve to the bound Finance user and ledger.
- Unknown Hermes workspaces must not silently fall back to `user_xuxin`.

Independent login:

- Finance users can also receive an access token for direct/local login.
- Endpoint: `POST /api/v1/finance/users/access-tokens`.
- The raw token is returned only at creation time.
- SQLite stores only `sha256:*` token hashes in `finance_access_tokens`; raw tokens must not be written to docs, logs, handoff, screenshots, or test fixtures.

2026-05-30 compliance update:

- Scoped Finance contexts are ledger-locked. If a Hermes session or Finance access token resolves to a ledger, caller-provided `ledger_id` cannot switch to another user's ledger.
- UI overview, transaction service, report service, and MCP master-data list tools now use the resolved scoped ledger.
- Transaction writes reject explicit account/category/member ids that do not belong to the resolved ledger.
- Transaction update/void reject transaction ids outside the resolved ledger.
- `finance.list_transactions` schema now advertises category, parent-category, account, merchant, member, tag, currency, pagination, and search filters.
- `finance.get_report` schema now advertises `subcategory`, `tag`, and structured `filters`, matching the report service dimensions.
- `POST /api/v1/hermes/plugin/users/bind` is loopback-only until a stronger Hermes admin-auth contract is added.

## Report Aggregation Rules

2026-05-30 correction:

- Report and summary aggregation must use `repository.reportRows()` / report-specific repository readers, not the paginated `listTransactions()` reader.
- `listTransactions()` remains bounded for UI/MCP list projection; report totals must not inherit its 200-row cap.
- Period boundaries are ledger-day boundaries. The current default ledger timezone is `Asia/Shanghai`, so year/quarter/month queries use local midnight converted to UTC.
- MCP `finance.get_summary` and unfiltered `finance.get_report` must aggregate the resolved workspace ledger across all members by default. Member is a reporting dimension, not the default permission scope for summary totals. Explicit `member_id` filters remain supported when the caller asks for one member.
- Report totals are currency-scoped for non-account dimensions. Default report currency is `CNY`; callers may pass `currency` to query `HKD`, `USD`, `EUR`, or another supported currency separately.
- Account-dimension reports are the exception: if `currency` is omitted, they include all accounts in original transaction currencies without FX conversion. Percentages are therefore original numeric proportions, not CNY-equivalent proportions.
- Do not sum different currencies into one CNY total unless a future explicit FX conversion service is added.
- `finance.get_summary`, `finance.list_transactions`, and `finance.get_report` advertise `currency` in their schemas. The standalone UI keeps one current report currency and sends it to overview summaries, report totals, report breakdowns, trend drilldowns, and filtered bill-detail drilldowns. It does not convert foreign currencies into CNY; users switch between original currencies explicitly.

## Account UI Projection Rules

2026-05-30 correction:

- Account pages group balances by currency and show the currency code beside each balance.
- Entry account selectors display account names only. Currency is bound to the selected account and synchronized into a hidden compatibility field before submit.
- The account selector still submits the account name as `account_hint` for compatibility with the existing transaction service.

## Ledger Book Rules

2026-05-31 correction:

- `finance_ledgers` is the user-scoped ledger-book table. One Finance user may own multiple ledgers.
- The default imported Wacai ledger is `daily` with display name `日常账本`.
- `GET /api/finance/ledgers` lists ledgers for the resolved Finance user and returns bounded counts for UI display.
- `POST /api/finance/ledgers` creates a new ledger for the resolved Finance user and seeds default accounts, members, and categories.
- UI API calls accept `ledger_id` as query/body context. The route layer delegates access decisions to `finance-ledger-service`; business services continue to enforce scoped ledger context.
- MCP exposes `finance.list_ledgers` and `finance.create_ledger` in the `finance` toolset.
- Wacai import infers ledger name from export filename `wacai_<ledger>_...xlsx` unless an explicit import env override is set.
- `npm run repair:wacai-members -- --batch-like <source-file-token>` runs a dry-run repair that compares imported Wacai `raw_participant_name` / `raw_tags` source fields with stored transaction members/tags. Add `-- --apply` only after reviewing aggregate counts; apply mode creates a SQLite backup, restores mismatched `booked_by_member_id`, restores missing tags only when the current transaction has no stored tags, and writes bounded audit rows without logging raw bill details.
- `scripts/import-mymoney-csv.js` imports 随手记 Android CSV v5 files into an explicit ledger. It requires `--csv`, `--ledger-id`, and a DB path from `--db` or `FINANCE_MCP_DB_PATH`; default `--mode analyze` is read-only, while `--mode import` writes an import batch and source fields. Run it against a production SQLite backup first, then back up production before applying. The script maps `项目` to tags, preserves the original fields in `finance_transaction_source_fields`, treats negative amounts as income/expense reversals, and skips exact same-ledger duplicates by default.
- Ledger templates are convenience shortcuts. UI and MCP ledger creation must also allow a custom `name` so users can create ledger books beyond the built-in template list.

2026-05-31 sharing update:

- `finance_ledger_memberships` stores shared-ledger access. Owner membership is created for every ledger owner.
- `finance_member_visibility` stores which in-ledger `finance_members` a non-Owner shared Finance user may see/select.
- `GET /api/finance/ledgers/:id/share` returns all member candidates for Owner and only granted candidates for non-Owner.
- `POST /api/finance/ledgers/:id/share` is Owner-only and writes both shared-ledger access and visible member scope. It is retained for service/admin workflows and accepts a resolved `finance_user_id`; Finance UI invitation should use the host-mediated invitation flow instead of typed user keys.
- `POST /api/finance/ledgers/:id/invitations` creates a bounded `finance.ledger_invitation_request` event for Hermes Mobile. It now requires a target Finance user id/key; ledger members such as `自己` / `家庭公用` are only the visibility scope for the invited Finance user. `POST /api/finance/ledger-invitations/:id/accept` accepts the invitation only from that target user's Hermes/Finance context.
- Ledger join uses approval requests, not QR codes or invite links. `finance_ledger_join_requests` stores pending/approved/rejected requests. `POST /api/finance/ledgers/:id/join-requests` creates a pending request and returns a bounded `finance.ledger_join_request` Hermes Inbox event. `POST /api/finance/ledger-join-requests/:id/review` is Owner-only and approves or rejects the request.
- MCP adds `finance.list_ledger_templates`, `finance.get_ledger_share`, `finance.share_ledger`, `finance.request_ledger_join`, `finance.list_ledger_join_requests`, and `finance.review_ledger_join_request`.
- The UI ledger picker follows Wacai's create flow shape: `选择账本` -> `添加账本` menu -> `个人账本` templates -> `添加账本` save form. The share panel lets Owner choose viewer/editor role and visible in-ledger members, then emits a Hermes-hosted invitation event. The share/member selector uses the Finance-specific visibility rule above.
- 2026-05-31 invitation correction: the share panel must show Finance users as invitation targets and ledger members only as visibility scope; inviting 自己 or 家庭公用 is invalid because those are accounting members, not login users.

## 2026-05-31 Shared Ledger Member Semantics

- Shared-ledger access is controlled only by `finance_ledger_memberships` and the target Finance user.
- A shared Finance user can see the full ledger: transactions, accounts, reports, attachments, and all member dimensions in that ledger.
- `finance_members` such as `自己` and `家庭公用` are bookkeeping/reporting dimensions used for entry ownership and statistics. They are not login users and not permission scopes.
- `finance_member_visibility` remains only as a legacy compatibility table and is not used by the active shared-ledger permission model.
- `GET /api/finance/ledgers/:id/share` returns `member_scope: "all_shared_ledger_members"` plus all ledger member dimensions.
- `POST /api/finance/ledgers/:id/share`, `finance.create_ledger_invitation`, and ledger-join approval grant full shared-ledger access; they must not ask for or persist per-member visibility.
- Finance UI invitation must choose a target Finance user and role only. Finance itself lists and accepts pending invitations for the target user; Hermes Mobile Inbox delivery is optional host enhancement.

## 2026-05-31 Invitation Acceptance Simplification

- `GET /api/finance/ledger-invitations?status=pending` lists pending invitations for the resolved current Finance user only.
- `POST /api/finance/ledger-invitations/:id/accept` remains the write path and must be called from the target user's Finance/Hermes context.
- Finance UI now renders pending invitations inside the ledger menu as `加入共享账本` cards with a `同意` action. This is the required path; Hermes Inbox/postMessage delivery is optional enhancement only.
- `finance.plugin.ledger_invitation_request` may still be sent from iframe mode, but Finance cannot rely on Hermes Mobile receiving it before the invitation is usable.
- The projection is bounded to invitation id, ledger id/name/template, inviter display name/id, role, status, created time, and `member_scope`. It must not include keys, tokens, cookies, raw transactions, attachments, or bank data.
