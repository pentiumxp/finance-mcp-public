"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const SOURCE = "mymoney";
const FORMAT = "mymoney_csv_v5";
const TYPE_EXPENSE = "\u652f\u51fa";
const TYPE_INCOME = "\u6536\u5165";
const HOUSEHOLD_MEMBER = "\u5bb6\u5ead\u516c\u7528";
const DEFAULT_MEMBER = "\u5434\u840d";
const DEFAULT_CNY_ACCOUNT = "\u94f6\u884c\u5361";
const DEFAULT_HKD_ACCOUNT = "\u9999\u6e2f";
const CREDIT_TEXT = "\u4fe1\u7528";
const BANK_TEXT = "\u94f6\u884c";
const CARD_TEXT = "\u5361";

const EXPECTED_HEADERS = [
  "\u4ea4\u6613\u7c7b\u578b",
  "\u65e5\u671f",
  "\u7c7b\u522b",
  "\u5b50\u7c7b\u522b",
  "\u9879\u76ee",
  "\u8d26\u6237",
  "\u8d26\u6237\u5e01\u79cd",
  "\u91d1\u989d",
  "\u6210\u5458",
  "\u5546\u5bb6",
  "\u5907\u6ce8",
  "\u5173\u8054Id",
];

const CURRENCY_META = {
  CNY: { displayName: "\u4eba\u6c11\u5e01", symbol: "\u00a5", sortOrder: 10 },
  HKD: { displayName: "\u6e2f\u5143", symbol: "HK$", sortOrder: 20 },
};

function usage() {
  return [
    "Usage: node scripts/import-mymoney-csv.js --csv <file> --ledger-id <ledger> [--mode analyze|import] [--db <path>]",
    "",
    "Environment fallback: FINANCE_MCP_DB_PATH for --db.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    mode: "analyze",
    csv: "",
    ledgerId: "",
    dbPath: "",
    sourceFileName: "",
    actorRef: "mymoney-import",
    skipExactDuplicates: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`missing_value:${arg}`);
      return argv[index];
    };
    if (arg === "--mode") options.mode = next();
    else if (arg === "--csv") options.csv = next();
    else if (arg === "--ledger-id") options.ledgerId = next();
    else if (arg === "--db") options.dbPath = next();
    else if (arg === "--source-file-name") options.sourceFileName = next();
    else if (arg === "--actor-ref") options.actorRef = next();
    else if (arg === "--allow-exact-duplicates") options.skipExactDuplicates = false;
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    } else {
      throw new Error(`unknown_arg:${arg}`);
    }
  }
  if (!["analyze", "import"].includes(options.mode)) throw new Error("invalid_mode");
  if (!options.csv) throw new Error("csv_required");
  if (!options.ledgerId) throw new Error("ledger_id_required");
  options.dbPath = options.dbPath || process.env.FINANCE_MCP_DB_PATH || path.join(process.cwd(), "data", "finance.sqlite3");
  options.sourceFileName = options.sourceFileName || path.basename(options.csv);
  return options;
}

function clean(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text === "NaN" ? "" : text;
}

