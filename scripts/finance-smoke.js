"use strict";

const { createFinanceRuntime } = require("../adapters/finance-runtime");

const runtime = createFinanceRuntime();
const result = runtime.transactionService.createTransaction({
  type: "expense",
  amount: "12.30",
  currency: "CNY",
  account_hint: "现金",
  category_hint: "餐饮",
  member_hint: "自己",
  note: "smoke",
  idempotency_key: `smoke-${Date.now()}`,
}, { role: "owner", actorRef: "smoke" });
const summary = runtime.reportService.getSummary({ period: "all" }, { role: "owner" });
process.stdout.write(JSON.stringify({ ok: true, transaction: result.transaction.id, summary: summary.totals }, null, 2) + "\n");
runtime.close();
