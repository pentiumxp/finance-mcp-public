"use strict";

function dispatchLedgerTool({ name, input = {}, context = {}, runtime } = {}) {
  if (name === "finance.list_ledgers") return { handled: true, result: { ledgers: runtime.ledgerService.listLedgers(context) } };
  if (name === "finance.create_ledger") return { handled: true, result: runtime.ledgerService.createLedger(input, context) };
  if (name === "finance.list_ledger_templates") return { handled: true, result: { templates: runtime.ledgerService.listLedgerTemplates() } };
  if (name === "finance.get_ledger_share") return { handled: true, result: runtime.ledgerService.getLedgerShare(input.ledgerId, context) };
  if (name === "finance.share_ledger") return { handled: true, result: runtime.ledgerService.shareLedger(input, context) };
  if (name === "finance.request_ledger_join") return { handled: true, result: runtime.ledgerService.requestLedgerJoin(input, context) };
  if (name === "finance.create_ledger_invitation") return { handled: true, result: runtime.ledgerService.createLedgerInvitation(input, context) };
  if (name === "finance.accept_ledger_invitation") return { handled: true, result: runtime.ledgerService.acceptLedgerInvitation(input, context) };
  if (name === "finance.list_ledger_join_requests") return { handled: true, result: runtime.ledgerService.listLedgerJoinRequests(input, context) };
  if (name === "finance.review_ledger_join_request") return { handled: true, result: runtime.ledgerService.reviewLedgerJoinRequest(input, context) };
  return { handled: false };
}

module.exports = {
  dispatchLedgerTool,
};
