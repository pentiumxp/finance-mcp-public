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

function normalizeLedgerId(input = {}, context = {}) {
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

function idInRows(rows, id) {
  return rows.some((row) => row.id === id);
}

function findByHint(rows, hint, fallback = "") {
  const text = String(hint || "").trim().toLowerCase();
  if (!text) return fallback;
  const exact = rows.find((row) => String(row.name || row.display_name || "").toLowerCase() === text);
  if (exact) return exact.id;
  const partial = rows.find((row) => String(row.name || row.display_name || "").toLowerCase().includes(text));
  return partial?.id || fallback;
}

function resolveScopedId({ rows, explicitId, hint, fallback = "", errorCode }) {
  if (explicitId) {
    if (!idInRows(rows, explicitId)) throw new Error(errorCode);
    return explicitId;
  }
  return findByHint(rows, hint, fallback);
}

function datePart(value) {
  const text = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const date = value instanceof Date ? value : new Date(text || Date.now());
  if (Number.isNaN(date.getTime())) throw new Error("invalid_date");
  return date.toISOString().slice(0, 10);
}

function normalizeTimeOfDay(value = "09:00") {
  const text = String(value || "09:00").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error("invalid_time_of_day");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) throw new Error("invalid_time_of_day");
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function shanghaiIso(day, timeOfDay = "09:00") {
  const time = normalizeTimeOfDay(timeOfDay);
  return new Date(`${datePart(day)}T${time}:00+08:00`).toISOString();
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonthsClamped(date, months, dayOfMonth) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const first = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(Math.max(1, dayOfMonth), lastDay));
  return first;
}

function dayNumber(value) {
  return Number(shanghaiIso(value, "00:00").slice(0, 10).replaceAll("-", ""));
}

function normalizeWeekdays(value) {
  const rows = Array.isArray(value) ? value : String(value || "").split(",");
  const nums = rows.map((item) => Number(item)).filter((num) => Number.isInteger(num) && num >= 1 && num <= 7);
  return [...new Set(nums)].sort((a, b) => a - b);
}

function nextDueAfter(rule, afterIso = "") {
  const frequency = String(rule.frequency || "").trim();
  const interval = Math.max(1, Math.min(99, Number(rule.intervalCount || rule.interval_count || 1)));
  const timeOfDay = normalizeTimeOfDay(rule.timeOfDay || rule.time_of_day || "09:00");
  const startDay = datePart(rule.startAt || rule.start_at);
  const endAt = rule.endAt || rule.end_at || "";
  const endLimit = endAt ? dayNumber(endAt) : 0;
  const afterTime = afterIso ? new Date(afterIso).getTime() : 0;
  const start = new Date(`${startDay}T00:00:00.000Z`);

  function allowed(iso) {
    if (!iso) return "";
    if (endLimit && dayNumber(iso) > endLimit) return "";
    if (afterTime && new Date(iso).getTime() <= afterTime) return "";
    return iso;
  }

  if (frequency === "daily") {
    for (let index = 0; index < 3700; index += interval) {
      const iso = shanghaiIso(addDays(start, index).toISOString(), timeOfDay);
      if (allowed(iso)) return iso;
    }
  }
  if (frequency === "weekly") {
    const weekdays = normalizeWeekdays(rule.weekdays || rule.weekdays_json);
    const wanted = weekdays.length ? weekdays : [1];
    for (let index = 0; index < 3700; index += 1) {
      const date = addDays(start, index);
      const weeks = Math.floor(index / 7);
      if (weeks % interval !== 0) continue;
      const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
      if (!wanted.includes(weekday)) continue;
      const iso = shanghaiIso(date.toISOString(), timeOfDay);
      if (allowed(iso)) return iso;
    }
  }
  if (frequency === "monthly") {
    const dom = Math.max(1, Math.min(31, Number(rule.dayOfMonth || rule.day_of_month || datePart(startDay).slice(8))));
    for (let index = 0; index < 1200; index += interval) {
      const iso = shanghaiIso(addMonthsClamped(start, index, dom).toISOString(), timeOfDay);
      if (allowed(iso)) return iso;
    }
  }
  if (frequency === "yearly") {
    const month = Math.max(1, Math.min(12, Number(rule.monthOfYear || rule.month_of_year || Number(startDay.slice(5, 7)))));
    const dom = Math.max(1, Math.min(31, Number(rule.dayOfMonth || rule.day_of_month || Number(startDay.slice(8, 10)))));
    for (let index = 0; index < 100; index += interval) {
      const iso = shanghaiIso(addMonthsClamped(new Date(Date.UTC(start.getUTCFullYear() + index, month - 1, 1)), 0, dom).toISOString(), timeOfDay);
      if (allowed(iso)) return iso;
    }
  }
  throw new Error("invalid_recurring_frequency");
}

