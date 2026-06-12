"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createFinanceMcpDispatcher } = require("../mcp/finance-mcp-server");
const { createTestRuntime } = require("./helpers");

test("MCP dispatcher creates and lists finance transaction", async () => {
  const runtime = createTestRuntime();
  const dispatcher = createFinanceMcpDispatcher(runtime);
  const created = await dispatcher.dispatch("finance.create_transaction", {
    type: "expense",
    amount: "9.90",
    account_hint: "现金",
    category_hint: "餐饮",
    member_hint: "自己",
  }, { role: "owner", actorRef: "mcp-test" });
  assert.equal(created.transaction.amountMinor, 990);
  const listed = await dispatcher.dispatch("finance.list_transactions", { limit: 10 }, { role: "owner" });
  assert.equal(listed.transactions.length, 1);
  runtime.close();
});

test("MCP dispatcher exposes Finance Reference Contract V1", async () => {
  const runtime = createTestRuntime();
  const dispatcher = createFinanceMcpDispatcher(runtime);
  const created = await dispatcher.dispatch("finance.create_transaction", {
    type: "expense",
    amount: "33.30",
    account_hint: "现金",
    category_hint: "餐饮",
    member_hint: "自己",
    merchant: "Reference MCP Merchant",
  }, { financeUserId: "user_xuxin", ledgerId: "daily", actorRef: "mcp-reference-test" });

  const types = await dispatcher.dispatch("finance.reference_object_types", {}, { financeUserId: "user_xuxin" });
  assert.deepEqual(types.object_types.map((row) => row.object_type), ["transaction", "account", "category"]);

  const detail = await dispatcher.dispatch("finance.reference_get", {
    object_type: "transaction",
    object_id: created.transaction.id,
  }, { financeUserId: "user_xuxin" });
  assert.equal(detail.reference.workspace_id, "local");
  assert.equal(detail.reference.plugin_id, "finance");
  assert.equal(detail.reference.object_type, "transaction");
  assert.equal(detail.object.amountMinor, 3330);
  assert.equal(detail.object.sourceRef, undefined);

  const summary = await dispatcher.dispatch("finance.reference_summarize", {
    object_type: "transaction",
    object_id: created.transaction.id,
  }, { financeUserId: "user_xuxin" });
  assert.match(summary.summary, /Expense 33\.30 CNY/);
  runtime.close();
});

test("MCP dispatcher creates transaction with inline photo attachment", async () => {
  const runtime = createTestRuntime();
  const dispatcher = createFinanceMcpDispatcher(runtime);
  const created = await dispatcher.dispatch("finance.create_transaction", {
    type: "expense",
    amount: "18.80",
    idempotency_key: "mcp-inline-photo",
    attachments: [{
      file_name: "receipt.png",
      mime_type: "image/png",
      data_base64: Buffer.from("mcp-inline-photo", "utf8").toString("base64"),
    }],
  }, { role: "owner", actorRef: "mcp-photo-test" });

  assert.equal(created.duplicate, false);
  assert.equal(created.transaction.attachmentCount, 1);
  assert.equal(created.transaction.imageAttachmentCount, 1);
  assert.equal(created.attachments.length, 1);
  assert.equal(created.attachments[0].transactionId, created.transaction.id);
  assert.equal(created.attachments[0].mimeType, "image/png");
  assert.match(created.attachments[0].thumbnailUrl, /\/thumbnail\?ledger_id=daily$/);

  const duplicate = await dispatcher.dispatch("finance.create_transaction", {
    type: "expense",
    amount: "18.80",
    idempotency_key: "mcp-inline-photo",
    attachments: [{
      file_name: "receipt-duplicate.png",
      mime_type: "image/png",
      data_base64: Buffer.from("duplicate-photo", "utf8").toString("base64"),
    }],
  }, { role: "owner", actorRef: "mcp-photo-test" });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.attachments.length, 0);
  assert.equal(runtime.attachmentService.listTransactionAttachments(created.transaction.id).length, 1);
  runtime.close();
});

