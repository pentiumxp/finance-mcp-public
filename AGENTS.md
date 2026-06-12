# 财务项目 Agent 规则

回答保持中性、客观、科学、证据导向，不迎合，不提供情绪价值，不夸张，不主观拔高。

## 启动规则

实质性工作前先读：

- `.agent-context/PROJECT_CONTEXT.md`
- `.agent-context/HANDOFF.md`
- `docs/DOCS_INDEX.md`

如果任务涉及 Hermes Mobile 接入、MCP、权限、Gateway、Harness、UI 或部署，还要读：

- `docs/hermes-mobile-constraints/README.md`
- `docs/ARCHITECTURE_BOUNDARY.md`
- `docs/IMPLEMENTATION_NOTES/harness-required-matrix.md`
- `docs/TEST_MATRIX.md`
- 任务相关的 `docs/MODULES/*.md`

## 文档更新规则

修改产品规则、架构边界、MCP 工具、数据模型、权限、Harness、UI 或部署流程时，同步更新最小相关文档：

- 产品/业务规则：`docs/finance-mcp-requirements-design.md`
- 架构/服务边界：`docs/ARCHITECTURE_BOUNDARY.md`
- MCP/模块行为：`docs/MODULES/finance-mcp.md`
- 复杂实现计划：`docs/finance-mcp-implementation-plan.md`
- Harness/测试分级：`docs/IMPLEMENTATION_NOTES/harness-required-matrix.md` 和 `docs/TEST_MATRIX.md`
- 当前状态：`.agent-context/HANDOFF.md`

## 工程边界

- 新业务逻辑必须先进入 service/provider/repository，再由 MCP/HTTP/UI 入口调用。
- 入口文件只做参数校验、权限上下文、依赖注入和响应格式化。
- 金额必须使用整数 minor units 加 currency/scale，不得用浮点数存储或聚合。
- 删除交易采用软删除/作废，并写审计日志。
- 写账、改账、成员绑定、批量导入、导出都必须有 actor/source/audit。
- Hermes Mobile 接入必须使用 `finance` MCP toolset；缺少工具集时报告路由或权限缺口，不用通用 HTTP 代替财务写操作。

## 隐私与安全

不要把以下内容写入 docs、handoff、测试夹具或日志：

- 原始密钥、Access Key、OAuth token、银行凭证、推送 endpoint
- 未脱敏账单截图全文、完整银行流水、完整聊天记录
- 长 raw logs、原始模型响应、隐藏 UI 状态

允许持久化：

- 技术决策、文件路径、环境变量名、状态、下一步、验证命令
- 数据库位置、密钥文件位置的元数据
- 摘要级样例和脱敏测试数据

## Mandatory documentation gate

This is a hard done criterion for every non-trivial change.

- Do not finish a code change that affects product behavior, API/MCP contracts, data schema, permissions, UI behavior, Harness, deployment, import/export, or Hermes integration unless the smallest matching docs above have been updated in the same change.
- If no document update is needed, the final response must explicitly state why the change is docs-neutral.
- Validation must include a docs check by reviewing `git diff --name-only`: code changes in `adapters/`, `server-routes/`, `mcp/`, `public/`, `scripts/`, `gateway-plugins/`, or `tests/` should normally be paired with at least one matching `docs/` or `.agent-context/HANDOFF.md` update.
- Do not use chat-only notes as the source of truth for durable rules; persist them in project docs or handoff.

## CodeGraph

本项目已初始化 `.codegraph/` 索引。遇到结构性代码问题时，优先使用 CodeGraph；如果索引缺失或损坏，再问用户是否运行：

```powershell
codegraph init -i
```

文字搜索、文档查找和已知文件读取使用 `rg` 或 PowerShell 等本地工具即可。
