"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFinanceRecurringSchedulerService, resolveRecurringAutoPostConfig } = require("../adapters/finance-recurring-scheduler-service");
const { createTestRuntime } = require("./helpers");

function masterIds(runtime, ledgerId) {
  return {
    accountId: runtime.repository.listAccounts(ledgerId)[0].id,
    categoryId: runtime.repository.listCategories(ledgerId, "expense")[0].id,
    memberId: runtime.repository.listMembers(ledgerId)[0].id,
  };
}

function createDueRule(runtime, ledgerId, title) {
  const ids = masterIds(runtime, ledgerId);
  return runtime.recurringService.createRecurringRule({
    ledger_id: ledgerId,
    title,
    type: "expense",
    amount: "10.00",
    account_id: ids.accountId,
    category_id: ids.categoryId,
    member_id: ids.memberId,
    frequency: "monthly",
    start_at: "2026-01-05",
    time_of_day: "08:30",
  }, { role: "owner", actorRef: "scheduler-test" });
}

test("recurring scheduler auto-posts due rules across ledgers idempotently", () => {
  const runtime = createTestRuntime();
  const context = { role: "owner", financeUserId: "user_xuxin", actorRef: "scheduler-test" };
  const secondLedger = runtime.ledgerService.createLedger({ name: "Travel" }, context).ledger;
  createDueRule(runtime, "daily", "Daily ledger rule");
  createDueRule(runtime, secondLedger.id, "Travel ledger rule");

  const scheduler = createFinanceRecurringSchedulerService({
    repository: runtime.repository,
    recurringService: runtime.recurringService,
    clock: () => "2026-01-06T00:00:00.000Z",
    intervalMs: 1000,
    maxOccurrences: 10,
  });

  const first = scheduler.runOnce();
  const second = scheduler.runOnce();
  const generated = runtime.repository.db.prepare("SELECT COUNT(*) AS count FROM finance_transactions WHERE source = 'recurring'").get().count;

  assert.equal(first.count, 2);
  assert.deepEqual(new Set(first.ledgers.map((row) => row.ledgerId)), new Set(["daily", secondLedger.id]));
  assert.equal(first.errors.length, 0);
  assert.equal(second.count, 0);
  assert.equal(generated, 2);
  runtime.close();
});

test("recurring scheduler drains missed occurrences after downtime", () => {
  const runtime = createTestRuntime();
  const ids = masterIds(runtime, "daily");
  runtime.recurringService.createRecurringRule({
    ledger_id: "daily",
    title: "Daily backlog rule",
    type: "expense",
    amount: "1.00",
    account_id: ids.accountId,
    category_id: ids.categoryId,
    member_id: ids.memberId,
    frequency: "daily",
    start_at: "2026-01-01",
    time_of_day: "09:00",
  }, { role: "owner", actorRef: "scheduler-test" });

  const scheduler = createFinanceRecurringSchedulerService({
    repository: runtime.repository,
    recurringService: runtime.recurringService,
    clock: () => "2026-01-06T02:00:00.000Z",
    intervalMs: 1000,
    maxOccurrences: 2,
    catchUpPassLimit: 10,
  });

  const result = scheduler.runOnce();
  const generated = runtime.repository.db.prepare("SELECT COUNT(*) AS count FROM finance_transactions WHERE source = 'recurring'").get().count;
  const remainingDue = runtime.repository.listLedgerIdsWithDueRecurringRules("2026-01-06T02:00:00.000Z");

  assert.equal(result.count, 6);
  assert.equal(result.ledgers[0].ledgerId, "daily");
  assert.equal(result.ledgers[0].passes, 3);
  assert.equal(generated, 6);
  assert.deepEqual(remainingDue, []);
  runtime.close();
});

test("recurring auto-post config is enabled by default and can be disabled", () => {
  assert.deepEqual(resolveRecurringAutoPostConfig({ FINANCE_RECURRING_AUTO_POST: "0" }).enabled, false);
  const defaults = resolveRecurringAutoPostConfig({});
  assert.equal(defaults.enabled, true);
  assert.equal(defaults.intervalMs, 5 * 60 * 1000);
  assert.equal(defaults.maxOccurrences, 100);
  assert.equal(defaults.catchUpPassLimit, 1000);
});

test("recurring scheduler reschedules after a run error", () => {
  const scheduled = [];
  const warnings = [];
  const scheduler = createFinanceRecurringSchedulerService({
    repository: {
      listLedgerIdsWithDueRecurringRules: () => {
        throw new Error("temporary_db_error");
      },
    },
    recurringService: {
      generateDueTransactions: () => ({ count: 0, generated: [] }),
    },
    clock: () => "2026-01-06T00:00:00.000Z",
    intervalMs: 1000,
    setTimer: (fn, delay) => {
      const handle = { fn, delay, unref: () => {} };
      scheduled.push(handle);
      return handle;
    },
    clearTimer: () => {},
    logger: {
      warn: (message) => warnings.push(message),
    },
  });

  scheduler.start();
  scheduled[0].fn();

  assert.equal(scheduled[0].delay, 0);
  assert.equal(scheduled[1].delay, 1000);
  assert.match(warnings[0], /temporary_db_error/);
  assert.deepEqual(scheduler.status().lastResult.errors, [{ ledgerId: "", error: "temporary_db_error" }]);
  scheduler.stop();
});
