"use strict";

const { normalizeArgs } = require("../finance-mcp-args");

function dispatchTransactionTool({ name, args = {}, input = {}, context = {}, runtime } = {}) {
  if (name === "finance.create_transaction") {
    if (runtime.transactionAttachmentService?.createTransactionWithAttachments) {
      return { handled: true, result: runtime.transactionAttachmentService.createTransactionWithAttachments(input, context) };
    }
    return { handled: true, result: runtime.transactionService.createTransaction(input, context) };
  }
  if (name === "finance.list_transactions") {
    return { handled: true, result: { transactions: runtime.transactionService.listTransactions(input, context) } };
  }
  if (name === "finance.add_transaction_attachment") {
    return { handled: true, result: runtime.attachmentService.addAttachment(input, context) };
  }
  if (name === "finance.update_transaction") {
    return {
      handled: true,
      result: runtime.transactionService.updateTransaction(args.transaction_id || args.transactionId, normalizeArgs(args.patch || {}), context),
    };
  }
  if (name === "finance.void_transaction") {
    return {
      handled: true,
      result: runtime.transactionService.voidTransaction(args.transaction_id || args.transactionId, args.reason || "", context),
    };
  }
  return { handled: false };
}

module.exports = {
  dispatchTransactionTool,
};
