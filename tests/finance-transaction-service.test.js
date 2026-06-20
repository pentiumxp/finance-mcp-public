"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { repairWacaiMemberTags } = require("../scripts/repair-wacai-member-tags");
const { createTestRuntime, tempDbPath } = require("./helpers");

test("creates expense transaction once and updates account balance", () => {
  const runtime = createTestRuntime();
  const first = runtime.transactionService.createTransaction({
    type: "expense",
    amount: "10.25",
    account_hint: "现金",
    category_hint: "餐饮",
    member_hint: "自己",
    merchant: "store-a",
    tags: ["tag-a"],
    idempotency_key: "same-key",
  }, { role: "owner", actorRef: "test" });
  const second = runtime.transactionService.createTransaction({
    type: "expense",
    amount: "10.25",
    account_hint: "现金",
    category_hint: "餐饮",
    member_hint: "自己",
    idempotency_key: "same-key",
  }, { role: "owner", actorRef: "test" });
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.notEqual(first.transaction.categoryName, "");
  assert.notEqual(first.transaction.accountName, "");
  assert.notEqual(first.transaction.memberName, "");
  assert.equal(first.transaction.merchantName, "store-a");
  assert.deepEqual(first.transaction.tags, ["tag-a"]);
  assert.equal(first.transaction.amountMinor, 1025);
  assert.equal(first.transaction.amount, "10.25");
  assert.equal(first.transaction.scale, 2);
  assert.notEqual(second.transaction.categoryName, "");
  assert.notEqual(second.transaction.accountName, "");
  assert.notEqual(second.transaction.memberName, "");
  assert.equal(second.transaction.merchantName, "store-a");
  assert.deepEqual(second.transaction.tags, ["tag-a"]);
  assert.equal(runtime.repository.getAccount("acct_cash").current_balance_minor, -1025);
  runtime.close();
});

test("void reverses balance and excludes transaction from active list", () => {
  const runtime = createTestRuntime();
  const created = runtime.transactionService.createTransaction({
    type: "income",
    amount: "20.00",
    account_hint: "现金",
    category_hint: "工资薪水",
    member_hint: "自己",
  }, { role: "owner", actorRef: "test" });
  assert.equal(runtime.repository.getAccount("acct_cash").current_balance_minor, 2000);
  runtime.transactionService.voidTransaction(created.transaction.id, "mistake", { role: "owner", actorRef: "test" });
  assert.equal(runtime.repository.getAccount("acct_cash").current_balance_minor, 0);
  assert.equal(runtime.transactionService.listTransactions({}, { role: "owner" }).length, 0);
  runtime.close();
});

test("update accepts amount strings and reapplies account balance", () => {
  const runtime = createTestRuntime();
  const member = runtime.repository.upsertMember({ ledgerId: "daily", displayName: "spouse-test" });
  const created = runtime.transactionService.createTransaction({
    type: "expense",
    amount: "10.00",
    note: "before",
    member_id: member.id,
    tags: ["keep-tag"],
  }, { role: "owner", actorRef: "test" });
  const accountId = created.transaction.accountId;
  assert.equal(runtime.repository.getAccount(accountId).current_balance_minor, -1000);
  assert.equal(created.transaction.memberName, "spouse-test");
  assert.deepEqual(created.transaction.tags, ["keep-tag"]);

  const updated = runtime.transactionService.updateTransaction(created.transaction.id, {
    type: "expense",
    amount: "12.00",
    note: "after",
  }, { role: "owner", actorRef: "test" });
  assert.equal(updated.transaction.amountMinor, 1200);
  assert.equal(updated.transaction.note, "after");
  assert.equal(updated.transaction.memberName, "spouse-test");
  assert.deepEqual(updated.transaction.tags, ["keep-tag"]);
  assert.equal(runtime.repository.getAccount(accountId).current_balance_minor, -1200);

  const cleared = runtime.transactionService.updateTransaction(created.transaction.id, {
    type: "expense",
    amount: "12.00",
    tags: [],
  }, { role: "owner", actorRef: "test" });
  assert.equal(cleared.transaction.memberName, "spouse-test");
  assert.deepEqual(cleared.transaction.tags, []);
  runtime.close();
});

