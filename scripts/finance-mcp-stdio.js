"use strict";

const { TOOL_SCHEMAS } = require("../mcp/finance-tool-contract");
const {
  assertNoWorkspaceOverride,
  loadWorkspaceConfig,
  parseWorkspaceArgs,
  stripPrivateToolArgs,
} = require("../adapters/finance-mcp-workspace-config");

const protocolVersion = "2024-11-05";

function mcpName(financeName) {
  if (String(financeName || "").startsWith("finance.")) {
    return String(financeName).slice("finance.".length);
  }
  return String(financeName || "").replace(/\./g, "_");
}

function financeName(mcpToolName) {
  if (String(mcpToolName || "").startsWith("mcp_finance_")) {
    return `finance.${String(mcpToolName).slice("mcp_finance_".length)}`;
  }
  if (!String(mcpToolName || "").startsWith("finance.")) {
    return `finance.${String(mcpToolName || "")}`;
  }
  return String(mcpToolName || "");
}

function boundedError(err) {
  const message = err?.message || String(err || "finance_mcp_error");
  if (/token|cookie|key|secret|password/i.test(message) && !/^finance_mcp_workspace_key_/.test(message)) {
    return "finance_mcp_error";
  }
  return message;
}

function toolsList() {
  return TOOL_SCHEMAS.map((schema) => ({
    name: mcpName(schema.name),
    description: schema.description || "Finance MCP tool.",
    inputSchema: schema.parameters || { type: "object", properties: {} },
  }));
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("finance_mcp_invalid_response");
  }
  if (!response.ok || parsed.ok === false) throw new Error(parsed.error || `finance_mcp_http_${response.status}`);
  return parsed;
}

async function callFinanceTool(session, name, args = {}) {
  assertNoWorkspaceOverride(args, session.workspaceRoot, session.noWorkspaceOverride);
  const payload = await postJson(`${session.apiBaseUrl}/api/finance/mcp/dispatch`, {
    tool: financeName(name),
    args: stripPrivateToolArgs(args),
    context: session.context,
  });
  return payload.result ?? payload;
}

function encodeMessage(payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  return Buffer.concat([
    Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii"),
    body,
  ]);
}

function createMessageParser(onMessage) {
  let buffer = Buffer.alloc(0);
  return (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const header = buffer.subarray(0, headerEnd).toString("ascii");
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        buffer = buffer.subarray(headerEnd + 4);
        continue;
      }
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (buffer.length < bodyEnd) return;
      const body = buffer.subarray(bodyStart, bodyEnd).toString("utf8");
      buffer = buffer.subarray(bodyEnd);
      onMessage(JSON.parse(body));
    }
  };
}

async function handleMessage(session, message) {
  const method = message.method || "";
  if (method === "initialize") {
    return {
      protocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: "finance", version: "0.1.0" },
    };
  }
  if (method === "tools/list") {
    return { tools: toolsList() };
  }
  if (method === "tools/call") {
    const result = await callFinanceTool(session, message.params?.name, message.params?.arguments || {});
    return {
      content: [{ type: "text", text: JSON.stringify({ ok: true, result }, null, 2) }],
    };
  }
  if (method === "ping") return {};
  if (method.startsWith("notifications/")) return undefined;
  throw new Error("method_not_found");
}

async function main() {
  const options = parseWorkspaceArgs(process.argv.slice(2), process.env);
  const loaded = loadWorkspaceConfig(options);
  const session = {
    workspaceRoot: loaded.workspaceRoot,
    apiBaseUrl: loaded.apiBaseUrl,
    context: loaded.context,
    noWorkspaceOverride: options.noWorkspaceOverride,
  };
  const parse = createMessageParser(async (message) => {
    if (!message || message.id === undefined) return;
    try {
      const result = await handleMessage(session, message);
      if (result === undefined) return;
      process.stdout.write(encodeMessage({ jsonrpc: "2.0", id: message.id, result }));
    } catch (err) {
      process.stdout.write(encodeMessage({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32000, message: boundedError(err) },
      }));
    }
  });
  process.stdin.on("data", parse);
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`${boundedError(err)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  callFinanceTool,
  createMessageParser,
  financeName,
  mcpName,
  toolsList,
};
