"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestRuntime } = require("./helpers");

test("recurring rule generates due transactions idempotently", () => {
  const runtime = createTestRuntime();
  const context = { role: "owner", actorRef: "recurring-test" };

  const created = runtime.recurringService.createRecurringRule({
    title: "Monthly rent",
    type: "expense",
    amount: "1200.00",
    account_hint: "现金",
    category_hint: "居家",
    member_hint: "自己",
    frequency: "monthly",
    start_at: "2026-01-05",
    time_of_day: "08:30",
  }, context);

  assert.equal(created.rule.status, "active");
  assert.equal(created.rule.endAt, "");
  assert.equal(created.rule.nextDueAt, "2026-01-05T00:30:00.000Z");

  const first = runtime.recurringService.generateDueTransactions({
    through_at: "2026-01-06T00:00:00.000Z",
  }, context);
  const second = runtime.recurringService.generateDueTransactions({
    through_at: "2026-01-06T00:00:00.000Z",
  }, context);

  assert.equal(first.count, 1);
  assert.equal(second.count, 0);
  assert.equal(runtime.repository.getAccount("acct_cash").current_balance_minor, -120000);
  const rows = runtime.transactionService.listTransactions({ limit: 10 }, context);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, "recurring");
  assert.match(rows[0].sourceRef, /^recurring:/);
  runtime.close();
});

test("paused recurring rule does not generate until resumed", () => {
  const runtime = createTestRuntime();
  const context = { role: "owner", actorRef: "recurring-test" };
  const created = runtime.recurringService.createRecurringRule({
    title: "Weekly subway",
    type: "expense",
    amount: "8.00",
    frequency: "weekly",
    weekdays: [1, 5],
    start_at: "2026-06-01",
  }, context);

  runtime.recurringService.setRecurringRuleStatus(created.rule.id, "paused", context);
  assert.equal(runtime.recurringService.generateDueTransactions({ through_at: "2026-06-08T00:00:00.000Z" }, context).count, 0);

  runtime.recurringService.setRecurringRuleStatus(created.rule.id, "active", context);
  assert.equal(runtime.recurringService.generateDueTransactions({ through_at: "2026-06-08T00:00:00.000Z" }, context).count, 2);
  runtime.close();
});

test("updating non-schedule fields preserves next due date", () => {
  const runtime = createTestRuntime();
  const context = { role: "owner", actorRef: "recurring-test" };
  const created = runtime.recurringService.createRecurringRule({
    title: "Monthly rent",
    type: "expense",
    amount: "1200.00",
    account_hint: "现金",
    category_hint: "居家",
    member_hint: "自己",
    frequency: "monthly",
    start_at: "2025-01-05",
    time_of_day: "08:30",
    next_due_at: "2026-07-05T00:30:00.000Z",
  }, context);

  const updated = runtime.recurringService.updateRecurringRule(created.rule.id, { amount: "1300.00" }, context);

  assert.equal(updated.rule.amount, "1300.00");
  assert.equal(updated.rule.nextDueAt, "2026-07-05T00:30:00.000Z");
  runtime.close();
});

test("updating schedule fields recalculates next due date", () => {
  const runtime = createTestRuntime();
  const context = { role: "owner", actorRef: "recurring-test" };
  const created = runtime.recurringService.createRecurringRule({
    title: "Monthly rent",
    type: "expense",
    amount: "1200.00",
    account_hint: "现金",
    category_hint: "居家",
    member_hint: "自己",
    frequency: "monthly",
    start_at: "2025-01-05",
    time_of_day: "08:30",
    next_due_at: "2026-07-05T00:30:00.000Z",
  }, context);

  const updated = runtime.recurringService.updateRecurringRule(created.rule.id, { start_at: "2026-08-10", time_of_day: "09:15" }, context);

  assert.equal(updated.rule.nextDueAt, "2026-08-10T01:15:00.000Z");
  runtime.close();
});

test("deleting recurring rule can void generated transactions", () => {
  const runtime = createTestRuntime();
  const context = { role: "owner", actorRef: "recurring-test" };
  const created = runtime.recurringService.createRecurringRule({
    title: "Monthly income",
    type: "income",
    amount: "100.00",
    account_hint: "现金",
    category_hint: "工资薪水",
    frequency: "monthly",
    start_at: "2026-01-01",
  }, context);

  runtime.recurringService.generateDueTransactions({ through_at: "2026-01-02T00:00:00.000Z" }, context);
  assert.equal(runtime.repository.getAccount("acct_cash").current_balance_minor, 10000);

  const deleted = runtime.recurringService.deleteRecurringRule(created.rule.id, { void_generated: true }, context);
  assert.equal(deleted.rule.status, "deleted");
  assert.equal(deleted.voidedTransactions.length, 1);
  assert.equal(runtime.repository.getAccount("acct_cash").current_balance_minor, 0);
  runtime.close();
});
