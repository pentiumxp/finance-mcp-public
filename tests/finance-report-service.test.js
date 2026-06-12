"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestRuntime } = require("./helpers");

test("category report groups active expenses", () => {
  const runtime = createTestRuntime();
  runtime.transactionService.createTransaction({
    type: "expense",
    amount: "12.00",
    account_hint: "现金",
    category_hint: "餐饮",
    member_hint: "自己",
  }, { role: "owner" });
  runtime.transactionService.createTransaction({
    type: "expense",
    amount: "8.00",
    account_hint: "现金",
    category_hint: "交通",
    member_hint: "自己",
  }, { role: "owner" });
  const report = runtime.reportService.getReport({ period: "all", metric: "expense", dimension: "category" }, { role: "owner" });
  assert.equal(report.breakdown.length, 2);
  assert.equal(report.totals.expenseMinor, 2000);
  assert.equal(report.aggregationBasis.includes("transfer excluded"), true);
  runtime.close();
});

test("category and subcategory reports use separate hierarchy levels", () => {
  const runtime = createTestRuntime();
  const parent = runtime.repository.upsertCategory({ ledgerId: "daily", type: "expense", name: "居家" });
  runtime.repository.upsertCategory({ ledgerId: "daily", type: "expense", parentId: parent.id, name: "电费" });
  runtime.repository.upsertCategory({ ledgerId: "daily", type: "expense", parentId: parent.id, name: "水费" });
  runtime.transactionService.createTransaction({
    type: "expense",
    amount: "12.00",
    account_hint: "现金",
    category_hint: "电费",
    member_hint: "自己",
  }, { role: "owner" });
  runtime.transactionService.createTransaction({
    type: "expense",
    amount: "8.00",
    account_hint: "现金",
    category_hint: "水费",
    member_hint: "自己",
  }, { role: "owner" });
  const category = runtime.reportService.getReport({ period: "all", metric: "expense", dimension: "category" }, { role: "owner" });
  const subcategory = runtime.reportService.getReport({ period: "all", metric: "expense", dimension: "subcategory" }, { role: "owner" });
  assert.equal(category.breakdown.length, 1);
  assert.equal(category.breakdown[0].label, "居家");
  assert.equal(subcategory.breakdown.length, 2);
  assert.equal(subcategory.breakdown.some((row) => row.label === "电费"), true);
  assert.equal(subcategory.breakdown.some((row) => row.label === "水费"), true);
  runtime.close();
});

test("tag report groups transactions by assigned tags", () => {
  const runtime = createTestRuntime();
  runtime.transactionService.createTransaction({
    type: "expense",
    amount: "10.00",
    account_hint: "现金",
    category_hint: "餐饮",
    member_hint: "自己",
    tags: ["日常"],
  }, { role: "owner" });
  runtime.transactionService.createTransaction({
    type: "expense",
    amount: "5.00",
    account_hint: "现金",
    category_hint: "餐饮",
    member_hint: "自己",
    tags: ["日常", "家庭"],
  }, { role: "owner" });
  const report = runtime.reportService.getReport({ period: "all", metric: "expense", dimension: "tag" }, { role: "owner" });
  const daily = report.breakdown.find((row) => row.label === "日常");
  const home = report.breakdown.find((row) => row.label === "家庭");
  assert.equal(daily.amountMinor, 1500);
  assert.equal(daily.amount, "15.00");
  assert.equal(daily.scale, 2);
  assert.equal(home.amountMinor, 500);
  assert.equal(home.amount, "5.00");
  assert.equal(home.scale, 2);
  runtime.close();
});

