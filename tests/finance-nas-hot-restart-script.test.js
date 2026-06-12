"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const scriptPath = path.resolve(__dirname, "..", "scripts", "nas-finance-hot-restart.ps1");

test("NAS hot restart script is scoped to Finance MCP wrapper and optional container restart", () => {
  const text = fs.readFileSync(scriptPath, "utf8");
  assert.match(text, /finance_mcp_stdio\[\\\.\]py|finance_mcp_stdio\[.\]py/);
  assert.match(text, /kill -TERM \$pids/);
  assert.match(text, /kill -KILL \$alive/);
  assert.match(text, /sudo -n "\$docker_path" restart "\$container_name"/);
  assert.match(text, /if sudo -n "\$docker_path" restart "\$container_name" >\/dev\/null 2>&1; then/);
  assert.match(text, /"\$docker_path" restart "\$container_name"/);
  assert.match(text, /finance-mcp-restart-container/);
  assert.match(text, /container_restart=ok method=sudo_helper/);
  assert.match(text, /for attempt in 1 2 3 4 5 6 7 8 9 10/);
  assert.match(text, /client_version_http=200 attempt=\$attempt/);
  assert.match(text, /python3 -m py_compile "\$finance_source\/scripts\/finance_mcp_stdio\.py"/);
  assert.match(text, /--check "\$finance_source\/scripts\/finance-mcp-stdio\.js"/);
  assert.match(text, /--check "\$finance_source\/server-routes\/finance-api-routes\.js"/);
  assert.match(text, /NasSmbSourcePath/);
  assert.match(text, /Copy-Item -LiteralPath \$localScript/);
});

test("NAS hot restart script avoids embedded credentials and long-lived remote files", () => {
  const text = fs.readFileSync(scriptPath, "utf8");
  assert.doesNotMatch(text, /password/i);
  assert.doesNotMatch(text, /token/i);
  assert.doesNotMatch(text, /access[-_ ]?key/i);
  assert.match(text, /BatchMode=yes/);
  assert.match(text, /trap cleanup EXIT/);
  assert.match(text, /rm -f "\$script_path"/);
});
