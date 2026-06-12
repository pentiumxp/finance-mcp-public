"use strict";

const { OWNER_FINANCE_USER_ID } = require("./finance-owner-asset-service");
const { fetchYahooPrice, yahooFxSymbol } = require("./finance-market-quote-provider");

const DEFAULT_POSITION_META = Object.freeze({
  "腾讯控股": { positionKey: "tencent_hk", ticker: "0700.HK", market: "HKEX", currency: "HKD", label: "腾讯控股" },
  "港股腾讯": { positionKey: "tencent_hk", ticker: "0700.HK", market: "HKEX", currency: "HKD", label: "腾讯控股" },
  "腾讯港股通": { positionKey: "tencent_stock_connect", ticker: "0700.HK", market: "HKEX Stock Connect", currency: "HKD", label: "腾讯港股通" },
  "贵州茅台": { positionKey: "kweichow_moutai", ticker: "600519.SS", market: "SSE", currency: "CNY", label: "贵州茅台" },
  "茅台": { positionKey: "kweichow_moutai", ticker: "600519.SS", market: "SSE", currency: "CNY", label: "贵州茅台" },
  "特斯拉": { positionKey: "tesla", ticker: "TSLA", market: "NASDAQ", currency: "USD", label: "特斯拉" },
  "tsla": { positionKey: "tesla", ticker: "TSLA", market: "NASDAQ", currency: "USD", label: "特斯拉" },
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

function bpsFromRatio(value) {
  return Math.round(finiteNumber(value) * 10000);
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

function requireOwner(context = {}) {
  const financeUserId = clean(context.financeUserId || OWNER_FINANCE_USER_ID);
  if (!financeUserId || context.role !== "owner") {
    throw new Error("finance_stocks_access_required");
  }
  if (context.readOnly) throw new Error("finance_write_denied");
  return financeUserId;
}

function requireOwnerRead(context = {}) {
  const financeUserId = clean(context.financeUserId || OWNER_FINANCE_USER_ID);
  if (!financeUserId || context.role !== "owner") {
    throw new Error("finance_stocks_access_required");
  }
  return financeUserId;
}

function normalizeDate(value) {
  const text = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error("stock_snapshot_date_invalid");
  return text;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function resolvePositionMeta(hint = "") {
  const text = clean(hint).toLowerCase();
  if (!text) return null;
  for (const [key, meta] of Object.entries(DEFAULT_POSITION_META)) {
    if (text === key.toLowerCase() || text.includes(key.toLowerCase())) return meta;
  }
  return null;
}

function quantityUnitsMicro(input = {}) {
  const explicit = firstOwnValue(input, ["quantityUnitsMicro", "quantity_units_micro"]);
  if (explicit !== undefined) return Math.round(finiteNumber(explicit));
  const units = firstOwnValue(input, ["quantityUnits", "quantity_units", "quantity"]);
  if (units !== undefined) return Math.round(finiteNumber(units) * 1000000);
  const wan = firstOwnValue(input, ["quantityWan", "quantity_wan"]);
  if (wan !== undefined) return Math.round(finiteNumber(wan) * 10000 * 1000000);
  return 0;
}

function quantityMajor(quantityMicro) {
  return finiteNumber(quantityMicro) / 1000000;
}

function fxToBaseRate(input = {}) {
  const ppm = firstOwnValue(input, ["fxToBasePpm", "fx_to_base_ppm"]);
  if (ppm !== undefined) return finiteNumber(ppm) / 1000000;
  const rate = firstOwnValue(input, ["fxToBaseRate", "fx_to_base_rate", "fxRate", "fx_rate"]);
  return finiteNumber(rate, 1) || 1;
}

function localMajorToBaseMinor(localMajor, fxRate, baseScale = 2) {
  const rate = finiteNumber(fxRate, 1) || 1;
  return Math.round((finiteNumber(localMajor) / rate) * (10 ** baseScale));
}

function normalizePosition(input = {}, index = 0, baseCurrency = "USD", baseScale = 2) {
  const label = clean(input.label || input.name);
  if (!label) throw new Error("stock_position_label_required");
  const ticker = clean(input.ticker || input.symbol);
  const market = clean(input.market || input.exchange);
  const currency = clean(input.currency || "USD").toUpperCase();
  const scale = Number.isInteger(input.scale) ? input.scale : 2;
  const quantityMicro = quantityUnitsMicro(input);
  if (!(quantityMicro > 0)) throw new Error("stock_position_quantity_required");
  const quantity = quantityMajor(quantityMicro);
  const fxRate = fxToBaseRate(input);
  const averageCostMinor = decimalToMinor(firstOwnValue(input, ["averageCost", "average_cost", "buyPrice", "buy_price"]) ?? 0, scale);
  const openingPriceMinor = decimalToMinor(firstOwnValue(input, ["openingPrice", "opening_price"]) ?? 0, scale);
  const currentPriceMinor = decimalToMinor(firstOwnValue(input, ["currentPrice", "current_price"]) ?? 0, scale);
  if (!(currentPriceMinor > 0)) throw new Error("stock_position_current_price_required");

  const averageCost = averageCostMinor / (10 ** scale);
  const openingPrice = openingPriceMinor / (10 ** scale);
  const currentPrice = currentPriceMinor / (10 ** scale);
  const costBasisLocal = quantity * averageCost;
  const openingValueLocal = quantity * openingPrice;
  const currentValueLocal = quantity * currentPrice;
  const currentMarketValueMinor = decimalToMinor(currentValueLocal, scale);
  const costBasisMinor = decimalToMinor(costBasisLocal, scale);
  const openingMarketValueMinor = decimalToMinor(openingValueLocal, scale);
  const marketValueBaseMinor = localMajorToBaseMinor(currentValueLocal, fxRate, baseScale);
  const costBasisBaseMinor = localMajorToBaseMinor(costBasisLocal, fxRate, baseScale);
  const openingMarketValueBaseMinor = localMajorToBaseMinor(openingValueLocal, fxRate, baseScale);

  return {
    positionKey: clean(input.positionKey || input.position_key || ticker || label).toLowerCase(),
    label,
    ticker,
    market,
    currency,
    scale,
    quantityUnitsMicro: quantityMicro,
    quantityUnit: clean(input.quantityUnit || input.quantity_unit || "share"),
    averageCostMinor,
    openingPriceMinor,
    currentPriceMinor,
    costBasisMinor,
    openingMarketValueMinor,
    currentMarketValueMinor,
    costBasisBaseMinor,
    openingMarketValueBaseMinor,
    marketValueBaseMinor,
    unrealizedGainBaseMinor: marketValueBaseMinor - costBasisBaseMinor,
    annualGainBaseMinor: marketValueBaseMinor - openingMarketValueBaseMinor,
    annualChangeBps: openingMarketValueBaseMinor > 0 ? bpsFromRatio((marketValueBaseMinor / openingMarketValueBaseMinor) - 1) : 0,
    cumulativeChangeBps: costBasisBaseMinor > 0 ? bpsFromRatio((marketValueBaseMinor / costBasisBaseMinor) - 1) : 0,
    allocationBps: 0,
    fxToBasePpm: Math.round(fxRate * 1000000),
    sortOrder: Number.isFinite(Number(input.sortOrder ?? input.sort_order)) ? Number(input.sortOrder ?? input.sort_order) : index,
    sourceRowIndex: Number.isFinite(Number(input.sourceRowIndex ?? input.source_row_index)) ? Number(input.sourceRowIndex ?? input.source_row_index) : index + 1,
  };
}

function positionProjection(row = {}) {
  return {
    id: row.id,
    position_key: row.positionKey,
    label: row.label,
    ticker: row.ticker,
    market: row.market,
    currency: row.currency,
    scale: row.scale,
    quantity_units_micro: row.quantityUnitsMicro,
    quantity_units: String(quantityMajor(row.quantityUnitsMicro)),
    quantity_wan: String(quantityMajor(row.quantityUnitsMicro) / 10000),
    quantity_unit: row.quantityUnit,
    average_cost_minor: row.averageCostMinor,
    opening_price_minor: row.openingPriceMinor,
    current_price_minor: row.currentPriceMinor,
    cost_basis_minor: row.costBasisMinor,
    opening_market_value_minor: row.openingMarketValueMinor,
    current_market_value_minor: row.currentMarketValueMinor,
    cost_basis_base_minor: row.costBasisBaseMinor,
    opening_market_value_base_minor: row.openingMarketValueBaseMinor,
    market_value_base_minor: row.marketValueBaseMinor,
    unrealized_gain_base_minor: row.unrealizedGainBaseMinor,
    annual_gain_base_minor: row.annualGainBaseMinor,
    annual_change_bps: row.annualChangeBps,
    cumulative_change_bps: row.cumulativeChangeBps,
    allocation_bps: row.allocationBps,
    fx_to_base_ppm: row.fxToBasePpm,
    sort_order: row.sortOrder,
    source_row_index: row.sourceRowIndex,
  };
}

function snapshotProjection(snapshot, positions = []) {
  if (!snapshot) return null;
  return {
    id: snapshot.id,
    finance_user_id: snapshot.financeUserId,
    as_of_date: snapshot.asOfDate,
    base_currency: snapshot.baseCurrency,
    base_scale: snapshot.baseScale,
    price_as_of: snapshot.priceAsOf,
    total_market_value_minor: snapshot.totalMarketValueMinor,
    total_cost_basis_minor: snapshot.totalCostBasisMinor,
    total_unrealized_gain_minor: snapshot.totalUnrealizedGainMinor,
    total_annual_gain_minor: snapshot.totalAnnualGainMinor,
    annual_change_bps: snapshot.annualChangeBps,
    source: snapshot.source,
    source_ref: snapshot.sourceRef,
    notes: snapshot.notes,
    positions: positions.map(positionProjection),
    created_at: snapshot.createdAt,
    updated_at: snapshot.updatedAt,
  };
}

function createFinanceOwnerStockService({ repository, quoteProvider = fetchYahooPrice } = {}) {
  if (!repository) throw new Error("repository_required");

  function upsertSnapshot(input = {}, context = {}) {
    const financeUserId = requireOwner(context);
    const asOfDate = normalizeDate(input.asOfDate || input.as_of_date);
    const baseCurrency = clean(input.baseCurrency || input.base_currency || "USD").toUpperCase();
    const baseScale = Number.isInteger(input.baseScale) ? input.baseScale : 2;
    let positionCount = 0;
    const snapshot = repository.transaction(() => {
      const positions = Array.isArray(input.positions)
        ? input.positions.map((position, index) => normalizePosition(position, index, baseCurrency, baseScale))
        : [];
      positionCount = positions.length;
      const totalMarketValueMinor = positions.reduce((sum, row) => sum + row.marketValueBaseMinor, 0);
      const totalCostBasisMinor = positions.reduce((sum, row) => sum + row.costBasisBaseMinor, 0);
      const totalOpeningMarketValueMinor = positions.reduce((sum, row) => sum + row.openingMarketValueBaseMinor, 0);
      for (const row of positions) {
        row.allocationBps = totalMarketValueMinor > 0 ? bpsFromRatio(row.marketValueBaseMinor / totalMarketValueMinor) : 0;
      }
      const saved = repository.upsertOwnerStockSnapshot({
        financeUserId,
        asOfDate,
        baseCurrency,
        baseScale,
        priceAsOf: clean(input.priceAsOf || input.price_as_of || asOfDate),
        totalMarketValueMinor,
        totalCostBasisMinor,
        totalUnrealizedGainMinor: totalMarketValueMinor - totalCostBasisMinor,
        totalAnnualGainMinor: totalMarketValueMinor - totalOpeningMarketValueMinor,
        annualChangeBps: totalOpeningMarketValueMinor > 0 ? bpsFromRatio((totalMarketValueMinor / totalOpeningMarketValueMinor) - 1) : 0,
        source: clean(input.source || "manual"),
        sourceRef: clean(input.sourceRef || input.source_ref),
        notes: clean(input.notes),
      });
      repository.replaceOwnerStockPositions(saved.id, positions);
      return saved;
    });
    return {
      snapshot: snapshotProjection(snapshot, repository.listOwnerStockPositions(snapshot.id)),
      position_count: positionCount,
    };
  }

  function listSnapshots(input = {}, context = {}) {
    const financeUserId = requireOwnerRead(context);
    const snapshots = repository.listOwnerStockSnapshots({
      financeUserId,
      startDate: clean(input.startDate || input.start_date || ""),
      endDate: clean(input.endDate || input.end_date || ""),
      limit: Math.min(Math.max(Number(input.limit || 50) || 50, 1), 200),
    });
    return {
      snapshots: snapshots.map((snapshot) => snapshotProjection(snapshot, repository.listOwnerStockPositions(snapshot.id))),
    };
  }

  function getSummary(input = {}, context = {}) {
    const financeUserId = requireOwnerRead(context);
    const latest = repository.getLatestOwnerStockSnapshot(financeUserId);
    const snapshots = repository.listOwnerStockSnapshots({
      financeUserId,
      startDate: clean(input.startDate || input.start_date || ""),
      endDate: clean(input.endDate || input.end_date || ""),
      limit: Math.min(Math.max(Number(input.limit || 20) || 20, 1), 100),
    });
    return {
      latest: latest ? snapshotProjection(latest, repository.listOwnerStockPositions(latest.id)) : null,
      snapshots: snapshots.map((snapshot) => snapshotProjection(snapshot, repository.listOwnerStockPositions(snapshot.id))),
      snapshot_count: snapshots.length,
      latest_date: latest?.asOfDate || null,
    };
  }

  async function getLiveSummary(input = {}, context = {}) {
    const financeUserId = requireOwnerRead(context);
    const latest = repository.getLatestOwnerStockSnapshot(financeUserId);
    if (!latest) {
      return { latest: null, snapshots: [], snapshot_count: 0, latest_date: null, live: true };
    }
    const rows = repository.listOwnerStockPositions(latest.id);
    const positions = [];
    for (const [rowIndex, row] of rows.entries()) {
      positions.push(await livePricedPositionInput(row, rowIndex));
    }
    const projection = buildSnapshotProjectionFromPositions({
      financeUserId,
      asOfDate: clean(input.asOfDate || input.as_of_date) || todayIso(),
      baseCurrency: latest.baseCurrency || "USD",
      baseScale: latest.baseScale || 2,
      priceAsOf: todayIso(),
      source: "owner_stock_live_quote",
      sourceRef: `owner-stock-live:${Date.now()}`,
      notes: "live quote projection",
      positions,
    });
    return {
      latest: projection,
      snapshots: [projection],
      snapshot_count: 1,
      latest_date: projection.as_of_date,
      live: true,
      persisted: false,
    };
  }

  function buildSnapshotProjectionFromPositions(input = {}) {
    const baseCurrency = clean(input.baseCurrency || input.base_currency || "USD").toUpperCase();
    const baseScale = Number.isInteger(input.baseScale) ? input.baseScale : 2;
    const positions = Array.isArray(input.positions)
      ? input.positions.map((position, index) => normalizePosition(position, index, baseCurrency, baseScale))
      : [];
    const totalMarketValueMinor = positions.reduce((sum, row) => sum + row.marketValueBaseMinor, 0);
    const totalCostBasisMinor = positions.reduce((sum, row) => sum + row.costBasisBaseMinor, 0);
    const totalOpeningMarketValueMinor = positions.reduce((sum, row) => sum + row.openingMarketValueBaseMinor, 0);
    for (const row of positions) {
      row.allocationBps = totalMarketValueMinor > 0 ? bpsFromRatio(row.marketValueBaseMinor / totalMarketValueMinor) : 0;
    }
    return {
      id: "",
      finance_user_id: input.financeUserId,
      as_of_date: input.asOfDate,
      base_currency: baseCurrency,
      base_scale: baseScale,
      price_as_of: input.priceAsOf || input.asOfDate,
      total_market_value_minor: totalMarketValueMinor,
      total_cost_basis_minor: totalCostBasisMinor,
      total_unrealized_gain_minor: totalMarketValueMinor - totalCostBasisMinor,
      total_annual_gain_minor: totalMarketValueMinor - totalOpeningMarketValueMinor,
      annual_change_bps: totalOpeningMarketValueMinor > 0 ? bpsFromRatio((totalMarketValueMinor / totalOpeningMarketValueMinor) - 1) : 0,
      source: input.source || "owner_stock_live_quote",
      source_ref: input.sourceRef || input.source_ref || "",
      notes: input.notes || "",
      positions: positions.map(positionProjection),
      created_at: "",
      updated_at: "",
    };
  }

  async function livePricedPositionInput(position = {}, index = 0) {
    const currency = clean(position.currency || "USD").toUpperCase();
    return {
      position_key: position.positionKey,
      label: position.label,
      ticker: position.ticker,
      market: position.market,
      currency,
      quantity_units: quantityMajor(position.quantityUnitsMicro),
      average_cost: majorFromMinor(position.averageCostMinor, position.scale),
      opening_price: majorFromMinor(position.openingPriceMinor, position.scale) || majorFromMinor(position.currentPriceMinor, position.scale),
      current_price: await quoteProvider(position.ticker),
      fx_to_base_rate: await quoteProvider(yahooFxSymbol(currency)),
      sort_order: position.sortOrder ?? index,
      source_row_index: position.sourceRowIndex ?? index + 1,
    };
  }

  function majorFromMinor(value, scale = 2) {
    const amount = Number(value || 0);
    return Number.isFinite(amount) ? amount / (10 ** (Number(scale) || 2)) : 0;
  }

  async function applyPositionDelta(input = {}, context = {}) {
    const financeUserId = requireOwner(context);
    const meta = resolvePositionMeta(input.positionHint || input.position_hint);
    if (!meta) throw new Error("stock_position_not_recognized");
    const action = clean(input.action).toLowerCase();
    if (!["buy", "sell", "adjust"].includes(action)) throw new Error("stock_position_action_invalid");
    const latest = repository.getLatestOwnerStockSnapshot(financeUserId);
    if (!latest) throw new Error("stock_snapshot_required");
    const rows = repository.listOwnerStockPositions(latest.id);
    const index = rows.findIndex((row) => row.positionKey === meta.positionKey || row.label === meta.label);
    if (index < 0) throw new Error("stock_position_not_found");
    const deltaUnits = firstOwnValue(input, ["quantityUnitsDelta", "quantity_units_delta"]) !== undefined
      ? finiteNumber(firstOwnValue(input, ["quantityUnitsDelta", "quantity_units_delta"]))
      : finiteNumber(firstOwnValue(input, ["quantityWanDelta", "quantity_wan_delta"])) * 10000;
    if (!(deltaUnits > 0)) throw new Error("stock_position_delta_required");
    const current = rows[index];
    const currentUnits = quantityMajor(current.quantityUnitsMicro);
    const signedDelta = action === "sell" ? -deltaUnits : deltaUnits;
    const nextUnits = action === "adjust" ? deltaUnits : currentUnits + signedDelta;
    if (!(nextUnits >= 0)) throw new Error("stock_position_quantity_negative");
    const nextRows = rows.map((row) => ({ ...row }));
    nextRows[index].quantityUnitsMicro = Math.round(nextUnits * 1000000);
    if (hasOwnValue(input, "averageCost") || hasOwnValue(input, "average_cost")) {
      nextRows[index].averageCostMinor = decimalToMinor(firstOwnValue(input, ["averageCost", "average_cost"]), nextRows[index].scale || 2);
    }
    const positions = [];
    for (const [rowIndex, row] of nextRows.entries()) {
      positions.push(await livePricedPositionInput(row, rowIndex));
    }
    return upsertSnapshot({
      as_of_date: clean(input.asOfDate || input.as_of_date) || todayIso(),
      base_currency: latest.baseCurrency || "USD",
      price_as_of: todayIso(),
      source: "owner_stock_mcp_delta",
      source_ref: `owner-stock-delta:${meta.positionKey}:${Date.now()}`,
      notes: clean(input.note),
      positions,
    }, { ...context, financeUserId });
  }

  return {
    upsertSnapshot,
    applyPositionDelta,
    listSnapshots,
    getSummary,
    getLiveSummary,
    OWNER_FINANCE_USER_ID,
  };
}

module.exports = {
  createFinanceOwnerStockService,
  decimalToMinor,
  bpsFromRatio,
};
