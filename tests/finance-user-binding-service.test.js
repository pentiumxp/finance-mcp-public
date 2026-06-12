"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestRuntime } = require("./helpers");
const { createFinanceMcpDispatcher } = require("../mcp/finance-mcp-server");

test("default xuxin user owns the imported daily ledger", () => {
  const runtime = createTestRuntime();
  const user = runtime.repository.getFinanceUserByKey("xuxin");
  const ledger = runtime.repository.getLedger("daily");
  const binding = runtime.repository.resolveFinanceUserBinding({
    provider: "hermes_mobile",
    externalWorkspaceId: process.env.FINANCE_HERMES_OWNER_WORKSPACE_ID || "owner",
    externalUserId: "",
  });

  assert.equal(user.id, "user_xuxin");
  assert.equal(ledger.owner_user_id, "user_xuxin");
  assert.equal(binding.finance_user_id, "user_xuxin");
  runtime.close();
});

test("approved Hermes workspace creates an isolated finance user and ledger", () => {
  const runtime = createTestRuntime();
  const result = runtime.userBindingService.registerHermesWorkspaceUser({
    target_workspace_id: "family-finance",
    display_name: "Family Finance",
  }, { role: "owner", actorRef: "admin" });

  assert.equal(result.created, true);
  assert.notEqual(result.user.id, "user_xuxin");
  assert.notEqual(result.ledger.id, "daily");
  assert.equal(result.ledger.owner_user_id, result.user.id);
  assert.equal(runtime.repository.listAccounts(result.ledger.id).length >= 3, true);
  assert.equal(runtime.repository.listMembers(result.ledger.id).some((row) => row.display_name === "自己"), true);

  const resolved = runtime.userBindingService.resolveUserForHermesContext({ externalWorkspaceId: "family-finance" });
  assert.equal(resolved.user.id, result.user.id);
  assert.equal(resolved.ledger.id, result.ledger.id);
  runtime.close();
});

test("finance access tokens are stored hashed and resolve to user ledger", () => {
  const runtime = createTestRuntime();
  const issued = runtime.userBindingService.createAccessToken({
    finance_user_key: "xuxin",
    label: "local login",
  }, { role: "owner" });

  assert.match(issued.accessToken, /^fin_/);
  const tokenRows = runtime.repository.db.prepare("SELECT token_hash FROM finance_access_tokens").all();
  assert.equal(tokenRows.length, 1);
  assert.equal(tokenRows[0].token_hash.includes(issued.accessToken), false);
  assert.equal(tokenRows[0].token_hash.startsWith("sha256:"), true);

  const resolved = runtime.userBindingService.resolveAccessToken(issued.accessToken);
  assert.equal(resolved.user.id, "user_xuxin");
  assert.equal(resolved.ledger.id, "daily");
  runtime.close();
});

test("unknown Hermes workspace cannot fall back to xuxin daily ledger", async () => {
  const runtime = createTestRuntime();
  const dispatcher = createFinanceMcpDispatcher(runtime);
  await assert.rejects(
    () => dispatcher.dispatch("finance.list_transactions", {}, { externalWorkspaceId: "unapproved-workspace" }),
    /finance_user_binding_required/,
  );
  runtime.close();
});
