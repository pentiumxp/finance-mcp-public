"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestRuntime } = require("./helpers");
const { hermesExternalUserId } = require("../adapters/finance-member-binding-service");

test("owner can bind Hermes workspace to finance member", () => {
  const runtime = createTestRuntime();
  const result = runtime.memberBindingService.bindMember({
    member_id: "member_self",
    external_workspace_id: "weixin_xuxin",
  }, { role: "owner", actorRef: "owner" });
  assert.equal(result.binding.member_id, "member_self");
  assert.equal(runtime.memberBindingService.resolveMemberForHermesContext({ externalWorkspaceId: "weixin_xuxin" }), "member_self");
  runtime.close();
});

test("non-owner cannot bind member", () => {
  const runtime = createTestRuntime();
  assert.throws(() => runtime.memberBindingService.bindMember({
    member_id: "member_self",
    external_workspace_id: "weixin_xuxin",
  }, { role: "member" }), /finance_binding_denied/);
  runtime.close();
});

test("Hermes workspace user keys create stable per-user finance members without storing raw keys", () => {
  const runtime = createTestRuntime();
  const userKeyA = ["fixture", "hermes", "user", "a"].join(":");
  const userKeyB = ["fixture", "hermes", "user", "b"].join(":");
  const first = runtime.memberBindingService.ensureMemberForHermesContext({}, {
    externalWorkspaceId: "home",
    hermesWorkspaceUserKey: userKeyA,
    displayName: "User A",
  });
  const again = runtime.memberBindingService.ensureMemberForHermesContext({}, {
    externalWorkspaceId: "home",
    hermesWorkspaceUserKey: userKeyA,
    displayName: "Changed Name",
  });
  const second = runtime.memberBindingService.ensureMemberForHermesContext({}, {
    externalWorkspaceId: "home",
    hermesWorkspaceUserKey: userKeyB,
    displayName: "User B",
  });

  assert.equal(first.memberId, again.memberId);
  assert.notEqual(first.memberId, second.memberId);
  assert.equal(first.binding.external_user_id.startsWith("sha256:"), true);
  assert.equal(first.binding.external_user_id.includes(userKeyA), false);
  assert.equal(second.binding.external_workspace_id, "home");
  assert.equal(runtime.repository.listMembers("daily").some((row) => row.display_name === "User A"), true);
  assert.equal(runtime.repository.listMembers("daily").some((row) => row.display_name === "User B"), true);
  runtime.close();
});

test("Hermes identity hash is scoped by workspace", () => {
  assert.notEqual(
    hermesExternalUserId({}, { externalWorkspaceId: "home-a", hermesWorkspaceUserKey: ["same", "fixture"].join(":") }),
    hermesExternalUserId({}, { externalWorkspaceId: "home-b", hermesWorkspaceUserKey: ["same", "fixture"].join(":") }),
  );
});
