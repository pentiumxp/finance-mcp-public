"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { extractSnapshotsFromSheet, findYearGroups } = require("../scripts/import-owner-asset-xlsx");

function fakeSheet(values = {}) {
  return {
    text(col, row) {
      const value = values[`${col}:${row}`];
      return value == null ? "" : String(value);
    },
    get(col, row) {
      const value = values[`${col}:${row}`];
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    },
  };
}

test("owner asset workbook import reads annual grouped totals, not only header columns", () => {
  const sheet = fakeSheet({
    "3:1": 2006,
    "4:1": 2007,
    "7:1": 2008,
    "3:47": 7.8,
    "3:53": 10,
    "3:56": 78,
    "6:30": 0.12,
    "6:41": 0.2,
    "6:42": 1.4,
    "6:47": 7.7,
    "6:53": 20,
    "6:56": 154,
    "7:47": 7.6,
    "7:52": 3,
    "7:53": 30,
    "7:56": 231,
  });
  assert.deepEqual(findYearGroups(sheet), [
    { year: 2006, startCol: 3, endCol: 3 },
    { year: 2007, startCol: 4, endCol: 6 },
    { year: 2008, startCol: 7, endCol: 7 },
  ]);

  const snapshots = extractSnapshotsFromSheet(sheet);
  assert.equal(snapshots.length, 3);
  assert.equal(snapshots[1].year, 2007);
  assert.equal(snapshots[1].total_assets_cny_minor, 15400);
  assert.equal(snapshots[1].fx_usd_cny_rate, "7.7");
  assert.equal(snapshots[1].usd_annual_return_bps, 1200);
  assert.equal(snapshots[1].usd_cagr_bps, 2000);
  assert.equal(snapshots[1].usd_total_return_multiple_bps, 14000);
  assert.deepEqual(snapshots[1].components.map((row) => row.component_key), ["usd_account"]);
  assert.deepEqual(snapshots[2].components.map((row) => row.component_key), ["usd_account", "cny_domestic_total"]);
});
