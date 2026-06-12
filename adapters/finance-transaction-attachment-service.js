"use strict";

const {
  MAX_CREATE_ATTACHMENTS,
  normalizeCreateAttachments,
} = require("./finance-attachment-input-service");
const { publicTransaction } = require("./finance-transaction-service");

function inputWithoutAttachments(input = {}) {
  const next = { ...input };
  delete next.attachments;
  return next;
}

function createFinanceTransactionAttachmentService({
  repository,
  transactionService,
  attachmentService,
} = {}) {
  if (!repository) throw new Error("repository_required");
  if (!transactionService?.createTransaction) throw new Error("transaction_service_required");
  if (!attachmentService?.addAttachment || !attachmentService?.validateAttachmentInput) throw new Error("attachment_service_required");

  function projectedTransaction(transaction = {}) {
    const row = repository.getTransactionProjection?.(transaction.id) || repository.getTransaction?.(transaction.id) || transaction;
    return publicTransaction(row);
  }

  function createTransactionWithAttachments(input = {}, context = {}) {
    const attachments = normalizeCreateAttachments(input);
    const transactionInput = inputWithoutAttachments(input);
    if (!attachments.length) return transactionService.createTransaction(transactionInput, context);

    for (const attachment of attachments) {
      attachmentService.validateAttachmentInput(attachment);
    }

    const created = transactionService.createTransaction(transactionInput, context);
    if (created.duplicate) {
      return {
        ...created,
        attachments: [],
        attachmentCount: 0,
      };
    }

    const transactionId = created.transaction?.id;
    if (!transactionId) throw new Error("transaction_id_required");
    const uploaded = attachments.map((attachment) => attachmentService.addAttachment({
      ...attachment,
      transactionId,
    }, context));

    return {
      ...created,
      transaction: projectedTransaction(created.transaction),
      attachments: uploaded,
      attachmentCount: uploaded.length,
    };
  }

  return {
    createTransactionWithAttachments,
  };
}

module.exports = {
  MAX_CREATE_ATTACHMENTS,
  createFinanceTransactionAttachmentService,
};
