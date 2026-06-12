"use strict";

const CURRENCY_SCALES = Object.freeze({
  CNY: 2,
  USD: 2,
  HKD: 2,
  EUR: 2,
  JPY: 0,
});

function normalizeCurrency(value = "CNY") {
  const currency = String(value || "CNY").trim().toUpperCase();
  if (!/^[A-Z]{3,8}$/.test(currency)) throw new Error("invalid_currency");
  return currency;
}

function currencyScale(currency) {
  return CURRENCY_SCALES[normalizeCurrency(currency)] ?? 2;
}

function parseAmountToMinor(value, currency = "CNY", options = {}) {
  const scale = Number.isInteger(options.scale) ? options.scale : currencyScale(currency);
  const raw = String(value ?? "").trim().replaceAll(",", "");
  if (!raw) throw new Error("amount_required");
  if (!/^\d+(?:\.\d+)?$/.test(raw)) throw new Error("invalid_amount");
  const [whole, fraction = ""] = raw.split(".");
  if (fraction.length > scale) throw new Error("amount_exceeds_currency_scale");
  const padded = `${fraction}${"0".repeat(scale)}`.slice(0, scale);
  const minor = BigInt(whole) * (10n ** BigInt(scale)) + BigInt(padded || "0");
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("amount_too_large");
  return Number(minor);
}

function formatMinor(minor, currency = "CNY", options = {}) {
  const scale = Number.isInteger(options.scale) ? options.scale : currencyScale(currency);
  const sign = Number(minor) < 0 ? "-" : "";
  const value = BigInt(Math.abs(Number(minor)));
  const base = 10n ** BigInt(scale);
  const whole = value / base;
  const fraction = String(value % base).padStart(scale, "0");
  return scale > 0
    ? `${sign}${whole.toString()}.${fraction}`
    : `${sign}${whole.toString()}`;
}

function addMinor(...values) {
  return values.reduce((sum, value) => sum + Number(value || 0), 0);
}

function percentageBasisPoints(part, total) {
  const denominator = Number(total || 0);
  if (!denominator) return 0;
  return Math.round((Number(part || 0) * 10000) / denominator);
}

module.exports = {
  CURRENCY_SCALES,
  addMinor,
  currencyScale,
  formatMinor,
  normalizeCurrency,
  parseAmountToMinor,
  percentageBasisPoints,
};

