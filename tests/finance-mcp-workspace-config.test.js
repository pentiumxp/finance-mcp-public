"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  assertNoWorkspaceOverride,
  loadWorkspaceConfig,
  parseWorkspaceArgs,
  stripPrivateToolArgs,
} = require("../adapters/finance-mcp-workspace-config");
const { callFinanceTool, financeName, mcpName, toolsList } = require("../scripts/finance-mcp-stdio");

function makeWorkspace(name = "finance-workspace") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  const configDir = path.join(root, ".hermes-finance");
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, "config.json"), JSON.stringify({
    api_base_url: "http://127.0.0.1:8791",
    workspace_id: "weixin_test_1",
    access_key_file: "access-key.txt",
    display_name: "Test Workspace",
  }), "utf8");
  fs.writeFileSync(path.join(configDir, "access-key.txt"), "fixture-workspace-key", "utf8");
  return root;
}

test("workspace config reads config metadata and key from workspace-local files", () => {
  const workspace = makeWorkspace();
  const loaded = loadWorkspaceConfig({ workspace });
  assert.equal(loaded.workspaceId, "weixin_test_1");
  assert.equal(loaded.apiBaseUrl, "http://127.0.0.1:8791");
  assert.equal(loaded.context.externalWorkspaceId, "weixin_test_1");
  assert.equal(loaded.context.source, "finance-mcp-wrapper");
  assert.equal(loaded.context.workspaceKey, "fixture-workspace-key");
});

test("workspace config fails with diagnostic errors for missing config or key", () => {
  const missingConfig = fs.mkdtempSync(path.join(os.tmpdir(), "finance-missing-config-"));
  assert.throws(() => loadWorkspaceConfig({ workspace: missingConfig }), /finance_mcp_workspace_config_missing/);

  const missingKey = fs.mkdtempSync(path.join(os.tmpdir(), "finance-missing-key-"));
  fs.mkdirSync(path.join(missingKey, ".hermes-finance"));
  fs.writeFileSync(path.join(missingKey, ".hermes-finance", "config.json"), JSON.stringify({ workspace_id: "no-key" }), "utf8");
  assert.throws(() => loadWorkspaceConfig({ workspace: missingKey }), /finance_mcp_workspace_key_missing/);
});

test("workspace override and secret tool args are blocked before dispatch", () => {
  const workspace = makeWorkspace();
  assertNoWorkspaceOverride({ workspace }, workspace, true);
  assert.throws(() => assertNoWorkspaceOverride({ workspace: path.join(workspace, "other") }, workspace, true), /workspace_override_not_allowed/);
  assert.deepEqual(stripPrivateToolArgs({
    amount: "8.00",
    workspace_key: "hidden",
    launch_token: "hidden",
    workspace: "hidden",
  }), { amount: "8.00" });
});

test("workspace CLI args support fixed workspace and no override flag", () => {
  const parsed = parseWorkspaceArgs(["--workspace", "C:/Hermes/User", "--no-workspace-override", "--api-base-url=http://127.0.0.1:8791"], {});
  assert.equal(parsed.workspace, "C:/Hermes/User");
  assert.equal(parsed.noWorkspaceOverride, true);
  assert.equal(parsed.apiBaseUrl, "http://127.0.0.1:8791");
});

test("stdio wrapper exposes raw local tool names and dispatches with workspace context", async () => {
  assert.equal(mcpName("finance.list_transactions"), "list_transactions");
  assert.equal(financeName("mcp_finance_get_summary"), "finance.get_summary");
  assert.equal(financeName("get_summary"), "finance.get_summary");
  assert.ok(toolsList().some((tool) => tool.name === "list_ledgers"));
  assert.equal(toolsList().some((tool) => tool.name === "mcp_finance_list_ledgers"), false);

  let posted = null;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      posted = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, result: { receivedTool: posted.tool } }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = server.address().port;
    const workspace = makeWorkspace();
    const loaded = loadWorkspaceConfig({ workspace, apiBaseUrl: `http://127.0.0.1:${port}` });
    const result = await callFinanceTool({
      workspaceRoot: loaded.workspaceRoot,
      apiBaseUrl: loaded.apiBaseUrl,
      context: loaded.context,
      noWorkspaceOverride: true,
    }, "mcp_finance_get_summary", { period: "year", workspace_key: "model-supplied" });
    assert.deepEqual(result, { receivedTool: "finance.get_summary" });
    assert.equal(posted.tool, "finance.get_summary");
    assert.equal(posted.args.workspace_key, undefined);
    assert.equal(posted.context.source, "finance-mcp-wrapper");
    assert.equal(posted.context.workspace_id, "weixin_test_1");
    assert.equal(posted.context.workspace_key, "fixture-workspace-key");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
