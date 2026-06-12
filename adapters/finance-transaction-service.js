"use strict";

const crypto = require("node:crypto");
const {
  currencyScale,
  formatMinor,
  normalizeCurrency,
  parseAmountToMinor,
} = require("./finance-money");

function defaultId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function actorRef(context = {}) {
  return context.actorRef || context.actorWorkspaceId || context.externalWorkspaceId || "local";
}

function requireWrite(context = {}) {
  if (context.readOnly) throw new Error("finance_write_denied");
}

function isScopedContext(context = {}) {
  return Boolean(context.financeUserId || context.externalWorkspaceId || context.externalUserId);
}

function normalizeLedgerId(input, context = {}) {
  if (isScopedContext(context)) {
    if (!context.ledgerId) throw new Error("finance_ledger_context_required");
    return context.ledgerId;
  }
  return input.ledgerId || input.ledger_id || context.ledgerId || "daily";
}

function assertLedgerAccess(ledgerId, context = {}) {
  if (isScopedContext(context) && ledgerId !== context.ledgerId) throw new Error("finance_ledger_access_denied");
}

function normalizeType(value) {
  const type = String(value || "").trim();
  if (!["expense", "income", "transfer"].includes(type)) throw new Error("invalid_transaction_type");
  return type;
}

function accountImpact(transaction) {
  const amount = Number(transaction.amountMinor || transaction.amount_minor || 0);
  const accountId = transaction.accountId || transaction.account_id;
  const targetAccountId = transaction.targetAccountId || transaction.target_account_id || "";
  if (transaction.type === "expense") return [{ accountId, deltaMinor: -amount }];
  if (transaction.type === "income") return [{ accountId, deltaMinor: amount }];
  if (transaction.type === "transfer") {
    if (!targetAccountId || targetAccountId === accountId) throw new Error("invalid_transfer_accounts");
    return [
      { accountId, deltaMinor: -amount },
      { accountId: targetAccountId, deltaMinor: amount },
    ];
  }
  return [];
}

function findByHint(rows, hint, fallback = "") {
  const text = String(hint || "").trim().toLowerCase();
  if (!text) return fallback;
  const exact = rows.find((row) => String(row.name || row.display_name || "").toLowerCase() === text);
  if (exact) return exact.id;
  const partial = rows.find((row) => String(row.name || row.display_name || "").toLowerCase().includes(text));
  return partial?.id || fallback;
}

