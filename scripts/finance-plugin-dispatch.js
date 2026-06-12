"use strict";

const { createFinanceMcpDispatcher } = require("../mcp/finance-mcp-server");
const { TOOL_SCHEMAS } = require("../mcp/finance-tool-contract");

function readJsonArg(index, fallback) {
  const raw = process.argv[index];
  if (!raw) return fallback;
  return JSON.parse(raw);
}

async function main() {
  if (process.argv.includes("--schemas")) {
    process.stdout.write(`${JSON.stringify({ ok: true, schemas: TOOL_SCHEMAS }, null, 2)}\n`);
    return;
  }
  const toolName = process.argv[2];
  if (!toolName) throw new Error("tool_name_required");
  const args = readJsonArg(3, {});
  const context = readJsonArg(4, {});
  const dispatcher = createFinanceMcpDispatcher();
  try {
    const result = await dispatcher.dispatch(toolName, args, context);
    process.stdout.write(`${JSON.stringify({ ok: true, result }, null, 2)}\n`);
  } finally {
    dispatcher.runtime?.close?.();
  }
}

if (require.main === module) {
  main().catch((err) => {
    process.stdout.write(`${JSON.stringify({ ok: false, error: err.message || String(err) }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
