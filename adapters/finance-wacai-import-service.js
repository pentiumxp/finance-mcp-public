"use strict";

const crypto = require("node:crypto");

const CURRENCY_MAP = Object.freeze({
  人民币: "CNY",
  港元: "HKD",
  美元: "USD",
  欧元: "EUR",
  日元: "JPY",
});

const TYPE_MAP = Object.freeze({
  支出: "expense",
  收入: "income",
  转账: "transfer",
});

const CURRENCY_DISPLAY = Object.freeze({
  CNY: { displayName: "人民币", symbol: "¥", sortOrder: 10 },
  HKD: { displayName: "港元", symbol: "HK$", sortOrder: 20 },
  USD: { displayName: "美元", symbol: "$", sortOrder: 30 },
  EUR: { displayName: "欧元", symbol: "€", sortOrder: 40 },
  JPY: { displayName: "日元", symbol: "¥", scale: 0, sortOrder: 50 },
});

function clean(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text === "NaN" ? "" : text;
}

function splitTags(value) {
  return clean(value)
    .split(/[，,、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeCurrencyName(value) {
  const raw = clean(value);
  return CURRENCY_MAP[raw] || raw.toUpperCase() || "CNY";
}

function normalizeTypeName(value) {
  const raw = clean(value);
  const type = TYPE_MAP[raw];
  if (!type) throw new Error(`unsupported_wacai_type:${raw}`);
  return type;
}

function normalizeAmountForPosting(value, scale = 2, multiplier = 1) {
  const raw = clean(value).replaceAll(",", "");
  if (!raw) throw new Error("amount_required");
  if (!/^\d+(?:\.\d+)?$/.test(raw)) throw new Error("invalid_amount");
  const [whole, fraction = ""] = raw.split(".");
  const multiplierInt = Number(multiplier || 1);
  if (!Number.isInteger(multiplierInt) || multiplierInt <= 0) throw new Error("invalid_amount_multiplier");
  const rawDigits = BigInt(`${whole}${fraction}` || "0");
  const numerator = rawDigits * BigInt(multiplierInt) * (10n ** BigInt(scale));
  const denominator = 10n ** BigInt(fraction.length);
  let minor = numerator / denominator;
  if ((numerator % denominator) * 2n >= denominator) minor += 1n;
  const base = 10n ** BigInt(scale);
  const roundedWhole = minor / base;
  const roundedFraction = String(minor % base).padStart(scale, "0");
  return scale > 0 ? `${roundedWhole.toString()}.${roundedFraction}` : roundedWhole.toString();
}

function normalizeDateTime(value) {
  if (value instanceof Date) return value.toISOString();
  const raw = clean(value);
  if (!raw) throw new Error("wacai_datetime_required");
  const normalized = raw.replace(" ", "T");
  const withZone = normalized.endsWith("Z") || /[+-]\d\d:\d\d$/.test(normalized)
    ? normalized
    : `${normalized}+08:00`;
  return new Date(withZone).toISOString();
}

function stableHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function createIdempotencyKey(row, rowIndex, importOptions = {}) {
  const optionKey = `${importOptions.amountMultiplier || 1}:${importOptions.forceCurrency || ""}`;
  return `wacai:${optionKey}:${rowIndex}:${stableHash(JSON.stringify(row)).slice(0, 24)}`;
}

function resolveCategory(repository, { ledgerId, type, categoryPath }) {
  const parts = clean(categoryPath).split("/").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return "";
  let parentId = "";
  let category = null;
  parts.forEach((part, index) => {
    category = repository.upsertCategory({
      ledgerId,
      type,
      parentId,
      name: part,
      sortOrder: (index + 1) * 10,
    });
    parentId = category.id;
  });
  return category?.id || "";
}

function createFinanceWacaiImportService({ repository, transactionService } = {}) {
  if (!repository) throw new Error("repository_required");
  if (!transactionService) throw new Error("transaction_service_required");

  function importRows(rows = [], options = {}, context = {}) {
    const ledgerId = options.ledgerId || context.ledgerId || "daily";
    const amountMultiplier = Number(options.amountMultiplier || 1);
    const forceCurrency = clean(options.forceCurrency).toUpperCase();
    const batch = repository.insertImportBatch({
      ledgerId,
      source: "wacai",
      sourceFileName: options.sourceFileName || "",
      sourceFileSha256: options.sourceFileSha256 || "",
      rowCount: rows.length,
      metadata: {
        ...(options.metadata || {}),
        amountMultiplier,
        forceCurrency,
      },
    });
    let importedCount = 0;
    let skippedCount = 0;
    const errors = [];

    rows.forEach((row, index) => {
      const sourceRowIndex = Number(row.__rowIndex || index + 1);
      try {
        const type = normalizeTypeName(row["类型"]);
        const currency = forceCurrency || normalizeCurrencyName(row["币种"]);
        const currencyMeta = CURRENCY_DISPLAY[currency] || { displayName: currency, symbol: "", sortOrder: 999 };
        repository.upsertCurrency({
          code: currency,
          displayName: currencyMeta.displayName,
          symbol: currencyMeta.symbol,
          scale: currencyMeta.scale ?? 2,
          sortOrder: currencyMeta.sortOrder,
        });
        const amount = normalizeAmountForPosting(row["金额"], 2, amountMultiplier);
        const accountName = clean(row["收付账户"]) || (currency === "HKD" ? "港币" : currency === "USD" ? "美金" : "现金");
        const participantName = clean(row["参与人"]) || "自己";
        const counterpartyName = clean(row["收付款人"]) || participantName;
        const merchantName = clean(row["商家"]);
        const categoryId = resolveCategory(repository, {
          ledgerId,
          type: type === "income" ? "income" : "expense",
          categoryPath: row["类别"],
        });
        const account = repository.upsertAccount({
          ledgerId,
          name: accountName,
          currency,
          type: accountName.includes("信用") ? "credit_card" : "cash",
          isLiability: accountName.includes("信用") ? 1 : 0,
        });
        const participant = repository.upsertMember({
          ledgerId,
          displayName: participantName,
          isHousehold: participantName === "家庭公用" ? 1 : 0,
        });
        const tagNames = splitTags(row["标签"]);
        const result = transactionService.createTransaction({
          ledgerId,
          type,
          amount,
          currency,
          occurredAt: normalizeDateTime(row["日期时间"]),
          categoryId,
          accountId: account.id,
          memberId: participant.id,
          payerMemberId: participant.id,
          merchant: merchantName,
          note: clean(row["备注"]),
          source: "wacai",
          sourceRef: clean(row["类别"]),
          idempotencyKey: createIdempotencyKey(row, sourceRowIndex, { amountMultiplier, forceCurrency }),
          allowZeroAmount: true,
          tags: tagNames,
        }, { ...context, actorRef: context.actorRef || "wacai-import" });
        if (result.duplicate) {
          skippedCount += 1;
          const existingId = result.transaction?.id;
          if (existingId && !repository.getTransactionSourceFields(existingId)) {
            repository.insertTransactionSourceFields({
              transactionId: existingId,
              ledgerId,
              source: "wacai",
              sourceRowIndex,
              rawDatetime: clean(row["日期时间"]),
              rawType: clean(row["类型"]),
              rawCategoryPath: clean(row["类别"]),
              rawAmount: clean(row["金额"]),
              rawCurrency: clean(row["币种"]),
              rawCounterparty: counterpartyName,
              rawAccountName: accountName,
              rawParticipantName: participantName,
              rawTags: clean(row["标签"]),
              rawMerchant: merchantName,
              rawProperty: clean(row["属性"]),
              rawNote: clean(row["备注"]),
              rawRowJson: JSON.stringify(row),
              importBatchId: batch.id,
            });
          }
          return;
        }
        importedCount += 1;
        repository.insertTransactionSourceFields({
          transactionId: result.transaction.id,
          ledgerId,
          source: "wacai",
          sourceRowIndex,
          rawDatetime: clean(row["日期时间"]),
          rawType: clean(row["类型"]),
          rawCategoryPath: clean(row["类别"]),
          rawAmount: clean(row["金额"]),
          rawCurrency: clean(row["币种"]),
          rawCounterparty: counterpartyName,
          rawAccountName: accountName,
          rawParticipantName: participantName,
          rawTags: clean(row["标签"]),
          rawMerchant: merchantName,
          rawProperty: clean(row["属性"]),
          rawNote: clean(row["备注"]),
          rawRowJson: JSON.stringify(row),
          importBatchId: batch.id,
        });
      } catch (err) {
        skippedCount += 1;
        errors.push({
          rowIndex: sourceRowIndex,
          message: err.message,
        });
      }
    });

    const updatedBatch = repository.updateImportBatchCounts(batch.id, { importedCount, skippedCount });
    return {
      batch: updatedBatch,
      importedCount,
      skippedCount,
      errors,
    };
  }

  return {
    importRows,
  };
}

module.exports = {
  CURRENCY_MAP,
  CURRENCY_DISPLAY,
  TYPE_MAP,
  clean,
  createFinanceWacaiImportService,
  normalizeAmountForPosting,
  normalizeCurrencyName,
  normalizeTypeName,
  splitTags,
};
