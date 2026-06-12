# Hermes Mobile 约束快照

本目录保存从 `C:\Users\xuxin\Documents\Agent` 和用户级 Skills 复制来的 Hermes Mobile 约束文件，用于让财务项目按同一工程规范推进。

## 来源

复制时间：2026-05-28

源工作区：

- `C:\Users\xuxin\Documents\Agent`
- `C:\Users\xuxin\.codex\skills`

## 快照内容

文档源：

- `source/docs/DOCS_INDEX.md`
- `source/docs/ARCHITECTURE.md`
- `source/docs/ARCHITECTURE_BOUNDARY.md`
- `source/docs/PRODUCT_REQUIREMENTS.md`
- `source/docs/TEST_MATRIX.md`
- `source/docs/FRONTEND_STATE_MAP.md`
- `source/docs/IMPLEMENTATION_NOTES/harness-required-matrix.md`
- `source/docs/MODULES/gateway-pool.md`
- `source/docs/MODULES/static-client.md`
- `source/docs/MODULES/workspace-auth-permissions.md`
- `source/docs/MODULES/skill-permissions.md`

Skill 源：

- `source/skills/hermes-mobile-doc-discipline.md`
- `source/skills/hermes-codegraph-harness-discipline.md`
- `source/skills/hermes-mobile-ui-design.md`
- `source/skills/service-first-architecture.md`
- `source/skills/windows-utf8-safe-editing.md`

## 财务项目适配原则

- 文档优先：先读上下文和 docs 索引，再改代码或设计。
- 服务优先：业务行为放在 service/provider/repository，入口只做胶水。
- Harness 优先：持久状态、权限、MCP 工具路由、通知/导出、UI 导航这类变更不能只靠手工验证。
- 移动优先：界面是工具型、低噪声、状态清晰、适合反复使用的移动控制面板。
- 权限优先：Finance 是敏感数据域，默认比普通工具更窄，不允许通用 HTTP 代替 MCP 写账。

## 使用规则

实现时不要直接修改 `source/` 下的复制快照。需要为财务项目新增或调整规范时，修改本项目根层文档，例如：

- `docs/ARCHITECTURE_BOUNDARY.md`
- `docs/IMPLEMENTATION_NOTES/harness-required-matrix.md`
- `docs/TEST_MATRIX.md`
- `docs/MODULES/finance-mcp.md`
- `docs/finance-mcp-implementation-plan.md`

