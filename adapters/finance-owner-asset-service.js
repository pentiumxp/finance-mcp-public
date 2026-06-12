"use strict";

const { fetchYahooPrice, yahooFxSymbol } = require("./finance-market-quote-provider");

const OWNER_FINANCE_USER_ID = "user_xuxin";

const DEFAULT_COMPONENT_LABELS = Object.freeze({
  usd_account: "美元账户",
  cny_bank: "人民币银行余额",
  cny_securities: "证券余额",
  cny_trust: "家托",
  cny_domestic_total: "国内总额",
  cny_other_investment: "其它投资",
});

function clean(value) {
  return String(value || "").trim();
}

function finiteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function decimalToMinor(value, scale = 2) {
  return Math.round(finiteNumber(value) * (10 ** scale));
}

function decimalRateToBps(value) {
  return Math.round(finiteNumber(value) * 10000);
}

function decimalRateToPpm(value) {
  return Math.round(finiteNumber(value) * 1000000);
}

function ppmToRateString(value) {
  const ppm = Number(value || 0);
  return ppm > 0 ? String(ppm / 1000000) : "";
}

function hasOwnValue(input = {}, key) {
  return Object.prototype.hasOwnProperty.call(input, key) && input[key] != null && input[key] !== "";
}

function firstOwnValue(input = {}, keys = []) {
  for (const key of keys) {
    if (hasOwnValue(input, key)) return input[key];
  }
  return undefined;
}

function parseBooleanLike(value, fallback = false) {
  if (value == null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const text = clean(value).toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return fallback;
}

function majorFromMinor(value, scale = 2) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount / (10 ** scale) : 0;
}

function bpsFromDecimalRate(value) {
  return Math.round(finiteNumber(value) * 10000);
}

function bpsFromMultiple(value) {
  return Math.round(finiteNumber(value) * 10000);
}

function findComponent(components = [], keys = []) {
  const wanted = new Set(keys.map((key) => clean(key)));
  return components.find((component) => wanted.has(component.componentKey));
}

function componentUsdMajor(component, fxUsdCnyPpm = 0) {
  if (!component) return 0;
  if (component.currency === "USD") return majorFromMinor(component.amountMinor);
  const fx = Number(fxUsdCnyPpm) / 1000000;
  if (fx > 0 && component.amountCnyMinor) return majorFromMinor(component.amountCnyMinor) / fx;
  return 0;
}

function usdAccountMajor(components = [], fxUsdCnyPpm = 0) {
  return componentUsdMajor(findComponent(components, ["usd_account"]), fxUsdCnyPpm);
}

function usdContributionMajor(input = {}, components = [], fxUsdCnyPpm = 0) {
  const explicitUsdMinor = firstOwnValue(input, ["usdNetContributionMinor", "usd_net_contribution_minor", "usdPrincipalMinor", "usd_principal_minor"]);
  if (explicitUsdMinor !== undefined) return majorFromMinor(explicitUsdMinor);
  const explicitUsd = firstOwnValue(input, ["usdNetContribution", "usd_net_contribution", "usdPrincipal", "usd_principal"]);
  if (explicitUsd !== undefined) return finiteNumber(explicitUsd);
  const explicitCnyMinor = firstOwnValue(input, ["usdNetContributionCnyMinor", "usd_net_contribution_cny_minor"]);
  const fx = Number(fxUsdCnyPpm) / 1000000;
  if (explicitCnyMinor !== undefined && fx > 0) return majorFromMinor(explicitCnyMinor) / fx;
  const explicitCny = firstOwnValue(input, ["usdNetContributionCny", "usd_net_contribution_cny"]);
  if (explicitCny !== undefined && fx > 0) return finiteNumber(explicitCny) / fx;
  return componentUsdMajor(findComponent(components, ["usd_net_contribution", "usd_principal"]), fxUsdCnyPpm);
}

function requireOwner(context = {}) {
  const financeUserId = context.financeUserId || OWNER_FINANCE_USER_ID;
  if (context.role !== "owner" || financeUserId !== OWNER_FINANCE_USER_ID) {
    throw new Error("finance_owner_assets_owner_required");
  }
  if (context.readOnly) throw new Error("finance_write_denied");
  return financeUserId;
}