test("MCP dispatcher attaches photo to an existing transaction", async () => {
  const runtime = createTestRuntime();
  const dispatcher = createFinanceMcpDispatcher(runtime);
  const created = await dispatcher.dispatch("finance.create_transaction", {
    type: "expense",
    amount: "12.30",
  }, { role: "owner", actorRef: "mcp-photo-test" });

  const attached = await dispatcher.dispatch("finance.add_transaction_attachment", {
    transaction_id: created.transaction.id,
    file_name: "after-entry.jpg",
    data_url: `data:image/jpeg;base64,${Buffer.from("existing-transaction-photo", "utf8").toString("base64")}`,
  }, { role: "owner", actorRef: "mcp-photo-test" });

  assert.equal(attached.transactionId, created.transaction.id);
  assert.equal(attached.mimeType, "image/jpeg");
  assert.equal(attached.isImage, true);
  assert.match(attached.url, /\/api\/finance\/attachments\//);

  const listed = await dispatcher.dispatch("finance.list_transactions", { limit: 10 }, { role: "owner" });
  assert.equal(listed.transactions[0].attachmentCount, 1);
  assert.equal(listed.transactions[0].imageAttachmentCount, 1);
  assert.equal(listed.transactions[0].firstImageAttachmentId, attached.id);
  const stored = runtime.imageStore.getOriginal(attached.id);
  assert.equal(stored.buffer.toString("utf8"), "existing-transaction-photo");
  runtime.close();
});

test("MCP dispatcher attaches an allowed server-local upload path", async () => {
  const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), "finance-upload-root-"));
  const runtime = createTestRuntime({ attachmentUploadRoots: [uploadRoot] });
  const dispatcher = createFinanceMcpDispatcher(runtime);
  const created = await dispatcher.dispatch("finance.create_transaction", {
    type: "expense",
    amount: "45.00",
    note: "parking",
  }, { role: "owner", actorRef: "mcp-photo-test" });

  const filePath = path.join(uploadRoot, "parking.png");
  fs.writeFileSync(filePath, Buffer.from("parking-photo", "utf8"));
  const attached = await dispatcher.dispatch("finance.add_transaction_attachment", {
    transaction_id: created.transaction.id,
    file_path: filePath,
  }, { role: "owner", actorRef: "mcp-photo-test" });

  assert.equal(attached.transactionId, created.transaction.id);
  assert.equal(attached.mimeType, "image/png");
  assert.equal(attached.fileName, "parking.png");
  const stored = runtime.imageStore.getOriginal(attached.id);
  assert.equal(stored.buffer.toString("utf8"), "parking-photo");

  const legacyPath = path.join(uploadRoot, "legacy-data-url-path.jpg");
  fs.writeFileSync(legacyPath, Buffer.from("legacy-path-photo", "utf8"));
  const legacyAttached = await dispatcher.dispatch("finance.add_transaction_attachment", {
    transaction_id: created.transaction.id,
    data_url: legacyPath,
  }, { role: "owner", actorRef: "mcp-photo-test" });
  assert.equal(legacyAttached.mimeType, "image/jpeg");
  assert.equal(legacyAttached.fileName, "legacy-data-url-path.jpg");

  const mediaWrappedPath = path.join(uploadRoot, "media-wrapped-data-url.png");
  fs.writeFileSync(mediaWrappedPath, Buffer.from("media-wrapped-path-photo", "utf8"));
  const mediaWrappedAttached = await dispatcher.dispatch("finance.add_transaction_attachment", {
    transaction_id: created.transaction.id,
    data_url: `MEDIA: ${mediaWrappedPath}`,
  }, { role: "owner", actorRef: "mcp-photo-test" });
  assert.equal(mediaWrappedAttached.mimeType, "image/png");
  assert.equal(mediaWrappedAttached.fileName, "media-wrapped-data-url.png");
  const mediaWrappedStored = runtime.imageStore.getOriginal(mediaWrappedAttached.id);
  assert.equal(mediaWrappedStored.buffer.toString("utf8"), "media-wrapped-path-photo");

  const deniedPath = path.join(os.tmpdir(), `finance-denied-${Date.now()}.png`);
  fs.writeFileSync(deniedPath, Buffer.from("not-allowed", "utf8"));
  await assert.rejects(() => dispatcher.dispatch("finance.add_transaction_attachment", {
    transaction_id: created.transaction.id,
    file_path: deniedPath,
  }, { role: "owner", actorRef: "mcp-photo-test" }), /attachment_file_path_not_allowed/);
  runtime.close();
});