test("report filters support category drilldown and transaction detail lists", () => {
  const runtime = createTestRuntime();
  const home = runtime.repository.upsertCategory({ ledgerId: "daily", type: "expense", name: "灞呭" });
  const food = runtime.repository.upsertCategory({ ledgerId: "daily", type: "expense", name: "椁愰ギ" });
  runtime.repository.upsertCategory({ ledgerId: "daily", type: "expense", parentId: home.id, name: "鐢佃垂" });
  runtime.repository.upsertCategory({ ledgerId: "daily", type: "expense", parentId: home.id, name: "姘磋垂" });
  runtime.transactionService.createTransaction({
    type: "expense",
    amount: "12.00",
    account_hint: "鐜伴噾",
    category_hint: "鐢佃垂",
    member_hint: "鑷繁",
  }, { role: "owner" });
  runtime.transactionService.createTransaction({
    type: "expense",
    amount: "8.00",
    account_hint: "鐜伴噾",
    category_hint: "姘磋垂",
    member_hint: "鑷繁",
  }, { role: "owner" });
  runtime.transactionService.createTransaction({
    type: "expense",
    amount: "5.00",
    account_hint: "鐜伴噾",
    category_hint: food.name,
    member_hint: "鑷繁",
  }, { role: "owner" });
  const subcategory = runtime.reportService.getReport({
    period: "all",
    metric: "expense",
    dimension: "subcategory",
    filters: { categoryParentId: home.id },
  }, { role: "owner" });
  const details = runtime.transactionService.listTransactions({ categoryParentId: home.id, type: "expense" }, { role: "owner" });
  assert.equal(subcategory.breakdown.length, 2);
  assert.equal(subcategory.totals.expenseMinor, 2000);
  assert.equal(details.length, 2);
  runtime.close();
});

test("all-period report is not truncated by transaction list pagination", () => {
  const runtime = createTestRuntime();
  for (let index = 0; index < 205; index += 1) {
    runtime.transactionService.createTransaction({
      type: "expense",
      amount: "1.00",
      occurredAt: `2025-03-${String((index % 28) + 1).padStart(2, "0")}T04:00:00.000Z`,
    }, { role: "owner", actorRef: "bulk-report-test" });
  }
  const report = runtime.reportService.getReport({ period: "all", metric: "expense", dimension: "category" }, { role: "owner" });
  assert.equal(report.totals.expenseMinor, 20500);
  assert.equal(report.totals.count, 205);
  assert.equal(report.breakdown.reduce((sum, row) => sum + row.count, 0), 205);
  runtime.close();
});

test("year reports use Asia Shanghai ledger-day boundaries", () => {
  const runtime = createTestRuntime();
  runtime.transactionService.createTransaction({
    type: "expense",
    amount: "10.00",
    occurredAt: "2014-12-31T18:00:00.000Z",
  }, { role: "owner", actorRef: "timezone-report-test" });
  const year2014 = runtime.reportService.getSummary({ period: "year", date: "2014-07-01T04:00:00.000Z" }, { role: "owner" });
  const year2015 = runtime.reportService.getSummary({ period: "year", date: "2014-12-31T18:00:00.000Z" }, { role: "owner" });
  assert.equal(year2014.totals.expenseMinor, 0);
  assert.equal(year2015.totals.expenseMinor, 1000);
  assert.equal(year2015.periodStart, "2014-12-31T16:00:00.000Z");
  runtime.close();
});

test("quarter reports use Asia Shanghai ledger-day boundaries", () => {
  const runtime = createTestRuntime();
  runtime.transactionService.createTransaction({
    type: "expense",
    amount: "10.00",
    occurredAt: "2026-03-31T15:59:59.000Z",
  }, { role: "owner", actorRef: "quarter-report-test" });
  runtime.transactionService.createTransaction({
    type: "expense",
    amount: "20.00",
    occurredAt: "2026-03-31T16:00:00.000Z",
  }, { role: "owner", actorRef: "quarter-report-test" });

  const q1 = runtime.reportService.getSummary({ period: "quarter", date: "2026-02-15T04:00:00.000Z" }, { role: "owner" });
  const q2 = runtime.reportService.getSummary({ period: "quarter", date: "2026-04-15T04:00:00.000Z" }, { role: "owner" });
  assert.equal(q1.totals.expenseMinor, 1000);
  assert.equal(q2.totals.expenseMinor, 2000);
  assert.equal(q1.periodStart, "2025-12-31T16:00:00.000Z");
  assert.equal(q1.periodEnd, "2026-03-31T15:59:59.999Z");
  assert.equal(q2.periodStart, "2026-03-31T16:00:00.000Z");
  runtime.close();
});

