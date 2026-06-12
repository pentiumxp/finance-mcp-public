# Mac Studio Finance Deployment

This document records the current Mac Studio production deployment path for the
Finance MCP plugin. It replaces the old NAS production path for current work.

## Current Target

- SSH alias: `homeai-macstudio-prod`.
- SSH login user: `xuxin`.
- Production runtime user: `hermes-host`.
- Production source directory:
  `/Users/hermes-host/HermesMobile/plugins/finance`.
- Production launchd job:
  `system/com.hermesmobile.plugin.finance`.
- Production plist:
  `/Library/LaunchDaemons/com.hermesmobile.plugin.finance.plist`.
- Runtime command:
  `/Users/hermes-host/HermesMobile/runtime/node-current/bin/node server.js`.
- Working directory:
  `/Users/hermes-host/HermesMobile/plugins/finance`.
- Finance service endpoint:
  `http://127.0.0.1:8791`.
- The service is intentionally loopback-bound on Mac production. A phone cannot
  load `http://192.168.10.110:8791` directly unless the plist host binding is
  deliberately changed. Mobile users should reach Finance through Home AI /
  Hermes plugin routing, not by exposing the Finance service port on LAN.

## Sensitive Input

The deploy script can read a sudo password from the Windows desktop file
`NAS.TXT`, defaulting to:

```powershell
Join-Path ([Environment]::GetFolderPath("Desktop")) "NAS.TXT"
```

Do not copy this password into docs, handoffs, shell history, logs, tests, or
git-tracked files. The script passes it only through stdin to `sudo -S`.

## Deploy Command

From the Windows Finance workspace:

```powershell
npm run deploy:mac
```

Equivalent direct command:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-mac-finance.ps1
```

From the Mac/Home AI development workspace, Finance can also be deployed through
the central Home AI macOS deployer:

```bash
npm run --silent deploy:macos -- --plugin finance --source /Users/hermes-dev/HermesMobileDev/plugins/finance --execute --json
```

Use the same private sudo password-file boundary as other Home AI macOS
deployments. This path is useful when the local machine does not provide
`powershell.exe` or `pwsh`; it preserves Finance `data/` and restarts
`system/com.hermesmobile.plugin.finance` through the central plugin contract.

Important defaults:

- `-HostName homeai-macstudio-prod`
- `-RemoteDir /Users/hermes-host/HermesMobile/plugins/finance`
- `-RemoteOwner hermes-host`
- `-ServiceDomain system`
- `-ServiceLabel com.hermesmobile.plugin.finance`
- `-Port 8791`

The script packages the local source while excluding `data/`, `node_modules/`,
`.git/`, and `.codegraph/`, then uploads the archive to `/tmp` on the Mac.

Gateway-side Finance MCP is a separate production surface from the Finance HTTP
service source. Hermes Gateway profiles launch the stdio wrapper from
`/Users/hermes-host/HermesMobile/gateway-worker/finance-mcp`, while the Finance
service runs from `/Users/hermes-host/HermesMobile/plugins/finance`. After an
MCP schema or wrapper change, verify both:

- the Finance service schema at `GET /api/finance/mcp/schemas` with the
  workspace-local Finance config/key; and
- the selected Gateway profile callable schema with
  `scripts/gateway-tool-schema-smoke.js --schema-only`.

If the Gateway-side wrapper tree is stale, back it up under
`/Users/hermes-host/HermesMobile/backups/finance-deploy/` and sync at least
`adapters/`, `mcp/`, `scripts/`, `package.json`, and `package-lock.json` from
the deployed Finance source. Do not copy production `data/`.

## What The Script Does

1. Reads the sudo password file without printing its contents.
2. Builds a local tarball of source files.
3. Copies the tarball and a temporary remote deploy script to the Mac.
4. Runs the remote deploy script through `sudo -S`.
5. Creates a source backup under:
   `/Users/hermes-host/HermesMobile/backups/finance-deploy/`.
6. Creates SQLite backups before changing source:
   - `data/finance.sqlite3.before-mac-deploy-<timestamp>.bak`
   - `data/finance-images.sqlite3.before-mac-deploy-<timestamp>.bak`
7. Replaces source directories/files while preserving production `data/` and
   `node_modules/`.
8. Restores ownership to `hermes-host:staff`.
9. Runs focused production checks:
   - `node --check public/app-finance-ui.js`
   - `node tests/app-finance-ui.test.js`
10. Restarts Finance through:
    `launchctl kickstart -k system/com.hermesmobile.plugin.finance`.
11. Waits for `http://127.0.0.1:8791/api/finance/client-version`.
12. Verifies the expected static asset and service-worker versions.

## Current Successful Deployment

On 2026-06-06, `scripts/deploy-mac-finance.ps1` successfully deployed:

- Static frontend: `finance-replica-20260605q`.
- Service worker: `finance-mcp-pwa-v97`.
- Source backup:
  `/Users/hermes-host/HermesMobile/backups/finance-deploy/finance-source-20260606-001621.tar.gz`.