test("MCP dispatcher allows only Hermes upload files under Hermes user roots", async () => {
  const baseRoot = fs.mkdtempSync(path.join(os.tmpdir(), "finance-hermes-users-"));
  const hermesUsersRoot = path.join(baseRoot, "data", "drive", "users");
  const uploadsDir = path.join(hermesUsersRoot, "owner", "Hermes-Xu", ".hermes-mobile", "uploads", "thread-test");
  fs.mkdirSync(uploadsDir, { recursive: true });
  const uploadPath = path.join(uploadsDir, "receipt.png");
  fs.writeFileSync(uploadPath, Buffer.from("hermes-upload-photo", "utf8"));

  const runtime = createTestRuntime({ attachmentUploadRoots: [hermesUsersRoot] });
  const dispatcher = createFinanceMcpDispatcher(runtime);
  const created = await dispatcher.dispatch("finance.create_transaction", {
    type: "expense",
    amount: "6.00",
  }, { role: "owner", actorRef: "mcp-photo-test" });
  const attached = await dispatcher.dispatch("finance.add_transaction_attachment", {
    transaction_id: created.transaction.id,
    upload_path: uploadPath,
  }, { role: "owner", actorRef: "mcp-photo-test" });
  assert.equal(attached.mimeType, "image/png");

  const nonUploadDir = path.join(hermesUsersRoot, "owner", "Hermes-Xu", "documents");
  fs.mkdirSync(nonUploadDir, { recursive: true });
  const nonUploadPath = path.join(nonUploadDir, "receipt.png");
  fs.writeFileSync(nonUploadPath, Buffer.from("not-upload", "utf8"));
  await assert.rejects(() => dispatcher.dispatch("finance.add_transaction_attachment", {
    transaction_id: created.transaction.id,
    upload_path: nonUploadPath,
  }, { role: "owner", actorRef: "mcp-photo-test" }), /attachment_file_path_not_allowed/);
  runtime.close();
});

