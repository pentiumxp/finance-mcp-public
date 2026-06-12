"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

test("MCP and route entrypoints delegate without SQL", () => {
  for (const rel of ["mcp/finance-mcp-server.js", "server-routes/finance-api-routes.js"]) {
    const text = read(rel);
    assert.equal(/CREATE TABLE|INSERT INTO|UPDATE finance_|DELETE FROM|SELECT \*/i.test(text), false, rel);
  }
});

test("scoped HTTP and MCP boundaries do not hardcode daily ledger access", () => {
  const routeText = read("server-routes/finance-api-routes.js");
  assert.equal(/listAccounts\("daily"\)|listCategories\("daily"\)|listMembers\("daily"\)/.test(routeText), false);
  assert.match(routeText, /\/api\/v1\/hermes\/plugin\/users\/bind[\s\S]+?requireLoopback\(req\)/);

  const mcpContextText = read("mcp/finance-mcp-context.js");
  const mcpContractText = read("mcp/finance-tool-contract.js");
  const mcpDispatcherText = read("mcp/finance-mcp-dispatcher.js");
  assert.match(mcpContextText, /function authorizedLedgerId/);
  assert.match(mcpDispatcherText, /authorizedLedgerId/);
  assert.match(mcpContractText, /category_parent_id/);
  assert.match(mcpContractText, /subcategory/);
  assert.match(mcpContractText, /tag/);
});

test("MCP server delegates contract and domain dispatch responsibilities", () => {
  const serverText = read("mcp/finance-mcp-server.js");
  assert.match(serverText, /createFinanceMcpDispatcherCore/);
  assert.match(serverText, /finance-tool-contract/);
  assert.doesNotMatch(serverText, /const TOOL_SCHEMAS = \[/);
  assert.doesNotMatch(serverText, /runtime\.transactionService\.createTransaction/);
  assert.doesNotMatch(serverText, /runtime\.attachmentService\.addAttachment/);

  const dispatcherText = read("mcp/finance-mcp-dispatcher.js");
  assert.match(dispatcherText, /dispatchTransactionTool/);
  assert.match(dispatcherText, /dispatchReferenceTool/);
  assert.match(dispatcherText, /dispatchLedgerTool/);
  const transactionDispatcherText = read("mcp/dispatchers/finance-transaction-dispatcher.js");
  const referenceDispatcherText = read("mcp/dispatchers/finance-reference-dispatcher.js");
  assert.match(transactionDispatcherText, /createTransactionWithAttachments/);
  assert.match(referenceDispatcherText, /referenceGet/);
});

test("MCP contract keeps filter and attachment schema parity", () => {
  const contractText = read("mcp/finance-tool-contract.js");
  assert.match(contractText, /attachmentPayloadProperties/);
  assert.match(contractText, /attachmentPayloadAnyOf/);
  assert.match(contractText, /category_parent_id/);
  assert.match(contractText, /subcategory/);
  assert.match(contractText, /tag/);
});

test("services enforce scoped ledger context", () => {
  const transactionText = read("adapters/finance-transaction-service.js");
  const reportText = read("adapters/finance-report-service.js");
  assert.match(transactionText, /function isScopedContext/);
  assert.match(transactionText, /finance_ledger_access_denied/);
  assert.match(transactionText, /account_not_in_ledger/);
  assert.match(reportText, /normalizeLedgerId/);
});

test("service modules have focused tests", () => {
  const required = [
    "adapters/finance-transaction-service.js",
    "adapters/finance-report-service.js",
    "adapters/finance-member-binding-service.js",
    "adapters/finance-wacai-import-service.js",
    "adapters/finance-hermes-embedded-plugin-service.js",
    "adapters/finance-user-binding-service.js",
    "adapters/finance-ledger-service.js",
    "adapters/finance-recurring-service.js",
    "adapters/finance-recurring-scheduler-service.js",
    "adapters/finance-attachment-input-service.js",
    "adapters/finance-transaction-attachment-service.js",
    "adapters/finance-reference-service.js",
    "mcp/finance-tool-contract.js",
    "mcp/finance-mcp-dispatcher.js",
  ];
  for (const rel of required) assert.equal(fs.existsSync(path.join(root, rel)), true, rel);
  for (const rel of [
    "tests/finance-transaction-service.test.js",
    "tests/finance-report-service.test.js",
    "tests/finance-member-binding-service.test.js",
    "tests/finance-wacai-import-service.test.js",
    "tests/finance-hermes-embedded-plugin-service.test.js",
    "tests/finance-user-binding-service.test.js",
    "tests/finance-ledger-service.test.js",
    "tests/finance-recurring-service.test.js",
    "tests/finance-recurring-scheduler-service.test.js",
    "tests/finance-attachment-input-service.test.js",
    "tests/finance-transaction-attachment-service.test.js",
    "tests/finance-reference-service.test.js",
    "tests/finance-tool-contract.test.js",
  ]) assert.equal(fs.existsSync(path.join(root, rel)), true, rel);
});

test("money module does not use floating arithmetic for parsing", () => {
  const text = read("adapters/finance-money.js");
  assert.equal(/parseFloat|Number\.parseFloat/.test(text), false);
});
