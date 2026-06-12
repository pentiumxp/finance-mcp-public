"use strict";

function authorizedLedgerId(runtime, input = {}, context = {}) {
  if (runtime.ledgerService?.authorizedLedger) {
    return runtime.ledgerService.authorizedLedger(input, context).id;
  }
  return input.ledgerId || input.ledger_id || context.ledgerId || "daily";
}

function applyHermesIdentity(runtime, input = {}, context = {}, options = {}) {
  let nextContext = context;
  let nextInput = { ...input };
  if (runtime.userBindingService?.resolveUserForHermesContext) {
    const hasHermesContext = context.externalWorkspaceId || context.actorWorkspaceId || context.workspaceId || context.workspace_id;
    const resolvedUser = runtime.userBindingService.resolveUserForHermesContext(context);
    if (resolvedUser) {
      nextContext = {
        ...nextContext,
        financeUserId: resolvedUser.user.id,
        ledgerId: nextContext.ledgerId || resolvedUser.ledger.id,
      };
      nextInput.ledgerId = nextInput.ledgerId || nextInput.ledger_id || resolvedUser.ledger.id;
    } else if (hasHermesContext) {
      throw new Error("finance_user_binding_required");
    }
  }
  if (options.resolveMember === false || !runtime.memberBindingService?.ensureMemberForHermesContext) return { input: nextInput, context: nextContext };
  const resolved = runtime.memberBindingService.ensureMemberForHermesContext(nextInput, nextContext);
  if (!resolved.memberId) return { input: nextInput, context: nextContext };
  if (options.defaultMember !== false && !nextInput.memberId && !nextInput.member_id && !nextInput.memberHint && !nextInput.member_hint) {
    nextInput.memberId = resolved.memberId;
  }
  return {
    input: nextInput,
    context: {
      ...nextContext,
      financeMemberId: resolved.memberId,
      externalUserId: resolved.binding?.external_user_id || nextContext.externalUserId,
      externalWorkspaceId: resolved.binding?.external_workspace_id || nextContext.externalWorkspaceId,
      actorRef: nextContext.actorRef || resolved.binding?.external_user_id || nextContext.externalUserId || nextContext.actorWorkspaceId,
    },
  };
}

module.exports = {
  applyHermesIdentity,
  authorizedLedgerId,
};