test("MCP schemas expose finance toolset only", () => {
  const runtime = createTestRuntime();
  const dispatcher = createFinanceMcpDispatcher(runtime);
  assert.equal(dispatcher.schemas.every((schema) => schema.toolset === "finance"), true);
  assert.equal(dispatcher.schemas.some((schema) => schema.name === "finance.create_transaction"), true);
  assert.equal(dispatcher.schemas.some((schema) => schema.name === "finance.list_ledgers"), true);
  assert.equal(dispatcher.schemas.some((schema) => schema.name === "finance.create_ledger"), true);
  assert.equal(dispatcher.schemas.some((schema) => schema.name === "finance.request_ledger_join"), true);
  assert.equal(dispatcher.schemas.some((schema) => schema.name === "finance.create_ledger_invitation"), true);
  assert.equal(dispatcher.schemas.some((schema) => schema.name === "finance.accept_ledger_invitation"), true);
  assert.equal(dispatcher.schemas.some((schema) => schema.name === "finance.review_ledger_join_request"), true);
  assert.equal(dispatcher.schemas.some((schema) => schema.name === "finance.list_currencies"), true);
  assert.equal(dispatcher.schemas.some((schema) => schema.name === "finance.resolve_current_member"), true);
  assert.equal(dispatcher.schemas.some((schema) => schema.name === "finance.create_recurring_rule"), true);
  assert.equal(dispatcher.schemas.some((schema) => schema.name === "finance.generate_due_recurring_transactions"), true);
  assert.equal(dispatcher.schemas.some((schema) => schema.name === "finance.add_transaction_attachment"), true);
  assert.equal(dispatcher.schemas.some((schema) => schema.name === "finance.reference_object_types"), true);
  assert.equal(dispatcher.schemas.some((schema) => schema.name === "finance.reference_get"), true);
  assert.equal(dispatcher.schemas.some((schema) => schema.name === "finance.reference_summarize"), true);
  const referenceGetSchema = dispatcher.schemas.find((schema) => schema.name === "finance.reference_get");
  assert.deepEqual(referenceGetSchema.parameters.required, ["object_type", "object_id"]);
  assert.deepEqual(referenceGetSchema.parameters.properties.object_type.enum, ["transaction", "account", "category"]);
  const createSchema = dispatcher.schemas.find((schema) => schema.name === "finance.create_transaction");
  assert.equal(Boolean(createSchema.parameters.properties.attachments), true);
  assert.equal(createSchema.parameters.properties.attachments.maxItems, 6);
  assert.match(createSchema.parameters.properties.attachments.description, /file_path or upload_path/);
  assert.doesNotMatch(createSchema.parameters.properties.attachments.description, /Payloads use base64 data/);
  const addAttachmentSchema = dispatcher.schemas.find((schema) => schema.name === "finance.add_transaction_attachment");
  assert.match(addAttachmentSchema.description, /file_path or upload_path/);
  assert.equal(Boolean(addAttachmentSchema.parameters.properties.transaction_id), true);
  assert.equal(Boolean(addAttachmentSchema.parameters.properties.file_path), true);
  assert.equal(Boolean(addAttachmentSchema.parameters.properties.upload_path), true);
  assert.match(addAttachmentSchema.parameters.properties.file_path.description, /instead of reading binary bytes into base64/);
  assert.match(addAttachmentSchema.parameters.properties.data_url.description, /MEDIA:<path>/);
  assert.deepEqual(addAttachmentSchema.parameters.required, ["transaction_id"]);
  const listSchema = dispatcher.schemas.find((schema) => schema.name === "finance.list_transactions");
  assert.equal(Boolean(listSchema.parameters.properties.currency), true);
  assert.equal(Boolean(listSchema.parameters.properties.category_parent_id), true);
  assert.equal(Boolean(listSchema.parameters.properties.tag_id), true);
  assert.equal(Boolean(listSchema.parameters.properties.search), true);
  const summarySchema = dispatcher.schemas.find((schema) => schema.name === "finance.get_summary");
  assert.equal(Boolean(summarySchema.parameters.properties.currency), true);
  assert.equal(summarySchema.parameters.properties.period.enum.includes("quarter"), true);
  const reportSchema = dispatcher.schemas.find((schema) => schema.name === "finance.get_report");
  assert.equal(Boolean(reportSchema.parameters.properties.currency), true);
  assert.equal(reportSchema.parameters.properties.period.enum.includes("quarter"), true);
  assert.equal(reportSchema.parameters.properties.dimension.enum.includes("subcategory"), true);
  assert.equal(reportSchema.parameters.properties.dimension.enum.includes("tag"), true);
  assert.equal(Boolean(reportSchema.parameters.properties.filters), true);
  const inviteSchema = dispatcher.schemas.find((schema) => schema.name === "finance.create_ledger_invitation");
  assert.equal(Boolean(inviteSchema.parameters.properties.target_finance_user_id), true);
  assert.equal(Boolean(inviteSchema.parameters.properties.target_finance_user_key), true);
  assert.equal(Boolean(inviteSchema.parameters.properties.member_ids), false);
  const shareSchema = dispatcher.schemas.find((schema) => schema.name === "finance.share_ledger");
  assert.equal(Boolean(shareSchema.parameters.properties.member_ids), false);
  assert.equal(JSON.stringify(dispatcher.schemas).includes("hermes_workspace_user_key"), false);
  runtime.close();
});

test("MCP dispatcher creates and generates due recurring transactions", async () => {
  const runtime = createTestRuntime();
  const dispatcher = createFinanceMcpDispatcher(runtime);
  const created = await dispatcher.dispatch("finance.create_recurring_rule", {
    title: "Monthly utility",
    type: "expense",
    amount: "66.00",
    account_hint: "现金",
    category_hint: "居家",
    frequency: "monthly",
    start_at: "2026-02-03",
  }, { role: "owner", actorRef: "mcp-recurring-test" });
  assert.equal(created.rule.title, "Monthly utility");

  const generated = await dispatcher.dispatch("finance.generate_due_recurring_transactions", {
    through_at: "2026-02-04T00:00:00.000Z",
  }, { role: "owner", actorRef: "mcp-recurring-test" });
  assert.equal(generated.count, 1);
  const listed = await dispatcher.dispatch("finance.list_recurring_rules", {}, { role: "owner" });
  assert.equal(listed.rules.some((row) => row.id === created.rule.id), true);
  runtime.close();
});

