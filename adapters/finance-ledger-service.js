"use strict";

const crypto = require("node:crypto");

function defaultId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function clean(value) {
  return String(value || "").trim();
}

function requireWrite(context = {}) {
  if (context.readOnly) throw new Error("finance_write_denied");
}

function isScopedContext(context = {}) {
  return Boolean(context.financeUserId || context.externalWorkspaceId || context.externalUserId);
}

function ownerUserId(context = {}) {
  if (!context.financeUserId && isScopedContext(context)) throw new Error("finance_user_context_required");
  return context.financeUserId || "user_xuxin";
}

const LEDGER_TEMPLATES = [
  { id: "daily", name: "\u65e5\u5e38\u8d26\u672c", description: "\u65e5\u5e38\u8d26\u672c\uff0cDIY\u770b\u4f60\u7684" },
  { id: "favor", name: "\u4eba\u60c5\u8d26\u672c", description: "\u82b1\u51fa\u53bb\u7684\u4efd\u5b50\u94b1\uff0c\u65e9\u665a\u8981\u8fd8\u7684" },
  { id: "travel", name: "\u65c5\u884c\u8d26\u672c", description: "\u4e14\u8d70\u4e14\u8bb0\u8d26\uff0c\u4e14\u8bb0\u4e14\u73cd\u60dc" },
  { id: "baby", name: "\u5b9d\u5b9d\u8d26\u672c", description: "\u8bb0\u5f55\u5b9d\u5b9d\u6210\u957f\u6bcf\u4e00\u6b65" },
  { id: "renovation", name: "\u88c5\u4fee\u8d26\u672c", description: "\u6d1e\u5bdf\u88c5\u4fee\u7701\u94b1\u95e8\u9053" },
  { id: "car", name: "\u6c7d\u8f66\u8d26\u672c", description: "\u660e\u767d\u7528\u8f66\uff0c\u6e05\u695a\u4fdd\u517b" },
  { id: "business", name: "\u751f\u610f\u8d26\u672c", description: "\u4ece\u8d26\u672c\u91cc\u627e\u751f\u610f\u7ecf" },
];

function findTemplate(templateId) {
  return LEDGER_TEMPLATES.find((row) => row.id === clean(templateId)) || LEDGER_TEMPLATES[0];
}

function boundedJoinRequestPayload({ request, ledger, requester, target }) {
  return {
    type: "finance.ledger_join_request",
    request_id: request.id,
    ledger: {
      id: ledger.id,
      name: ledger.name,
    },
    requester: {
      finance_user_id: requester.id,
      display_name: requester.display_name || requester.user_key || requester.id,
    },
    target: {
      finance_user_id: target.id,
      display_name: target.display_name || target.user_key || target.id,
    },
    requested_role: request.requested_role,
    status: request.status,
    created_at: request.created_at,
  };
}

function boundedInvitationPayload({ invitation, ledger, inviter, target }) {
  return {
    type: "finance.ledger_invitation_request",
    invitation_id: invitation.id,
    ledger: {
      id: ledger.id,
      name: ledger.name,
    },
    inviter: {
      finance_user_id: inviter.id,
      display_name: inviter.display_name || inviter.user_key || inviter.id,
    },
    target: {
      finance_user_id: target.id,
      display_name: target.display_name || target.user_key || target.id,
    },
    role: invitation.role,
    status: invitation.status,
    created_at: invitation.created_at,
  };
}

function seedLedgerDefaults(repository, ledgerId) {
  repository.upsertCurrency({ code: "CNY", displayName: "人民币", symbol: "¥", scale: 2, sortOrder: 10 });
  repository.upsertAccount({ ledgerId, name: "现金", type: "cash", currency: "CNY" });
  repository.upsertAccount({ ledgerId, name: "银行卡", type: "bank", currency: "CNY" });
  repository.upsertAccount({ ledgerId, name: "应付", type: "payable", currency: "CNY", isLiability: 1 });
  repository.upsertMember({ ledgerId, displayName: "自己", isHousehold: 0 });
  repository.upsertMember({ ledgerId, displayName: "家庭公用", isHousehold: 1 });
  for (const row of [
    ["expense", "餐饮", 10],
    ["expense", "交通", 20],
    ["expense", "居家", 30],
    ["expense", "服饰", 40],
    ["expense", "医疗", 50],
    ["income", "工资薪水", 10],
    ["income", "奖金", 20],
    ["income", "退款", 30],
  ]) {
    repository.upsertCategory({ ledgerId, type: row[0], name: row[1], sortOrder: row[2] });
  }
}

