"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CONFIG_DIR = ".hermes-finance";
const CONFIG_FILE = "config.json";
const DEFAULT_KEY_FILE = "access-key.txt";
const WORKSPACE_OVERRIDE_KEYS = new Set([
  "workspace",
  "workspace_path",
  "workspacePath",
  "workspace_root",
  "workspaceRoot",
  "hermes_workspace_root",
  "hermesWorkspaceRoot",
]);
const SECRET_ARG_KEYS = new Set([
  "workspace_key",
  "workspaceKey",
  "access_key",
  "accessKey",
  "owner_key",
  "ownerKey",
  "launch_token",
  "launchToken",
  "cookie",
  "session",
]);

function normalizePath(value) {
  return path.resolve(String(value || "")).replace(/[\\/]+$/, "").toLowerCase();
}

function nonEmpty(...values) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function parseWorkspaceArgs(argv = process.argv.slice(2), env = process.env) {
  const options = {
    workspace: "",
    noWorkspaceOverride: false,
    apiBaseUrl: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--workspace") options.workspace = argv[++index] || "";
    else if (arg.startsWith("--workspace=")) options.workspace = arg.slice("--workspace=".length);
    else if (arg === "--no-workspace-override") options.noWorkspaceOverride = true;
    else if (arg === "--api-base-url") options.apiBaseUrl = argv[++index] || "";
    else if (arg.startsWith("--api-base-url=")) options.apiBaseUrl = arg.slice("--api-base-url=".length);
  }
  options.workspace = nonEmpty(options.workspace, env.FINANCE_MCP_WORKSPACE, env.FINANCE_HERMES_WORKSPACE_ROOT, env.HERMES_MCP_WORKSPACE);
  options.apiBaseUrl = nonEmpty(options.apiBaseUrl, env.FINANCE_MCP_URL, env.FINANCE_API_BASE_URL);
  if (env.FINANCE_MCP_NO_WORKSPACE_OVERRIDE === "1" || env.FINANCE_MCP_NO_WORKSPACE_OVERRIDE === "true") {
    options.noWorkspaceOverride = true;
  }
  return options;
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") throw new Error("finance_mcp_workspace_config_missing");
    throw new Error("finance_mcp_workspace_config_invalid");
  }
}

function resolveKeyPath(configDir, config = {}) {
  const configured = nonEmpty(config.access_key_file, config.accessKeyFile, DEFAULT_KEY_FILE);
  if (path.isAbsolute(configured)) throw new Error("finance_mcp_key_path_must_be_relative");
  const resolved = path.resolve(configDir, configured);
  if (!normalizePath(resolved).startsWith(`${normalizePath(configDir)}${path.sep}`) && normalizePath(resolved) !== normalizePath(path.join(configDir, DEFAULT_KEY_FILE))) {
    throw new Error("finance_mcp_key_path_outside_config_dir");
  }
  return resolved;
}

function loadWorkspaceConfig(options = {}) {
  const workspace = nonEmpty(options.workspace);
  if (!workspace) throw new Error("finance_mcp_workspace_required");
  const workspaceRoot = path.resolve(workspace);
  const configDir = path.join(workspaceRoot, CONFIG_DIR);
  const configPath = path.join(configDir, CONFIG_FILE);
  const config = readJsonFile(configPath);
  const keyPath = resolveKeyPath(configDir, config);
  let workspaceKey = "";
  try {
    workspaceKey = fs.readFileSync(keyPath, "utf8").trim();
  } catch (err) {
    if (err.code === "ENOENT") throw new Error("finance_mcp_workspace_key_missing");
    throw new Error("finance_mcp_workspace_key_unreadable");
  }
  if (!workspaceKey) throw new Error("finance_mcp_workspace_key_empty");
  const apiBaseUrl = nonEmpty(options.apiBaseUrl, config.api_base_url, config.apiBaseUrl, "http://127.0.0.1:8791").replace(/\/+$/, "");
  const workspaceId = nonEmpty(config.workspace_id, config.workspaceId, path.basename(workspaceRoot));
  return {
    workspaceRoot,
    configDir,
    configPath,
    keyPath,
    config,
    apiBaseUrl,
    workspaceId,
    workspaceKey,
    context: {
      source: "finance-mcp-wrapper",
      role: nonEmpty(config.role, "member"),
      actorRef: `finance-mcp:${workspaceId}`,
      externalWorkspaceId: workspaceId,
      workspaceId,
      workspace_id: workspaceId,
      workspaceKey,
      workspace_key: workspaceKey,
      ...(nonEmpty(config.finance_user_id, config.financeUserId) ? { financeUserId: nonEmpty(config.finance_user_id, config.financeUserId) } : {}),
      ...(nonEmpty(config.ledger_id, config.ledgerId) ? { ledgerId: nonEmpty(config.ledger_id, config.ledgerId) } : {}),
      ...(nonEmpty(config.display_name, config.displayName) ? { displayName: nonEmpty(config.display_name, config.displayName) } : {}),
    },
  };
}

function stripPrivateToolArgs(args = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(args || {})) {
    if (SECRET_ARG_KEYS.has(key) || WORKSPACE_OVERRIDE_KEYS.has(key)) continue;
    clean[key] = value;
  }
  return clean;
}

function assertNoWorkspaceOverride(args = {}, workspaceRoot = "", noWorkspaceOverride = false) {
  if (!noWorkspaceOverride) return;
  const expected = normalizePath(workspaceRoot);
  for (const key of WORKSPACE_OVERRIDE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(args || {}, key)) continue;
    const value = args[key];
    if (value === undefined || value === null || value === "") continue;
    if (normalizePath(value) !== expected) throw new Error("workspace_override_not_allowed");
  }
}

module.exports = {
  CONFIG_DIR,
  CONFIG_FILE,
  DEFAULT_KEY_FILE,
  WORKSPACE_OVERRIDE_KEYS,
  assertNoWorkspaceOverride,
  loadWorkspaceConfig,
  parseWorkspaceArgs,
  stripPrivateToolArgs,
};
