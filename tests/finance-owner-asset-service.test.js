"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFinanceMcpDispatcher } = require("../mcp/finance-mcp-server");
const { createTestRuntime } = require("./helpers");

function sampleSnapshot(year = 2026) {
  return {
    year,
    as_of_date: `${year}-06-10`,
    fx_usd_cny_rate: "6.8",
    usd_investment_year: 20,
    usd_annual_return_bps: -370,
    usd_cagr_bps: 2308,
    usd_total_return_multiple_bps: 636867,
    total_assets_cny_minor: 127698709300,
    source_ref: "owner-asset-test",
    components: [
      { component_key: "usd_account", label: "美元账户", currency: "USD", amount_minor: 15068062500, amount_cny_minor: 102462825000, sort_order: 10 },
      { component_key: "cny_bank", label: "人民币银行余额", currency: "CNY", amount_minor: 400000000, amount_cny_minor: 400000000, sort_order: 20 },
      { component_key: "cny_securities", label: "证券余额", currency: "CNY", amount_minor: 19867178200, amount_cny_minor: 19867178200, sort_order: 30 },
      { component_key: "cny_trust", label: "家托", currency: "CNY", amount_minor: 3968706100, amount_cny_minor: 3968706100, sort_order: 40 },
      { component_key: "cny_other_investment", label: "其它投资", currency: "CNY", amount_minor: 1000000000, amount_cny_minor: 1000000000, sort_order: 50 },
    ],
  };
}

function createRuntimeWithFx(rate = 7.2) {
  return createTestRuntime({
    stockQuoteProvider: (symbol) => {
      if (symbol === "CNY=X") return rate;
      return 1;
    },
  });
}

test("owner asset service upserts structured owner snapshots", async () => {
  const runtime = createRuntimeWithFx();
  const created = runtime.ownerAssetService.upsertSnapshot(sampleSnapshot(), { role: "owner", financeUserId: "user_xuxin", actorRef: "asset-test" });
  assert.equal(created.snapshot.year, 2026);
  assert.equal(created.snapshot.total_assets_cny_minor, 127698709300);
  assert.equal(created.snapshot.components.length, 5);

  const updated = runtime.ownerAssetService.upsertSnapshot({
    ...sampleSnapshot(),
    total_assets_cny_minor: 127700000000,
    components: [{ component_key: "usd_account", label: "美元账户", currency: "USD", amount_minor: 15000000000, amount_cny_minor: 102000000000 }],
  }, { role: "owner", financeUserId: "user_xuxin" });
  assert.equal(updated.snapshot.id, created.snapshot.id);
  assert.equal(updated.snapshot.total_assets_cny_minor, 127700000000);
  assert.equal(updated.snapshot.components.length, 1);

  const listed = runtime.ownerAssetService.listSnapshots({}, { role: "owner", financeUserId: "user_xuxin" });
  assert.equal(listed.snapshots.length, 1);
  const summary = await runtime.ownerAssetService.getSummary({}, { role: "owner", financeUserId: "user_xuxin" });
  assert.equal(summary.latest.year, 2026);
  assert.equal(summary.snapshots.length, 1);
  assert.equal(summary.snapshots[0].components.length, 1);
  runtime.close();
});

test("owner asset summary refreshes and persists current USD total using live FX", async () => {
  const runtime = createRuntimeWithFx(7.25);
  runtime.ownerAssetService.upsertSnapshot(sampleSnapshot(), { role: "owner", financeUserId: "user_xuxin", actorRef: "asset-test" });
  const summary = await runtime.ownerAssetService.getSummary({}, { role: "owner", financeUserId: "user_xuxin" });
  assert.equal(summary.current_fx_error, "");
  assert.equal(summary.latest.current_usd_cny_rate, "7.25");
  assert.equal(summary.latest.current_usd_cny_ppm, 7250000);
  assert.equal(summary.latest.current_total_assets_usd_minor, Math.round(127698709300 / 7.25));
  assert.equal(summary.latest.current_fx_source, "yahoo:CNY=X");
  assert.ok(summary.latest.current_fx_updated_at);
  const persisted = await runtime.ownerAssetService.getSummary({ refresh_live_fx: false }, { role: "owner", financeUserId: "user_xuxin" });
  assert.equal(persisted.latest.current_total_assets_usd_minor, summary.latest.current_total_assets_usd_minor);
  runtime.close();
});