function createFinanceLedgerService({ repository, idGenerator = defaultId } = {}) {
  if (!repository) throw new Error("repository_required");

  function listLedgers(context = {}) {
    return repository.listLedgersByUser(ownerUserId(context));
  }

  function assertLedgerAccess(ledgerId, context = {}) {
    const ledger = repository.getLedger(ledgerId || "");
    if (!ledger) throw new Error("finance_ledger_not_found");
    const financeUserId = ownerUserId(context);
    if (ledger.owner_user_id !== financeUserId && !repository.getLedgerMembership(ledger.id, financeUserId)) {
      throw new Error("finance_ledger_access_denied");
    }
    return ledger;
  }

  function authorizedLedger(input = {}, context = {}) {
    const requested = clean(input.ledgerId || input.ledger_id || context.ledgerId);
    if (requested) {
      const ledger = repository.getLedger(requested);
      const financeUserId = ownerUserId(context);
      if (ledger?.owner_user_id === financeUserId || repository.getLedgerMembership(ledger?.id, financeUserId)) return ledger;
      if (isScopedContext(context) && context.ledgerId && context.ledgerId !== requested) return assertLedgerAccess(context.ledgerId, context);
      throw new Error(ledger ? "finance_ledger_access_denied" : "finance_ledger_not_found");
    }
    const ledgers = listLedgers(context);
    if (ledgers.length) return ledgers[0];
    return createLedger({ name: "日常账本", id: ownerUserId(context) === "user_xuxin" ? "daily" : "" }, context);
  }

  function contextForLedger(input = {}, context = {}) {
    const ledger = authorizedLedger(input, context);
    return { ...context, ledgerId: ledger.id };
  }

  function createLedger(input = {}, context = {}) {
    requireWrite(context);
    const template = findTemplate(input.templateId || input.template_id);
    const name = clean(input.name || input.title || input.ledgerName || input.ledger_name) || template.name;
    if (!name) throw new Error("ledger_name_required");
    const existing = repository.findLedgerByName(ownerUserId(context), name);
    if (existing) return { ledger: existing, created: false };
    const id = clean(input.id || input.ledgerId || input.ledger_id) || idGenerator("ledger");
    const ledger = repository.upsertLedger({
      id,
      ownerUserId: ownerUserId(context),
      name,
      baseCurrency: clean(input.baseCurrency || input.base_currency) || "CNY",
      timezone: clean(input.timezone) || "Asia/Shanghai",
      templateId: template.id,
      coverRef: clean(input.coverRef || input.cover_ref),
      monthStartDay: Number(input.monthStartDay || input.month_start_day || 1) || 1,
    });
    seedLedgerDefaults(repository, ledger.id);
    repository.insertAudit({
      ledgerId: ledger.id,
      actorRef: context.actorRef || "ledger-service",
      action: "ledger.create",
      entityType: "ledger",
      entityId: ledger.id,
      after: { id: ledger.id, owner_user_id: ledger.owner_user_id, name: ledger.name },
    });
    return { ledger, created: true };
  }

  function listLedgerTemplates() {
    return LEDGER_TEMPLATES.map((row) => ({ ...row }));
  }

  function roleForLedger(ledger, context = {}) {
    const financeUserId = ownerUserId(context);
    if (ledger.owner_user_id === financeUserId) return "owner";
    return repository.getLedgerMembership(ledger.id, financeUserId)?.role || "";
  }

  function listVisibleMembers(ledgerId, context = {}) {
    const ledger = assertLedgerAccess(ledgerId, context);
    return repository.listMembers(ledger.id);
  }

  function getLedgerShare(ledgerId, context = {}) {
    const ledger = assertLedgerAccess(ledgerId, context);
    const role = roleForLedger(ledger, context);
    const memberDimensions = repository.listMembers(ledger.id);
    const sharedUserIds = new Set(repository.listLedgerMemberships(ledger.id).map((row) => row.finance_user_id));
    const financeUserCandidates = role === "owner"
      ? repository.listFinanceUsers()
        .filter((user) => user.id !== ownerUserId(context) && !sharedUserIds.has(user.id))
        .map((user) => ({
          id: user.id,
          user_key: user.user_key,
          display_name: user.display_name,
          status: user.status,
        }))
      : [];
    return {
      ledger,
      access_role: role,
      shared_users: role === "owner" ? repository.listLedgerMemberships(ledger.id) : [],
      finance_user_candidates: financeUserCandidates,
      member_candidates: memberDimensions,
      member_scope: "all_shared_ledger_members",
    };
  }

  function shareLedger(input = {}, context = {}) {
    requireWrite(context);
    const ledger = assertLedgerAccess(input.ledgerId || input.ledger_id, context);
    if (roleForLedger(ledger, context) !== "owner") throw new Error("finance_ledger_owner_required");
    const financeUserKey = clean(input.financeUserKey || input.finance_user_key || input.userKey || input.user_key);
    const resolvedUser = financeUserKey ? repository.getFinanceUserByKey(financeUserKey) : null;
    const financeUserId = clean(input.financeUserId || input.finance_user_id || resolvedUser?.id);
    if (!financeUserId) throw new Error("finance_user_required");
    if (!repository.getFinanceUser(financeUserId)) throw new Error("finance_user_not_found");
    if (financeUserId === ownerUserId(context)) throw new Error("finance_ledger_share_self_forbidden");
    const membership = repository.upsertLedgerMembership({
      ledgerId: ledger.id,
      financeUserId,
      role: clean(input.role) || "viewer",
      invitedByUserId: ownerUserId(context),
    });
    repository.insertAudit({
      ledgerId: ledger.id,
      actorRef: context.actorRef || "ledger-service",
      action: "ledger.share",
      entityType: "ledger_membership",
      entityId: membership.id,
      after: { ledger_id: ledger.id, finance_user_id: financeUserId, role: membership.role, member_scope: "all_shared_ledger_members" },
    });
    return { membership, user: repository.getFinanceUser(financeUserId), member_scope: "all_shared_ledger_members" };
  }

  function createLedgerInvitation(input = {}, context = {}) {
    requireWrite(context);
    const ledger = assertLedgerAccess(input.ledgerId || input.ledger_id, context);
    if (roleForLedger(ledger, context) !== "owner") throw new Error("finance_ledger_owner_required");
    const inviter = repository.getFinanceUser(ownerUserId(context));
    if (!inviter) throw new Error("finance_user_not_found");
    const targetFinanceUserKey = clean(input.targetFinanceUserKey || input.target_finance_user_key || input.financeUserKey || input.finance_user_key);
    const resolvedTarget = targetFinanceUserKey ? repository.getFinanceUserByKey(targetFinanceUserKey) : null;
    const targetFinanceUserId = clean(input.targetFinanceUserId || input.target_finance_user_id || input.financeUserId || input.finance_user_id || resolvedTarget?.id);
    if (!targetFinanceUserId) throw new Error("target_finance_user_required");
    const target = repository.getFinanceUser(targetFinanceUserId);
    if (!target) throw new Error("target_finance_user_not_found");
    if (target.id === inviter.id) throw new Error("finance_ledger_invite_self_forbidden");
    if (repository.getLedgerMembership(ledger.id, target.id)) throw new Error("finance_ledger_already_shared");
    const invitation = repository.insertLedgerInvitation({
      ledgerId: ledger.id,
      inviterFinanceUserId: inviter.id,
      targetFinanceUserId: target.id,
      role: clean(input.role) || "viewer",
      memberIds: [],
    });
    repository.insertAudit({
      ledgerId: ledger.id,
      actorRef: context.actorRef || "ledger-service",
      action: "ledger.invitation.create",
      entityType: "ledger_invitation",
      entityId: invitation.id,
      after: { id: invitation.id, ledger_id: ledger.id, target_finance_user_id: target.id, role: invitation.role, member_scope: "all_shared_ledger_members" },
    });
    return {
      invitation,
      target_user: {
        id: target.id,
        user_key: target.user_key,
        display_name: target.display_name,
      },
      hermes_inbox_event: boundedInvitationPayload({ invitation, ledger, inviter, target }),
    };
  }

  function listLedgerInvitations(input = {}, context = {}) {
    const status = clean(input.status) || "pending";
    const invitations = repository.listLedgerInvitations({
      targetFinanceUserId: ownerUserId(context),
      status,
    });
    return {
      invitations: invitations.map((row) => ({
        id: row.id,
        ledger_id: row.ledger_id,
        ledger_name: row.ledger_name || row.ledger_id,
        ledger_template_id: row.ledger_template_id || "",
        inviter_finance_user_id: row.inviter_finance_user_id,
        inviter_display_name: row.inviter_display_name || row.inviter_user_key || row.inviter_finance_user_id,
        role: row.role,
        status: row.status,
        created_at: row.created_at,
        member_scope: "all_shared_ledger_members",
      })),
      member_scope: "all_shared_ledger_members",
    };
  }

  function acceptLedgerInvitation(input = {}, context = {}) {
    requireWrite(context);
    const invitation = repository.getLedgerInvitation(clean(input.invitationId || input.invitation_id));
    if (!invitation) throw new Error("finance_ledger_invitation_not_found");
    if (invitation.status !== "pending") throw new Error("finance_ledger_invitation_closed");
    const ledger = repository.getLedger(invitation.ledger_id);
    if (!ledger) throw new Error("finance_ledger_not_found");
    const targetFinanceUserId = ownerUserId(context);
    if (invitation.target_finance_user_id && invitation.target_finance_user_id !== targetFinanceUserId) {
      throw new Error("finance_ledger_invitation_target_mismatch");
    }
    if (ledger.owner_user_id === targetFinanceUserId || repository.getLedgerMembership(ledger.id, targetFinanceUserId)) {
      throw new Error("finance_ledger_already_accessible");
    }
    const accepted = repository.acceptLedgerInvitation({ id: invitation.id, targetFinanceUserId });
    const membership = repository.upsertLedgerMembership({
      ledgerId: ledger.id,
      financeUserId: targetFinanceUserId,
      role: invitation.role || "viewer",
      invitedByUserId: invitation.inviter_finance_user_id,
    });
    repository.insertAudit({
      ledgerId: ledger.id,
      actorRef: context.actorRef || `finance-user:${targetFinanceUserId}`,
      action: "ledger.invitation.accept",
      entityType: "ledger_invitation",
      entityId: invitation.id,
      after: { id: invitation.id, target_finance_user_id: targetFinanceUserId, member_scope: "all_shared_ledger_members" },
    });
    return { invitation: accepted, membership, member_scope: "all_shared_ledger_members" };
  }

  function requestLedgerJoin(input = {}, context = {}) {
    requireWrite(context);
    const ledgerId = clean(input.ledgerId || input.ledger_id);
    const ledger = repository.getLedger(ledgerId);
    if (!ledger) throw new Error("finance_ledger_not_found");
    const requesterFinanceUserId = ownerUserId(context);
    if (ledger.owner_user_id === requesterFinanceUserId || repository.getLedgerMembership(ledger.id, requesterFinanceUserId)) {
      throw new Error("finance_ledger_already_accessible");
    }
    const requester = repository.getFinanceUser(requesterFinanceUserId);
    const target = repository.getFinanceUser(ledger.owner_user_id);
    if (!requester || !target) throw new Error("finance_user_not_found");
    const request = repository.insertLedgerJoinRequest({
      ledgerId: ledger.id,
      requesterFinanceUserId,
      targetFinanceUserId: ledger.owner_user_id,
      requestedRole: clean(input.role) || "viewer",
      requestedMemberIds: [],
      message: clean(input.message),
    });
    repository.insertAudit({
      ledgerId: ledger.id,
      actorRef: context.actorRef || `finance-user:${requesterFinanceUserId}`,
      action: "ledger.join_request.create",
      entityType: "ledger_join_request",
      entityId: request.id,
      after: { id: request.id, ledger_id: ledger.id, requester_finance_user_id: requesterFinanceUserId, target_finance_user_id: ledger.owner_user_id },
    });
    return {
      request,
      hermes_inbox_event: boundedJoinRequestPayload({ request, ledger, requester, target }),
    };
  }

  function listLedgerJoinRequests(input = {}, context = {}) {
    const status = clean(input.status || "pending");
    return {
      requests: repository.listLedgerJoinRequests({
        targetFinanceUserId: ownerUserId(context),
        status,
      }),
    };
  }

  function reviewLedgerJoinRequest(input = {}, context = {}) {
    requireWrite(context);
    const request = repository.getLedgerJoinRequest(clean(input.requestId || input.request_id));
    if (!request) throw new Error("finance_ledger_join_request_not_found");
    const ledger = repository.getLedger(request.ledger_id);
    if (!ledger) throw new Error("finance_ledger_not_found");
    if (ledger.owner_user_id !== ownerUserId(context)) throw new Error("finance_ledger_owner_required");
    if (request.status !== "pending") throw new Error("finance_ledger_join_request_closed");
    const decision = clean(input.decision || input.status);
    if (!["approve", "approved", "reject", "rejected"].includes(decision)) throw new Error("finance_ledger_join_decision_invalid");
    const approved = decision === "approve" || decision === "approved";
    const reviewed = repository.updateLedgerJoinRequestStatus({
      id: request.id,
      status: approved ? "approved" : "rejected",
      decidedByUserId: ownerUserId(context),
    });
    let membership = null;
    if (approved) {
      membership = repository.upsertLedgerMembership({
        ledgerId: ledger.id,
        financeUserId: request.requester_finance_user_id,
        role: clean(input.role) || request.requested_role || "viewer",
        invitedByUserId: ownerUserId(context),
      });
    }
    repository.insertAudit({
      ledgerId: ledger.id,
      actorRef: context.actorRef || "ledger-service",
      action: approved ? "ledger.join_request.approve" : "ledger.join_request.reject",
      entityType: "ledger_join_request",
      entityId: request.id,
      after: { id: request.id, status: reviewed.status, requester_finance_user_id: request.requester_finance_user_id, member_scope: "all_shared_ledger_members" },
    });
    return { request: reviewed, membership, member_scope: approved ? "all_shared_ledger_members" : "" };
  }

  function ensureLedgerForName(name, context = {}) {
    const cleanName = clean(name);
    if (!cleanName) return authorizedLedger({}, context);
    const existing = repository.findLedgerByName(ownerUserId(context), cleanName);
    if (existing) return existing;
    return createLedger({ name: cleanName }, context).ledger;
  }

  return {
    assertLedgerAccess,
    acceptLedgerInvitation,
    authorizedLedger,
    contextForLedger,
    createLedgerInvitation,
    createLedger,
    ensureLedgerForName,
    getLedgerShare,
    listLedgerInvitations,
    listLedgerTemplates,
    listLedgerJoinRequests,
    listLedgers,
    listVisibleMembers,
    requestLedgerJoin,
    reviewLedgerJoinRequest,
    seedLedgerDefaults: (ledgerId) => seedLedgerDefaults(repository, ledgerId),
    shareLedger,
  };
}

module.exports = {
  createFinanceLedgerService,
  LEDGER_TEMPLATES,
  seedLedgerDefaults,
};
