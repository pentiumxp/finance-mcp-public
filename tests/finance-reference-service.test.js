"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestRuntime } = require("./helpers");

test("Finance Reference Contract V1 exposes supported object types", () => {
  const runtime = createTestRuntime();
  const result = runtime.referenceService.objectTypes();
  assert.equal(result.plugin_id, "finance");
  assert.deepEqual(result.object_types.map((row) => row.object_type), ["transaction", "account", "category"]);
  assert.equal(result.object_types.every((row) => row.methods.includes("reference_get")), true);
  runtime.close();
});

test("Finance Reference Contract V1 returns bounded transaction references", () => {
  const runtime = createTestRuntime();
  const created = runtime.transactionService.createTransaction({
    type: "expense",
    amount: "45.00",
    account_hint: "现金",
    category_hint: "交通",
    member_hint: "自己",
    merchant: "Parking Test Merchant",
    note: "Parking fee with receipt",
    raw_text: "raw-source-ref-that-must-not-be-copied",
  }, { financeUserId: "user_xuxin", ledgerId: "daily", actorRef: "reference-test" });

  const detail = runtime.referenceService.referenceGet({
    object_type: "transaction",
    object_id: created.transaction.id,
  }, { financeUserId: "user_xuxin", externalWorkspaceId: "owner" });

  assert.equal(detail.reference.workspace_id, "owner");
  assert.equal(detail.reference.plugin_id, "finance");
  assert.equal(detail.reference.object_type, "transaction");
  assert.equal(detail.reference.object_id, created.transaction.id);
  assert.equal(detail.reference.display.thumbnail_hint, "");
  assert.equal(detail.object.amountMinor, 4500);
  assert.equal(detail.object.merchantName, "Parking Test Merchant");
  assert.equal(detail.object.source, undefined);
  assert.equal(detail.object.sourceRef, undefined);
  assert.equal(detail.object.firstImageUrl, undefined);
  assert.equal(JSON.stringify(detail).includes("raw-source-ref-that-must-not-be-copied"), false);

  const summary = runtime.referenceService.referenceSummarize({
    object_type: "transaction",
    object_id: created.transaction.id,
    purpose: "note-backlink",
  }, { financeUserId: "user_xuxin", externalWorkspaceId: "owner" });
  assert.equal(summary.reference.object_id, created.transaction.id);
  assert.match(summary.summary, /Expense 45\.00 CNY/);
  assert.match(summary.summary, /Parking Test Merchant/);
  assert.equal(summary.purpose, "note-backlink");
  runtime.close();
});

test("Finance Reference Contract V1 returns account and category references", () => {
  const runtime = createTestRuntime();
  const account = runtime.repository.listAccounts("daily")[0];
  const category = runtime.repository.listCategories("daily", "expense")[0];

  const accountRef = runtime.referenceService.referenceGet({
    object_type: "account",
    object_id: account.id,
  }, { financeUserId: "user_xuxin" });
  assert.equal(accountRef.reference.object_type, "account");
  assert.equal(accountRef.object.name, account.name);
  assert.equal(accountRef.object.current_balance_minor, undefined);

  const categoryRef = runtime.referenceService.referenceGet({
    object_type: "category",
    object_id: category.id,
    ledger_id: "daily",
  }, { financeUserId: "user_xuxin" });
  assert.equal(categoryRef.reference.object_type, "category");
  assert.equal(categoryRef.object.name, category.name);
  assert.equal(categoryRef.object.ledgerId, "daily");
  runtime.close();
});

test("Finance Reference Contract V1 enforces ledger access", () => {
  const runtime = createTestRuntime();
  runtime.repository.upsertFinanceUser({
    id: "user_reference_other",
    userKey: "reference_other",
    displayName: "Reference Other",
  });
  const { ledger } = runtime.ledgerService.createLedger({ name: "Reference Other Ledger" }, {
    financeUserId: "user_reference_other",
    actorRef: "reference-other",
  });
  const created = runtime.transactionService.createTransaction({
    ledger_id: ledger.id,
    type: "expense",
    amount: "8.00",
    account_hint: "现金",
    category_hint: "餐饮",
  }, {
    financeUserId: "user_reference_other",
    ledgerId: ledger.id,
    actorRef: "reference-other",
  });

  assert.throws(() => runtime.referenceService.referenceGet({
    object_type: "transaction",
    object_id: created.transaction.id,
  }, { financeUserId: "user_xuxin" }), /finance_ledger_access_denied/);
  runtime.close();
});
