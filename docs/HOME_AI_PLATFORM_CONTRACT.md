# Home AI Platform Contract Pointer

Last updated: 2026-06-11.
Home AI platform contract version: `20260618-v4`.

## Scope

Finance is a standard inserted Home AI plugin. This file records only
Finance-local facts and points back to the canonical Home AI platform contract.
It must not redefine shared SSH, sudo, MCP upgrade, Reference Graph, or mobile
visual rules.

## Canonical Home AI Docs

Read these Home AI docs before changing deployment, MCP tools, mobile visual
behavior, or cross-plugin reference behavior:

- `C:\Users\xuxin\Documents\Agent\docs\PLATFORM_CONTRACTS\plugin-workspace-platform-contract.md`
- `C:\Users\xuxin\Documents\Agent\docs\PLATFORM_CONTRACTS\plugin-mobile-ui-visual-contract.md`
- `C:\Users\xuxin\Documents\Agent\docs\RUNBOOKS\macos-production-access.md`
- `C:\Users\xuxin\Documents\Agent\docs\RUNBOOKS\mcp-tool-upgrade-closure.md`
- `C:\Users\xuxin\Documents\Agent\docs\RUNBOOKS\macos-ios-simulator-appium.md`
- `C:\Users\xuxin\Documents\Agent\docs\MODULES\ai-operations-control-plane.md`
- `C:\Users\xuxin\Documents\Agent\docs\IMPLEMENTATION_NOTES\ai-operations-control-plane.md`
- `C:\Users\xuxin\Documents\Agent\docs\IMPLEMENTATION_NOTES\reference-memory-graph-v1.md`
- `C:\Users\xuxin\Documents\Agent\docs\IMPLEMENTATION_NOTES\reference-memory-graph-harness-plan.md`

## Plugin-Local Facts

| Field | Value |
| --- | --- |
| `plugin_id` | `finance` |
| `workspace_path_windows` | `C:\Users\xuxin\Documents\财务` |
| `pointer_added_at_snapshot` | `codex/finance-mcp-design` at `d8d0a5b` when this pointer was added |
| `production_source_path_macos` | `/Users/hermes-host/HermesMobile/plugins/finance` |
| `production_data_root_macos` | `/Users/hermes-host/HermesMobile/plugins/finance/data` |
| `windows_dev_base_url` | `http://127.0.0.1:8791` |
| `macos_production_base_url` | `http://127.0.0.1:8791` |
| `launchd_label` | `system/com.hermesmobile.plugin.finance` |
| `manifest_url` | `http://127.0.0.1:8791/api/v1/hermes/plugin/manifest` |
| `client_version_endpoint` | `GET /api/finance/client-version` |
| `mcp_command` | `npm run start:mcp` or `npm run start:mcp:stdio`; verify Gateway profile before production changes |
| `mcp_schema_endpoint` | `GET /api/finance/mcp/schemas` |
| `dev_runtime_prerequisites` | Mac DEV must expose Node and npm through `/Users/xuxin/Developer/HomeAIDev/bin`; run `node --version` and `npm --version` before classifying MCP/service test failures. |
| `deploy_command` | `npm run deploy:mac` or `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-mac-finance.ps1 -PasswordFile <private-local-password-file>` |
| `credential_locations` | Private ignored local config/password files only. Do not record raw values here. |
| `reference_contract_status` | `v1-minimal`; Finance exposes Reference Contract methods for transaction/account/category objects. |
| `mobile_visual_harness_status` | Standalone PWA/browser harnesses exist; Home AI embedded iOS/Appium evidence is required when Finance embedded UI layout or plugin shell behavior changes. |
| `ai_ops_control_plane_command` | `cd /Users/hermes-dev/HermesMobileDev/app && node scripts/ai-ops-control-plane.js intake --task "<task>" --json` |
| `ai_ops_required_flow` | `intake -> required-checks -> lane allocate if visual -> evidence append -> production smoke -> handoff` |
| `ai_ops_evidence_ledger` | `$HOME/.homeai-qa/finance-evidence-ledger.jsonl` |
| `ios_live_debug_available` | `yes`; use Home AI `npm run ios:pwa:debug` for interactive embedded iOS PWA reproduction, with one Simulator/live-debug-port/WDA-port/MJPEG-port lane per concurrent plugin debug session. |
| `ios_visual_harness_command` | `cd /Users/hermes-dev/HermesMobileDev/app && npm run ios:pwa:visual -- --scenario embedded-plugin-shell --plugin-id finance --debug-url http://127.0.0.1:19073/` |
| `plugin_manifest_actions_status` | `declared`; Finance exposes manifest `actions` for host Dock `常用`, long-press menus, and search. |

## Required Local Validation

Run the smallest focused set for the changed surface:

```powershell
node --check mcp\finance-mcp-server.js
node --test tests\finance-mcp-server.test.js
npm run platform:check
npm run check
npm test
```

For service availability:

```powershell
npm run start:windows
```

Then verify:

- `http://127.0.0.1:8791/api/finance/client-version` returns `ok: true`.
- `http://127.0.0.1:8791/api/finance/mcp/schemas` exposes any changed MCP tool
  or schema field.

From the Home AI main workspace, run the cross-workspace platform contract
checker after changing this pointer or any Finance deployment/MCP/mobile
contract:

```powershell
node scripts\plugin-workspace-platform-contract-check.js --plugin finance --json
```

## Required Production Validation

Use the Home AI Mac access runbook. Do not print passwords, keys, cookies,
workspace tokens, raw uploaded files, full financial data, or long logs.

Minimum closure for Finance production changes:

1. verify Mac launchd `system/com.hermesmobile.plugin.finance` is running;
2. verify Mac loopback `/api/finance/client-version`;
3. verify Mac loopback `/api/finance/mcp/schemas`;
4. when MCP tools changed, run the Home AI MCP tool upgrade closure harness so
   the selected Gateway profile and selected worker expose the callable
   `mcp_finance_*` tool names;
5. for write features, perform a bounded readback smoke against the changed
   object without dumping private ledger contents.

## Open Gaps

- Extend Reference Contract coverage later if attachments or natural-language
  reference search/resolution become part of the Home AI graph workflow.
- Add Finance-specific adoption of the Home AI Appium/iOS Simulator embedded UI
  harness when embedded UI behavior changes.
- Keep the MCP upgrade closure harness mandatory for future Finance tool schema
  changes, especially attachment tools.