test("MCP dispatcher lists and creates ledgers", async () => {
  const runtime = createTestRuntime();
  const dispatcher = createFinanceMcpDispatcher(runtime);
  const created = await dispatcher.dispatch("finance.create_ledger", { name: "旅行账本" }, { role: "owner", actorRef: "mcp-test" });
  assert.equal(created.ledger.name, "旅行账本");
  const listed = await dispatcher.dispatch("finance.list_ledgers", {}, { role: "owner" });
  assert.equal(listed.ledgers.some((row) => row.id === created.ledger.id), true);
  runtime.close();
});

test("MCP dispatcher creates and reviews ledger join requests", async () => {
  const runtime = createTestRuntime();
  const dispatcher = createFinanceMcpDispatcher(runtime);
  const requester = runtime.repository.upsertFinanceUser({
    id: "user_join_mcp",
    userKey: "join_mcp",
    displayName: "Join MCP",
  });
  const ledger = runtime.ledgerService.authorizedLedger({}, { financeUserId: "user_xuxin" });
  const requested = await dispatcher.dispatch("finance.request_ledger_join", { ledger_id: ledger.id }, {
    financeUserId: requester.id,
    actorRef: "mcp-requester",
  });
  assert.equal(requested.hermes_inbox_event.type, "finance.ledger_join_request");
  assert.equal(Object.prototype.hasOwnProperty.call(requested.hermes_inbox_event, "url"), false);

  const reviewed = await dispatcher.dispatch("finance.review_ledger_join_request", {
    request_id: requested.request.id,
    decision: "approve",
  }, { financeUserId: "user_xuxin", actorRef: "mcp-owner" });
  assert.equal(reviewed.request.status, "approved");
  assert.equal(reviewed.membership.finance_user_id, requester.id);
  assert.equal(reviewed.member_scope, "all_shared_ledger_members");
  runtime.close();
});

test("MCP dispatcher creates host-mediated ledger invitations", async () => {
  const runtime = createTestRuntime();
  const dispatcher = createFinanceMcpDispatcher(runtime);
  const invited = runtime.repository.upsertFinanceUser({ id: "user_invite_mcp", userKey: "invite_mcp", displayName: "Invite MCP" });
  const ledger = runtime.ledgerService.authorizedLedger({}, { financeUserId: "user_xuxin" });
  const created = await dispatcher.dispatch("finance.create_ledger_invitation", { ledger_id: ledger.id, target_finance_user_id: invited.id }, {
    financeUserId: "user_xuxin",
    actorRef: "mcp-owner",
  });
  assert.equal(created.hermes_inbox_event.type, "finance.ledger_invitation_request");
  assert.equal(created.hermes_inbox_event.target.finance_user_id, invited.id);
  const accepted = await dispatcher.dispatch("finance.accept_ledger_invitation", { invitation_id: created.invitation.id }, {
    financeUserId: invited.id,
    actorRef: "mcp-invited",
  });
  assert.equal(accepted.membership.finance_user_id, invited.id);
  runtime.close();
});

test("MCP dispatcher lists currencies for entry", async () => {
  const runtime = createTestRuntime();
  const dispatcher = createFinanceMcpDispatcher(runtime);
  const listed = await dispatcher.dispatch("finance.list_currencies", {}, { role: "owner" });
  assert.equal(listed.currencies.some((row) => row.code === "CNY"), true);
  assert.equal(listed.currencies.some((row) => row.code === "HKD"), true);
  assert.equal(listed.currencies.some((row) => row.code === "USD"), true);
  assert.equal(listed.currencies.some((row) => row.code === "EUR"), true);
  runtime.close();
});

