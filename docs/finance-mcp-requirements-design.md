# Finance MCP 需求分析与详细设计

日期：2026-05-28

## 1. 产品定位

本项目是一个独立的本地优先个人/家庭财务系统。它提供日常记账、账单导入、分类统计、账户余额、成员绑定和 MCP 工具集能力。Hermes Mobile 只通过 `finance` MCP toolset 使用本系统，不嵌入本项目 UI，不通过通用 HTTP 工具写入财务数据。

第一版目标不是复刻挖财 App 的全部 UI，而是把挖财类产品背后的业务能力拆成可持久化、可审计、可被 Hermes 调用的事实系统：

- 事实层：账户、交易、分类、成员、标签、商家、货币、导入批次、原始字段、报表、审计。
- 操作层：Hermes Mobile 通过 MCP 做自然语言记账、查账、统计、修改、作废和成员绑定。
- 本地管理层：独立 Finance Web UI 用于本地录入、报表、明细查看和验证，视觉规则继承 Hermes Mobile，但产品边界保持独立。

## 2. 核心约束

- 本项目是独立 Git 工作区和独立运行时。
- 运行时默认监听 `0.0.0.0`，用于可信局域网调试；生产暴露前必须另做鉴权和网络边界。
- 数据库是本地 SQLite，默认路径为 `data/finance.sqlite3`，该文件是运行时数据，不入库。
- 金额全部使用整数 minor units，不使用浮点数做业务计算。
- 交易金额支持小数点后两位；`amount_minor + currency + scale` 是事实结构。UI 展示必须保留非零小数位：`12.30` 显示为 `12.30`，`12.05` 显示为 `12.05`，`12.00` 这类整金额可以显示为 `12`。
- 货币是一级字段，交易必须保留原币种；已支持 CNY、HKD、USD、EUR、JPY 主数据。
- Wacai 2025 导入文件中的金额曾缩小 100 倍，导入时必须使用 `FINANCE_WACAI_AMOUNT_MULTIPLIER=100` 还原。
- 写操作必须可审计，作废必须软删除，导入必须可追溯来源批次和原始字段。
- MCP 返回受控 projection，不返回本地绝对路径、密钥路径、完整原始账单文件或无关成员数据。

## 3. 角色与成员模型

## 2026-05-30 Data Isolation Requirement

- Finance user identity is the product-level ownership boundary.
- A resolved Finance user or Hermes workspace session must be locked to its resolved ledger.
- Caller-supplied `ledger_id` must not allow access to another user's ledger.
- Master-data ids used in writes must belong to the resolved ledger.
- Updating or voiding a transaction from another ledger must be denied.
- Hermes workspace onboarding is an administrator operation and must not be open to arbitrary LAN callers.

### 3.1 财务成员

`finance_members` 表表示账本内成员。成员可以是：

- 手工成员，例如“自己”“家庭公用”“孩子”。
- Hermes Mobile 绑定成员，通过 `finance_member_bindings` 关联 Hermes workspace 或 user。
- 未绑定成员，仍可参与记账、报表和导入。

### 3.2 Hermes 绑定

绑定目标：

- `provider`: 固定使用 `hermes_mobile`。
- `external_workspace_id`: Hermes workspace 级身份。
- `external_user_id`: Hermes 用户级身份。

规则：

- Owner 才能执行成员绑定。
- 手工 `finance.bind_member` 仍然 owner-only。
- Hermes Mobile 自动传入的 workspace user key 由 Finance 转换为
  workspace-scoped `sha256:*` 外部用户 id。
- 同一 Hermes workspace 下，不同 user key 必须能映射到不同 active finance
  member。
- 同一 Hermes workspace/user key 重复调用必须稳定映射到同一个 finance member。
- raw workspace user key 不保存到数据库、文档、handoff、测试 fixture 或日志。
- 后续“我的支出”等默认过滤必须先经过绑定解析，不能靠名称猜测。

## 4. 主要用户流程

### 4.1 手动记账

用户在独立 Finance UI 进入“记账”页，选择支出、收入或转账，填写金额、货币、账户、分类、成员、商家、备注后保存。

系统行为：

