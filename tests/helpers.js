"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createFinanceRuntime } = require("../adapters/finance-runtime");

function tempDbPath(name = "finance-test") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  return path.join(dir, "finance.sqlite3");
}

function createTestRuntime(options = {}) {
  return createFinanceRuntime({ dbPath: options.dbPath || tempDbPath(), ...options });
}

module.exports = {
  createTestRuntime,
  tempDbPath,
};
