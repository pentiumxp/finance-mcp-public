"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { formatMinor, parseAmountToMinor, percentageBasisPoints } = require("../adapters/finance-money");

test("parses decimal amount into integer minor units", () => {
  assert.equal(parseAmountToMinor("12.34", "CNY"), 1234);
  assert.equal(parseAmountToMinor("86.5", "CNY"), 8650);
  assert.equal(parseAmountToMinor("1,234.00", "CNY"), 123400);
  assert.equal(formatMinor(8650, "CNY"), "86.50");
});

test("rejects excess scale and invalid float-like internals", () => {
  assert.throws(() => parseAmountToMinor("86.567", "CNY"), /amount_exceeds_currency_scale/);
  assert.throws(() => parseAmountToMinor("-1.00", "CNY"), /invalid_amount/);
});

test("returns integer basis points", () => {
  assert.equal(percentageBasisPoints(1, 3), 3333);
});