- SQLite backup:
  `/Users/hermes-host/HermesMobile/plugins/finance/data/finance.sqlite3.before-mac-deploy-20260606-001621.bak`.
- Image SQLite backup:
  `/Users/hermes-host/HermesMobile/plugins/finance/data/finance-images.sqlite3.before-mac-deploy-20260606-001621.bak`.

On 2026-06-06 later in the same day, backend-only Finance MCP attachment
support was deployed with static frontend assets still at
`finance-replica-20260605t` and `finance-mcp-pwa-v100`. Additional production
evidence:

- Source backup:
  `/Users/hermes-host/HermesMobile/backups/finance-deploy/finance-source-20260606-150642.tar.gz`.
- SQLite backup:
  `/Users/hermes-host/HermesMobile/plugins/finance/data/finance.sqlite3.before-mac-deploy-20260606-150642.bak`.
- Image SQLite backup:
  `/Users/hermes-host/HermesMobile/plugins/finance/data/finance-images.sqlite3.before-mac-deploy-20260606-150642.bak`.
- Gateway-side wrapper backup:
  `/Users/hermes-host/HermesMobile/backups/finance-deploy/finance-gateway-worker-mcp-20260606-151815.tar.gz`.
- Owner and WuPing Gateway schema smoke passed for
  `mcp_finance_create_transaction` and
  `mcp_finance_add_transaction_attachment` using `agent-schema-probe` evidence.

On 2026-06-08, the embedded Finance plugin note-viewport fix was deployed with
static frontend assets `finance-replica-20260608f` and service worker
`finance-mcp-pwa-v106`. This deployment also verifies that the embedded plugin
manifest and launch redirect use the same current static version as
`public/finance.html` instead of an older hard-coded manifest version.

- Source backup:
  `/Users/hermes-host/HermesMobile/backups/finance-deploy/finance-source-20260608-111427.tar.gz`.
- SQLite backup:
  `/Users/hermes-host/HermesMobile/plugins/finance/data/finance.sqlite3.before-mac-deploy-20260608-111427.bak`.
- Image SQLite backup:
  `/Users/hermes-host/HermesMobile/plugins/finance/data/finance-images.sqlite3.before-mac-deploy-20260608-111427.bak`.
- Remote smoke:
  `/finance.html` contains `finance-replica-20260608f`,
  `/service-worker.js` contains `finance-mcp-pwa-v106`,
  `/api/v1/hermes/plugin/manifest` returns an entry with
  `v=finance-replica-20260608f`, and `/api/finance/overview` returned HTTP
  `200`.

On 2026-06-12, the embedded bottom-nav opaque-area fix was deployed through the
central Home AI macOS deployer because the Mac development shell did not expose
PowerShell. The deployment used static frontend assets
`finance-replica-20260612e` and service worker `finance-mcp-pwa-v129`.
Production evidence:

- Source backup:
  `/Users/hermes-host/HermesMobile/backups/deploy/20260612T041749Z-plugin-finance-finance-embedded-dot`.
- `system/com.hermesmobile.plugin.finance` was running after restart.
- Plugin manifest health returned
  `/finance.html?embed=hermes&v=finance-replica-20260612e`.
- launchd:
  `system/com.hermesmobile.plugin.finance` showed `state = running` and
  `last exit code = 0`.

## Validation Commands

```powershell
ssh homeai-macstudio-prod 'curl -sS -m 8 http://127.0.0.1:8791/service-worker.js | grep -F "finance-mcp-pwa-v129"'
ssh homeai-macstudio-prod 'curl -sS -m 8 http://127.0.0.1:8791/finance.html | grep -F "finance-replica-20260612e"'
ssh homeai-macstudio-prod 'curl -sS -m 8 "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest?workspaceId=owner&appOrigin=http://127.0.0.1:8791" | grep -F "finance-replica-20260612e"'
ssh homeai-macstudio-prod 'curl -sS -m 8 -o /tmp/finance-overview-smoke.json -w "%{http_code}" http://127.0.0.1:8791/api/finance/overview'
```

Expected results for this deployment:

- `service-worker.js` contains the expected `finance-mcp-pwa-*` cache version.
- `finance.html` contains the expected `finance-replica-*` static version.
- The embedded plugin manifest entry carries that same static version.
- `/api/finance/overview` returns HTTP `200` with `ok: true`.

## Rollback

Rollback is source-only unless a data repair also needs restoration.

1. SSH to the Mac.
2. Use sudo to extract the selected source backup into the production directory.
3. Restore ownership to `hermes-host:staff`.
4. Restart `system/com.hermesmobile.plugin.finance`.
5. Verify `/api/finance/client-version`, `/finance.html`, and
   `/service-worker.js`.

Do not restore a SQLite backup unless the deployment changed persistent data or
the user explicitly asks for data rollback.