function publicRule(row = {}) {
  if (!row) return null;
  return {
    ...row,
    amount: formatMinor(Number(row.amountMinor || 0), row.currency || "CNY", { scale: row.scale || 2 }),
  };
}

function recurringScheduleChanged(existing = {}, next = {}) {
  if (!existing) return true;
  const existingWeekdays = JSON.stringify(existing.weekdays || []);
  const nextWeekdays = JSON.stringify(next.weekdays || []);
  return String(existing.frequency || "") !== String(next.frequency || "")
    || Number(existing.intervalCount || 1) !== Number(next.intervalCount || 1)
    || existingWeekdays !== nextWeekdays
    || Number(existing.dayOfMonth || 0) !== Number(next.dayOfMonth || 0)
    || Number(existing.monthOfYear || 0) !== Number(next.monthOfYear || 0)
    || String(existing.startAt || "") !== String(next.startAt || "")
    || String(existing.endAt || "") !== String(next.endAt || "")
    || String(existing.timeOfDay || "") !== String(next.timeOfDay || "");
}

function createFinanceRecurringService({
  repository,
  transactionService,
  clock = nowIso,
  idGenerator = defaultId,
} = {}) {
  if (!repository) throw new Error("repository_required");
  if (!transactionService) throw new Error("transaction_service_required");

  function resolveRuleInput(input = {}, context = {}, existing = null) {
    const ledgerId = existing?.ledgerId || normalizeLedgerId(input, context);
    assertLedgerAccess(ledgerId, context);
    const type = normalizeType(input.type || input.transactionType || input.transaction_type || existing?.transactionType);
    const currency = normalizeCurrency(input.currency || existing?.currency || "CNY");
    const scale = currencyScale(currency);
    const amountMinor = Number.isInteger(input.amountMinor)
      ? input.amountMinor
      : Number.isInteger(input.amount_minor)
        ? input.amount_minor
        : input.amount !== undefined
          ? parseAmountToMinor(input.amount, currency, { scale })
          : existing?.amountMinor;
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) throw new Error("amount_must_be_positive");

    const accounts = repository.listAccounts(ledgerId);
    const categories = repository.listCategories(ledgerId, type === "income" ? "income" : "expense");
    const members = repository.listMembers(ledgerId);
    const accountId = resolveScopedId({
      rows: accounts,
      explicitId: input.accountId || input.account_id || existing?.accountId,
      hint: input.accountHint || input.account_hint,
      fallback: accounts[0]?.id,
      errorCode: "account_not_in_ledger",
    });
    const targetAccountId = resolveScopedId({
      rows: accounts,
      explicitId: input.targetAccountId || input.target_account_id || existing?.targetAccountId,
      hint: input.targetAccountHint || input.target_account_hint,
      fallback: "",
      errorCode: "target_account_not_in_ledger",
    });
    if (!accountId) throw new Error("account_required");
    const categoryId = resolveScopedId({
      rows: categories,
      explicitId: input.categoryId || input.category_id || existing?.categoryId,
      hint: input.categoryHint || input.category_hint,
      fallback: "",
      errorCode: "category_not_in_ledger",
    });
    const memberId = resolveScopedId({
      rows: members,
      explicitId: input.memberId || input.member_id || existing?.memberId,
      hint: input.memberHint || input.member_hint,
      fallback: members[0]?.id || "",
      errorCode: "member_not_in_ledger",
    });
    const hasStartAt = Object.prototype.hasOwnProperty.call(input, "startAt")
      || Object.prototype.hasOwnProperty.call(input, "start_at");
    const inputStartAt = Object.prototype.hasOwnProperty.call(input, "startAt") ? input.startAt : input.start_at;
    const startAt = inputStartAt || existing?.startAt || clock();
    const timeOfDay = normalizeTimeOfDay(input.timeOfDay || input.time_of_day || existing?.timeOfDay || "09:00");
    const startDayPart = datePart(startAt);
    const hasDayOfMonth = Object.prototype.hasOwnProperty.call(input, "dayOfMonth")
      || Object.prototype.hasOwnProperty.call(input, "day_of_month");
    const inputDayOfMonth = Object.prototype.hasOwnProperty.call(input, "dayOfMonth") ? input.dayOfMonth : input.day_of_month;
    const dayOfMonth = Number(inputDayOfMonth || (hasStartAt ? Number(startDayPart.slice(8, 10)) : existing?.dayOfMonth || Number(startDayPart.slice(8, 10))));
    const hasMonthOfYear = Object.prototype.hasOwnProperty.call(input, "monthOfYear")
      || Object.prototype.hasOwnProperty.call(input, "month_of_year");
    const inputMonthOfYear = Object.prototype.hasOwnProperty.call(input, "monthOfYear") ? input.monthOfYear : input.month_of_year;
    const monthOfYear = Number(inputMonthOfYear || (hasStartAt ? Number(startDayPart.slice(5, 7)) : existing?.monthOfYear || Number(startDayPart.slice(5, 7))));
    const base = {
      id: existing?.id || input.id || idGenerator("recurring"),
      ledgerId,
      status: input.status || existing?.status || "active",
      title: String(input.title || existing?.title || input.note || "周期账").trim(),
      transactionType: type,
      amountMinor,
      scale,
      currency,
      categoryId,
      accountId,
      targetAccountId,
      memberId,
      merchantName: String(input.merchant || input.merchantName || input.merchant_name || existing?.merchantName || ""),
      note: String(input.note ?? existing?.note ?? ""),
      tags: Array.isArray(input.tags) ? input.tags : existing?.tags || [],
      frequency: String(input.frequency || existing?.frequency || "monthly"),
      intervalCount: Math.max(1, Math.min(99, Number(input.intervalCount || input.interval_count || existing?.intervalCount || 1))),
      weekdays: normalizeWeekdays(input.weekdays !== undefined ? input.weekdays : existing?.weekdays || []),
      dayOfMonth,
      monthOfYear,
      startAt: shanghaiIso(startAt, timeOfDay),
      endAt: input.endAt || input.end_at || existing?.endAt || "",
      timeOfDay,
      createdAt: existing?.createdAt || clock(),
      updatedAt: clock(),
    };
    const explicitNextDue = Object.prototype.hasOwnProperty.call(input, "nextDueAt")
      ? input.nextDueAt
      : Object.prototype.hasOwnProperty.call(input, "next_due_at")
        ? input.next_due_at
        : undefined;
    if (explicitNextDue !== undefined) {
      base.nextDueAt = explicitNextDue || "";
    } else if (existing && !recurringScheduleChanged(existing, base)) {
      base.nextDueAt = existing.nextDueAt || "";
    } else {
      base.nextDueAt = nextDueAfter(base);
    }
    return base;
  }

  function listRecurringRules(filters = {}, context = {}) {
    const ledgerId = normalizeLedgerId(filters, context);
    return repository.listRecurringRules({ ledgerId, status: filters.status || "" }).map(publicRule);
  }

  function createRecurringRule(input = {}, context = {}) {
    requireWrite(context);
    const row = resolveRuleInput(input, context);
    return repository.transaction(() => {
      const inserted = repository.insertRecurringRule(row);
      const audit = repository.insertAudit({
        ledgerId: row.ledgerId,
        actorRef: actorRef(context),
        action: "recurring_rule.create",
        entityType: "recurring_rule",
        entityId: inserted.id,
        after: inserted,
      });
      return { rule: publicRule(inserted), auditId: audit.id };
    });
  }

  function updateRecurringRule(ruleId, patch = {}, context = {}) {
    requireWrite(context);
    const before = repository.getRecurringRule(ruleId);
    if (!before) throw new Error("recurring_rule_not_found");
    assertLedgerAccess(before.ledgerId, context);
    const row = resolveRuleInput({ ...patch, status: patch.status || before.status }, context, before);
    return repository.transaction(() => {
      const after = repository.updateRecurringRule(row);
      const audit = repository.insertAudit({
        ledgerId: before.ledgerId,
        actorRef: actorRef(context),
        action: "recurring_rule.update",
        entityType: "recurring_rule",
        entityId: ruleId,
        before,
        after,
      });
      return { rule: publicRule(after), auditId: audit.id };
    });
  }

  function setRecurringRuleStatus(ruleId, status, context = {}) {
    requireWrite(context);
    if (!["active", "paused"].includes(status)) throw new Error("invalid_recurring_rule_status");
    const before = repository.getRecurringRule(ruleId);
    if (!before) throw new Error("recurring_rule_not_found");
    assertLedgerAccess(before.ledgerId, context);
    return repository.transaction(() => {
      const after = repository.setRecurringRuleStatus(ruleId, status, clock());
      const audit = repository.insertAudit({
        ledgerId: before.ledgerId,
        actorRef: actorRef(context),
        action: `recurring_rule.${status}`,
        entityType: "recurring_rule",
        entityId: ruleId,
        before,
        after,
      });
      return { rule: publicRule(after), auditId: audit.id };
    });
  }

  function deleteRecurringRule(ruleId, options = {}, context = {}) {
    requireWrite(context);
    const before = repository.getRecurringRule(ruleId);
    if (!before) throw new Error("recurring_rule_not_found");
    assertLedgerAccess(before.ledgerId, context);
    const voidGenerated = Boolean(options.voidGenerated || options.void_generated);
    const voidedTransactions = [];
    if (voidGenerated) {
      for (const row of repository.listGeneratedTransactionsForRecurringRule(ruleId, before.ledgerId)) {
        if (row.status !== "active") continue;
        const result = transactionService.voidTransaction(row.id, "recurring_rule_deleted", context);
        voidedTransactions.push(result.transaction);
      }
    }
    return repository.transaction(() => {
      const after = repository.setRecurringRuleStatus(ruleId, "deleted", clock(), clock());
      const audit = repository.insertAudit({
        ledgerId: before.ledgerId,
        actorRef: actorRef(context),
        action: "recurring_rule.delete",
        entityType: "recurring_rule",
        entityId: ruleId,
        before,
        after: { ...after, voidGenerated },
      });
      return { rule: publicRule(after), auditId: audit.id, voidedTransactions };
    });
  }

  function transactionInputForRule(rule, dueAt) {
    return {
      type: rule.transactionType,
      amount: formatMinor(rule.amountMinor, rule.currency, { scale: rule.scale || 2 }),
      currency: rule.currency,
      occurred_at: dueAt,
      category_id: rule.categoryId || undefined,
      account_id: rule.accountId,
      target_account_id: rule.targetAccountId || undefined,
      member_id: rule.memberId || undefined,
      merchant: rule.merchantName || undefined,
      note: rule.note || rule.title,
      tags: rule.tags || [],
      source: "recurring",
      source_ref: `recurring:${rule.id}:${dueAt}`,
      idempotency_key: `recurring:${rule.id}:${dueAt}`,
    };
  }

  function generateDueTransactions(input = {}, context = {}) {
    requireWrite(context);
    const ledgerId = normalizeLedgerId(input, context);
    const throughAt = input.throughAt || input.through_at || clock();
    const maxOccurrences = Math.max(1, Math.min(100, Number(input.maxOccurrences || input.max_occurrences || 50)));
    const created = [];
    let attempts = 0;
    for (const rule of repository.listDueRecurringRules({ ledgerId, throughAt })) {
      let current = rule;
      while (current?.nextDueAt && current.status === "active" && current.nextDueAt <= throughAt && attempts < maxOccurrences) {
        attempts += 1;
        const dueAt = current.nextDueAt;
        const result = transactionService.createTransaction(transactionInputForRule(current, dueAt), {
          ...context,
          ledgerId,
          actorRef: actorRef(context) || "recurring",
        });
        if (!result.duplicate) created.push({ ruleId: current.id, transaction: result.transaction });
        const nextDueAt = nextDueAfter(current, dueAt);
        current = repository.updateRecurringRuleNextDue(current.id, nextDueAt, clock());
        if (!nextDueAt) current = repository.setRecurringRuleStatus(current.id, "completed", clock());
      }
    }
    return { generated: created, count: created.length };
  }

  return {
    listRecurringRules,
    createRecurringRule,
    updateRecurringRule,
    setRecurringRuleStatus,
    deleteRecurringRule,
    generateDueTransactions,
  };
}

module.exports = {
  createFinanceRecurringService,
  nextDueAfter,
};
