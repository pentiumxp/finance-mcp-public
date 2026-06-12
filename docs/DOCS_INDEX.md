# Finance MCP 文档索引

本项目按 Hermes Mobile 的文档优先、service-first、Harness 分级规则维护，但运行时保持独立。Hermes Mobile 只通过 `finance` MCP toolset 使用本项目。

## 首读顺序

1. `.agent-context/PROJECT_CONTEXT.md`
2. `.agent-context/HANDOFF.md`
3. `docs/finance-mcp-requirements-design.md`
4. `docs/finance-mcp-implementation-plan.md`
5. `docs/IMPLEMENTATION_NOTES/harness-required-matrix.md`

## 核心文档

- `docs/finance-mcp-requirements-design.md`
  - 产品定位、业务模型、Wacai 对标、数据模型、报表下钻、MCP toolset、UI 规则、风险边界。
- `docs/finance-mcp-implementation-plan.md`
  - 当前代码结构、服务初始化、数据库、交易服务、报表服务、Wacai 导入、MCP、HTTP/UI API、前端实现、测试和运行流程。
- `docs/IMPLEMENTATION_NOTES/harness-required-matrix.md`
  - H1/H2/H3 触发条件、必须验证内容和最低测试命令。
- `docs/ARCHITECTURE_BOUNDARY.md`
  - service-first 架构边界、MCP 边界、Hermes Mobile 集成边界、UI 边界。
- `docs/TEST_MATRIX.md`
  - 测试矩阵和阶段性验收命令。
- `docs/MODULES/finance-mcp.md`
  - Finance MCP 模块说明、运行配置、数据规则、工具清单和隐私规则。

## Hermes Mobile 约束快照

本地快照位于：

- `docs/hermes-mobile-constraints/README.md`
- `docs/hermes-mobile-constraints/source/docs/`
- `docs/hermes-mobile-constraints/source/skills/`

实现时优先读本项目适配文档。只有当本项目文档没有覆盖某个 Hermes 规则时，再读快照源文档。

## 更新规则

- 改产品范围或业务口径：更新 `docs/finance-mcp-requirements-design.md`。
- 改实现结构、运行方式、API、服务职责：更新 `docs/finance-mcp-implementation-plan.md`。
- 改 MCP 工具、数据模型、权限、运行配置：更新 `docs/MODULES/finance-mcp.md`。
- 改架构边界：更新 `docs/ARCHITECTURE_BOUNDARY.md`。
- 改测试或 Harness 要求：更新 `docs/IMPLEMENTATION_NOTES/harness-required-matrix.md` 和 `docs/TEST_MATRIX.md`。
- 结束实质工作前：更新 `.agent-context/HANDOFF.md`。

## 禁止写入文档的内容

- access key、token、password。
- 原始银行账单全文或完整 Wacai 明细。
- `data/finance.sqlite3` dump。
- 长日志。
- 无关用户或无关账本数据。

## Mandatory documentation gate

Every non-trivial implementation change must include the matching durable documentation update before the task is considered done.

- Product/business rule changes: update `docs/finance-mcp-requirements-design.md`.
- Architecture/service boundary changes: update `docs/ARCHITECTURE_BOUNDARY.md` or `docs/finance-mcp-implementation-plan.md`.
- API/MCP/schema/permission/runtime behavior changes: update `docs/MODULES/finance-mcp.md`.
- Harness/test expectation changes: update `docs/IMPLEMENTATION_NOTES/harness-required-matrix.md` and `docs/TEST_MATRIX.md`.
- Current-state or operational facts: update `.agent-context/HANDOFF.md`.
- If a code change is docs-neutral, say so explicitly in the final response with the reason.
- Before final response, inspect `git diff --name-only`; changes under `adapters/`, `server-routes/`, `mcp/`, `public/`, `scripts/`, `gateway-plugins/`, or `tests/` normally require a paired docs or handoff update.

## Hermes Embedded Plugin

- `docs/IMPLEMENTATION_NOTES/hermes-embedded-plugin.md`
  - Records the Hermes Mobile embedded-app plugin contract for Finance.
  - Covers `/api/v1/hermes/plugin/manifest`, `/api/v1/hermes/plugin/launch`, `?embed=hermes`, iframe navigation/back/refresh messages, same-origin proxy behavior, and required harness.
- `docs/IMPLEMENTATION_NOTES/android-pwa-harness.md`
  - Records the installed-PWA mobile validation rule: Chrome/Safari address-bar loading is browser-mode diagnosis only; mobile PWA evidence must start from the Launcher/Desktop PWA icon.

## Mac Studio Production Deployment

- `docs/IMPLEMENTATION_NOTES/mac-studio-deployment.md`
  - Records the current Mac Studio Finance deployment target, deploy script,
    backup locations, launchd restart command, validation commands, and rollback
    boundaries.