test("update accepts snake_case occurred_at date patches", () => {
  const runtime = createTestRuntime();
  const created = runtime.transactionService.createTransaction({
    type: "expense",
    amount: "10.00",
    occurred_at: "2026-05-10 09:30",
    account_hint: "现金",
    category_hint: "餐饮",
    member_hint: "自己",
  }, { role: "owner", actorRef: "test" });

  const updated = runtime.transactionService.updateTransaction(created.transaction.id, {
    type: "expense",
    amount: "10.00",
    occurred_at: "2026-05-12 19:45",
  }, { role: "owner", actorRef: "test" });

  assert.equal(updated.transaction.occurredAt, "2026-05-12 19:45");
  assert.equal(runtime.repository.getTransaction(created.transaction.id).occurredAt, "2026-05-12 19:45");
  runtime.close();
});

test("Wacai member and tag repair restores source-field dimensions", () => {
  const dbPath = tempDbPath("wacai-member-tag-repair");
  let runtime = createTestRuntime({ dbPath });
  const member = runtime.repository.upsertMember({ ledgerId: "daily", displayName: "spouse-test" });
  const created = runtime.transactionService.createTransaction({
    type: "expense",
    amount: "8.00",
    member_id: member.id,
    tags: ["repair-tag"],
  }, { role: "owner", actorRef: "test" });
  const batch = runtime.repository.insertImportBatch({
    ledgerId: "daily",
    source: "wacai",
    sourceFileName: "wacai-unit-20260604.xlsx",
    rowCount: 1,
    importedCount: 1,
  });
  runtime.repository.insertTransactionSourceFields({
    transactionId: created.transaction.id,
    ledgerId: "daily",
    source: "wacai",
    sourceRowIndex: 1,
    rawParticipantName: "spouse-test",
    rawTags: "repair-tag",
    rawRowJson: "{}",
    importBatchId: batch.id,
  });
  const before = runtime.repository.getTransaction(created.transaction.id);
  runtime.repository.updateTransactionRow(created.transaction.id, {
    ...before,
    bookedByMemberId: "member_household",
  });
  runtime.repository.replaceTransactionTags(created.transaction.id, []);
  runtime.close();

  const repair = repairWacaiMemberTags({
    dbPath,
    apply: true,
    backup: false,
    batchLike: "unit-20260604",
    actorRef: "test",
  });
  assert.equal(repair.memberUpdateCount, 1);
  assert.equal(repair.tagRestoreCount, 1);
  assert.deepEqual(repair.applied, { memberUpdates: 1, tagRestores: 1, auditRows: 1 });

  runtime = createTestRuntime({ dbPath });
  const [restored] = runtime.transactionService.listTransactions({ limit: 1 }, { role: "owner" });
  assert.equal(restored.memberName, "spouse-test");
  assert.deepEqual(restored.tags, ["repair-tag"]);
  runtime.close();
});

test("transfer changes two accounts but report totals exclude it", () => {
  const runtime = createTestRuntime();
  runtime.transactionService.createTransaction({
    type: "transfer",
    amount: "5.00",
    account_hint: "现金",
    target_account_hint: "银行卡",
    member_hint: "自己",
  }, { role: "owner", actorRef: "test" });
  assert.equal(runtime.repository.getAccount("acct_cash").current_balance_minor, -500);
  assert.equal(runtime.repository.getAccount("acct_bank").current_balance_minor, 500);
  const summary = runtime.reportService.getSummary({ period: "all" }, { role: "owner" });
  assert.equal(summary.totals.incomeMinor, 0);
  assert.equal(summary.totals.expenseMinor, 0);
  runtime.close();
});