- 金额字符串转为 minor units。
- 账户、分类、成员按 hint 解析。
- 商家按名称 upsert。
- 金额输入使用固定自定义键盘，支持小数点后两位；键盘支持 `+ - * /` 四则表达式，点击 `=` 在本地计算并归一化为最多两位小数后再保存；金额显示不可触发系统键盘、文本选择框或长按菜单。
- 记账页只有明确点击 `保存` 才能创建或更新交易。键盘上的 `再记`
  只切换“保存后继续记下一笔”模式，不得直接提交表单或写入交易。
- 成员和标签必须从可见选择层选择，选择结果写回交易 payload；成员列表按历史账单使用次数降序排列，使用次数相同再按成员兜底顺序排列。标签以 `tags` 数组提交。商家不作为当前记账页的可见入口。
- 备注输入不再常驻记账页底部。记账页元信息条在相机按钮前提供固定文本 `备注` 按钮，点击后打开底部备注输入弹层；弹层 `完成` 才写回隐藏 `note` 字段，关闭不提交。备注输入获得焦点时，或备注弹层已打开但 iOS/iframe 键盘切换短暂丢失 `document.activeElement` 时，弹层必须使用 Finance 自身的可视工作区模型：键盘打开时按 iframe/页面自己的 `visualViewport.height` 写入 `--finance-app-height`，并在 iOS 平移 iframe 时按 Finance 自身的 `visualViewport.offsetTop` 或 iframe `scrollY` 写入 `--finance-app-top`，输入 sheet 贴 Finance 可视区域底部并保持在原生键盘上方，不能让原生键盘覆盖整体页面或把页面拉到顶部空白区域。`?embed=hermes` 插件 iframe 可以接收宿主 `hermes.plugin.viewport` 作为宿主 chrome / 底部占用诊断，但不能用宿主 `viewport.offsetTop` 来计算系统输入法面板。日期可见控件固定显示 `日期`，不在记账页直接展示当前日期时间；实际 `occurred_at` 仍保存在隐藏字段并由日期弹层或服务端默认时间写入。
- 交易写入后同步更新账户余额。
- 写入审计日志。
- UI 返回首页并刷新概览。

### 4.2 Hermes 自然语言记账

示例输入：

```text
今天晚饭 86.5，现金，家庭公用，标签朋友聚餐
```

Hermes 应解析后调用：

```json
{
  "type": "expense",
  "amount": "86.50",
  "currency": "CNY",
  "occurred_at": "2026-05-28T20:00:00+08:00",
  "category_hint": "晚饭",
  "account_hint": "现金",
  "member_hint": "家庭公用",
  "tags": ["朋友聚餐"],
  "idempotency_key": "stable-source-key"
}
```

要求：

- 同一 `idempotency_key` 重复提交不得重复入账。
- hint 解析低置信时返回警告或要求确认。
- Hermes 不得绕过 `finance` toolset 使用通用 HTTP 写账。

### 4.3 查账与统计

用户问：

```text
今年居家支出按小类分别是多少？
```

系统路径：

- Hermes 选择 `finance.get_report`。
- 传入 `period=year` / `period=quarter` / `period=month` 等周期，`metric=expense`、`dimension=subcategory`，并带分类过滤。
- 返回 totals、breakdown、appliedFilters、aggregationBasis。

UI 路径：

- 报表页选择周期和维度。
- 点击排行项打开底部 action sheet。
- 可进入趋势统计、小类报表或账单明细。
- 二级页使用左上角返回和左边缘右滑返回。

### 4.4 修改和作废

修改流程：

- 先用 `finance.list_transactions` 找候选。
- 唯一高置信候选才可调用 `finance.update_transaction`。
- 多候选必须要求用户选择。
- 修改金额、账户或类型时必须在一个 DB transaction 内撤销旧余额影响并应用新余额影响。
- UI/API 编辑可以传入 `amount` 字符串；服务层必须以新金额重新解析 minor units，不得因旧交易行的 `amountMinor` 合并而忽略新金额。
- UI/API/MCP 更新交易时，未显式传入成员或标签不得重置现有成员或清空现有标签；只有显式 `tags` 补丁才可替换交易标签。
- 前端账目行左滑菜单按挖财交互提供编辑、复制、删除；编辑和复制复用记账页，不维护第二套交易表单。编辑保留原交易时间；复制必须默认使用当前时间，不能复制原交易发生时间。菜单必须只在明确左滑后生成，普通触摸和纵向滚动不能提前显示操作按钮。

作废流程：

