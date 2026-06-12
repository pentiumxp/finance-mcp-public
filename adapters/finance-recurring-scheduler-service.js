"use strict";

function nowIso() {
  return new Date().toISOString();
}

function cleanEnabled(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return !["0", "false", "off", "disabled", "no"].includes(text);
}

function cleanInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function resolveRecurringAutoPostConfig(env = process.env) {
  return {
    enabled: cleanEnabled(env.FINANCE_RECURRING_AUTO_POST),
    intervalMs: cleanInteger(env.FINANCE_RECURRING_AUTO_POST_INTERVAL_MS, 5 * 60 * 1000, {
      min: 60 * 1000,
      max: 24 * 60 * 60 * 1000,
    }),
    maxOccurrences: cleanInteger(env.FINANCE_RECURRING_AUTO_POST_MAX_OCCURRENCES, 100, {
      min: 1,
      max: 100,
    }),
    catchUpPassLimit: cleanInteger(env.FINANCE_RECURRING_AUTO_POST_CATCH_UP_PASSES, 1000, {
      min: 1,
      max: 10000,
    }),
    actorRef: String(env.FINANCE_RECURRING_AUTO_POST_ACTOR || "recurring-auto-post").trim() || "recurring-auto-post",
  };
}

function errorCode(error) {
  return error?.code || error?.message || "recurring_auto_post_failed";
}

function createFinanceRecurringSchedulerService({
  repository,
  recurringService,
  clock = nowIso,
  intervalMs = 5 * 60 * 1000,
  maxOccurrences = 100,
  catchUpPassLimit = 1000,
  actorRef = "recurring-auto-post",
  logger = null,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  if (!repository) throw new Error("repository_required");
  if (!recurringService) throw new Error("recurring_service_required");
  if (typeof repository.listLedgerIdsWithDueRecurringRules !== "function") throw new Error("due_recurring_ledger_query_required");
  if (typeof recurringService.generateDueTransactions !== "function") throw new Error("recurring_generate_required");

  const normalizedIntervalMs = cleanInteger(intervalMs, 5 * 60 * 1000, { min: 1, max: 24 * 60 * 60 * 1000 });
  const normalizedMaxOccurrences = cleanInteger(maxOccurrences, 100, { min: 1, max: 100 });
  const normalizedCatchUpPassLimit = cleanInteger(catchUpPassLimit, 1000, { min: 1, max: 10000 });
  let timer = null;
  let started = false;
  let running = false;
  let lastResult = null;

  function status() {
    return {
      started,
      running,
      intervalMs: normalizedIntervalMs,
      maxOccurrences: normalizedMaxOccurrences,
      catchUpPassLimit: normalizedCatchUpPassLimit,
      lastResult,
    };
  }

  function ledgerStillDue(ledgerId, throughAt) {
    return repository.listLedgerIdsWithDueRecurringRules(throughAt).includes(ledgerId);
  }

  function runOnce(input = {}) {
    const throughAt = input.throughAt || input.through_at || clock();
    if (running) {
      return {
        skipped: true,
        reason: "already_running",
        throughAt,
        count: 0,
        ledgers: [],
        errors: [],
      };
    }

    running = true;
    const ledgers = [];
    const errors = [];
    let count = 0;
    try {
      for (const ledgerId of repository.listLedgerIdsWithDueRecurringRules(throughAt)) {
        try {
          let ledgerCount = 0;
          let passes = 0;
          let stillDue = true;
          while (stillDue && passes < normalizedCatchUpPassLimit) {
            passes += 1;
            const result = recurringService.generateDueTransactions({
              ledger_id: ledgerId,
              through_at: throughAt,
              max_occurrences: normalizedMaxOccurrences,
            }, {
              role: "owner",
              ledgerId,
              actorRef,
            });
            ledgerCount += Number(result?.count || 0);
            stillDue = ledgerStillDue(ledgerId, throughAt);
          }
          count += ledgerCount;
          ledgers.push({ ledgerId, count: ledgerCount, passes });
          if (stillDue) errors.push({ ledgerId, error: "recurring_auto_post_catch_up_pass_limit" });
        } catch (error) {
          errors.push({ ledgerId, error: errorCode(error) });
        }
      }
      lastResult = {
        skipped: false,
        throughAt,
        count,
        ledgers,
        errors,
      };
      return lastResult;
    } finally {
      running = false;
    }
  }

  function schedule(delayMs) {
    if (!started) return;
    timer = setTimer(tick, delayMs);
    if (timer && typeof timer.unref === "function") timer.unref();
  }

  function tick() {
    timer = null;
    try {
      const result = runOnce();
      if (result.count > 0 && logger?.info) {
        logger.info(`Finance recurring auto-post generated ${result.count} transaction(s).`);
      }
      if (result.errors.length && logger?.warn) {
        logger.warn(`Finance recurring auto-post skipped ${result.errors.length} ledger(s) with errors.`);
      }
    } catch (error) {
      lastResult = {
        skipped: false,
        throughAt: clock(),
        count: 0,
        ledgers: [],
        errors: [{ ledgerId: "", error: errorCode(error) }],
      };
      if (logger?.warn) logger.warn(`Finance recurring auto-post failed: ${errorCode(error)}`);
    }
    schedule(normalizedIntervalMs);
  }

  function start(options = {}) {
    if (started) return status();
    const runImmediately = options.runImmediately !== false;
    started = true;
    schedule(runImmediately ? 0 : normalizedIntervalMs);
    return status();
  }

  function stop() {
    started = false;
    if (timer) clearTimer(timer);
    timer = null;
    return status();
  }

  return {
    runOnce,
    start,
    status,
    stop,
  };
}

module.exports = {
  createFinanceRecurringSchedulerService,
  resolveRecurringAutoPostConfig,
};
