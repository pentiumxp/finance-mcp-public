"use strict";

const { normalizeArgs } = require("../finance-mcp-args");

function dispatchRecurringTool({ name, args = {}, input = {}, context = {}, runtime } = {}) {
  if (name === "finance.create_recurring_rule") return { handled: true, result: runtime.recurringService.createRecurringRule(input, context) };
  if (name === "finance.list_recurring_rules") return { handled: true, result: { rules: runtime.recurringService.listRecurringRules(input, context) } };
  if (name === "finance.update_recurring_rule") {
    return {
      handled: true,
      result: runtime.recurringService.updateRecurringRule(input.ruleId || args.rule_id || args.ruleId, normalizeArgs(args.patch || {}), context),
    };
  }
  if (name === "finance.set_recurring_rule_status") {
    return {
      handled: true,
      result: runtime.recurringService.setRecurringRuleStatus(input.ruleId || args.rule_id || args.ruleId, input.status, context),
    };
  }
  if (name === "finance.delete_recurring_rule") {
    return {
      handled: true,
      result: runtime.recurringService.deleteRecurringRule(input.ruleId || args.rule_id || args.ruleId, input, context),
    };
  }
  if (name === "finance.generate_due_recurring_transactions") {
    return { handled: true, result: runtime.recurringService.generateDueTransactions(input, context) };
  }
  return { handled: false };
}

module.exports = {
  dispatchRecurringTool,
};
