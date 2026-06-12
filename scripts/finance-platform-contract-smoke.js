"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { TOOL_SCHEMAS } = require("../mcp/finance-tool-contract");
const { mcpName, toolsList } = require("./finance-mcp-stdio");

function splitCsv(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function parseArgs(argv = []) {
  const out = {
    homeAiRoot: path.resolve(process.cwd(), "..", "Agent"),
    requireTools: [],
    skipHomeAiCheck: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--home-ai-root") out.homeAiRoot = path.resolve(argv[++index] || out.homeAiRoot);
    else if (arg === "--require-tool") out.requireTools.push(...splitCsv(argv[++index] || ""));
    else if (arg === "--skip-home-ai-check") out.skipHomeAiCheck = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`unknown_argument:${arg}`);
    }
  }
  return out;
}

function printHelp() {
  console.log([
    "Usage: node scripts/finance-platform-contract-smoke.js [options]",
    "",
    "Options:",
    "  --require-tool <name>       Require a local finance.* tool. Can be repeated or comma-separated.",
    "  --home-ai-root <dir>        Home AI main workspace root. Defaults to ../Agent.",
    "  --skip-home-ai-check        Skip the Home AI platform pointer checker.",
    "  --json                      Print bounded JSON.",
  ].join("\n"));
}

function runHomeAiChecker(options) {
  const script = path.join(options.homeAiRoot, "scripts", "plugin-workspace-platform-contract-check.js");
  const result = spawnSync(process.execPath, [script, "--plugin", "finance", "--json"], {
    cwd: options.homeAiRoot,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  let parsed = null;
  try {
    parsed = result.stdout ? JSON.parse(result.stdout) : null;
  } catch {
    parsed = null;
  }
  return {
    checked: true,
    ok: result.status === 0 && parsed?.ok === true,
    status: result.status,
    contractVersion: parsed?.contractVersion || "",
    checkedPlugins: parsed?.checkedPlugins || [],
    issues: parsed?.issues || [],
    stderrLength: String(result.stderr || "").length,
  };
}

function buildReport(options = {}) {
  const serviceTools = TOOL_SCHEMAS.map((schema) => schema.name);
  const stdioTools = toolsList().map((tool) => tool.name);
  const issues = [];
  const requiredTools = options.requireTools || [];

  for (const schema of TOOL_SCHEMAS) {
    if (schema.toolset !== "finance") issues.push(`schema_toolset_mismatch:${schema.name}`);
    if (!schema.name.startsWith("finance.")) issues.push(`schema_name_not_finance:${schema.name}`);
  }
  for (const toolName of requiredTools) {
    if (!serviceTools.includes(toolName)) issues.push(`service_tool_missing:${toolName}`);
    const localName = mcpName(toolName);
    if (!stdioTools.includes(localName)) issues.push(`stdio_tool_missing:${localName}`);
  }
  for (const localName of stdioTools) {
    if (localName.startsWith("mcp_finance_")) issues.push(`stdio_prefixed_tool_name:${localName}`);
  }

  const homeAi = options.skipHomeAiCheck
    ? { checked: false, ok: true, skipped: true }
    : runHomeAiChecker(options);
  if (homeAi.checked && !homeAi.ok) issues.push("home_ai_platform_contract_check_failed");

  return {
    ok: issues.length === 0,
    serviceToolCount: serviceTools.length,
    stdioToolCount: stdioTools.length,
    requiredTools,
    homeAi,
    issues,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildReport(options);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`finance platform contract smoke ok=${report.ok}`);
    console.log(`serviceTools=${report.serviceToolCount} stdioTools=${report.stdioToolCount}`);
    if (report.issues.length) console.log(`issues=${report.issues.join(",")}`);
  }
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = {
  buildReport,
  parseArgs,
};