test("scoped user context cannot use another ledger or its master-data ids", () => {
  const runtime = createTestRuntime();
  const ownerTxn = runtime.transactionService.createTransaction({
    type: "expense",
    amount: "3.00",
  }, { role: "owner", actorRef: "owner" });
  const registered = runtime.userBindingService.registerHermesWorkspaceUser({
    target_workspace_id: "isolated-transactions",
    display_name: "Isolated Transactions",
  }, { role: "owner", actorRef: "admin" });
  const context = {
    role: "owner",
    financeUserId: registered.user.id,
    ledgerId: registered.ledger.id,
    actorRef: "isolated-user",
  };

  const created = runtime.transactionService.createTransaction({
    ledger_id: "daily",
    type: "expense",
    amount: "4.00",
  }, context);
  assert.equal(created.transaction.ledgerId, registered.ledger.id);

  assert.throws(() => runtime.transactionService.createTransaction({
    type: "expense",
    amount: "4.00",
    account_id: "acct_cash",
  }, context), /account_not_in_ledger/);
  assert.throws(() => runtime.transactionService.updateTransaction(ownerTxn.transaction.id, {
    type: "expense",
    amount: "6.00",
  }, context), /finance_ledger_access_denied/);
  assert.throws(() => runtime.transactionService.voidTransaction(ownerTxn.transaction.id, "forbidden", context), /finance_ledger_access_denied/);
  runtime.close();
});

test("transaction list supports bounded offset pagination", () => {
  const runtime = createTestRuntime();
  for (let index = 0; index < 3; index += 1) {
    runtime.transactionService.createTransaction({
      type: "expense",
      amount: String(index + 1),
      occurred_at: `2026-06-0${index + 1}T12:00:00.000Z`,
      note: `page-${index + 1}`,
    }, { role: "owner", actorRef: "test" });
  }

  const firstPage = runtime.transactionService.listTransactions({ limit: 2, offset: 0 }, { role: "owner" });
  const secondPage = runtime.transactionService.listTransactions({ limit: 2, offset: 2 }, { role: "owner" });

  assert.deepEqual(firstPage.map((row) => row.note), ["page-3", "page-2"]);
  assert.deepEqual(secondPage.map((row) => row.note), ["page-1"]);
  runtime.close();
});

test("transaction list supports bounded text search for bill copy workflows", () => {
  const runtime = createTestRuntime();
  runtime.transactionService.createTransaction({
    type: "expense",
    amount: "38",
    category_hint: "椁愰ギ",
    note: "family dinner copy seed",
  }, { role: "owner", actorRef: "test" });
  runtime.transactionService.createTransaction({
    type: "expense",
    amount: "12",
    note: "bus card",
  }, { role: "owner", actorRef: "test" });
  runtime.transactionService.createTransaction({
    type: "expense",
    amount: "1200",
    note: "school fee",
  }, { role: "owner", actorRef: "test" });
  runtime.transactionService.createTransaction({
    type: "expense",
    amount: "5000",
    note: "health insurance",
  }, { role: "owner", actorRef: "test" });

  const byNote = runtime.transactionService.listTransactions({ search: "copy seed", limit: 10 }, { role: "owner" });
  const byAmount = runtime.transactionService.listTransactions({ search: "1200", limit: 10 }, { role: "owner" });
  const byDecimalAmount = runtime.transactionService.listTransactions({ search: "5,000.00", limit: 10 }, { role: "owner" });

  assert.equal(byNote.length, 1);
  assert.equal(byNote[0].note, "family dinner copy seed");
  assert.equal(byAmount.length, 1);
  assert.equal(byAmount[0].note, "school fee");
  assert.equal(byDecimalAmount.length, 1);
  assert.equal(byDecimalAmount[0].note, "health insurance");
  runtime.close();
});

test("member list sorts by historical transaction usage", () => {
  const runtime = createTestRuntime();
  runtime.repository.upsertMember({ displayName: "少用成员" });
  runtime.repository.upsertMember({ displayName: "常用成员" });
  runtime.transactionService.createTransaction({
    type: "expense",
    amount: "10",
    member_hint: "少用成员",
    note: "rare member",
  }, { role: "owner", actorRef: "test" });
  for (let index = 0; index < 3; index += 1) {
    runtime.transactionService.createTransaction({
      type: "expense",
      amount: "10",
      member_hint: "常用成员",
      note: `common member ${index}`,
    }, { role: "owner", actorRef: "test" });
  }

  const members = runtime.repository.listMembers("daily");
  const commonIndex = members.findIndex((row) => row.display_name === "常用成员");
  const rareIndex = members.findIndex((row) => row.display_name === "少用成员");

  assert.equal(members[commonIndex].transaction_usage_count, 3);
  assert.equal(members[rareIndex].transaction_usage_count, 1);
  assert.equal(commonIndex < rareIndex, true);
  runtime.close();
});
