"use strict";

function yahooFxSymbol(currency) {
  const code = String(currency || "USD").trim().toUpperCase();
  if (!code || code === "USD") return "";
  return `${code}=X`;
}

async function fetchYahooPrice(symbol) {
  if (!symbol) return 1;
  if (typeof fetch !== "function") throw new Error("market_quote_fetch_unavailable");
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`);
  if (!response.ok) throw new Error(`market_quote_http_${response.status}:${symbol}`);
  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  const price = Number(result?.meta?.regularMarketPrice ?? result?.meta?.previousClose);
  if (!Number.isFinite(price) || !(price > 0)) throw new Error(`market_quote_missing:${symbol}`);
  return price;
}

module.exports = {
  fetchYahooPrice,
  yahooFxSymbol,
};