function parseCsv(input) {
  const rows = [];
  let row = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (inQuotes) {
      if (char === "\"") {
        if (input[index + 1] === "\"") {
          current += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === "\"") inQuotes = true;
    else if (char === ",") {
      row.push(current);
      current = "";
    } else if (char === "\n") {
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
    } else if (char === "\r") {
      if (input[index + 1] === "\n") continue;
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }
  if (current.length || row.length) {
    row.push(current);
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((field) => clean(field)));
}

function stableHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function loadCsv(filePath) {
  const bytes = fs.readFileSync(filePath);
  const text = bytes.toString("utf8").replace(/^\uFEFF/, "");
  const rows = parseCsv(text);
  const metadata = clean(rows[0]?.[0] || "");
  const headers = rows[1] || [];
  if (headers.length !== EXPECTED_HEADERS.length || headers.some((header, index) => header !== EXPECTED_HEADERS[index])) {
    throw new Error("unsupported_mymoney_headers");
  }
  return {
    bytes,
    sourceFileSha256: stableHash(bytes),
    metadata,
    headers,
    rows: rows.slice(2),
  };
}

function normalizeType(value) {
  const raw = clean(value);
  if (raw === TYPE_EXPENSE) return "expense";
  if (raw === TYPE_INCOME) return "income";
  throw new Error(`unsupported_mymoney_type:${raw}`);
}

function normalizeCurrency(value) {
  const currency = clean(value).toUpperCase() || "CNY";
  if (!/^[A-Z]{3,8}$/.test(currency)) throw new Error("invalid_currency");
  return currency;
}

function normalizeDateTime(value) {
  const raw = clean(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) throw new Error("invalid_datetime");
  const [, yyyy, mm, dd, hh, min, ss = "00"] = match;
  const date = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}+08:00`);
  if (Number.isNaN(date.getTime())) throw new Error("invalid_datetime");
  return date.toISOString();
}

function categoryPath(row) {
  return [clean(row[2]), clean(row[3])].filter(Boolean).join("/");
}

function normalizeAccount(row, currency) {
  return clean(row[5]) || (currency === "HKD" ? DEFAULT_HKD_ACCOUNT : DEFAULT_CNY_ACCOUNT);
}

function accountType(accountName) {
  if (accountName.includes(CREDIT_TEXT)) return { type: "credit_card", isLiability: 1 };
  if (accountName.includes(BANK_TEXT) || accountName.includes(CARD_TEXT)) return { type: "bank", isLiability: 0 };
  return { type: "cash", isLiability: 0 };
}

function normalizeMember(value) {
  return clean(value) || DEFAULT_MEMBER;
}

function normalizeAmountText(value) {
  const raw = clean(value).replaceAll(",", "");
  if (!raw) throw new Error("amount_required");
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(raw)) throw new Error("invalid_amount");
  return {
    amount: raw.startsWith("-") ? raw.slice(1) : raw,
    isNegative: raw.startsWith("-"),
  };
}

function flipType(type) {
  if (type === "expense") return "income";
  if (type === "income") return "expense";
  return type;
}

function rowObject(headers, row) {
  const object = {};
  headers.forEach((header, index) => {
    object[header] = row[index] ?? "";
  });
  return object;
}

function createIdempotencyKey(row, sourceRowIndex) {
  return `${SOURCE}:v1:${sourceRowIndex}:${stableHash(JSON.stringify(row)).slice(0, 24)}`;
}

function loadFinanceMoney() {
  const { parseAmountToMinor, formatMinor } = require(path.join(process.cwd(), "adapters", "finance-money"));
  return { parseAmountToMinor, formatMinor };
}

function normalizeRows(parsed) {
  const { parseAmountToMinor } = loadFinanceMoney();
  const normalized = [];
  const errors = [];
  parsed.rows.forEach((fields, index) => {
    const sourceRowIndex = index + 1;
    try {
      if (fields.length !== parsed.headers.length) throw new Error("invalid_column_count");
      const sourceRow = rowObject(parsed.headers, fields);
      const type = normalizeType(fields[0]);
      const currency = normalizeCurrency(fields[6]);
      const amountInput = normalizeAmountText(fields[7]);
      const typeForPosting = amountInput.isNegative ? flipType(type) : type;
      const amountMinor = parseAmountToMinor(amountInput.amount, currency);
      const accountName = normalizeAccount(fields, currency);
      const memberName = normalizeMember(fields[8]);
      const merchantName = clean(fields[9]);
      const projectName = clean(fields[4]);
      const rawCategoryPath = categoryPath(fields);
      normalized.push({
        sourceRowIndex,
        sourceRow,
        type: typeForPosting,
        currency,
        amount: amountInput.amount,
        amountMinor,
        occurredAt: normalizeDateTime(fields[1]),
        categoryPath: rawCategoryPath,
        accountName,
        memberName,
        merchantName,
        projectName,
        note: clean(fields[10]),
        idempotencyKey: createIdempotencyKey(sourceRow, sourceRowIndex),
        raw: {
          datetime: clean(fields[1]),
          type: clean(fields[0]),
          categoryPath: rawCategoryPath,
          amount: clean(fields[7]),
          currency,
          accountName,
          participantName: memberName,
          merchantName,
          property: projectName,
          note: clean(fields[10]),
        },
      });
    } catch (err) {
      errors.push({ rowIndex: sourceRowIndex, message: err.message });
    }
  });
  return { normalized, errors };
}

function categoryKey(row) {
  return clean(row.categoryPath);
}

function exactTransactionKey(row) {
  return [
    row.type,
    row.currency,
    String(row.amountMinor),
    row.occurredAt,
    categoryKey(row),
    clean(row.accountName),
    clean(row.memberName),
    clean(row.merchantName),
    clean(row.note),
  ].join("\u001f");
}

function existingTransactionKey(row) {
  const pathParts = [clean(row.parent_category_name), clean(row.category_name)].filter(Boolean);
  return [
    clean(row.type),
    clean(row.currency),
    String(row.amount_minor || 0),
    clean(row.occurred_at),
    pathParts.join("/"),
    clean(row.account_name),
    clean(row.member_name),
    clean(row.merchant_name),
    clean(row.note),
  ].join("\u001f");
}

function loadExistingExactKeys(dbPath, ledgerId) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const rows = db.prepare(`
      SELECT t.type, t.amount_minor, t.currency, t.occurred_at, t.note,
             c.name AS category_name, pc.name AS parent_category_name,
             a.name AS account_name, m.display_name AS member_name, merchant.name AS merchant_name
      FROM finance_transactions t
      LEFT JOIN finance_categories c ON c.id = t.category_id
      LEFT JOIN finance_categories pc ON pc.id = c.parent_id
      LEFT JOIN finance_accounts a ON a.id = t.account_id
      LEFT JOIN finance_members m ON m.id = t.booked_by_member_id
      LEFT JOIN finance_merchants merchant ON merchant.id = t.merchant_id
      WHERE t.ledger_id = ? AND t.status = 'active'
    `).all(ledgerId);
    return new Set(rows.map(existingTransactionKey));
  } finally {
    db.close();
  }
}

function inc(map, key, amount = 1) {
  const cleanKey = key || "(empty)";
  map[cleanKey] = (map[cleanKey] || 0) + amount;
}

function top(map, limit = 12) {
  return Object.entries(map)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit);
}

function summarize(parsed, normalized, existingKeys, options) {
  const { formatMinor } = loadFinanceMoney();
  const typeCounts = {};
  const currencyCounts = {};
  const memberCounts = {};
  const accountCounts = {};
  const categoryCounts = {};
  const projectCounts = {};
  const merchantCounts = {};
  const totalsMinor = {};
  let minOccurredAt = "";
  let maxOccurredAt = "";
  let exactDuplicateCount = 0;
  for (const row of normalized) {
    inc(typeCounts, row.type);
    inc(currencyCounts, row.currency);
    inc(memberCounts, row.memberName);
    inc(accountCounts, row.accountName);
    inc(categoryCounts, row.categoryPath);
    inc(projectCounts, row.projectName);
    inc(merchantCounts, row.merchantName);
    const totalKey = `${row.type}|${row.currency}`;
    totalsMinor[totalKey] = (totalsMinor[totalKey] || 0) + row.amountMinor;
    if (!minOccurredAt || row.occurredAt < minOccurredAt) minOccurredAt = row.occurredAt;
    if (!maxOccurredAt || row.occurredAt > maxOccurredAt) maxOccurredAt = row.occurredAt;
    if (existingKeys.has(exactTransactionKey(row))) exactDuplicateCount += 1;
  }
  const totals = {};
  for (const [key, value] of Object.entries(totalsMinor)) {
    const currency = key.split("|")[1] || "CNY";
    totals[key] = formatMinor(value, currency);
  }
  return {
    mode: options.mode,
    source: SOURCE,
    format: FORMAT,
    ledgerId: options.ledgerId,
    sourceFileName: options.sourceFileName,
    sourceFileSha256: parsed.sourceFileSha256,
    metadata: parsed.metadata,
    rowCount: parsed.rows.length,
    normalizedCount: normalized.length,
    exactDuplicateCount,
    candidateImportCount: normalized.length - exactDuplicateCount,
    minOccurredAt,
    maxOccurredAt,
    typeCounts,
    currencyCounts,
    totals,
    topMembers: top(memberCounts),
    topAccounts: top(accountCounts),
    topCategories: top(categoryCounts),
    topProjects: top(projectCounts),
    topMerchants: top(merchantCounts, 8),
  };
}

function resolveCategory(repository, { ledgerId, type, categoryPath: pathText }) {
  const parts = clean(pathText).split("/").map((part) => part.trim()).filter(Boolean);
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

function importRows(parsed, normalized, existingKeys, options) {
  const { createFinanceRuntime } = require(path.join(process.cwd(), "adapters", "finance-runtime"));
  const runtime = createFinanceRuntime({ dbPath: options.dbPath });
  const repository = runtime.repository;
  const transactionService = runtime.transactionService;
  let importedCount = 0;
  let skippedExactDuplicateCount = 0;
  let skippedIdempotentDuplicateCount = 0;
  const errors = [];
  try {
    const batch = repository.insertImportBatch({
      ledgerId: options.ledgerId,
      source: SOURCE,
      sourceFileName: options.sourceFileName,
      sourceFileSha256: parsed.sourceFileSha256,
      rowCount: parsed.rows.length,
      metadata: {
        format: FORMAT,
        sourceMetadata: parsed.metadata,
        duplicatePolicy: options.skipExactDuplicates ? "exact_transaction_key" : "idempotency_only",
      },
    });
    for (const row of normalized) {
      try {
        const exactKey = exactTransactionKey(row);
        if (options.skipExactDuplicates && existingKeys.has(exactKey)) {
          skippedExactDuplicateCount += 1;
          continue;
        }
        const currencyMeta = CURRENCY_META[row.currency] || { displayName: row.currency, symbol: "", sortOrder: 999 };
        repository.upsertCurrency({
          code: row.currency,
          displayName: currencyMeta.displayName,
          symbol: currencyMeta.symbol,
          sortOrder: currencyMeta.sortOrder,
        });
        const categoryId = resolveCategory(repository, {
          ledgerId: options.ledgerId,
          type: row.type === "income" ? "income" : "expense",
          categoryPath: row.categoryPath,
        });
        const accountMeta = accountType(row.accountName);
        const account = repository.upsertAccount({
          ledgerId: options.ledgerId,
          name: row.accountName,
          currency: row.currency,
          type: accountMeta.type,
          isLiability: accountMeta.isLiability,
        });
        const member = repository.upsertMember({
          ledgerId: options.ledgerId,
          displayName: row.memberName,
          isHousehold: row.memberName === HOUSEHOLD_MEMBER ? 1 : 0,
        });
        const result = transactionService.createTransaction({
          ledgerId: options.ledgerId,
          type: row.type,
          amount: row.amount,
          currency: row.currency,
          occurredAt: row.occurredAt,
          categoryId,
          accountId: account.id,
          memberId: member.id,
          payerMemberId: member.id,
          merchant: row.merchantName,
          note: row.note,
          source: SOURCE,
          sourceRef: row.categoryPath,
          idempotencyKey: row.idempotencyKey,
          allowZeroAmount: false,
          tags: row.projectName ? [row.projectName] : [],
        }, { actorRef: options.actorRef, role: "owner" });
        if (result.duplicate) {
          skippedIdempotentDuplicateCount += 1;
          continue;
        }
        importedCount += 1;
        existingKeys.add(exactKey);
        repository.insertTransactionSourceFields({
          transactionId: result.transaction.id,
          ledgerId: options.ledgerId,
          source: SOURCE,
          sourceRowIndex: row.sourceRowIndex,
          rawDatetime: row.raw.datetime,
          rawType: row.raw.type,
          rawCategoryPath: row.raw.categoryPath,
          rawAmount: row.raw.amount,
          rawCurrency: row.raw.currency,
          rawCounterparty: row.merchantName || row.memberName,
          rawAccountName: row.raw.accountName,
          rawParticipantName: row.raw.participantName,
          rawTags: row.projectName,
          rawMerchant: row.raw.merchantName,
          rawProperty: row.raw.property,
          rawNote: row.raw.note,
          rawRowJson: JSON.stringify(row.sourceRow),
          importBatchId: batch.id,
        });
      } catch (err) {
        errors.push({ rowIndex: row.sourceRowIndex, message: err.message });
      }
    }
    const skippedCount = skippedExactDuplicateCount + skippedIdempotentDuplicateCount + errors.length;
    const updatedBatch = repository.updateImportBatchCounts(batch.id, { importedCount, skippedCount });
    return {
      batch: updatedBatch,
      importedCount,
      skippedCount,
      skippedExactDuplicateCount,
      skippedIdempotentDuplicateCount,
      errors,
    };
  } finally {
    runtime.close();
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const parsed = loadCsv(options.csv);
  const { normalized, errors } = normalizeRows(parsed);
  const existingKeys = loadExistingExactKeys(options.dbPath, options.ledgerId);
  const summary = summarize(parsed, normalized, existingKeys, options);
  if (errors.length) {
    const output = { ok: false, summary, validationErrors: errors.slice(0, 50), validationErrorCount: errors.length };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }
  if (options.mode === "analyze") {
    process.stdout.write(`${JSON.stringify({ ok: true, summary }, null, 2)}\n`);
    return;
  }
  const result = importRows(parsed, normalized, existingKeys, options);
  const output = {
    ok: result.errors.length === 0,
    summary,
    import: {
      batchId: result.batch?.id || "",
      importedCount: result.importedCount,
      skippedCount: result.skippedCount,
      skippedExactDuplicateCount: result.skippedExactDuplicateCount,
      skippedIdempotentDuplicateCount: result.skippedIdempotentDuplicateCount,
      errorCount: result.errors.length,
      errors: result.errors.slice(0, 50),
    },
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (result.errors.length) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 1;
  }
}
