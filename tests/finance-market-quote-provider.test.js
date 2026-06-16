"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { fetchYahooPrice, marketQuoteTimeoutMs, yahooFxSymbol } = require("../adapters/finance-market-quote-provider");

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
