"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestRuntime } = require("./helpers");

test("default xuxin ledger is named as Wacai daily ledger", () => {
  const runtime = createTestRuntime();
  const ledgers = runtime.ledgerService.listLedgers({ financeUserId: "user_xuxin" });
  assert.equal(ledgers[0].id, "daily");
  assert.equal(ledgers[0].name, "日常账本");
  runtime.close();
});

test("ledger service creates isolated ledgers with default master data", () => {
  const runtime = createTestRuntime();
  const result = runtime.ledgerService.createLedger({ name: "旅行账本" }, { role: "owner", financeUserId: "user_xuxin", actorRef: "test" });
  assert.equal(result.created, true);
  assert.equal(result.ledger.name, "旅行账本");
  assert.notEqual(result.ledger.id, "daily");
  assert.equal(runtime.repository.listAccounts(result.ledger.id).some((row) => row.name === "现金"), true);
  assert.equal(runtime.repository.listMembers(result.ledger.id).some((row) => row.display_name === "自己"), true);
  assert.equal(runtime.ledgerService.authorizedLedger({ ledger_id: result.ledger.id }, { financeUserId: "user_xuxin" }).id, result.ledger.id);
  runtime.close();
});

test("scoped finance users cannot select another user's ledger", () => {
  const runtime = createTestRuntime();
  const registered = runtime.userBindingService.registerHermesWorkspaceUser({
    target_workspace_id: "ledger-scope",
    display_name: "Ledger Scope",
  }, { role: "owner", actorRef: "admin" });
  assert.throws(
    () => runtime.ledgerService.authorizedLedger({ ledger_id: "daily" }, { financeUserId: registered.user.id }),
    /finance_ledger_access_denied/,
  );
  runtime.close();
});

test("ledger templates match the Wacai-style create flow", () => {
  const runtime = createTestRuntime();
  const templates = runtime.ledgerService.listLedgerTemplates();
  assert.deepEqual(
    templates.map((row) => row.id),
    ["daily", "favor", "travel", "baby", "renovation", "car", "business"],
  );
  const created = runtime.ledgerService.createLedger({ template_id: "car" }, { financeUserId: "user_xuxin", actorRef: "test" });
  assert.equal(created.created, true);
  assert.equal(created.ledger.template_id, "car");
  runtime.close();
});

test("shared ledger users see all member dimensions", () => {
  const runtime = createTestRuntime();
  const invited = runtime.repository.upsertFinanceUser({
    id: "user_invited",
    userKey: "workspace_invited",
    displayName: "Invited",
  });
  const ledger = runtime.ledgerService.authorizedLedger({}, { financeUserId: "user_xuxin" });
  const members = runtime.repository.listMembers(ledger.id);
  assert.ok(members.length >= 2);

  const ownerShare = runtime.ledgerService.getLedgerShare(ledger.id, { financeUserId: "user_xuxin" });
  assert.equal(ownerShare.member_candidates.length, members.length);
  assert.deepEqual(ownerShare.finance_user_candidates.map((row) => row.id), [invited.id]);

  runtime.ledgerService.shareLedger({
    ledger_id: ledger.id,
    finance_user_id: invited.id,
    role: "viewer",
    member_ids: [members[0].id],
  }, { financeUserId: "user_xuxin", actorRef: "test" });

  const nonOwnerShare = runtime.ledgerService.getLedgerShare(ledger.id, { financeUserId: invited.id });
  assert.equal(nonOwnerShare.access_role, "viewer");
  assert.deepEqual(nonOwnerShare.member_candidates.map((row) => row.id).sort(), members.map((row) => row.id).sort());
  assert.equal(nonOwnerShare.member_scope, "all_shared_ledger_members");
  assert.equal(nonOwnerShare.shared_users.length, 0);
  runtime.close();
});