function requireOwnerRead(context = {}) {
  const financeUserId = context.financeUserId || OWNER_FINANCE_USER_ID;
  if (context.role !== "owner" || financeUserId !== OWNER_FINANCE_USER_ID) {
    throw new Error("finance_owner_assets_owner_required");
  }
  return financeUserId;
}

function normalizeYear(value) {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) throw new Error("asset_snapshot_year_invalid");
  return year;
}

function normalizeComponent(input = {}, index = 0) {
  const componentKey = clean(input.componentKey || input.component_key || input.key);
  if (!componentKey) throw new Error("asset_component_key_required");
  const currency = clean(input.currency || "CNY").toUpperCase();
  const scale = Number.isInteger(input.scale) ? input.scale : 2;
  const amountMinor = input.amountMinor != null || input.amount_minor != null
    ? Number(input.amountMinor ?? input.amount_minor)
    : decimalToMinor(input.amount || 0, scale);
  const amountCnyMinor = input.amountCnyMinor != null || input.amount_cny_minor != null
    ? Number(input.amountCnyMinor ?? input.amount_cny_minor)
    : decimalToMinor(input.amount_cny ?? input.amountCny ?? input.amount ?? 0, 2);
  return {
    componentKey,
    label: clean(input.label) || DEFAULT_COMPONENT_LABELS[componentKey] || componentKey,
    currency,
    amountMinor: Number.isFinite(amountMinor) ? amountMinor : 0,
    amountCnyMinor: Number.isFinite(amountCnyMinor) ? amountCnyMinor : 0,
    sortOrder: Number.isFinite(Number(input.sortOrder ?? input.sort_order)) ? Number(input.sortOrder ?? input.sort_order) : index,
  };
}

function snapshotProjection(snapshot, components = []) {
  if (!snapshot) return null;
  return {
    id: snapshot.id,
    finance_user_id: snapshot.financeUserId,
    year: snapshot.year,
    as_of_date: snapshot.asOfDate,
    base_currency: snapshot.baseCurrency,
    fx_usd_cny_rate: snapshot.fxUsdCnyPpm ? String(snapshot.fxUsdCnyPpm / 1000000) : "",
    usd_investment_year: snapshot.usdInvestmentYear,
    usd_annual_return_bps: snapshot.usdAnnualReturnBps,
    usd_cagr_bps: snapshot.usdCagrBps,
    usd_total_return_multiple_bps: snapshot.usdTotalReturnMultipleBps,
    total_assets_cny_minor: snapshot.totalAssetsCnyMinor,
    current_usd_cny_rate: ppmToRateString(snapshot.currentUsdCnyPpm),
    current_usd_cny_ppm: snapshot.currentUsdCnyPpm || 0,
    current_total_assets_usd_minor: snapshot.currentTotalAssetsUsdMinor || 0,
    current_fx_updated_at: snapshot.currentFxUpdatedAt || "",
    current_fx_source: snapshot.currentFxSource || "",
    source: snapshot.source,
    source_ref: snapshot.sourceRef,
    notes: snapshot.notes,
    components: components.map((row) => ({
      component_key: row.componentKey,
      label: row.label,
      currency: row.currency,
      amount_minor: row.amountMinor,
      amount_cny_minor: row.amountCnyMinor,
      sort_order: row.sortOrder,
    })),
    created_at: snapshot.createdAt,
    updated_at: snapshot.updatedAt,
  };
}

