"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const test = require("node:test");
const { TOOL_SCHEMAS } = require("../mcp/finance-tool-contract");
const { toolsList: nodeToolsList } = require("../scripts/finance-mcp-stdio");

const root = path.resolve(__dirname, "..");
const pythonWrapper = path.join(root, "scripts", "finance_mcp_stdio.py");

function makeWorkspace({ key = "fixture-python-workspace-key", config = true, accessKey = true } = {}) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "finance-python-wrapper-"));
  const configDir = path.join(workspace, ".hermes-finance");
  fs.mkdirSync(configDir, { recursive: true });
  if (config) {
    fs.writeFileSync(path.join(configDir, "config.json"), JSON.stringify({
      workspace_id: "weixin_test_1",
      access_key_file: "access-key.txt",
      display_name: "Python Test Workspace",
      role: "member",
    }), "utf8");
  }
  if (accessKey) fs.writeFileSync(path.join(configDir, "access-key.txt"), key, "utf8");
  return workspace;
}

function encode(payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii"), body]);
}

function encodeNdjson(payload) {
  return Buffer.from(`${JSON.stringify(payload)}\n`, "utf8");
}

function extractMessages(buffer) {
  const messages = [];
  let pending = buffer;
  while (true) {
    const headerEnd = pending.indexOf("\r\n\r\n");
    if (headerEnd < 0) break;
    const header = pending.subarray(0, headerEnd).toString("ascii");
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) break;
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (pending.length < bodyEnd) break;
    messages.push(JSON.parse(pending.subarray(bodyStart, bodyEnd).toString("utf8")));
    pending = pending.subarray(bodyEnd);
  }
  return messages;
}

function extractNdjsonMessages(buffer) {
  return buffer
    .toString("utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function assertNoPrivateOutput(result, privateValue = "fixture-python-workspace-key") {
  const serialized = JSON.stringify(result.messages);
  assert.equal(serialized.includes(privateValue), false);
  assert.equal(String(result.stderr || "").includes(privateValue), false);
  assert.equal(/token|cookie/i.test(String(result.stderr || "")), false);
}

async function withFakeFinanceServer(fn) {
  const calls = [];
  const schemaCalls = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      if (req.url === "/api/finance/mcp/schemas" && req.method === "GET") {
        schemaCalls.push(req.headers);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, schemas: TOOL_SCHEMAS }));
        return;
      }
      if (req.url === "/api/finance/mcp/dispatch" && req.method === "POST") {
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        calls.push(payload);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, result: { receivedTool: payload.tool } }));
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "not_found" }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await fn({ port: server.address().port, calls, schemaCalls });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function runPythonMcp({ workspace, apiBaseUrl, messages }) {
  return new Promise((resolve, reject) => {
    const child = spawn("python", [
      pythonWrapper,
      "--workspace",
      workspace,
      "--no-workspace-override",
      "--api-base-url",
      apiBaseUrl,
    ], { cwd: root, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = Buffer.alloc(0);
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout = Buffer.concat([stdout, chunk]); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr, messages: extractMessages(stdout) }));
    for (const message of messages) child.stdin.write(encode(message));
    child.stdin.end();
  });
}

function runPythonMcpRaw({ workspace, apiBaseUrl, chunks, extract = extractMessages }) {
  return new Promise((resolve, reject) => {
    const child = spawn("python", [
      pythonWrapper,
      "--workspace",
      workspace,
      "--no-workspace-override",
      "--api-base-url",
      apiBaseUrl,
    ], { cwd: root, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = Buffer.alloc(0);
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout = Buffer.concat([stdout, chunk]); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr, messages: extract(stdout) }));
    for (const chunk of chunks) child.stdin.write(chunk);
    child.stdin.end();
  });
}

