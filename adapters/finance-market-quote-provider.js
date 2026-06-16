"use strict";

const DEFAULT_MARKET_QUOTE_TIMEOUT_MS = 2500;
const DEFAULT_SINA_QUOTE_TIMEOUT_MS = 5000;
const MARKET_QUOTE_HEADERS = Object.freeze({
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
  "Referer": "https://quote.eastmoney.com/",
});

function yahooFxSymbol(currency) {
  const code = String(currency || "USD").trim().toUpperCase();
  if (!code || code === "USD") return "";
  return `${code}=X`;
}

function marketQuoteTimeoutMs() {
  const value = Number(process.env.FINANCE_MARKET_QUOTE_TIMEOUT_MS || DEFAULT_MARKET_QUOTE_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MARKET_QUOTE_TIMEOUT_MS;
}

function sinaQuoteTimeoutMs(fallback = marketQuoteTimeoutMs()) {
  const value = Number(process.env.FINANCE_SINA_QUOTE_TIMEOUT_MS || DEFAULT_SINA_QUOTE_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function fetchWithTimeout(url, timeoutMs) {
  if (typeof fetch !== "function") throw new Error("market_quote_fetch_unavailable");
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    return await fetch(url, {
      ...(controller ? { signal: controller.signal } : {}),
      headers: MARKET_QUOTE_HEADERS,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw new Error("market_quote_timeout");
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchYahooPriceOnly(symbol, timeoutMs) {
  const response = await fetchWithTimeout(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`,
    timeoutMs,
  );
  if (!response.ok) throw new Error(`market_quote_http_${response.status}:${symbol}`);
  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  const price = Number(result?.meta?.regularMarketPrice ?? result?.meta?.previousClose);
  if (!Number.isFinite(price) || !(price > 0)) throw new Error(`market_quote_missing:${symbol}`);
  return price;
}

function fxCurrencyFromYahooSymbol(symbol) {
  const match = String(symbol || "").trim().toUpperCase().match(/^([A-Z]{3})=X$/);
  return match?.[1] || "";
}

function sinaSymbol(symbol) {
  const raw = String(symbol || "").trim();
  const upper = raw.toUpperCase();
  if (!raw || fxCurrencyFromYahooSymbol(upper)) return "";
  const hk = upper.match(/^(\d{1,5})\.HK$/);
  if (hk) return `hk${hk[1].padStart(5, "0")}`;
  const sh = upper.match(/^(\d{6})\.(SS|SH)$/);
  if (sh) return `sh${sh[1]}`;
  const sz = upper.match(/^(\d{6})\.SZ$/);
  if (sz) return `sz${sz[1]}`;
  if (/^[A-Z.]+$/.test(upper)) return `gb_${upper.toLowerCase().replace(".", "$")}`;
  return "";
}

function eastmoneySymbol(symbol) {
  const raw = String(symbol || "").trim();
  const upper = raw.toUpperCase();
  if (!raw || fxCurrencyFromYahooSymbol(upper)) return "";
  const hk = upper.match(/^(\d{1,5})\.HK$/);
  if (hk) return `116.${hk[1].padStart(5, "0")}`;
  const sh = upper.match(/^(\d{6})\.(SS|SH)$/);
  if (sh) return `1.${sh[1]}`;
  const sz = upper.match(/^(\d{6})\.SZ$/);
  if (sz) return `0.${sz[1]}`;
  if (/^[A-Z.]+$/.test(upper)) return `105.${upper}`;
  return "";
}

function tencentSymbol(symbol) {
  const raw = String(symbol || "").trim();
  const upper = raw.toUpperCase();
  if (!raw || fxCurrencyFromYahooSymbol(upper)) return "";
  const hk = upper.match(/^(\d{1,5})\.HK$/);
  if (hk) return `hk${hk[1].padStart(5, "0")}`;
  const sh = upper.match(/^(\d{6})\.(SS|SH)$/);
  if (sh) return `sh${sh[1]}`;
  const sz = upper.match(/^(\d{6})\.SZ$/);
  if (sz) return `sz${sz[1]}`;
  if (/^[A-Z.]+$/.test(upper)) return `us${upper}`;
  return "";
}

function parseSinaPayload(text = "") {
  const match = String(text).match(/="([^"]*)"/);
  return match ? match[1].split(",").map((part) => part.trim()) : [];
}

function parseTencentPayload(text = "") {
  const match = String(text).match(/="([^"]*)"/);
  return match ? match[1].split("~").map((part) => part.trim()) : [];
}

async function fetchEastmoneyPrice(symbol, timeoutMs) {
  const mapped = eastmoneySymbol(symbol);
  if (!mapped) throw new Error(`market_quote_unsupported_eastmoney:${symbol}`);
  const response = await fetchWithTimeout(
    `https://push2.eastmoney.com/api/qt/stock/get?secid=${encodeURIComponent(mapped)}&fields=f43,f57,f58,f60,f86`,
    timeoutMs,
  );
  if (!response.ok) throw new Error(`market_quote_eastmoney_http_${response.status}:${symbol}`);
  const payload = await response.json();
  const price = Number(payload?.data?.f43) / 1000;
  if (!Number.isFinite(price) || !(price > 0)) throw new Error(`market_quote_eastmoney_missing:${symbol}`);
  return price;
}

async function fetchTencentPrice(symbol, timeoutMs) {
  const mapped = tencentSymbol(symbol);
  if (!mapped) throw new Error(`market_quote_unsupported_tencent:${symbol}`);
  const response = await fetchWithTimeout(`https://qt.gtimg.cn/q=${encodeURIComponent(mapped)}`, timeoutMs);
  if (!response.ok) throw new Error(`market_quote_tencent_http_${response.status}:${symbol}`);
  const fields = parseTencentPayload(await response.text());
  let price = NaN;
  if (mapped.startsWith("hk")) price = Number(fields[3]);
  else if (mapped.startsWith("us")) price = Number(fields[3] || fields[1]);
  else price = Number(fields[3]);
  if (!Number.isFinite(price) || !(price > 0)) throw new Error(`market_quote_tencent_missing:${symbol}`);
  return price;
}

async function fetchSinaPrice(symbol, timeoutMs) {
  const mapped = sinaSymbol(symbol);
  if (!mapped) throw new Error(`market_quote_unsupported_sina:${symbol}`);
  const response = await fetchWithTimeout(`https://hq.sinajs.cn/rn=${Date.now()}&list=${encodeURIComponent(mapped)}`, timeoutMs);
  if (!response.ok) throw new Error(`market_quote_sina_http_${response.status}:${symbol}`);
  const fields = parseSinaPayload(await response.text());
  let price = NaN;
  if (mapped.startsWith("hk")) price = Number(fields[6] || fields[3]);
  else if (mapped.startsWith("gb_")) price = Number(fields[1]);
  else price = Number(fields[3]);
  if (!Number.isFinite(price) || !(price > 0)) throw new Error(`market_quote_sina_missing:${symbol}`);
  return price;
}

async function fetchFrankfurterFx(symbol, timeoutMs) {
  const currency = fxCurrencyFromYahooSymbol(symbol);
  if (!currency) throw new Error(`market_quote_unsupported_fx:${symbol}`);
  const response = await fetchWithTimeout(`https://api.frankfurter.app/latest?from=USD&to=${encodeURIComponent(currency)}`, timeoutMs);
  if (!response.ok) throw new Error(`market_quote_fx_http_${response.status}:${symbol}`);
  const payload = await response.json();
  const price = Number(payload?.rates?.[currency]);
  if (!Number.isFinite(price) || !(price > 0)) throw new Error(`market_quote_fx_missing:${symbol}`);
  return price;
}

function stooqSymbol(symbol) {
  const clean = String(symbol || "").trim().toLowerCase();
  if (!clean) return "";
  if (clean.endsWith(".hk")) return clean;
  if (clean.includes(".")) return clean;
  if (/^[a-z]+$/.test(clean)) return `${clean}.us`;
  return clean;
}

function parseCsvLine(line = "") {
  return String(line).split(",").map((part) => part.trim());
}

async function fetchStooqPrice(symbol, timeoutMs) {
  const mapped = stooqSymbol(symbol);
  if (!mapped || fxCurrencyFromYahooSymbol(symbol)) throw new Error(`market_quote_unsupported_stock:${symbol}`);
  const response = await fetchWithTimeout(`https://stooq.com/q/l/?s=${encodeURIComponent(mapped)}&f=sd2t2ohlcv&h&e=csv`, timeoutMs);
  if (!response.ok) throw new Error(`market_quote_stooq_http_${response.status}:${symbol}`);
  const lines = String(await response.text()).trim().split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const values = parseCsvLine(lines[1]);
  const closeIndex = header.findIndex((name) => name.toLowerCase() === "close");
  const price = Number(values[closeIndex]);
  if (!Number.isFinite(price) || !(price > 0)) throw new Error(`market_quote_stooq_missing:${symbol}`);
  return price;
}

async function fetchYahooPrice(symbol, options = {}) {
  if (!symbol) return 1;
  const timeoutMs = Number(options.timeoutMs || options.timeout_ms || marketQuoteTimeoutMs());
  const fallbackTimeoutMs = Number(options.fallbackTimeoutMs || options.fallback_timeout_ms || timeoutMs);
  const sinaTimeoutMs = Number(options.sinaTimeoutMs || options.sina_timeout_ms || sinaQuoteTimeoutMs(timeoutMs));
  const attempts = [
    () => fetchEastmoneyPrice(symbol, Math.min(timeoutMs, 1200)),
    () => fetchTencentPrice(symbol, Math.min(timeoutMs, 1800)),
    () => fetchSinaPrice(symbol, sinaTimeoutMs),
    () => fetchYahooPriceOnly(symbol, timeoutMs),
    () => fetchFrankfurterFx(symbol, fallbackTimeoutMs),
    () => fetchStooqPrice(symbol, fallbackTimeoutMs),
  ];
  try {
    return await Promise.any(attempts.map((attempt) => attempt()));
  } catch (err) {
    const errors = Array.isArray(err?.errors)
      ? err.errors.map((error) => error?.message || String(error))
      : [err?.message || String(err)];
    if (errors.some((message) => message === "market_quote_timeout")) {
      throw new Error(`market_quote_timeout:${symbol}`);
    }
    throw new Error(`market_quote_unavailable:${symbol}:${errors.join("|").slice(0, 180)}`);
  }
}

module.exports = {
  DEFAULT_MARKET_QUOTE_TIMEOUT_MS,
  DEFAULT_SINA_QUOTE_TIMEOUT_MS,
  fetchYahooPrice,
  fetchEastmoneyPrice,
  fetchTencentPrice,
  fetchSinaPrice,
  fetchFrankfurterFx,
  fetchStooqPrice,
  marketQuoteTimeoutMs,
  sinaQuoteTimeoutMs,
  yahooFxSymbol,
};
