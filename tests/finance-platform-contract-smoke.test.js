"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildReport, parseArgs } = require("../scripts/finance-platform-contract-smoke");

const scriptPath = path.resolve(__dirname, "..", "scripts", "finance-platform-contract-smoke.js");

test("finance platform contract smoke validates required Reference tools", () => {
  const report = buildReport({
    requireTools: [
      "finance.reference_object_types",
      "finance.reference_get",
      "finance.reference_summarize",
    ],
    skipHomeAiCheck: true,
  });
  assert.equal(report.ok, true);
  assert.equal(report.issues.length, 0);
  assert.equal(report.serviceToolCount, report.stdioToolCount);
});

test("finance platform contract smoke reports missing required tools", () => {
  const report = buildReport({
    requireTools: ["finance.missing_reference_tool"],
    skipHomeAiCheck: true,
  });
  assert.equal(report.ok, false);
  assert.deepEqual(report.issues, [
    "service_tool_missing:finance.missing_reference_tool",
    "stdio_tool_missing:missing_reference_tool",
  ]);
});

test("finance platform contract smoke parses repeated required tools", () => {
  const parsed = parseArgs([
    "--skip-home-ai-check",
    "--require-tool",
    "finance.reference_get,finance.reference_summarize",
    "--require-tool",
    "finance.reference_object_types",
  ]);
  assert.equal(parsed.skipHomeAiCheck, true);
  assert.deepEqual(parsed.requireTools, [
    "finance.reference_get",
    "finance.reference_summarize",
    "finance.reference_object_types",
  ]);
});

test("finance platform contract smoke does not handle secret-bearing inputs", () => {
  const text = fs.readFileSync(scriptPath, "utf8");
  assert.doesNotMatch(text, /password-file|sudo\s+-S|Access Key|workspace_key|Bearer/i);
  assert.match(text, /plugin-workspace-platform-contract-check/);
});