- 调用 `finance.void_transaction`。
- 状态改为 `voided`。
- 删除入口必须二次确认，仍然执行软删除/作废，不物理删除交易。
- 撤销账户余额影响。
- 统计默认排除。
- 写审计日志。

### 4.5 Wacai Excel 导入

导入目标是尽量保留挖财业务结构，而不是只导入扁平流水。

当前已支持：

- Excel 文件解析。
- 父子分类解析。
- 账户、成员、标签、商家自动 upsert。
- CNY/HKD/USD 等源币种保留到交易。
- 原始字段写入 `finance_transaction_source_fields`。
- 导入批次写入 `finance_import_batches`。
- 确定性 idempotency key，重复导入可去重。
- 金额缩小 100 倍场景通过环境变量还原。

### 4.6 随手记 CSV 导入

`scripts/import-mymoney-csv.js` 用于随手记 Android CSV v5 导出文件的受控导入。该导入脚本不是 MCP 写账入口；生产使用前必须先在生产 SQLite 副本上 dry run，再备份正式库后导入。

映射规则：

- 导出文件第一行是随手记元数据，第二行是 CSV 表头。
- 交易类型仅支持 `支出` 和 `收入`；负金额按冲减处理，负支出导入为收入，负收入导入为支出。
- `类别/子类别` 映射为 Finance 父子分类。
- `账户币种` 保留为交易币种，金额按 integer minor units 入库。
- `成员` 为空时按吴萍本人导入；只有 `家庭公用` 写入 `is_household=1`。
- `项目` 映射为 Finance 标签，同时保存在 source fields；商家、备注、账户、成员、原始金额和原始类型也写入 source fields。
- 脚本生成确定性 `mymoney:v1:*` idempotency key，并默认跳过同账本中类型、时间、金额、币种、分类、账户、成员、商家、备注完全一致的现有交易。

导入记录只保存批次、数量、文件 hash、格式元数据和逐交易 source fields；docs、handoff 和测试证据不得记录原始账单行。

## 5. 数据模型

### 5.1 主数据

- `finance_ledgers`: 账本，当前默认 `daily`。
- `finance_currencies`: 货币主数据，包含 code、display_name、symbol、scale、sort_order。
- `finance_accounts`: 现金、银行卡、应付等账户，保留币种和当前余额。
- `finance_categories`: 收入/支出分类，支持 `parent_id` 表示大类/小类。
- `finance_members`: 账本成员。
- `finance_merchants`: 商家，按 normalized name 去重。
- `finance_tags`: 标签。

### 5.2 交易数据

`finance_transactions` 是核心事实表：

- `type`: `expense | income | transfer`
- `status`: `active | voided`
- `amount_minor`, `scale`, `currency`
- `occurred_at`
- `category_id`
- `account_id`, `target_account_id`
- `booked_by_member_id`, `payer_member_id`
- `merchant_id`
- `note`, `source`, `source_ref`, `idempotency_key`

关联表：

- `finance_transaction_tags`
- `finance_transaction_participants`
- `finance_attachments`

### 5.3 导入与审计

- `finance_import_batches`: 每次导入的来源、文件名、hash、行数、导入数、跳过数和元数据。
- `finance_transaction_source_fields`: 每条导入交易的原始列保留。
- `finance_audit_log`: 写操作审计。

### 5.4 Owner 资产快照

Owner 可维护一组独立于日常账本交易的年度资产快照，用于长期净资产、美元账户收益率和复合增长率统计。

- `finance_owner_asset_snapshots`: Owner 年度资产快照，按 `finance_user_id + snapshot_year` 去重；保存年度、快照日期、美元兑人民币汇率、美元投资第 N 年、年度回报率、复合增长率、总回报倍数和人民币总资产。金额字段使用 minor units；收益率/CAGR 使用 basis points；总回报倍数用 basis points 表示，`1.0x = 10000`。
- `finance_owner_asset_components`: 快照组件明细，保存美元账户、人民币银行余额、证券余额、家托、国内总额、其它投资等结构化组件。组件可保留原币金额和折人民币金额。
- 资产快照是 Owner-only 事实，不参与普通 ledger sharing，也不对非 Owner Finance user 暴露。
- Excel 导入只持久化结构化字段、来源文件 hash 摘要和导入数量；docs、handoff、测试和日志不得保存完整原始资产表或逐行原始资产明细。年度导入以工作簿内每个年度分组的汇率、美元总额和人民币总资产总计为准，不能假设美元账户来源固定在某个银行账户列；缺失的组件明细不应补成 0 组件。

