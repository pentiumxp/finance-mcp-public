"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { fetchEastmoneyPrice, fetchSinaPrice, fetchTencentPrice, fetchYahooPrice, marketQuoteTimeoutMs, yahooFxSymbol } = require("../adapters/finance-market-quote-provider");

test("market quote provider times out stalled Yahoo requests", async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = (_url, options = {}) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });
    await assert.rejects(
      () => fetchYahooPrice("CNY=X", { timeoutMs: 1 }),
      /market_quote_timeout:CNY=X/,
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("market quote provider parses Yahoo prices and FX symbols", async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async (_url, options = {}) => {
      assert.ok(options.signal);
      return {
        ok: true,
        async json() {
          return { chart: { result: [{ meta: { regularMarketPrice: 7.26 } }] } };
        },
      };
    };
    assert.equal(yahooFxSymbol("CNY"), "CNY=X");
    assert.equal(yahooFxSymbol("USD"), "");
    assert.equal(await fetchYahooPrice("CNY=X", { timeoutMs: 100 }), 7.26);
    assert.equal(await fetchYahooPrice(""), 1);
    assert.ok(marketQuoteTimeoutMs() > 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test("market quote provider prefers Sina stock quotes when available", async () => {
  const originalFetch = global.fetch;
  try {
    const urls = [];
    global.fetch = async (url, options = {}) => {
      urls.push(String(url));
      assert.ok(options.signal);
      return {
        ok: true,
        async text() {
          return 'var hq_str_hk00700="TENCENT,腾讯控股,462.600,459.600,462.600,445.400,447.400,-12.200,-2.654";\n';
        },
      };
    };
    assert.equal(await fetchSinaPrice("0700.HK", 100), 447.4);
    assert.equal(await fetchYahooPrice("0700.HK", { timeoutMs: 100 }), 447.4);
    assert.equal(urls.some((url) => url.includes("hq.sinajs.cn")), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("market quote provider uses Eastmoney stock quotes first", async () => {
  const originalFetch = global.fetch;
  try {
    const urls = [];
    global.fetch = async (url, options = {}) => {
      urls.push(String(url));
      assert.ok(options.signal);
      return {
        ok: true,
        async json() {
          return { rc: 0, data: { f43: 447400, f57: "00700" } };
        },
      };
    };
    assert.equal(await fetchEastmoneyPrice("0700.HK", 100), 447.4);
    assert.equal(await fetchYahooPrice("0700.HK", { timeoutMs: 100 }), 447.4);
    assert.equal(urls[0].includes("push2.eastmoney.com"), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("market quote provider can parse Tencent stock quotes", async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async (_url, options = {}) => {
      assert.ok(options.signal);
      return {
        ok: true,
        async text() {
          return 'v_sh600519="1~贵州茅台~600519~1255.67~1271.10~1267.01";\n';
        },
      };
    };
    assert.equal(await fetchTencentPrice("600519.SH", 100), 1255.67);
  } finally {
    global.fetch = originalFetch;
  }
});

test("market quote provider falls back to public FX source", async () => {
  const originalFetch = global.fetch;
  try {
    const urls = [];
    global.fetch = async (url, options = {}) => {
      urls.push(String(url));
      assert.ok(options.signal);
      if (String(url).includes("query1.finance.yahoo.com")) throw new Error("yahoo_down");
      return {
        ok: true,
        async json() {
          return { rates: { CNY: 7.31 } };
        },
      };
    };
    assert.equal(await fetchYahooPrice("CNY=X", { timeoutMs: 100 }), 7.31);
    assert.equal(urls.some((url) => url.includes("api.frankfurter.app")), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("market quote provider falls back to public stock source", async () => {
  const originalFetch = global.fetch;
  try {
    const urls = [];
    global.fetch = async (url, options = {}) => {
      urls.push(String(url));
      assert.ok(options.signal);
      if (String(url).includes("query1.finance.yahoo.com")) throw new Error("yahoo_down");
      return {
        ok: true,
        async text() {
          return "Symbol,Date,Time,Open,High,Low,Close,Volume\n0700.HK,2026-06-16,15:59,501,512,500,510,1000\n";
        },
      };
    };
    assert.equal(await fetchYahooPrice("0700.HK", { timeoutMs: 100 }), 510);
    assert.equal(urls.some((url) => url.includes("stooq.com")), true);
  } finally {
    global.fetch = originalFetch;
  }
});
