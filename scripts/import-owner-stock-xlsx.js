"use strict";

const fs = require("node:fs");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { createFinanceRuntime } = require("../adapters/finance-runtime");

const DEFAULT_LABELS = Object.freeze({
  "腾讯控股": { position_key: "tencent_hk", ticker: "0700.HK", market: "HKEX", currency: "HKD" },
  "腾讯港股通": { position_key: "tencent_stock_connect", ticker: "0700.HK", market: "HKEX Stock Connect", currency: "HKD" },
  "贵州茅台": { position_key: "kweichow_moutai", ticker: "600519.SS", market: "SSE", currency: "CNY" },
  "特斯拉": { position_key: "tesla", ticker: "TSLA", market: "NASDAQ", currency: "USD" },
});

function parseArgs(argv = process.argv.slice(2)) {
  const out = { prices: {}, fx: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key.startsWith("--")) continue;
    i += 1;
    if (key === "--price") {
      const [ticker, price] = String(value || "").split("=");
      out.prices[ticker] = Number(price);
    } else if (key === "--fx") {
      const [currency, rate] = String(value || "").split("=");
      out.fx[currency.toUpperCase()] = Number(rate);
    } else {
      out[key.slice(2).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())] = value;
    }
  }
  return out;
}

function unzip(file, path) {
  return execFileSync("unzip", ["-p", file, path], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
}

function attrs(tag) {
  const out = {};
  tag.replace(/([A-Za-z_:]+)="([^"]*)"/g, (_, key, value) => { out[key] = value; });
  return out;
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function colNum(ref) {
  const letters = ref.match(/[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
  return n;
}

function readXlsxRows(file) {
  const shared = [];
  const sharedXml = unzip(file, "xl/sharedStrings.xml");
  for (const match of sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    shared.push([...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((item) => decodeXml(item[1])).join(""));
  }
  const sheet = unzip(file, "xl/worksheets/sheet1.xml");
  const rows = [];
  for (const rowMatch of sheet.matchAll(/<row([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowAttrs = attrs(rowMatch[1]);
    const rowIndex = Number(rowAttrs.r) || rows.length + 1;
    const row = [];
    for (const cellMatch of rowMatch[2].matchAll(/<c([^\/>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const cellAttrs = attrs(cellMatch[1]);
      if (!cellAttrs.r) continue;
      const body = cellMatch[2] || "";
      const raw = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1] ?? "";
      let value = raw;
      if (cellAttrs.t === "s") value = shared[Number(raw)] ?? "";
      else if (raw !== "") value = Number(raw);
      else value = null;
      row[colNum(cellAttrs.r) - 1] = value;
    }
    rows[rowIndex - 1] = row;
  }
  const header = rows.find((row) => row && row.includes("名称"));
  if (!header) throw new Error("stock_xlsx_header_not_found");
  const headerIndex = rows.indexOf(header);
  return rows.slice(headerIndex + 1)
    .filter(Boolean)
    .map((row, rowOffset) => ({
      sourceRowIndex: headerIndex + rowOffset + 2,
      values: Object.fromEntries(header.map((key, index) => [key || `col${index + 1}`, row[index] ?? null])),
    }));
}

function sourceRef(file) {
  const hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 16);
  return `owner-stock-xlsx:${hash}`;
}

function requireFinite(value, code) {
  const num = Number(value);
  if (!Number.isFinite(num) || !(num > 0)) throw new Error(code);
  return num;
}

function yahooSymbolForCurrency(currency) {
  if (currency === "USD") return "";
  return `${currency}=X`;
}

async function fetchYahooPrice(symbol) {
  if (!symbol) return 1;
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`);
  if (!response.ok) throw new Error(`market_quote_http_${response.status}:${symbol}`);
  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  const price = Number(result?.meta?.regularMarketPrice ?? result?.meta?.previousClose);
  if (!Number.isFinite(price) || !(price > 0)) throw new Error(`market_quote_missing:${symbol}`);
  return price;
}

async function fillLiveMarketData(rows, providedPrices = {}, providedFx = {}) {
  const positions = rows.filter((row) => DEFAULT_LABELS[row.values["名称"]])
    .map((row) => DEFAULT_LABELS[row.values["名称"]]);
  const prices = { ...providedPrices };
  const fx = { USD: 1, ...providedFx };
  for (const meta of positions) {
    if (!prices[meta.ticker]) prices[meta.ticker] = await fetchYahooPrice(meta.ticker);
    if (!fx[meta.currency]) fx[meta.currency] = await fetchYahooPrice(yahooSymbolForCurrency(meta.currency));
  }
  return { prices, fx };
}

function buildPositions(rows, prices, fx) {
  return rows
    .filter((row) => DEFAULT_LABELS[row.values["名称"]])
    .map((row, index) => {
      const meta = DEFAULT_LABELS[row.values["名称"]];
      return {
        ...meta,
        label: row.values["名称"],
        quantity_wan: requireFinite(row.values["数量（万）"], "stock_quantity_missing"),
        average_cost: requireFinite(row.values["买入价格"], "stock_average_cost_missing"),
        opening_price: requireFinite(row.values["期初价格"], "stock_opening_price_missing"),
        current_price: requireFinite(prices[meta.ticker], `stock_price_missing:${meta.ticker}`),
        fx_to_base_rate: requireFinite(fx[meta.currency] || (meta.currency === "USD" ? 1 : 0), `stock_fx_missing:${meta.currency}`),
        sort_order: (index + 1) * 10,
        source_row_index: row.sourceRowIndex,
      };
    });
}

async function main() {
  const args = parseArgs();
  if (!args.file) throw new Error("file_required");
  const asOfDate = args.asOfDate || new Date().toISOString().slice(0, 10);
  const runtime = createFinanceRuntime({ dbPath: args.dbPath });
  try {
    const rows = readXlsxRows(args.file);
    const market = await fillLiveMarketData(rows, args.prices, args.fx);
    const positions = buildPositions(rows, market.prices, market.fx);
    const result = runtime.ownerStockService.upsertSnapshot({
      as_of_date: asOfDate,
      base_currency: args.baseCurrency || "USD",
      price_as_of: args.priceAsOf || asOfDate,
      source: "owner_stock_xlsx",
      source_ref: sourceRef(args.file),
      notes: args.notes || "",
      positions,
    }, { role: "owner", financeUserId: "user_xuxin", actorRef: "owner-stock-import" });
    process.stdout.write(`${JSON.stringify({
      ok: true,
      as_of_date: result.snapshot.as_of_date,
      base_currency: result.snapshot.base_currency,
      position_count: result.position_count,
      total_market_value_minor: result.snapshot.total_market_value_minor,
      source_ref: result.snapshot.source_ref,
    }, null, 2)}\n`);
  } finally {
    runtime.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`${err.message || String(err)}\n`);
    process.exit(1);
  });
}

module.exports = {
  readXlsxRows,
  buildPositions,
  fillLiveMarketData,
};