### 5.5 股票持仓快照

股票持仓是按 Finance user 分区的结构化投资事实；当前 Owner 个人持仓只对 Owner 可见，后续其他 Finance user 可独立开通自己的股票持仓能力。

- `finance_owner_stock_snapshots`: 股票组合快照，按 `finance_user_id + as_of_date` 去重；保存基准货币、价格时间、总市值、成本、未实现盈亏、当年盈亏和当年变动。金额使用 minor units，比例使用 basis points。
- `finance_owner_stock_positions`: 快照持仓行，保存股票标识、市场、币种、数量 micro-units、买入价、期初价、当前价、本币市值、基准货币市值、实时汇率和占比。
- 查询股票总市值或打开股票页面时必须用实时股票价格和实时汇率生成当前估值投影；不能只返回库内旧价格。写入类工具可把实时估值持久化为新快照。
- 长期主要录入方式是 MCP 自然语言增减仓，例如“腾讯港股通增加多少股”或“港股腾讯卖出多少股”。用户不需要填写实时行情或汇率；工具运行时负责获取行情和汇率。
- Excel/XLSX 只作为一次性初始化或迁移入口；导入只持久化结构化持仓和来源 hash，不保存完整原始表。

## 6. 报表设计

### 6.1 周期

当前支持：

- `month`
- `quarter`
- `year`
- `custom`
- `all`

报表返回必须包含：

- `periodStart`
- `periodEnd`
- `timezone`
- `metric`
- `dimension`
- `totals`
- `breakdown`
- `series`
- `appliedFilters`
- `aggregationBasis`

### 6.2 指标

- `expense`: 只统计支出。
- `income`: 只统计收入。
- `net`: 收入为正，支出为负。
- `transfer`: 默认不进入收入/支出统计。
- `voided`: 默认排除。

### 6.3 维度

当前实现维度：

- `trend`: 按日期生成序列，前端趋势页可按年聚合展示。
- `category`: 大类，优先使用父分类。
- `subcategory`: 小类，直接按交易分类。
- `member`: 记账成员。
- `account`: 账户。
- `merchant`: 商家。
- `tag`: 标签，未打标签用 `untagged`。

### 6.4 报表下钻

报表排行项点击后弹出底部 action sheet：

- 趋势统计：使用同一筛选条件请求 `dimension=trend`。
- 小类报表：仅大类维度显示，使用 `category_parent_id` 过滤并请求 `dimension=subcategory`。
- 账单明细：使用同一筛选条件请求 `/api/finance/transactions`。
- 主页/全部明细列表默认加载 50 条交易；滚动到底部时继续请求下一页，每页 50 条并追加显示。
- 全部明细搜索框提交搜索后必须让输入框失去焦点，收起移动端原生输入法，避免遮挡搜索结果。
- 全部明细搜索如果输入的是纯金额格式，例如 `5000`、`5000.00` 或 `5,000.00`，按确定金额搜索账单，匹配主币种金额的 major units；不得按 minor units 文本模糊匹配，所以 `1200` 表示 `1200.00`，不是 `12.00`。
- 分类图标采用挖财式移动端识别形态：彩色圆形底、白色简洁符号。Wacai 导入必须按原始分类路径为 `finance_categories.icon` 固化稳定 icon key；启动回填只补空值或通用值，不覆盖已明确设置的非通用 icon。交易列表、分类选择器、快捷分类和报表排行必须优先使用分类表/交易投影里的 icon，无法识别的分类才使用灰色通用 fallback。

筛选参数：

- `category_id`
- `category_parent_id`
- `member_id`
- `account_id`
- `merchant_id`
- `tag_id`

## 7. MCP Toolset 设计

Toolset 名称固定为 `finance`。

当前已实现工具：

- `finance.create_transaction`
  - May attach up to 6 photos/files during the same MCP create call through
    `attachments`. Each attachment carries `file_name`, `mime_type`, and one
    payload source: `data_base64`, `data_url`, `file_path`, or `upload_path`;
    responses expose only bounded attachment metadata and structured attachment
    URLs. Replayed idempotent duplicate creates must not attach the same
    payloads again.
