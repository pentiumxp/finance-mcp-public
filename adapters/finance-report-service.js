"use strict";

const { currencyScale, formatMinor, normalizeCurrency, percentageBasisPoints } = require("./finance-money");
const { normalizeLedgerId } = require("./finance-transaction-service");

const SHANGHAI_OFFSET_MINUTES = 8 * 60;

function localUtcIso(year, monthIndex, day, hour, minute, second, millisecond, offsetMinutes = SHANGHAI_OFFSET_MINUTES) {
  return new Date(Date.UTC(year, monthIndex, day, hour, minute - offsetMinutes, second, millisecond)).toISOString();
}

function localDateKey(value, offsetMinutes = SHANGHAI_OFFSET_MINUTES) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return String(value || "").slice(0, 10);
  return new Date(timestamp + offsetMinutes * 60 * 1000).toISOString().slice(0, 10);
}

function localDateParts(value, offsetMinutes = SHANGHAI_OFFSET_MINUTES) {
  const timestamp = new Date(value).getTime();
  const date = Number.isFinite(timestamp)
    ? new Date(timestamp + offsetMinutes * 60 * 1000)
    : new Date();
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
  };
}

function periodBounds({ period = "month", date = new Date(), startDate = "", endDate = "" } = {}) {
  if (period === "custom") return { startDate, endDate };
  const { year, month } = localDateParts(date);
  if (period === "year") {
    return {
      startDate: localUtcIso(year, 0, 1, 0, 0, 0, 0),
      endDate: localUtcIso(year, 11, 31, 23, 59, 59, 999),
    };
  }
  if (period === "quarter") {
    const quarterStartMonth = Math.floor(month / 3) * 3;
    return {
      startDate: localUtcIso(year, quarterStartMonth, 1, 0, 0, 0, 0),
      endDate: localUtcIso(year, quarterStartMonth + 3, 0, 23, 59, 59, 999),
    };
  }
  if (period === "all") return { startDate: "", endDate: "" };
  return {
    startDate: localUtcIso(year, month, 1, 0, 0, 0, 0),
    endDate: localUtcIso(year, month + 1, 0, 23, 59, 59, 999),
  };
}

function rowAmount(row) {
  return Number(row.amount_minor || 0);
}

function firstNonEmpty(...values) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function normalizeReportFilters(input = {}) {
  const filters = { ...input };
  const pairs = [
    ["categoryId", "category_id"],
    ["categoryParentId", "category_parent_id"],
    ["memberId", "member_id"],
    ["accountId", "account_id"],
    ["merchantId", "merchant_id"],
    ["tagId", "tag_id"],
  ];
  for (const [camel, snake] of pairs) {
    const value = firstNonEmpty(filters[camel], filters[snake]);
    if (value) filters[camel] = value;
    delete filters[snake];
  }
  return filters;
}

function emptyTotals(currency) {
  return {
    currency,
    incomeMinor: 0,
    expenseMinor: 0,
    netMinor: 0,
    count: 0,
    income: formatMinor(0, currency),
    expense: formatMinor(0, currency),
    net: formatMinor(0, currency),
  };
}

function totalsFromRows(rows = [], currency = "CNY") {
  const totals = emptyTotals(currency);
  for (const row of rows) {
    if (row.type === "income") totals.incomeMinor += rowAmount(row);
    if (row.type === "expense") totals.expenseMinor += rowAmount(row);
    if (row.type === "income" || row.type === "expense") totals.count += 1;
  }
  return finalizeTotals(totals);
}

function memberBreakdownFromRows(rows = [], currency = "CNY") {
  const groups = new Map();
  for (const row of rows) {
    const memberId = row.booked_by_member_id || "unassigned";
    const label = row.member_name || "Unassigned";
    const existing = groups.get(memberId) || { memberId, label, totals: emptyTotals(currency) };
    if (row.type === "income") existing.totals.incomeMinor += rowAmount(row);
    if (row.type === "expense") existing.totals.expenseMinor += rowAmount(row);
    if (row.type === "income" || row.type === "expense") existing.totals.count += 1;
    groups.set(memberId, existing);
  }
  return [...groups.values()]
    .map((item) => ({ ...item, totals: finalizeTotals(item.totals) }))
    .sort((a, b) => {
      const bMagnitude = Math.abs(b.totals.incomeMinor) + Math.abs(b.totals.expenseMinor);
      const aMagnitude = Math.abs(a.totals.incomeMinor) + Math.abs(a.totals.expenseMinor);
      return bMagnitude - aMagnitude || a.label.localeCompare(b.label);
    });
}

function finalizeTotals(total) {
  total.netMinor = total.incomeMinor - total.expenseMinor;
  total.income = formatMinor(total.incomeMinor, total.currency);
  total.expense = formatMinor(total.expenseMinor, total.currency);
  total.net = formatMinor(total.netMinor, total.currency);
  return total;
}

