"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFinanceMcpDispatcher } = require("../mcp/finance-mcp-server");
const { createTestRuntime } = require("./helpers");

function quoteProvider(symbol) {
  return {
    "0700.HK": 510,
    "TSLA": 320,
    "HKD=X": 7.8,
  }[symbol] || 1;
}

function sampleSnapshot(asOfDate = "2026-06-12") {
  return {
    as_of_date: asOfDate,
    base_currency: "USD",
    price_as_of: asOfDate,
    source_ref: "owner-stock-test",
    positions: [
      {
        position_key: "tencent_hk",
        label: "腾讯控股",
        ticker: "0700.HK",
        market: "HKEX",
        currency: "HKD",
        quantity_wan: 1,
        average_cost: 250,
        opening_price: 400,
        current_price: 500,
        fx_to_base_rate: 7.8,
      },
      {
        position_key: "tesla",
        label: "特斯拉",
        ticker: "TSLA",
        market: "NASDAQ",
        currency: "USD",
        quantity_wan: 1,
        average_cost: 100,
        opening_price: 200,
        current_price: 300,
        fx_to_base_rate: 1,
      },
    ],
  };
}

test("owner stock service upserts structured stock snapshots", () => {
  const runtime = createTestRuntime();
  const created = runtime.ownerStockService.upsertSnapshot(sampleSnapshot(), { role: "owner", financeUserId: "user_xuxin" });
  assert.equal(created.snapshot.as_of_date, "2026-06-12");
  assert.equal(created.snapshot.positions.length, 2);
  assert.equal(created.snapshot.base_currency, "USD");
  assert.ok(created.snapshot.total_market_value_minor > 0);
  assert.equal(created.snapshot.positions[0].currency, "HKD");
  assert.equal(created.snapshot.positions[0].fx_to_base_ppm, 7800000);

  const updated = runtime.ownerStockService.upsertSnapshot({
    ...sampleSnapshot(),
    positions: [sampleSnapshot().positions[1]],
  }, { role: "owner", financeUserId: "user_xuxin" });
  assert.equal(updated.snapshot.id, created.snapshot.id);
  assert.equal(updated.snapshot.positions.length, 1);

  const summary = runtime.ownerStockService.getSummary({}, { role: "owner", financeUserId: "user_xuxin" });
  assert.equal(summary.latest.as_of_date, "2026-06-12");
  assert.equal(summary.snapshots.length, 1);
  runtime.close();
});

test("owner stock service denies non owner contexts", () => {
  const runtime = createTestRuntime();
  assert.throws(
    () => runtime.ownerStockService.upsertSnapshot(sampleSnapshot(), { role: "member", financeUserId: "user_xuxin" }),
    /finance_stocks_access_required/,
  );
  assert.throws(
    () => runtime.ownerStockService.upsertSnapshot(sampleSnapshot(), { role: "owner", financeUserId: "user_xuxin", readOnly: true }),
    /finance_write_denied/,
  );
  runtime.close();
});

test("stock service is partitioned by finance user for future opt-in users", () => {
  const runtime = createTestRuntime();
  runtime.repository.upsertFinanceUser({ id: "user_other", userKey: "other", displayName: "Other" });
  runtime.ownerStockService.upsertSnapshot(sampleSnapshot(), { role: "owner", financeUserId: "user_other" });
  const otherSummary = runtime.ownerStockService.getSummary({}, { role: "owner", financeUserId: "user_other" });
  const ownerSummary = runtime.ownerStockService.getSummary({}, { role: "owner", financeUserId: "user_xuxin" });
  assert.equal(otherSummary.latest.as_of_date, "2026-06-12");
  assert.equal(ownerSummary.latest, null);
  runtime.close();
});

test("MCP owner stock tools expose owner-only structured queries", async () => {
  const runtime = createTestRuntime({ stockQuoteProvider: quoteProvider });
  const dispatcher = createFinanceMcpDispatcher(runtime);
  assert.ok(dispatcher.schemas.some((schema) => schema.name === "finance.upsert_owner_stock_snapshot"));
  assert.ok(dispatcher.schemas.some((schema) => schema.name === "finance.apply_owner_stock_position_delta"));
  assert.ok(dispatcher.schemas.some((schema) => schema.name === "finance.get_owner_stock_summary"));
  await dispatcher.dispatch("finance.upsert_owner_stock_snapshot", sampleSnapshot(), { role: "owner", financeUserId: "user_xuxin" });
  const listed = await dispatcher.dispatch("finance.list_owner_stock_snapshots", {}, { role: "owner", financeUserId: "user_xuxin" });
  assert.equal(listed.snapshots.length, 1);
  const summary = await dispatcher.dispatch("finance.get_owner_stock_summary", {}, { role: "owner", financeUserId: "user_xuxin" });
  assert.equal(summary.live, true);
  assert.equal(summary.persisted, false);
  assert.equal(summary.latest.positions.length, 2);
  assert.equal(summary.latest.positions[0].current_price_minor, 51000);
  await assert.rejects(
    () => dispatcher.dispatch("finance.get_owner_stock_summary", {}, { role: "member", financeUserId: "user_xuxin" }),
    /finance_stocks_access_required/,
  );
  runtime.close();
});

test("owner stock natural-language delta persists a live-priced snapshot", async () => {
  const runtime = createTestRuntime({ stockQuoteProvider: quoteProvider });
  runtime.ownerStockService.upsertSnapshot(sampleSnapshot("2026-06-11"), { role: "owner", financeUserId: "user_xuxin" });
  const result = await runtime.ownerStockService.applyPositionDelta({
    as_of_date: "2026-06-12",
    position_hint: "港股腾讯",
    action: "buy",
    quantity_wan_delta: 0.5,
  }, { role: "owner", financeUserId: "user_xuxin" });
  assert.equal(result.snapshot.as_of_date, "2026-06-12");
  assert.equal(result.snapshot.source, "owner_stock_mcp_delta");
  assert.equal(result.snapshot.positions[0].current_price_minor, 51000);
  runtime.close();
});