- `finance.add_transaction_attachment`
  - Attach one bounded base64 or server-local upload-path photo/file to an
    existing transaction by `transaction_id`, returning attachment metadata and
    structured URLs only.
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
- `finance.bind_member`

Reference Contract V1:

- Home AI graph/Note links use stable Finance references, not copied full
  transaction/account/category facts.
- Supported object types are `transaction`, `account`, and `category`.
- Stable identity is `workspace_id + plugin_id + object_type + object_id`.
- `reference_get` and `reference_summarize` must enforce the same ledger access
  rules as normal Finance reads and return bounded projections only.

后续工具蓝图：

- `finance.batch_import_bills`
- `finance.classify_transactions`
- `finance.list_recurring_transactions`
- `finance.set_budget`
- `finance.get_budget_status`
- `finance.upsert_owner_asset_snapshot`
- `finance.list_owner_asset_snapshots`
- `finance.get_owner_asset_summary`
- `finance.apply_owner_stock_position_delta`
- `finance.get_owner_stock_summary`
- `finance.list_owner_stock_snapshots`
- `finance.bill_calendar`
- `finance.create_finance_todo`
- `finance.export_monthly_markdown_report`

## 8. 独立 UI 设计

UI 是本地管理投影，不是 Hermes Mobile 内嵌页。

### 8.1 全局规则

- 页眉固定，不随页面滚动。
- 禁止页面手动缩放。
- 二级页面左上角返回。
- 二级页面支持左边缘右滑返回。
- 不提供独立退出按钮。
- 底部导航保留首页、计划、记账、报表、我的；当且仅当当前上下文有对应私有数据 summary 时，额外显示 `资产` 或 `股票` 标签。当前 `资产` 是 `user_xuxin` Owner-only；`股票` 按 Finance user 分区，Owner 个人股票标签只展示 Owner 的持仓。
- 底部导航使用内容内浮动胶囊标签形态，不能固定贴住 viewport 底边；`?embed=hermes` 内嵌模式下必须上浮到 Hermes Mobile 宿主底栏之上，避免被宿主输入/底部 tab UI 遮挡。
- 设置复用 Hermes 风格的 `system/light/dark` 主题。

### 8.2 报表页

报表页当前包含：

- 周期 tabs：全部、年、季、月；点击年、季、月快捷周期时以当前本地日期进入当前年、当前季、当前月，手动选择器保留用户选定周期。
- 维度 tabs：趋势、大类、小类、成员、账户、商家、标签。
- donut 占比图。
- 总支出中心值。
- 排行行：名称、金额、笔数、占比、比例条。
- 排行列表一次显示完整结果，不再折叠前三项或显示点击展开按钮。
- 点击排行项进入 action sheet。
- 趋势页、小类占比页、账单明细页。

### 8.4 Owner 资产页

- `资产` 标签只对 Owner 可见。前端仅在 `/api/finance/overview` 返回 `ownerAssetSummary.latest` 时显示该标签；非 Owner overview 不返回资产 summary，直接访问资产 API 也必须返回 `finance_owner_assets_owner_required`。
- 资产页默认把人民币总资产和按当前实时 USD/CNY 汇率折算并保存的美元总资产作为同级总资产卡片展示；两张总资产卡片在移动宽度下单列上下排列，避免长金额被双列压缩换行。随后展示美元账户复合增长率、年度回报、总回报倍数和结构化资产构成。每次打开资产页或通过 MCP 查询资产 summary 时都必须实时获取 USD/CNY；获取成功后保存当前汇率、刷新时间、来源和折算后的美元总资产，不能使用固定汇率兜底。资产页当前汇率标识只能使用实时 `current_usd_cny_rate`，不能在总资产区继续展示历史工作簿 `fx_usd_cny_rate`。当 summary 含多年度快照时，页面提供从最新到最早的年度选择器，Owner 可切换到任一年查看对应年度的资产构成和收益率。页面总资产展示人民币口径；组件明细按组件原币展示，例如美元账户组件显示 USD。
- 资产页是 Owner 管理投影，不参与普通账本 sharing，不把原始 Excel 行或完整资产表展示给非 Owner。

### 8.5 股票页