function createFinanceReportService({ repository } = {}) {
  if (!repository) throw new Error("repository_required");

  function getSummary(filters = {}, context = {}) {
    const ledgerId = normalizeLedgerId(filters, context);
    const currency = normalizeCurrency(filters.currency || "CNY");
    const bounds = periodBounds(filters);
    const rows = repository.reportRows({ ...filters, ...bounds, ledgerId, currency });
    const totals = totalsFromRows(rows, currency);
    const memberBreakdown = memberBreakdownFromRows(rows, currency);
    return {
      ledgerId,
      periodStart: bounds.startDate,
      periodEnd: bounds.endDate,
      timezone: repository.getLedger(ledgerId)?.timezone || "Asia/Shanghai",
      totals,
      memberBreakdown,
      aggregationBasis: "active transactions only; all ledger members included unless an explicit member filter is provided; transfer excluded from income and expense totals; currency-scoped",
      appliedFilters: { ...filters, currency },
    };
  }

  function getReport(options = {}, context = {}) {
    const ledgerId = normalizeLedgerId(options, context);
    const dimension = options.dimension || "category";
    const metric = options.metric || "expense";
    const optionFilters = normalizeReportFilters(options.filters || {});
    const topLevelFilters = normalizeReportFilters({
      categoryId: options.categoryId || options.category_id,
      categoryParentId: options.categoryParentId || options.category_parent_id,
      memberId: options.memberId || options.member_id,
      accountId: options.accountId || options.account_id,
      merchantId: options.merchantId || options.merchant_id,
      tagId: options.tagId || options.tag_id,
    });
    for (const [key, value] of Object.entries(topLevelFilters)) {
      if (firstNonEmpty(value)) optionFilters[key] = value;
    }
    const requestedCurrency = options.currency || optionFilters.currency || "";
    const mixedOriginalCurrency = !requestedCurrency && (dimension === "account" || Boolean(optionFilters.accountId));
    const currency = mixedOriginalCurrency ? "MIXED" : normalizeCurrency(requestedCurrency || "CNY");
    const bounds = periodBounds(options);
    const filters = { ...optionFilters };
    if (!mixedOriginalCurrency) filters.currency = currency;
    const sourceRows = dimension === "tag"
      ? repository.reportTagRows({ ...filters, ...bounds, ledgerId, type: metric === "net" ? "" : metric })
      : repository.reportRows({ ...filters, ...bounds, ledgerId });
    const rows = sourceRows
      .filter((row) => metric === "net" || row.type === metric);
    const groups = new Map();
    for (const row of rows) {
      let key = "uncategorized";
      let label = "Uncategorized";
      if (dimension === "category") {
        key = row.category_parent_id || row.category_id || "uncategorized";
        label = row.parent_category_name || row.category_name || "Uncategorized";
      } else if (dimension === "subcategory") {
        key = row.category_id || "uncategorized";
        label = row.category_name || "Uncategorized";
      } else if (dimension === "member") {
        key = row.booked_by_member_id || "unassigned";
        label = row.member_name || "Unassigned";
      } else if (dimension === "account") {
        key = row.account_id || "unknown";
        label = row.account_name || "Unknown account";
      } else if (dimension === "merchant") {
        key = row.merchant_id || "none";
        label = row.merchant_name || "No merchant";
      } else if (dimension === "tag") {
        key = row.tag_id || "untagged";
        label = row.tag_name || "无标签";
      } else if (dimension === "trend") {
        key = localDateKey(row.occurred_at);
        label = key;
      }
      const itemCurrency = mixedOriginalCurrency ? normalizeCurrency(row.currency || "CNY") : currency;
      const icon = dimension === "category"
        ? row.parent_category_icon || row.category_icon || ""
        : dimension === "subcategory"
          ? row.category_icon || ""
          : "";
      const existing = groups.get(key) || { key, label, icon, amountMinor: 0, count: 0, currency: itemCurrency };
      if (!existing.icon && icon) existing.icon = icon;
      if (existing.currency !== itemCurrency) existing.currency = "MIXED";
      const amount = row.type === "income" ? rowAmount(row) : row.type === "expense" ? rowAmount(row) : 0;
      existing.amountMinor += metric === "net" && row.type === "expense" ? -amount : amount;
      existing.count += 1;
      groups.set(key, existing);
    }
    const total = [...groups.values()].reduce((sum, item) => sum + Math.abs(item.amountMinor), 0);
    const breakdown = [...groups.values()]
      .sort((a, b) => Math.abs(b.amountMinor) - Math.abs(a.amountMinor))
      .map((item) => ({
        ...item,
        scale: currencyScale(item.currency || currency),
        amount: formatMinor(item.amountMinor, item.currency || currency),
        percentageBasisPoints: percentageBasisPoints(Math.abs(item.amountMinor), total),
      }));
    const totals = mixedOriginalCurrency
      ? totalsFromRows(sourceRows, currency)
      : getSummary({ ...filters, ...options, ledgerId, currency }, context).totals;
    return {
      ledgerId,
      periodStart: bounds.startDate,
      periodEnd: bounds.endDate,
      timezone: repository.getLedger(ledgerId)?.timezone || "Asia/Shanghai",
      metric,
      dimension,
      currency,
      totals,
      breakdown,
      series: dimension === "trend" ? breakdown.sort((a, b) => a.key.localeCompare(b.key)) : [],
      appliedFilters: filters,
      aggregationBasis: mixedOriginalCurrency
        ? "active transactions only; transfer excluded unless metric explicitly supports it; account dimension uses original transaction currencies without FX conversion"
        : "active transactions only; transfer excluded unless metric explicitly supports it; currency-scoped",
    };
  }

  return { getReport, getSummary };
}

module.exports = {
  createFinanceReportService,
  localDateKey,
  periodBounds,
};