test("MCP dispatcher maps Hermes workspace user key to default transaction member", async () => {
  const runtime = createTestRuntime();
  const dispatcher = createFinanceMcpDispatcher(runtime);
  const workspaceUserKey = ["fixture", "workspace", "user"].join(":");
  runtime.userBindingService.registerHermesWorkspaceUser({
    target_workspace_id: "finance-home",
    target_user_key: workspaceUserKey,
    display_name: "Hermes Finance Owner",
  }, { role: "owner", actorRef: "admin" });
  const resolved = await dispatcher.dispatch("finance.resolve_current_member", {
    display_name: "Hermes Finance User",
  }, {
    role: "member",
    externalWorkspaceId: "finance-home",
    hermesWorkspaceUserKey: workspaceUserKey,
  });
  const created = await dispatcher.dispatch("finance.create_transaction", {
    type: "expense",
    amount: "12.00",
    account_hint: "现金",
    category_hint: "餐饮",
  }, {
    role: "member",
    externalWorkspaceId: "finance-home",
    hermesWorkspaceUserKey: workspaceUserKey,
  });
  assert.equal(created.transaction.memberId, resolved.memberId);
  const listed = await dispatcher.dispatch("finance.list_transactions", { limit: 10 }, {
    role: "member",
    externalWorkspaceId: "finance-home",
    hermesWorkspaceUserKey: workspaceUserKey,
  });
  assert.equal(listed.transactions[0].memberName, "Hermes Finance User");
  assert.equal(resolved.binding.external_user_id.includes(workspaceUserKey), false);
  runtime.close();
});

test("MCP summary and member report include all workspace ledger members by default", async () => {
  const runtime = createTestRuntime();
  const dispatcher = createFinanceMcpDispatcher(runtime);
  const workspaceUserKey = ["fixture", "summary", "user"].join(":");
  const registered = runtime.userBindingService.registerHermesWorkspaceUser({
    target_workspace_id: "finance-summary",
    target_user_key: workspaceUserKey,
    display_name: "Hermes Summary Owner",
  }, { role: "owner", actorRef: "admin" });
  const context = {
    role: "member",
    externalWorkspaceId: "finance-summary",
    hermesWorkspaceUserKey: workspaceUserKey,
  };
  const resolved = await dispatcher.dispatch("finance.resolve_current_member", {
    display_name: "Hermes Summary User",
  }, context);
  const household = runtime.repository.listMembers(registered.ledger.id)
    .find((row) => row.id !== resolved.memberId);

  await dispatcher.dispatch("finance.create_transaction", {
    type: "expense",
    amount: "12.00",
  }, context);
  await dispatcher.dispatch("finance.create_transaction", {
    type: "expense",
    amount: "8.00",
    member_id: household.id,
  }, context);

  const listed = await dispatcher.dispatch("finance.list_transactions", { limit: 10 }, context);
  assert.equal(listed.transactions.length, 1);
  assert.equal(listed.transactions[0].memberId, resolved.memberId);

  const summary = await dispatcher.dispatch("finance.get_summary", { period: "all" }, context);
  assert.equal(summary.totals.expenseMinor, 2000);
  assert.equal(summary.totals.count, 2);
  assert.equal(summary.memberBreakdown.some((row) => row.memberId === resolved.memberId), true);
  assert.equal(summary.memberBreakdown.some((row) => row.memberId === household.id), true);

  const report = await dispatcher.dispatch("finance.get_report", {
    period: "all",
    metric: "expense",
    dimension: "member",
  }, context);
  assert.equal(report.totals.expenseMinor, 2000);
  assert.equal(report.breakdown.some((row) => row.key === resolved.memberId), true);
  assert.equal(report.breakdown.some((row) => row.key === household.id), true);
  runtime.close();
});

test("MCP scoped Hermes context cannot override the resolved ledger", async () => {
  const runtime = createTestRuntime();
  const dispatcher = createFinanceMcpDispatcher(runtime);
  await dispatcher.dispatch("finance.create_transaction", {
    type: "expense",
    amount: "5.00",
  }, { role: "owner", actorRef: "owner" });

  runtime.userBindingService.registerHermesWorkspaceUser({
    target_workspace_id: "isolated-workspace",
    display_name: "Isolated Workspace",
  }, { role: "owner", actorRef: "admin" });

  const listed = await dispatcher.dispatch("finance.list_transactions", { ledger_id: "daily", limit: 10 }, {
    role: "member",
    externalWorkspaceId: "isolated-workspace",
  });
  assert.equal(listed.transactions.length, 0);

  const accounts = await dispatcher.dispatch("finance.list_accounts", { ledger_id: "daily" }, {
    role: "member",
    externalWorkspaceId: "isolated-workspace",
  });
  assert.equal(accounts.accounts.some((row) => row.ledger_id === "daily"), false);
  runtime.close();
});