- `股票` 标签只在当前 Finance user 存在股票快照 summary 时显示；当前 Owner 初始持仓只对 Owner 可见，未来其他用户开通后只看到自己的持仓。
- 股票页打开或切换到该标签时调用实时估值接口，使用当前股票价格和当前汇率刷新总市值、当年变动、累计盈亏、持仓明细和占比。共享行情 provider 对股票优先尝试东方财富、腾讯和新浪等国内可访问行情源，再尝试 Yahoo chart 和无密钥公开 FX/股票 quote fallback；不得用固定汇率或固定股价兜底。同一快照内持仓价格和汇率请求应并发执行，避免按持仓数量串行放大等待时间。资产或股票实时刷新失败时，页面必须保留一个小型刷新图标按钮用于重试；失败不能要求用户退出重进页面。
- 股票页展示基准货币组合市值和持仓行；持仓行保留股票原币当前价，组合市值按实时汇率折算到基准货币。
- 股票页不展示完整上传原表，也不把 Owner 股票持仓暴露给普通 ledger sharing。

### 8.3 自动刷新

服务端暴露 `/api/finance/client-version`，签名由静态资源 mtime/size 生成。前端每 30 秒轮询，发现版本变化后请求刷新；若当前处于二级/可返回页面、记账页、弹层或左滑菜单状态，刷新必须延迟到用户回到 root 首页后再执行 `window.location.reload()`。前端代码变化后必须重启服务端，否则签名不会更新。

## 9. 非目标

第一版明确不做：

- 真实银行账户直连。
- 投资组合估值。
- 企业会计凭证。
- 未确认的大规模自动入账。
- 自动汇率换算。
- Hermes Mobile 内嵌 UI。

## 10. 风险与控制

- 财务数据敏感：文档、handoff、测试不能保存原始账单全文、密钥、长日志。
- 局域网开放：`0.0.0.0` 仅用于可信 LAN，本阶段不等于公网可用。
- 自然语言记账：必须依赖 idempotency 和候选确认，不能只靠模型猜测。
- 多币种：当前保留原币种，不默认折算为人民币。
- Owner 资产快照是唯一例外：其来源表已经给出年度汇率和折人民币总资产，因此资产组件可同时保存原币金额和折人民币金额，但不得把该换算规则套用到普通交易报表。
- Wacai 金额：当前 2025 文件按缩小 100 倍导入，重跑必须保留 multiplier。
- 文档编码：以后编辑中文文档必须使用 UTF-8 safe workflow。
## 2026-05-30 User Ownership Update

- Finance user is the data owner.
- Existing imported Wacai history belongs to `user_xuxin`.
- Existing `daily` ledger is owned by `user_xuxin`.
- Ledger members are participants inside a user's ledger; they are not login users.
- Hermes administrator workspace is bound to `user_xuxin`.
- When Hermes administrator approves a new workspace for the Finance plugin, Hermes calls Finance to create a new Finance user binding.
- Finance creates an isolated default ledger for that user and future data is separated by user/ledger.
- Direct Finance login requires an access token. Raw access tokens are returned only once and only token hashes are stored.

## 2026-05-31 Entry Shortcut and Attachment Update

- Bookkeeping quick category chips are sorted by historical active transaction count within the scoped ledger. The Wacai-style common-category order is only a fallback for ties or categories with no usage history.
- Entry currency is bound to the selected source account. The visible entry form does not show a separate currency chip; a hidden compatibility field is synchronized from the account option before submit.
- The entry camera button opens an attachment action sheet with three actions: camera capture, photo upload, and generic file upload.
- New-entry attachments are queued in the browser until the transaction is created, then uploaded to `/api/finance/attachments` and linked to that transaction. Edit uses the same entry form and the same attachment button.
- MCP direct entry may send bounded base64 attachments or allowed server-local upload paths in `finance.create_transaction`, or attach one photo/file later through `finance.add_transaction_attachment` with an existing `transaction_id`; both reuse the same attachment storage and return metadata only, without embedding raw file bytes in transaction projections, logs, docs, or tests. Hermes/vision analysis may inspect an uploaded image through the model's multimodal path, but Finance attachment persistence should accept the server-local upload path instead of requiring the model to read PNG bytes and produce base64. Legacy absolute upload paths accidentally passed as `data_url` are accepted only after the same upload-root allowlist check; new callers should use `file_path` or `upload_path`.
- Attachment metadata is stored in `finance_attachments`; file responses are served from structured `/api/finance/attachments/:id` URLs with the stored `Content-Type`.
- Transaction list rows with image attachments must show a bounded image indicator. Transaction detail must load `/api/finance/transactions/:id/attachments`, show image thumbnails, and open a large preview when the thumbnail is tapped.
- Original attachment/image bytes must not depend only on loose filesystem files. Finance stores ledger metadata in the main SQLite database and stores original attachment blobs in a separate image SQLite database keyed by `attachment_id`. Thumbnails are derived cache files and are not stored in the image SQLite database.

