"use strict";

const { publicTransaction } = require("./finance-transaction-service");

const PLUGIN_ID = "finance";
const SUPPORTED_TYPES = [
  {
    object_type: "transaction",
    description: "Permission-checked Finance transaction reference.",
    id_field: "transaction_id",
  },
  {
    object_type: "account",
    description: "Permission-checked Finance account reference.",
    id_field: "account_id",
  },
  {
    object_type: "category",
    description: "Permission-checked Finance category reference.",
    id_field: "category_id",
  },
];

function clean(value) {
  return String(value || "").trim();
}

function workspaceId(context = {}) {
  return clean(context.externalWorkspaceId || context.workspaceId || context.workspace_id || context.actorWorkspaceId) || "local";
}

function truncate(value, max = 160) {
  const text = clean(value);
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function normalizeInput(input = {}) {
  return {
    objectType: clean(input.objectType || input.object_type).toLowerCase(),
    objectId: clean(input.objectId || input.object_id),
    ledgerId: clean(input.ledgerId || input.ledger_id),
    purpose: truncate(input.purpose, 80),
  };
}

function typeLabel(type) {
  if (type === "income") return "Income";
  if (type === "transfer") return "Transfer";
  return "Expense";
}

function withoutPrivateTransactionFields(transaction) {
  const {
    firstImageUrl,
    firstImageThumbnailUrl,
    source,
    sourceRef,
    ...safe
  } = transaction || {};
  return {
    ...safe,
    note: truncate(safe.note, 180),
  };
}

function createFinanceReferenceService({ repository, ledgerService } = {}) {
  if (!repository) throw new Error("repository_required");
  if (!ledgerService?.authorizedLedger) throw new Error("ledger_service_required");

  function authorizedLedger(ledgerId, context = {}) {
    return ledgerService.authorizedLedger({ ledgerId }, context);
  }

  function referenceEnvelope({ objectType, objectId, ledgerId, display, context }) {
    return {
      workspace_id: workspaceId(context),
      plugin_id: PLUGIN_ID,
      object_type: objectType,
      object_id: objectId,
      ledger_id: ledgerId,
      display,
    };
  }

  function objectTypes() {
    return {
      plugin_id: PLUGIN_ID,
      object_types: SUPPORTED_TYPES.map((row) => ({
        ...row,
        stable_identity: "workspace_id + plugin_id + object_type + object_id",
        methods: ["reference_get", "reference_summarize"],
      })),
    };
  }

  function transactionReference(objectId, context = {}) {
    const row = repository.getTransactionProjection(objectId);
    if (!row) throw new Error("reference_object_not_found");
    const ledgerId = row.ledger_id || row.ledgerId;
    authorizedLedger(ledgerId, context);
    const object = withoutPrivateTransactionFields(publicTransaction(row));
    const titleParts = [typeLabel(object.type), object.amount, object.currency].filter(Boolean);
    const subtitleParts = [
      object.categoryName,
      object.merchantName,
      object.accountName,
      object.memberName,
    ].filter(Boolean);
    return {
      reference: referenceEnvelope({
        objectType: "transaction",
        objectId: object.id,
        ledgerId,
        context,
        display: {
          title: titleParts.join(" "),
          subtitle: truncate(subtitleParts.join(" / "), 120),
          time: object.occurredAt || "",
          thumbnail_hint: object.imageAttachmentCount > 0 ? "receipt" : "",
        },
      }),
      object,
    };
  }

  function accountReference(objectId, context = {}) {
    const account = repository.getAccount(objectId);
    if (!account) throw new Error("reference_object_not_found");
    const ledgerId = account.ledger_id || account.ledgerId;
    authorizedLedger(ledgerId, context);
    const object = {
      id: account.id,
      ledgerId,
      name: account.name,
      type: account.type,
      currency: account.currency,
      isLiability: Boolean(account.is_liability),
      isActive: Boolean(account.is_active),
    };
    return {
      reference: referenceEnvelope({
        objectType: "account",
        objectId: account.id,
        ledgerId,
        context,
        display: {
          title: object.name,
          subtitle: [object.type, object.currency].filter(Boolean).join(" / "),
          time: "",
          thumbnail_hint: "",
        },
      }),
      object,
    };
  }

  function categoryReference(objectId, ledgerId = "", context = {}) {
    const ledger = authorizedLedger(ledgerId, context);
    const categories = repository.listCategories(ledger.id);
    const category = categories.find((row) => row.id === objectId);
    if (!category) throw new Error("reference_object_not_found");
    const parent = category.parent_id ? categories.find((row) => row.id === category.parent_id) : null;
    const object = {
      id: category.id,
      ledgerId: ledger.id,
      type: category.type,
      parentId: category.parent_id || "",
      parentName: parent?.name || "",
      name: category.name,
      icon: category.icon || "",
      isActive: Boolean(category.is_active),
    };
    return {
      reference: referenceEnvelope({
        objectType: "category",
        objectId: category.id,
        ledgerId: ledger.id,
        context,
        display: {
          title: object.name,
          subtitle: [object.type, object.parentName].filter(Boolean).join(" / "),
          time: "",
          thumbnail_hint: object.icon || "",
        },
      }),
      object,
    };
  }

  function referenceGet(input = {}, context = {}) {
    const normalized = normalizeInput(input);
    if (!normalized.objectType) throw new Error("reference_object_type_required");
    if (!normalized.objectId) throw new Error("reference_object_id_required");
    if (normalized.objectType === "transaction") return transactionReference(normalized.objectId, context);
    if (normalized.objectType === "account") return accountReference(normalized.objectId, context);
    if (normalized.objectType === "category") return categoryReference(normalized.objectId, normalized.ledgerId, context);
    throw new Error("unsupported_reference_object_type");
  }

  function summarizeObject(detail, purpose = "") {
    const objectType = detail.reference.object_type;
    const object = detail.object;
    if (objectType === "transaction") {
      const parts = [
        `${typeLabel(object.type)} ${object.amount} ${object.currency}`,
        object.categoryName,
        object.merchantName,
        object.accountName,
        object.memberName,
        object.occurredAt,
      ].filter(Boolean);
      if (object.note) parts.push(`Note: ${truncate(object.note, 80)}`);
      return truncate(parts.join(" / "), 260);
    }
    if (objectType === "account") {
      return truncate(["Account", object.name, object.type, object.currency].filter(Boolean).join(" / "), 180);
    }
    if (objectType === "category") {
      return truncate(["Category", object.name, object.type, object.parentName].filter(Boolean).join(" / "), 180);
    }
    return truncate([detail.reference.display?.title, purpose].filter(Boolean).join(" / "), 180);
  }

  function referenceSummarize(input = {}, context = {}) {
    const normalized = normalizeInput(input);
    const detail = referenceGet(normalized, context);
    return {
      reference: detail.reference,
      summary: summarizeObject(detail, normalized.purpose),
      purpose: normalized.purpose,
    };
  }

  return {
    objectTypes,
    referenceGet,
    referenceSummarize,
  };
}

module.exports = {
  createFinanceReferenceService,
  PLUGIN_ID,
  SUPPORTED_TYPES,
};
