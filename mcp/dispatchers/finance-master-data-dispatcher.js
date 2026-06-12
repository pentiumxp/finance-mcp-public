"use strict";

function dispatchMasterDataTool({ name, input = {}, context = {}, runtime, authorizedLedgerId } = {}) {
  if (name === "finance.list_accounts") {
    return { handled: true, result: { accounts: runtime.repository.listAccounts(authorizedLedgerId(input, context)) } };
  }
  if (name === "finance.list_currencies") return { handled: true, result: { currencies: runtime.repository.listCurrencies() } };
  if (name === "finance.list_categories") {
    return { handled: true, result: { categories: runtime.repository.listCategories(authorizedLedgerId(input, context), input.type || "") } };
  }
  if (name === "finance.list_members") {
    return { handled: true, result: { members: runtime.ledgerService.listVisibleMembers(authorizedLedgerId(input, context), context) } };
  }
  if (name === "finance.resolve_current_member") {
    return { handled: true, result: runtime.memberBindingService.ensureMemberForHermesContext(input, context) };
  }
  if (name === "finance.bind_member") return { handled: true, result: runtime.memberBindingService.bindMember(input, context) };
  return { handled: false };
}

module.exports = {
  dispatchMasterDataTool,
};