## 2026-05-31 Ledger Book Update

## 2026-06-04 Recurring Bookkeeping Update

- Finance supports Wacai-style recurring bookkeeping rules for repeated income, expense, and transfer transactions.
- A recurring rule stores the transaction template, recurrence frequency, interval, start date, optional end date, and entry time. A missing end date means the rule is perpetual.
- Supported recurrence shapes are daily, weekly, monthly, and yearly. Weekly rules may target selected weekdays; monthly/yearly rules use a day-of-month with month-end clamping.
- Generated transactions are normal audited Finance transactions with `source="recurring"` and deterministic idempotency keys. Re-running due generation must not duplicate transactions.
- The backend must automatically post due recurring rules without depending on page refresh. Runtime startup/restart must catch up all missed due occurrences from each rule's persisted `next_due_at` through the current time.
- Editing a recurring rule does not rewrite historical generated transactions. Historical generated transactions remain individually editable like ordinary bills.
- Pausing or resuming a rule only affects future generated transactions.
- Deleting a rule retains generated transactions by default. An explicit destructive option can void generated transactions through the normal soft-void transaction path.
- Wacai observation note: the Android app exposes `周期账` from the home service grid; entering management requires login. Wacai's public help and user screenshots also document a create path from the bookkeeping date selector via automatic recurring bookkeeping. Finance mirrors this by opening a full date panel from the entry date field; that panel has a normal date save path and a `保存为周期账` path. The recurring editor then stays visually tied to the active entry form with a `周期账` badge, a `关闭` control, visible save/error status, an explicit perpetual end option, and the Wacai-style field order for type, cycle, interval, start, end, and time.

- Finance now treats ledger books as first-class user-scoped records, matching Wacai's account-level ability to keep multiple books under one user.
- The imported Wacai export does not include a separate ledger column in row data; the current export identifies the ledger through the filename `wacai_日常账本_...xlsx`. Import therefore infers ledger name from the filename unless `FINANCE_WACAI_LEDGER_NAME` or `FINANCE_WACAI_LEDGER_ID` is provided.
- The default `daily` ledger display name is `日常账本`.
- A Finance user can list and create ledgers. Ledger switching changes all overview, transaction, report, account, category, member, attachment, and entry API calls to the selected ledger.
- Scoped Hermes/Finance access-token contexts may select ledgers owned by the resolved Finance user. Attempts to pass another user's ledger id are ignored in favor of the resolved scoped ledger or rejected by service-level access checks.
- 2026-05-31 ledger sharing rule: `finance_ledger_memberships` grants shared-ledger access by Finance user, and `finance_member_visibility` grants member-selection scope inside that shared ledger.
- Ledger-share member selection intentionally differs from Wacai: the ledger Owner can see all ledger members; a non-Owner shared user can see only members explicitly granted to that Finance user.
- Wacai-like ledger creation templates are supported for UI/MCP creation: daily, favor, travel, baby, renovation, car, and business.
- Template ledgers are shortcuts only. The UI must also provide a first-class custom ledger creation path where the user types any ledger name.
- Ledger joining does not use QR codes, public links, or invite URLs. A requester creates a `finance_ledger_join_requests` row; Finance returns a bounded `finance.ledger_join_request` Inbox event for Hermes Mobile to deliver to the ledger Owner. Owner approval creates the ledger membership and member visibility scope.
- Owner invitation is host-mediated: Finance creates a bounded `finance.ledger_invitation_request` event with ledger, inviter, role, and visible member scope; Hermes Mobile chooses the target user, delivers it to that user's Inbox, and the target accepts from their own Hermes/Finance context. Finance UI must not require typing a Finance user key for this flow.
- 2026-05-31 correction: invitation targets are Finance users, not ledger members. The UI must show `finance_user_candidates` as the invitation target list. Ledger members such as "自己" or "家庭公用" are only the visibility/accounting-member scope granted to the invited Finance user.

## 2026-05-31 Shared Ledger Rule Correction

