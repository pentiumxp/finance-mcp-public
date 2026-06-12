"use strict";

const crypto = require("node:crypto");

function actorRef(context = {}) {
  return context.actorRef || context.actorWorkspaceId || context.externalWorkspaceId || "local";
}

function clean(value) {
  return String(value || "").trim();
}

function firstNonEmpty(...values) {
  return values.map(clean).find(Boolean) || "";
}

function hashIdentity(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hermesWorkspaceId(input = {}, context = {}) {
  return firstNonEmpty(
    input.externalWorkspaceId,
    input.external_workspace_id,
    input.workspaceId,
    input.workspace_id,
    context.externalWorkspaceId,
    context.actorWorkspaceId,
    context.workspaceId,
    context.workspace_id,
  );
}

function hermesWorkspaceUserKey(input = {}, context = {}) {
  return firstNonEmpty(
    input.hermesWorkspaceUserKey,
    input.hermes_workspace_user_key,
    input.workspaceUserKey,
    input.workspace_user_key,
    input.userKey,
    input.user_key,
    input.principalKey,
    input.principal_key,
    context.hermesWorkspaceUserKey,
    context.hermes_workspace_user_key,
    context.workspaceUserKey,
    context.workspace_user_key,
    context.userKey,
    context.user_key,
    context.principalKey,
    context.principal_key,
    context.accessKeyFingerprint,
    context.access_key_fingerprint,
  );
}

function displayNameForHermesUser(input = {}, context = {}, externalUserId = "") {
  const explicit = firstNonEmpty(
    input.displayName,
    input.display_name,
    input.memberDisplayName,
    input.member_display_name,
    context.displayName,
    context.display_name,
    context.actorDisplayName,
    context.actor_display_name,
  );
  return explicit || `Hermes 用户 ${externalUserId.slice(-12)}`;
}

function hermesExternalUserId(input = {}, context = {}) {
  const alreadyScoped = firstNonEmpty(input.externalUserId, input.external_user_id, context.externalUserId, context.external_user_id);
  if (alreadyScoped) return alreadyScoped.startsWith("sha256:") ? alreadyScoped : `sha256:${hashIdentity(alreadyScoped)}`;
  const userKey = hermesWorkspaceUserKey(input, context);
  if (!userKey) return "";
  const workspaceId = hermesWorkspaceId(input, context) || "default";
  return `sha256:${hashIdentity(`hermes_mobile:${workspaceId}:${userKey}`)}`;
}

function createFinanceMemberBindingService({ repository } = {}) {
  if (!repository) throw new Error("repository_required");

  function bindMember(input = {}, context = {}) {
    if (context.role && context.role !== "owner") throw new Error("finance_binding_denied");
    const ledgerId = input.ledgerId || input.ledger_id || context.ledgerId || "daily";
    const memberId = input.memberId || input.member_id;
    const member = repository.listMembers(ledgerId).find((item) => item.id === memberId);
    if (!member) throw new Error("member_not_found");
    const row = repository.bindMember({
      ledgerId,
      memberId,
      provider: input.provider || "hermes_mobile",
      externalUserId: hermesExternalUserId(input, context),
      externalWorkspaceId: hermesWorkspaceId(input, context),
    });
    const audit = repository.insertAudit({
      ledgerId,
      actorRef: actorRef(context),
      action: "member.bind",
      entityType: "member_binding",
      entityId: row.id,
      after: row,
    });
    return { binding: row, auditId: audit.id };
  }

  function resolveMemberForHermesContext(context = {}) {
    const binding = repository.resolveBinding({
      provider: "hermes_mobile",
      externalWorkspaceId: context.externalWorkspaceId || context.actorWorkspaceId || "",
      externalUserId: hermesExternalUserId({}, context),
    });
    return binding?.member_id || "";
  }

  function ensureMemberForHermesContext(input = {}, context = {}) {
    const ledgerId = input.ledgerId || input.ledger_id || context.ledgerId || "daily";
    const externalWorkspaceId = hermesWorkspaceId(input, context);
    const externalUserId = hermesExternalUserId(input, context);
    if (!externalWorkspaceId && !externalUserId) return { memberId: "", binding: null, created: false };
    const existing = repository.resolveBinding({
      provider: "hermes_mobile",
      externalWorkspaceId,
      externalUserId,
    });
    if (existing) return { memberId: existing.member_id, binding: existing, created: false };
    const member = repository.upsertMember({
      ledgerId,
      displayName: displayNameForHermesUser(input, context, externalUserId),
      isHousehold: 0,
    });
    const binding = repository.bindMember({
      ledgerId,
      memberId: member.id,
      provider: "hermes_mobile",
      externalUserId,
      externalWorkspaceId,
    });
    repository.insertAudit({
      ledgerId,
      actorRef: actorRef({ ...context, externalWorkspaceId }),
      action: "member.ensure_from_hermes",
      entityType: "member_binding",
      entityId: binding.id,
      after: {
        id: binding.id,
        member_id: binding.member_id,
        provider: binding.provider,
        external_workspace_id: binding.external_workspace_id,
        external_user_id: binding.external_user_id,
      },
    });
    return { memberId: member.id, member, binding, created: true };
  }

  return { bindMember, ensureMemberForHermesContext, resolveMemberForHermesContext };
}

module.exports = {
  hermesExternalUserId,
  createFinanceMemberBindingService,
};
