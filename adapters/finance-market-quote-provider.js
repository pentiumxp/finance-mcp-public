"use strict";

const DEFAULT_MARKET_QUOTE_TIMEOUT_MS = 2500;

function yahooFxSymbol(currency) {
  const code = String(currency || "USD").trim().toUpperCase();
  if (!code || code === "USD") return "";
  return `${code}=X`;
}

function marketQuoteTimeoutMs() {
  const value = Number(process.env.FINANCE_MARKET_QUOTE_TIMEOUT_MS || DEFAULT_MARKET_QUOTE_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MARKET_QUOTE_TIMEOUT_MS;
}

async function fetchYahooPrice(symbol, options = {}) {
  if (!symbol) return 1;
  if (typeof fetch !== "function") throw new Error("market_quote_fetch_unavailable");
  const timeoutMs = Number(options.timeoutMs || options.timeout_ms || marketQuoteTimeoutMs());
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let response;
  try {
    response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`, controller ? { signal: controller.signal } : undefined);
  } catch (err) {
    if (err?.name === "AbortError") throw new Error(`market_quote_timeout:${symbol}`);
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!response.ok) throw new Error(`market_quote_http_${response.status}:${symbol}`);
  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  const price = Number(result?.meta?.regularMarketPrice ?? result?.meta?.previousClose);
  if (!Number.isFinite(price) || !(price > 0)) throw new Error(`market_quote_missing:${symbol}`);
  return price;
}

module.exports = {
  DEFAULT_MARKET_QUOTE_TIMEOUT_MS,
  fetchYahooPrice,
  marketQuoteTimeoutMs,
  yahooFxSymbol,
};