- Shared ledgers are full-ledger sharing: every shared Finance user can see the whole ledger.
- Ledger members such as `自己` and `家庭公用` are accounting/reporting dimensions under the ledger, not login users and not visibility scopes.
- Reports may group by member to show who/what a transaction belongs to; permission is still determined by Finance user membership in the ledger.
- MCP workspace summary totals include all member dimensions in the resolved workspace ledger by default. The current Hermes user/member may be exposed in member breakdowns and may default write/list flows, but `finance.get_summary` and unfiltered `finance.get_report` totals must not be implicitly narrowed to the current member.

## 2026-05-31 Invitation Acceptance Simplification

- Ledger invitations no longer depend on Hermes Mobile Inbox delivery as the required user path.
- Finance still may emit the bounded `finance.plugin.ledger_invitation_request` iframe message as an optional host enhancement, but the durable source of truth is the Finance database row in `finance_ledger_invitations`.
- A target Finance user can open the Finance ledger menu and see pending invitations under `加入共享账本`.
- Tapping `同意` accepts the invitation from that target user's current Finance/Hermes context and creates the shared-ledger membership.
- The invitation card must show only bounded metadata: ledger name, inviter display name, role/status, and invitation id for the accept API. It must not expose access tokens, workspace keys, cookies, raw transaction content, receipts, or bank details.

## 2026-06-04 Wacai Home Service Grid Update

- The Finance home page should mirror Wacai's home service row order: quick entry, bill details, calendar/report, recurring bookkeeping, and all services.
- The recurring bookkeeping entry must be visible from both the home page service grid and the all-bills page shortcut row, so users do not have to infer that recurring rules live only under the Plan tab.
- The service entries use compact icon-first buttons, not plain text pills. User-facing labels remain Chinese UI copy.
## 2026-06-04 Wacai 2026 Scale Repair and Year Summary Update

- The 2026 Wacai export imported in batch `import_02db2c628ac2d322` and the Wacai recurring-rule detail capture use the same amount scale as the older 2025 import and must be multiplied by 100 before storing in Finance minor units.
- The Finance home summary should match Wacai's home emphasis on current-year values: current-year expense is primary, with current-year income and net shown below it. Monthly summary remains available through API data but is no longer the home card default.
- A later transaction-service repair found that using `updateTransaction()` for the 2026 scale repair had reset `booked_by_member_id` to the first sorted member and cleared tags when the update patch omitted those fields. The durable rule is that Wacai source `参与人` remains the imported bookkeeping member, and repair scripts may restore members/tags only from `finance_transaction_source_fields` aggregates without logging raw bill rows.

## 2026-06-05 Entry UI Completion and Copied Amount Correction

- Historical ADB observation on Wacai `com.wacai365` v13.0.13, device `e0cd9d2b`, showed note focus with an inline note row and custom keypad visible. That 2026-06-05 browser-specific inline-note implementation is superseded by the 2026-06-08 entry note button rule.
- Current rule as of 2026-06-08: the bookkeeping page does not render an always-visible note input row. The meta strip exposes a fixed `备注` button before the camera button; tapping it opens a bottom note input sheet, `完成` writes the hidden `note` field, and closing the sheet must not alter the page's amount keypad reservation.
- Closing and reopening the note sheet must not reuse stale keyboard offsets, create blank keypad reservation, or trigger a full-page reload.
- Copying a transaction may prefill the source amount for inspection. If the user starts typing a numeric amount before clearing the prefilled value, the first numeric key must replace the copied amount from zero instead of appending to it.
- The bottom custom amount calculator must keep a left/right safe touch gutter. The `1/4/7` column must not sit flush against the physical screen edge, because edge-adjacent buttons are unreliable to tap on mobile.
- The bottom custom amount calculator supports local `+ - * /` arithmetic. Pressing `=` must evaluate the expression with operator precedence and must not use dynamic code execution such as `Function`/`eval`.
- In dark mode, returning to the Finance PWA from another app must not flash a white/light canvas. The HTML shell and PWA manifests must provide a dark pre-CSS launch/resume background while still allowing explicit light mode after theme resolution.
- The home search button opens the all-bills search page with focus already in the search field so the user can type immediately.
- After a transaction is created, copied, edited, or returned through an idempotent duplicate write, the detail page must show the selected category, account, transfer target, member, merchant, and tags. The UI must not show these fields as unrecorded merely because the service returned a raw transaction row without joined projection names.
