"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const pluginDir = path.join(root, "gateway-plugins", "hermes-mobile-finance");

test("Hermes Finance plugin declares scoped finance toolset", () => {
  const yaml = fs.readFileSync(path.join(pluginDir, "plugin.yaml"), "utf8");
  assert.match(yaml, /name:\s*hermes-mobile-finance/);
  assert.match(yaml, /provides_tools:\s*\n\s*-\s*finance/);
  assert.match(yaml, /FINANCE_MCP_URL/);
  assert.match(yaml, /FINANCE_MCP_WORKSPACE/);
  assert.match(yaml, /FINANCE_MCP_NO_WORKSPACE_OVERRIDE/);
  assert.match(yaml, /FINANCE_HERMES_CALLBACK_URL/);
  assert.match(yaml, /endpoint:\s*\/api\/finance\/mcp\/register/);
  assert.doesNotMatch(yaml, /FINANCE_MCP_ROOT/);
  assert.match(yaml, /source:\s*workspace_local_hermes_finance_config/);
  assert.match(yaml, /config:\s*\.hermes-finance\/config\.json/);
  assert.match(yaml, /key_file:\s*\.hermes-finance\/access-key\.txt/);
  assert.match(yaml, /raw_key_storage:\s*forbidden/);
  assert.match(yaml, /owner_fallback:\s*forbidden/);
});

test("Hermes Finance plugin registers finance schemas and hides identity keys from tool args", () => {
  const script = `
import importlib.util, json
from pathlib import Path
plugin = Path(${JSON.stringify(path.join(pluginDir, "__init__.py"))})
spec = importlib.util.spec_from_file_location("hermes_mobile_finance", plugin)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
calls = []
def fake_request(path, payload=None, timeout=30, context=None):
    calls.append({"path": path, "payload": payload, "context": context})
    if path.endswith("/schemas"):
        return {"ok": True, "schemas": [
            {"name":"finance.create_transaction","toolset":"finance","description":"create","parameters":{"type":"object","properties":{}}},
            {"name":"finance.resolve_current_member","toolset":"finance","description":"resolve","parameters":{"type":"object","properties":{}}},
        ]}
    return {"ok": True, "result": {"path": path, "payload": payload}}
module._request_json = fake_request
class Ctx:
    def __init__(self):
        self.tools = []
    def register_tool(self, **kwargs):
        self.tools.append(kwargs)
ctx = Ctx()
module.register(ctx)
handler = ctx.tools[0]["handler"]
identity_key = ":".join(["fixture", "plugin", "identity"])
payload = json.loads(handler({"amount":"1.00","hermes_workspace_user_key":identity_key}, context={"externalWorkspaceId":"home"}))
print(json.dumps({"tools":[item["name"] for item in ctx.tools],"payload":payload,"calls":calls}, ensure_ascii=False))
`;
  const output = execFileSync("python", ["-c", script], {
    cwd: root,
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    encoding: "utf8",
  });
  const result = JSON.parse(output);
  assert.deepEqual(result.tools, ["finance.create_transaction", "finance.resolve_current_member"]);
  assert.equal(result.calls[0].path, "/api/finance/mcp/schemas");
  assert.equal(result.calls[1].path, "/api/finance/mcp/dispatch");
  assert.equal(result.calls[1].payload.tool, "finance.create_transaction");
  assert.equal(result.calls[1].payload.args.amount, "1.00");
  assert.equal(result.calls[1].payload.args.hermes_workspace_user_key, undefined);
  assert.equal(result.calls[1].payload.context.hermes_workspace_user_key, ["fixture", "plugin", "identity"].join(":"));
});

test("Hermes Finance plugin reads workspace-local config and strips secret or override args", () => {
  const script = `
import importlib.util, json, tempfile
from pathlib import Path
root = Path(tempfile.mkdtemp())
config_dir = root / ".hermes-finance"
config_dir.mkdir()
(config_dir / "config.json").write_text(json.dumps({
    "api_base_url": "http://127.0.0.1:8791",
    "workspace_id": "weixin_test_1",
    "access_key_file": "access-key.txt",
    "display_name": "Test"
}), encoding="utf-8")
(config_dir / "access-key.txt").write_text("fixture-workspace-key", encoding="utf-8")
plugin = Path(${JSON.stringify(path.join(pluginDir, "__init__.py"))})
spec = importlib.util.spec_from_file_location("hermes_mobile_finance", plugin)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
calls = []
def fake_request(path, payload=None, timeout=30, context=None):
    calls.append({"path": path, "payload": payload, "context": context})
    if path.endswith("/schemas"):
        return {"ok": True, "schemas": [{"name":"finance.get_summary","toolset":"finance","description":"summary","parameters":{"type":"object","properties":{}}}]}
    return {"ok": True, "result": {"payload": payload}}
module._request_json = fake_request
class Ctx:
    def __init__(self):
        self.tools = []
    def register_tool(self, **kwargs):
        self.tools.append(kwargs)
ctx = Ctx()
module.os.environ["FINANCE_MCP_WORKSPACE"] = str(root)
module.os.environ["FINANCE_MCP_NO_WORKSPACE_OVERRIDE"] = "1"
module.register(ctx)
payload = json.loads(ctx.tools[0]["handler"]({"period":"year","workspace_key":"model-supplied","launch_token":"bad"}))
print(json.dumps({"payload":payload,"calls":calls}, ensure_ascii=False))
`;
  const output = execFileSync("python", ["-c", script], {
    cwd: root,
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    encoding: "utf8",
  });
  const result = JSON.parse(output);
  assert.equal(result.calls[0].context.source, "finance-mcp-wrapper");
  assert.equal(result.calls[0].context.workspace_id, "weixin_test_1");
  assert.equal(result.calls[0].context.workspace_key, "fixture-workspace-key");
  const dispatch = result.calls[1].payload;
  assert.equal(dispatch.args.period, "year");
  assert.equal(dispatch.args.workspace_key, undefined);
  assert.equal(dispatch.args.launch_token, undefined);
  assert.equal(dispatch.context.source, "finance-mcp-wrapper");
  assert.equal(dispatch.context.workspace_id, "weixin_test_1");
  assert.equal(dispatch.context.workspace_key, "fixture-workspace-key");
});

test("Hermes Finance plugin registers configured callback URL before tool schemas", () => {
  const script = `
import importlib.util, json
from pathlib import Path
plugin = Path(${JSON.stringify(path.join(pluginDir, "__init__.py"))})
spec = importlib.util.spec_from_file_location("hermes_mobile_finance", plugin)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
calls = []
def fake_request(path, payload=None, timeout=30, context=None):
    calls.append({"path": path, "payload": payload, "context": context})
    if path.endswith("/schemas"):
        return {"ok": True, "schemas": []}
    return {"ok": True, "result": {"path": path, "payload": payload}}
module._request_json = fake_request
class Ctx:
    def register_tool(self, **kwargs):
        pass
module.register(Ctx())
print(json.dumps({"calls": calls}, ensure_ascii=False))
`;
  const output = execFileSync("python", ["-c", script], {
    cwd: root,
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
      FINANCE_HERMES_CALLBACK_URL: "https://hermes.example.test/mobile/callback",
    },
    encoding: "utf8",
  });
  const result = JSON.parse(output);
  assert.equal(result.calls[0].path, "/api/finance/mcp/register");
  assert.equal(result.calls[0].payload.callback_url, "https://hermes.example.test/mobile/callback");
  assert.equal(result.calls[1].path, "/api/finance/mcp/schemas");
});