function createFinanceOwnerAssetService({ repository, quoteProvider = fetchYahooPrice } = {}) {
  if (!repository) throw new Error("repository_required");

  function valueOrExisting(input, keys, existingValue, fallback = 0) {
    const value = firstOwnValue(input, keys);
    if (value !== undefined) return value;
    return existingValue ?? fallback;
  }

  function bpsValueOrExisting(input, bpsKeys, decimalKeys, existingValue, fallback = 0) {
    const bpsValue = firstOwnValue(input, bpsKeys);
    if (bpsValue !== undefined) return Number(bpsValue);
    const decimalValue = firstOwnValue(input, decimalKeys);
    if (decimalValue !== undefined) return decimalRateToBps(decimalValue);
    return Number(existingValue ?? fallback) || 0;
  }

  function minorValueOrExisting(input, minorKeys, decimalKeys, existingValue, fallback = 0) {
    const minorValue = firstOwnValue(input, minorKeys);
    if (minorValue !== undefined) return Number(minorValue);
    const decimalValue = firstOwnValue(input, decimalKeys);
    if (decimalValue !== undefined) return decimalToMinor(decimalValue);
    return Number(existingValue ?? fallback) || 0;
  }

  function shouldRecalculateUsdReturnMetrics(input = {}) {
    const explicit = firstOwnValue(input, ["recalculateUsdReturnMetrics", "recalculate_usd_return_metrics"]);
    if (explicit !== undefined) return parseBooleanLike(explicit, true);
    return clean(input.source) !== "owner_asset_xlsx";
  }

  function recalculateUsdReturnMetrics({ financeUserId, year, input, row, components, existing } = {}) {
    const explicit = {
      usdAnnualReturnBps: row.usdAnnualReturnBps,
      usdCagrBps: row.usdCagrBps,
      usdTotalReturnMultipleBps: row.usdTotalReturnMultipleBps,
    };
    if (!shouldRecalculateUsdReturnMetrics(input)) return explicit;
    const currentUsd = usdAccountMajor(components, row.fxUsdCnyPpm);
    if (!(currentUsd > 0)) return explicit;
    const priorSnapshots = repository.listOwnerAssetSnapshots({
      financeUserId,
      startYear: 0,
      endYear: year - 1,
      limit: 500,
    });
    const previous = priorSnapshots.at(-1);
    if (!previous) return explicit;
    const previousUsd = usdAccountMajor(repository.listOwnerAssetComponents(previous.id), previous.fxUsdCnyPpm);
    const denominator = previousUsd + usdContributionMajor(input, components, row.fxUsdCnyPpm);
    if (!(denominator > 0)) return explicit;
    const annualReturnBps = bpsFromDecimalRate((currentUsd / denominator) - 1);
    let totalReturnMultiple = 1;
    for (const snapshot of priorSnapshots) {
      totalReturnMultiple *= 1 + ((Number(snapshot.usdAnnualReturnBps) || 0) / 10000);
    }
    totalReturnMultiple *= 1 + (annualReturnBps / 10000);
    if (!(totalReturnMultiple > 0)) return {
      ...explicit,
      usdAnnualReturnBps: annualReturnBps,
    };
    const investmentYear = Number(row.usdInvestmentYear || existing?.usdInvestmentYear || 0) || 0;
    return {
      usdAnnualReturnBps: annualReturnBps,
      usdCagrBps: investmentYear > 0 ? bpsFromDecimalRate((totalReturnMultiple ** (1 / investmentYear)) - 1) : explicit.usdCagrBps,
      usdTotalReturnMultipleBps: bpsFromMultiple(totalReturnMultiple),
    };
  }

  function upsertSnapshot(input = {}, context = {}) {
    const financeUserId = requireOwner(context);
    const year = normalizeYear(input.year || input.snapshot_year);
    let componentCount = 0;
    const snapshot = repository.transaction(() => {
      const existing = repository.getOwnerAssetSnapshotByYear(financeUserId, year);
      const components = Array.isArray(input.components)
        ? input.components.map(normalizeComponent)
        : existing
          ? repository.listOwnerAssetComponents(existing.id)
          : [];
      componentCount = components.length;
      const fxValue = firstOwnValue(input, ["fxUsdCnyPpm", "fx_usd_cny_ppm"]);
      const fxRateValue = firstOwnValue(input, ["fx_usd_cny_rate", "fxUsdCnyRate"]);
      const row = {
        financeUserId,
        year,
        asOfDate: clean(input.asOfDate || input.as_of_date) || existing?.asOfDate || `${year}-12-31`,
        baseCurrency: clean(input.baseCurrency || input.base_currency) || existing?.baseCurrency || "CNY",
        fxUsdCnyPpm: fxValue !== undefined
          ? Number(fxValue)
          : fxRateValue !== undefined
            ? decimalRateToPpm(fxRateValue)
            : Number(existing?.fxUsdCnyPpm || 0),
        usdInvestmentYear: Number(valueOrExisting(input, ["usdInvestmentYear", "usd_investment_year"], existing?.usdInvestmentYear, 0)) || 0,
        usdAnnualReturnBps: bpsValueOrExisting(input, ["usdAnnualReturnBps", "usd_annual_return_bps"], ["usd_annual_return_rate", "usdAnnualReturnRate"], existing?.usdAnnualReturnBps, 0),
        usdCagrBps: bpsValueOrExisting(input, ["usdCagrBps", "usd_cagr_bps"], ["usd_cagr", "usdCagr"], existing?.usdCagrBps, 0),
        usdTotalReturnMultipleBps: bpsValueOrExisting(input, ["usdTotalReturnMultipleBps", "usd_total_return_multiple_bps"], ["usd_total_return_multiple", "usdTotalReturnMultiple"], existing?.usdTotalReturnMultipleBps, 0),
        totalAssetsCnyMinor: minorValueOrExisting(input, ["totalAssetsCnyMinor", "total_assets_cny_minor"], ["total_assets_cny", "totalAssetsCny"], existing?.totalAssetsCnyMinor, 0),
        source: clean(input.source || existing?.source || "manual"),
        sourceRef: clean(input.sourceRef || input.source_ref || existing?.sourceRef),
        notes: clean(input.notes || existing?.notes),
      };
      Object.assign(row, recalculateUsdReturnMetrics({ financeUserId, year, input, row, components, existing }));
      const saved = repository.upsertOwnerAssetSnapshot(row);
      repository.replaceOwnerAssetComponents(saved.id, components);
      return saved;
    });
    return {
      snapshot: snapshotProjection(snapshot, repository.listOwnerAssetComponents(snapshot.id)),
      component_count: componentCount,
    };
  }

  function listSnapshots(input = {}, context = {}) {
    const financeUserId = requireOwnerRead(context);
    const snapshots = repository.listOwnerAssetSnapshots({
      financeUserId,
      startYear: Number(input.startYear || input.start_year || 0) || 0,
      endYear: Number(input.endYear || input.end_year || 9999) || 9999,
      limit: Math.min(Math.max(Number(input.limit || 200) || 200, 1), 500),
    });
    return {
      snapshots: snapshots.map((snapshot) => snapshotProjection(snapshot, repository.listOwnerAssetComponents(snapshot.id))),
    };
  }

  async function refreshLatestCurrentUsdProjection(latest) {
    if (!latest?.id || !(Number(latest.totalAssetsCnyMinor) > 0)) return latest;
    const rate = Number(await quoteProvider(yahooFxSymbol("CNY")));
    if (!Number.isFinite(rate) || !(rate > 0)) throw new Error("asset_live_fx_missing:USD_CNY");
    const currentUsdCnyPpm = decimalRateToPpm(rate);
    const currentTotalAssetsUsdMinor = Math.round(Number(latest.totalAssetsCnyMinor || 0) / rate);
    return repository.updateOwnerAssetCurrentUsdProjection({
      id: latest.id,
      currentUsdCnyPpm,
      currentTotalAssetsUsdMinor,
      currentFxSource: `yahoo:${yahooFxSymbol("CNY")}`,
    });
  }

  async function getSummary(input = {}, context = {}) {
    const financeUserId = requireOwnerRead(context);
    let latest = repository.getLatestOwnerAssetSnapshot(financeUserId);
    let currentFxError = "";
    if (latest && parseBooleanLike(input.refresh_live_fx ?? input.refreshLiveFx, true)) {
      try {
        latest = await refreshLatestCurrentUsdProjection(latest);
      } catch (err) {
        currentFxError = err?.message || String(err);
      }
    }
    const snapshots = repository.listOwnerAssetSnapshots({
      financeUserId,
      startYear: Number(input.startYear || input.start_year || 0) || 0,
      endYear: Number(input.endYear || input.end_year || 9999) || 9999,
      limit: 500,
    });
    return {
      latest: latest ? snapshotProjection(latest, repository.listOwnerAssetComponents(latest.id)) : null,
      snapshots: snapshots.map((snapshot) => snapshotProjection(snapshot, repository.listOwnerAssetComponents(snapshot.id))),
      history_count: snapshots.length,
      first_year: snapshots[0]?.year || null,
      latest_year: latest?.year || null,
      current_fx_error: currentFxError,
    };
  }

  return {
    upsertSnapshot,
    listSnapshots,
    getSummary,
    OWNER_FINANCE_USER_ID,
  };
}

module.exports = {
  OWNER_FINANCE_USER_ID,
  createFinanceOwnerAssetService,
  decimalToMinor,
  decimalRateToBps,
  decimalRateToPpm,
};