test("owner asset service recalculates manual current-year USD return metrics", () => {
  const runtime = createTestRuntime();
  const owner = { role: "owner", financeUserId: "user_xuxin", actorRef: "asset-test" };
  runtime.ownerAssetService.upsertSnapshot({
    year: 2025,
    fx_usd_cny_rate: "7",
    usd_investment_year: 1,
    usd_annual_return_bps: 1000,
    usd_cagr_bps: 1000,
    usd_total_return_multiple_bps: 11000,
    total_assets_cny_minor: 70000,
    source: "owner_asset_xlsx",
    components: [
      { component_key: "usd_account", label: "美元账户", currency: "USD", amount_minor: 10000, amount_cny_minor: 70000 },
    ],
  }, owner);

  const imported = runtime.ownerAssetService.upsertSnapshot({
    year: 2026,
    fx_usd_cny_rate: "7",
    usd_investment_year: 2,
    usd_annual_return_bps: 500,
    usd_cagr_bps: 400,
    usd_total_return_multiple_bps: 10500,
    total_assets_cny_minor: 84700,
    source: "owner_asset_xlsx",
    components: [
      { component_key: "usd_account", label: "美元账户", currency: "USD", amount_minor: 12100, amount_cny_minor: 84700 },
    ],
  }, owner);
  assert.equal(imported.snapshot.usd_annual_return_bps, 500);
  assert.equal(imported.snapshot.usd_cagr_bps, 400);
  assert.equal(imported.snapshot.usd_total_return_multiple_bps, 10500);

  const manual = runtime.ownerAssetService.upsertSnapshot({
    year: 2026,
    usd_annual_return_bps: -9999,
    usd_cagr_bps: -9999,
    usd_total_return_multiple_bps: 1,
    total_assets_cny: 847,
    components: [
      { component_key: "usd_account", label: "美元账户", currency: "USD", amount_minor: 12100, amount_cny_minor: 84700 },
    ],
  }, owner);
  const expectedMultiple = 1.1 * 1.21;
  assert.equal(manual.snapshot.usd_annual_return_bps, 2100);
  assert.equal(manual.snapshot.usd_total_return_multiple_bps, Math.round(expectedMultiple * 10000));
  assert.equal(manual.snapshot.usd_cagr_bps, Math.round(((expectedMultiple ** (1 / 2)) - 1) * 10000));
  assert.equal(manual.snapshot.total_assets_cny_minor, 84700);
  assert.equal(manual.snapshot.components.length, 1);
  runtime.close();
});

test("owner asset service denies non owner contexts", () => {
  const runtime = createTestRuntime();
  assert.throws(
    () => runtime.ownerAssetService.upsertSnapshot(sampleSnapshot(), { role: "member", financeUserId: "user_xuxin" }),
    /finance_owner_assets_owner_required/,
  );
  assert.throws(
    () => runtime.ownerAssetService.listSnapshots({}, { role: "owner", financeUserId: "user_other" }),
    /finance_owner_assets_owner_required/,
  );
  assert.throws(
    () => runtime.ownerAssetService.upsertSnapshot(sampleSnapshot(), { role: "owner", financeUserId: "user_xuxin", readOnly: true }),
    /finance_write_denied/,
  );
  runtime.close();
});

test("MCP owner asset tools expose owner-only structured queries", async () => {
  const runtime = createRuntimeWithFx(7.2);
  const dispatcher = createFinanceMcpDispatcher(runtime);
  assert.ok(dispatcher.schemas.some((schema) => schema.name === "finance.upsert_owner_asset_snapshot"));
  await dispatcher.dispatch("finance.upsert_owner_asset_snapshot", sampleSnapshot(2025), { role: "owner", financeUserId: "user_xuxin" });
  const listed = await dispatcher.dispatch("finance.list_owner_asset_snapshots", {}, { role: "owner", financeUserId: "user_xuxin" });
  assert.equal(listed.snapshots.length, 1);
  assert.equal(listed.snapshots[0].year, 2025);
  const summary = await dispatcher.dispatch("finance.get_owner_asset_summary", {}, { role: "owner", financeUserId: "user_xuxin" });
  assert.equal(summary.snapshots.length, 1);
  assert.equal(summary.snapshots[0].year, 2025);
  assert.equal(summary.latest.current_usd_cny_rate, "7.2");
  await assert.rejects(
    () => dispatcher.dispatch("finance.get_owner_asset_summary", {}, { role: "member", financeUserId: "user_xuxin" }),
    /finance_owner_assets_owner_required/,
  );
  runtime.close();
});