test("owner creates ledger invitation for target Finance user", () => {
  const runtime = createTestRuntime();
  const invited = runtime.repository.upsertFinanceUser({ id: "user_invited_key", userKey: "test-account", displayName: "Test Account" });
  const ledger = runtime.ledgerService.authorizedLedger({}, { financeUserId: "user_xuxin" });
  const members = runtime.repository.listMembers(ledger.id);
  const created = runtime.ledgerService.createLedgerInvitation({
    ledger_id: ledger.id,
    target_finance_user_id: invited.id,
    role: "editor",
    member_ids: members.map((row) => row.id),
  }, { financeUserId: "user_xuxin", actorRef: "test" });
  assert.equal(created.hermes_inbox_event.type, "finance.ledger_invitation_request");
  assert.equal(created.hermes_inbox_event.target.finance_user_id, invited.id);
  assert.equal("url" in created.hermes_inbox_event, false);

  const pending = runtime.ledgerService.listLedgerInvitations({}, { financeUserId: invited.id });
  assert.equal(pending.invitations.length, 1);
  assert.equal(pending.invitations[0].id, created.invitation.id);
  assert.equal(pending.invitations[0].ledger_name, ledger.name);
  assert.equal(pending.invitations[0].inviter_finance_user_id, "user_xuxin");
  assert.equal(pending.invitations[0].member_scope, "all_shared_ledger_members");

  const accepted = runtime.ledgerService.acceptLedgerInvitation({ invitation_id: created.invitation.id }, { financeUserId: invited.id, actorRef: "test-invited" });
  assert.equal(accepted.invitation.status, "accepted");
  assert.equal(accepted.membership.role, "editor");
  assert.equal(accepted.member_scope, "all_shared_ledger_members");
  assert.deepEqual(runtime.ledgerService.listVisibleMembers(ledger.id, { financeUserId: invited.id }).map((row) => row.id).sort(), members.map((row) => row.id).sort());
  runtime.close();
});

test("owner cannot accept own ledger invitation", () => {
  const runtime = createTestRuntime();
  const invited = runtime.repository.upsertFinanceUser({ id: "user_invited_self_guard", userKey: "self_guard", displayName: "Self Guard" });
  const ledger = runtime.ledgerService.authorizedLedger({}, { financeUserId: "user_xuxin" });
  const created = runtime.ledgerService.createLedgerInvitation({ ledger_id: ledger.id, target_finance_user_id: invited.id }, { financeUserId: "user_xuxin" });
  assert.throws(
    () => runtime.ledgerService.acceptLedgerInvitation({ invitation_id: created.invitation.id }, { financeUserId: "user_xuxin" }),
    /finance_ledger_invitation_target_mismatch/,
  );
  runtime.close();
});

test("ledger join requests use owner approval instead of QR or invite links", () => {
  const runtime = createTestRuntime();
  const requester = runtime.repository.upsertFinanceUser({
    id: "user_join_requester",
    userKey: "join_requester",
    displayName: "Join Requester",
  });
  const ledger = runtime.ledgerService.authorizedLedger({}, { financeUserId: "user_xuxin" });
  const members = runtime.repository.listMembers(ledger.id);

  const requested = runtime.ledgerService.requestLedgerJoin({
    ledger_id: ledger.id,
    role: "viewer",
    message: "please add me",
  }, { financeUserId: requester.id, actorRef: "test-requester" });
  assert.equal(requested.request.status, "pending");
  assert.equal(requested.hermes_inbox_event.type, "finance.ledger_join_request");
  assert.equal(requested.hermes_inbox_event.ledger.id, ledger.id);
  assert.equal(requested.hermes_inbox_event.requester.finance_user_id, requester.id);
  assert.equal("url" in requested.hermes_inbox_event, false);

  const pending = runtime.ledgerService.listLedgerJoinRequests({}, { financeUserId: "user_xuxin" });
  assert.equal(pending.requests.length, 1);

  const reviewed = runtime.ledgerService.reviewLedgerJoinRequest({
    request_id: requested.request.id,
    decision: "approve",
    member_ids: [members[0].id],
  }, { financeUserId: "user_xuxin", actorRef: "test-owner" });
  assert.equal(reviewed.request.status, "approved");
  assert.equal(reviewed.membership.finance_user_id, requester.id);
  assert.equal(reviewed.member_scope, "all_shared_ledger_members");
  assert.deepEqual(runtime.ledgerService.listVisibleMembers(ledger.id, { financeUserId: requester.id }).map((row) => row.id).sort(), members.map((row) => row.id).sort());
  assert.equal(runtime.ledgerService.authorizedLedger({ ledger_id: ledger.id }, { financeUserId: requester.id }).id, ledger.id);
  runtime.close();
});