test("Python stdio wrapper returns raw local tool names matching the Node wrapper", async () => {
  await withFakeFinanceServer(async ({ port, schemaCalls }) => {
    const workspace = makeWorkspace();
    const result = await runPythonMcp({
      workspace,
      apiBaseUrl: `http://127.0.0.1:${port}`,
      messages: [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
        { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      ],
    });
    assert.equal(result.code, 0);
    const pythonTools = result.messages[1].result.tools.map((tool) => tool.name).sort();
    const nodeTools = nodeToolsList().map((tool) => tool.name).sort();
    assert.deepEqual(pythonTools, nodeTools);
    assert.ok(pythonTools.includes("list_ledgers"));
    assert.equal(pythonTools.includes("mcp_finance_list_ledgers"), false);
    assert.equal(schemaCalls[0]["x-finance-mcp-workspace-id"], "weixin_test_1");
    assert.equal(schemaCalls[0]["x-finance-mcp-workspace-key"], "fixture-python-workspace-key");
    assertNoPrivateOutput(result);
  });
});

test("Python stdio wrapper supports Hermes SDK newline-delimited JSON framing", async () => {
  await withFakeFinanceServer(async ({ port }) => {
    const workspace = makeWorkspace();
    const result = await runPythonMcpRaw({
      workspace,
      apiBaseUrl: `http://127.0.0.1:${port}`,
      chunks: [
        encodeNdjson({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } }),
        encodeNdjson({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
      ],
      extract: extractNdjsonMessages,
    });
    assert.equal(result.code, 0);
    assert.equal(result.messages[0].result.serverInfo.name, "finance");
    const tools = result.messages[1].result.tools.map((tool) => tool.name);
    assert.ok(tools.includes("list_ledgers"));
    assert.equal(tools.includes("mcp_finance_list_ledgers"), false);
    assertNoPrivateOutput(result);
  });
});

test("Python stdio wrapper dispatches prefixed and raw calls with workspace-local context", async () => {
  await withFakeFinanceServer(async ({ port, calls }) => {
    const workspace = makeWorkspace();
    const result = await runPythonMcp({
      workspace,
      apiBaseUrl: `http://127.0.0.1:${port}`,
      messages: [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "mcp_finance_list_ledgers", arguments: { workspace_key: "model-supplied", cookie: "bad" } } },
        { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_ledgers", arguments: {} } },
      ],
    });
    assert.equal(result.code, 0);
    assert.equal(result.messages[1].error, undefined);
    assert.equal(result.messages[2].error, undefined);
    assert.equal(calls[0].tool, "finance.list_ledgers");
    assert.equal(calls[0].args.workspace_key, undefined);
    assert.equal(calls[0].args.cookie, undefined);
    assert.equal(calls[0].context.source, "finance-mcp-wrapper");
    assert.equal(calls[0].context.workspace_id, "weixin_test_1");
    assert.equal(calls[0].context.workspace_key, "fixture-python-workspace-key");
    assert.equal(calls[1].tool, "finance.list_ledgers");
    assertNoPrivateOutput(result);
  });
});

test("Python stdio wrapper reports missing config or key without owner fallback", () => {
  const missingConfig = makeWorkspace({ config: false, accessKey: true });
  const noConfig = spawnSync("python", [pythonWrapper, "--workspace", missingConfig], { cwd: root, encoding: "utf8" });
  assert.notEqual(noConfig.status, 0);
  assert.match(noConfig.stderr, /finance_mcp_workspace_config_missing/);

  const missingKey = makeWorkspace({ config: true, accessKey: false });
  const noKey = spawnSync("python", [pythonWrapper, "--workspace", missingKey], { cwd: root, encoding: "utf8" });
  assert.notEqual(noKey.status, 0);
  assert.match(noKey.stderr, /finance_mcp_workspace_key_missing/);
});

test("Python stdio wrapper rejects workspace override arguments", async () => {
  await withFakeFinanceServer(async ({ port }) => {
    const workspace = makeWorkspace();
    const result = await runPythonMcp({
      workspace,
      apiBaseUrl: `http://127.0.0.1:${port}`,
      messages: [
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "mcp_finance_get_summary", arguments: { workspace: path.join(workspace, "other") } } },
      ],
    });
    assert.equal(result.code, 0);
    assert.equal(result.messages[0].error.message, "workspace_override_not_allowed");
  });
});
