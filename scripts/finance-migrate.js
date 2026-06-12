"use strict";

const { createFinanceRuntime } = require("../adapters/finance-runtime");

const runtime = createFinanceRuntime();
process.stdout.write(JSON.stringify({
  ok: true,
  dbPath: process.env.FINANCE_MCP_DB_PATH || "data/finance.sqlite3",
  ledger: runtime.repository.getLedger("daily")?.id || "",
}, null, 2) + "\n");
runtime.close();