test("reports are currency scoped instead of mixing currencies", () => {
  const runtime = createTestRuntime();
  runtime.transactionService.createTransaction({
    type: "expense",
    amount: "10.00",
    currency: "CNY",
  }, { role: "owner", actorRef: "currency-report-test" });
  runtime.transactionService.createTransaction({
    type: "expense",
    amount: "20.00",
    currency: "USD",
  }, { role: "owner", actorRef: "currency-report-test" });
  const cny = runtime.reportService.getReport({ period: "all", metric: "expense", dimension: "category" }, { role: "owner" });
  const usd = runtime.reportService.getReport({ period: "all", metric: "expense", dimension: "category", currency: "USD" }, { role: "owner" });
  assert.equal(cny.currency, "CNY");
  assert.equal(cny.totals.expenseMinor, 1000);
  assert.equal(usd.currency, "USD");
  assert.equal(usd.totals.expenseMinor, 2000);
  runtime.close();
});

test("summary totals include all ledger members and exposes member breakdown", () => {
  const runtime = createTestRuntime();
  runtime.transactionService.createTransaction({
    type: "expense",
    amount: "10.00",
    memberId: "member_self",
  }, { role: "owner", actorRef: "summary-member-test" });
  runtime.transactionService.createTransaction({
    type: "expense",
    amount: "20.00",
    memberId: "member_household",
  }, { role: "owner", actorRef: "summary-member-test" });

  const summary = runtime.reportService.getSummary({ period: "all" }, { role: "owner" });
  assert.equal(summary.totals.expenseMinor, 3000);
  assert.equal(summary.totals.count, 2);
  const self = summary.memberBreakdown.find((row) => row.memberId === "member_self");
  const household = summary.memberBreakdown.find((row) => row.memberId === "member_household");
  assert.equal(self.totals.expenseMinor, 1000);
  assert.equal(household.totals.expenseMinor, 2000);

  const filtered = runtime.reportService.getSummary({ period: "all", memberId: "member_self" }, { role: "owner" });
  assert.equal(filtered.totals.expenseMinor, 1000);
  assert.deepEqual(filtered.memberBreakdown.map((row) => row.memberId), ["member_self"]);
  runtime.close();
});

test("account reports include original-currency accounts when currency is omitted", () => {
  const runtime = createTestRuntime();
  const usdAccount = runtime.repository.upsertAccount({
    ledgerId: "daily",
    name: "USD Wallet",
    type: "cash",
    currency: "USD",
  });
  runtime.transactionService.createTransaction({
    type: "expense",
    amount: "10.00",
    currency: "CNY",
  }, { role: "owner", actorRef: "account-currency-report-test" });
  runtime.transactionService.createTransaction({
    type: "expense",
    amount: "20.00",
    currency: "USD",
    accountId: usdAccount.id,
  }, { role: "owner", actorRef: "account-currency-report-test" });
  const mixed = runtime.reportService.getReport({ period: "all", metric: "expense", dimension: "account" }, { role: "owner" });
  const usd = mixed.breakdown.find((row) => row.label === "USD Wallet");
  assert.equal(mixed.currency, "MIXED");
  assert.equal(mixed.totals.expenseMinor, 3000);
  assert.equal(usd.amountMinor, 2000);
  assert.equal(usd.currency, "USD");
  const usdTrend = runtime.reportService.getReport({
    period: "all",
    metric: "expense",
    dimension: "trend",
    filters: { account_id: usdAccount.id },
  }, { role: "owner" });
  assert.equal(usdTrend.totals.expenseMinor, 2000);
  assert.equal(usdTrend.series[0].currency, "USD");
  const cny = runtime.reportService.getReport({ period: "all", metric: "expense", dimension: "account", currency: "CNY" }, { role: "owner" });
  assert.equal(cny.currency, "CNY");
  assert.equal(cny.breakdown.some((row) => row.label === "USD Wallet"), false);
  runtime.close();
});
