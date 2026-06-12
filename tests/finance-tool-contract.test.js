"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ATTACHMENT_PAYLOAD_SOURCE_FIELDS, MAX_CREATE_ATTACHMENTS } = require("../adapters/finance-attachment-input-service");
const { MEMBER_DEFAULT_TOOLS, TOOL_SCHEMAS, TOOLSET } = require("../mcp/finance-tool-contract");
const { createFinanceMcpDispatcher } = require("../mcp/finance-mcp-server");
const { createTestRuntime } = require("./helpers");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

test("Finance MCP contract registry is the schema source of truth", () => {
  assert.equal(TOOLSET, "finance");
  assert.equal(TOOL_SCHEMAS.every((schema) => schema.toolset === TOOLSET), true);
  assert.equal(TOOL_SCHEMAS.every((schema) => schema.name.startsWith("finance.")), true);
  assert.equal(MEMBER_DEFAULT_TOOLS.has("finance.create_transaction"), true);
  assert.equal(MEMBER_DEFAULT_TOOLS.has("finance.reference_get"), false);

  const createSchema = TOOL_SCHEMAS.find((schema) => schema.name === "finance.create_transaction");
  const addAttachmentSchema = TOOL_SCHEMAS.find((schema) => schema.name === "finance.add_transaction_attachment");
  assert.equal(createSchema.parameters.properties.attachments.maxItems, MAX_CREATE_ATTACHMENTS);
  assert.deepEqual(createSchema.parameters.properties.attachments.items.anyOf, ATTACHMENT_PAYLOAD_SOURCE_FIELDS.map((field) => ({ required: [field] })));
  assert.deepEqual(addAttachmentSchema.parameters.anyOf, ATTACHMENT_PAYLOAD_SOURCE_FIELDS.map((field) => ({ required: [field] })));
  for (const field of ATTACHMENT_PAYLOAD_SOURCE_FIELDS) {
    assert.equal(Boolean(createSchema.parameters.properties.attachments.items.properties[field]), true);
    assert.equal(Boolean(addAttachmentSchema.parameters.properties[field]), true);
  }
});

test("MCP server remains thin glue around contract and dispatcher modules", () => {
  const serverText = read("mcp/finance-mcp-server.js");
  const dispatcherText = read("mcp/finance-mcp-dispatcher.js");
  assert.match(serverText, /finance-tool-contract/);
  assert.match(serverText, /finance-mcp-dispatcher/);
  assert.doesNotMatch(serverText, /const TOOL_SCHEMAS = \[/);
  assert.doesNotMatch(serverText, /finance\.add_transaction_attachment[\s\S]+?runtime\.attachmentService\.addAttachment/);
  assert.match(dispatcherText, /dispatchTransactionTool/);
  assert.match(dispatcherText, /dispatchReferenceTool/);
  assert.match(dispatcherText, /dispatchRecurringTool/);
});

test("dispatcher exposes contract schemas without cloning a second schema set", () => {
  const runtime = createTestRuntime();
  const dispatcher = createFinanceMcpDispatcher(runtime);
  assert.equal(dispatcher.schemas, TOOL_SCHEMAS);
  runtime.close();
});