function idInRows(rows, id) {
  return rows.some((row) => row.id === id);
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function resolveScopedId({ rows, explicitId, hint, fallback = "", errorCode }) {
  if (explicitId) {
    if (!idInRows(rows, explicitId)) throw new Error(errorCode);
    return explicitId;
  }
  return findByHint(rows, hint, fallback);
}

function publicTransaction(row, money = {}) {
  if (!row) return null;
  const currency = row.currency || "CNY";
  const amountMinor = Number(row.amount_minor ?? row.amountMinor ?? 0);
  const ledgerId = row.ledger_id || row.ledgerId;
  const firstImageAttachmentId = row.first_image_attachment_id || row.firstImageAttachmentId || "";
  const ledgerQuery = encodeURIComponent(ledgerId || "");
  const firstImageUrl = firstImageAttachmentId
    ? `/api/finance/attachments/${encodeURIComponent(firstImageAttachmentId)}?ledger_id=${ledgerQuery}`
    : "";
  const firstImageThumbnailUrl = firstImageAttachmentId
    ? `/api/finance/attachments/${encodeURIComponent(firstImageAttachmentId)}/thumbnail?ledger_id=${ledgerQuery}`
    : "";
  return {
    id: row.id,
    ledgerId,
    type: row.type,
    status: row.status,
    amountMinor,
    scale: row.scale ?? 2,
    amount: formatMinor(amountMinor, currency, { scale: row.scale ?? 2 }),
    currency,
    occurredAt: row.occurred_at || row.occurredAt,
    categoryId: row.category_id || row.categoryId || "",
    categoryName: row.category_name || money.categoryName || "",
    accountId: row.account_id || row.accountId || "",
    accountName: row.account_name || money.accountName || "",
    targetAccountId: row.target_account_id || row.targetAccountId || "",
    targetAccountName: row.target_account_name || "",
    memberId: row.booked_by_member_id || row.bookedByMemberId || "",
    memberName: row.member_name || "",
    merchantName: row.merchant_name || "",
    note: row.note || "",
    tags: parseJsonArray(row.tags_json || row.tags),
    source: row.source || "",
    sourceRef: row.source_ref || row.sourceRef || "",
    attachmentCount: Number(row.attachment_count ?? row.attachmentCount ?? 0),
    imageAttachmentCount: Number(row.image_attachment_count ?? row.imageAttachmentCount ?? 0),
    firstImageAttachmentId,
    firstImageUrl,
    firstImageThumbnailUrl,
    createdAt: row.created_at || row.createdAt || "",
    updatedAt: row.updated_at || row.updatedAt || "",
  };
}

function createFinanceTransactionService({ repository, clock = nowIso, idGenerator = defaultId } = {}) {
  if (!repository) throw new Error("repository_required");

  function resolveInput(input = {}, context = {}) {
    const ledgerId = normalizeLedgerId(input, context);
    const type = normalizeType(input.type);
    const currency = normalizeCurrency(input.currency || "CNY");
    const scale = currencyScale(currency);
    const amountMinor = Number.isInteger(input.amountMinor)
      ? input.amountMinor
      : parseAmountToMinor(input.amount, currency, { scale });
    if (amountMinor < 0 || (amountMinor === 0 && input.allowZeroAmount !== true)) {
      throw new Error("amount_must_be_positive");
    }
    const accounts = repository.listAccounts(ledgerId);
    const categories = repository.listCategories(ledgerId, type === "income" ? "income" : "expense");
    const members = repository.listMembers(ledgerId);
    const accountId = resolveScopedId({
      rows: accounts,
      explicitId: input.accountId || input.account_id,
      hint: input.accountHint || input.account_hint,
      fallback: accounts[0]?.id,
      errorCode: "account_not_in_ledger",
    });
    const targetAccountId = resolveScopedId({
      rows: accounts,
      explicitId: input.targetAccountId || input.target_account_id,
      hint: input.targetAccountHint || input.target_account_hint,
      fallback: "",
      errorCode: "target_account_not_in_ledger",
    });
    if (!accountId) throw new Error("account_required");
    const categoryId = resolveScopedId({
      rows: categories,
      explicitId: input.categoryId || input.category_id,
      hint: input.categoryHint || input.category_hint,
      fallback: "",
      errorCode: "category_not_in_ledger",
    });
    const memberId = resolveScopedId({
      rows: members,
      explicitId: input.memberId || input.member_id || input.bookedByMemberId || input.booked_by_member_id,
      hint: input.memberHint || input.member_hint,
      fallback: members[0]?.id || "",
      errorCode: "member_not_in_ledger",
    });
    const merchant = repository.upsertMerchant({ ledgerId, name: input.merchant || input.merchantName || "" });
    const tagIds = [];
    for (const tagName of Array.isArray(input.tags) ? input.tags : []) {
      const tag = repository.upsertTag({ ledgerId, name: tagName });
      if (tag?.id) tagIds.push(tag.id);
    }
    return {
      ledgerId,
      type,
      amountMinor,
      scale,
      currency,
      occurredAt: input.occurredAt || input.occurred_at || clock(),
      categoryId,
      accountId,
      targetAccountId,
      bookedByMemberId: memberId,
      payerMemberId: input.payerMemberId || input.payer_member_id || memberId,
      merchantId: merchant?.id || "",
      note: String(input.note || ""),
      source: String(input.source || context.source || "local"),
      sourceRef: String(input.sourceRef || input.source_ref || input.rawText || input.raw_text || ""),
      idempotencyKey: String(input.idempotencyKey || input.idempotency_key || ""),
      tagIds,
    };
  }

  function createTransaction(input = {}, context = {}) {
    requireWrite(context);
    const row = resolveInput(input, context);
    const existing = repository.findTransactionByIdempotency(row.ledgerId, row.idempotencyKey);
    if (existing) {
      return {
        transaction: publicTransaction(repository.getTransactionProjection?.(existing.id) || existing),
        duplicate: true,
        auditId: "",
        requiresConfirmation: false,
        resolutionWarnings: [],
      };
    }
    return repository.transaction(() => {
      const ts = clock();
      const inserted = repository.insertTransaction({
        ...row,
        id: input.id || idGenerator("txn"),
        createdAt: ts,
        updatedAt: ts,
      });
      for (const impact of accountImpact(inserted)) {
        repository.updateAccountBalance(impact.accountId, impact.deltaMinor);
      }
      repository.replaceTransactionTags(inserted.id, row.tagIds);
      const projected = repository.getTransactionProjection?.(inserted.id) || inserted;
      const audit = repository.insertAudit({
        ledgerId: row.ledgerId,
        actorRef: actorRef(context),
        action: "transaction.create",
        entityType: "transaction",
        entityId: inserted.id,
        after: inserted,
      });
      return {
        transaction: publicTransaction(projected),
        duplicate: false,
        auditId: audit.id,
        requiresConfirmation: false,
        resolutionWarnings: [],
      };
    });
  }

  function listTransactions(filters = {}, context = {}) {
    const ledgerId = normalizeLedgerId(filters, context);
    return repository.listTransactions({ ...filters, ledgerId }).map(publicTransaction);
  }

  function updateTransaction(transactionId, patch = {}, context = {}) {
    requireWrite(context);
    const shouldReplaceTags = Object.prototype.hasOwnProperty.call(patch, "tags");
    return repository.transaction(() => {
      const before = repository.getTransaction(transactionId);
      if (!before) throw new Error("transaction_not_found");
      assertLedgerAccess(before.ledgerId, context);
      if (before.status !== "active") throw new Error("transaction_not_active");
      const merged = { ...before, ...patch, ledgerId: before.ledgerId };
      if (patch.amount !== undefined && patch.amountMinor === undefined && patch.amount_minor === undefined) {
        delete merged.amountMinor;
        delete merged.amount_minor;
      }
      const resolved = resolveInput(merged, context);
      for (const impact of accountImpact(before)) repository.updateAccountBalance(impact.accountId, -impact.deltaMinor);
      const after = repository.updateTransactionRow(transactionId, resolved);
      for (const impact of accountImpact(after)) repository.updateAccountBalance(impact.accountId, impact.deltaMinor);
      if (shouldReplaceTags) repository.replaceTransactionTags(transactionId, resolved.tagIds || []);
      const projected = repository.getTransactionProjection?.(transactionId) || after;
      const audit = repository.insertAudit({
        ledgerId: before.ledgerId,
        actorRef: actorRef(context),
        action: "transaction.update",
        entityType: "transaction",
        entityId: transactionId,
        before,
        after,
      });
      return { transaction: publicTransaction(projected), auditId: audit.id };
    });
  }

  function voidTransaction(transactionId, reason = "", context = {}) {
    requireWrite(context);
    return repository.transaction(() => {
      const before = repository.getTransaction(transactionId);
      if (!before) throw new Error("transaction_not_found");
      assertLedgerAccess(before.ledgerId, context);
      if (before.status !== "active") {
        const projected = repository.getTransactionProjection?.(transactionId) || before;
        return { transaction: publicTransaction(projected), auditId: "", alreadyVoided: true };
      }
      for (const impact of accountImpact(before)) repository.updateAccountBalance(impact.accountId, -impact.deltaMinor);
      const after = repository.setTransactionVoided(transactionId);
      const projected = repository.getTransactionProjection?.(transactionId) || after;
      const audit = repository.insertAudit({
        ledgerId: before.ledgerId,
        actorRef: actorRef(context),
        action: "transaction.void",
        entityType: "transaction",
        entityId: transactionId,
        before,
        after: { ...after, reason },
      });
      return { transaction: publicTransaction(projected), auditId: audit.id, alreadyVoided: false };
    });
  }

  return {
    createTransaction,
    listTransactions,
    updateTransaction,
    voidTransaction,
  };
}

module.exports = {
  accountImpact,
  assertLedgerAccess,
  createFinanceTransactionService,
  normalizeLedgerId,
  publicTransaction,
};
