"use strict";

const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { createFinanceRuntime } = require("../adapters/finance-runtime");

function parseArgs(argv) {
  const out = { file: "", dbPath: "", json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--file") out.file = argv[++index] || "";
    else if (arg === "--db") out.dbPath = argv[++index] || "";
    else if (arg === "--json") out.json = true;
    else if (arg === "--help") {
      console.log("Usage: node scripts/import-owner-asset-xlsx.js --file <xlsx> [--db <sqlite>] [--json]");
      process.exit(0);
    } else {
      throw new Error(`unknown_arg:${arg}`);
    }
  }
  if (!out.file) throw new Error("file_required");
  return out;
}

function decodeXml(value = "") {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function readZipText(file, entry) {
  return execFileSync("unzip", ["-p", file, entry], { encoding: "utf8" });
}

function colName(index) {
  let out = "";
  let n = index;
  while (n) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function colNum(value) {
  return [...value].reduce((sum, ch) => sum * 26 + ch.charCodeAt(0) - 64, 0);
}

function parseWorkbook(file) {
  const sharedXml = readZipText(file, "xl/sharedStrings.xml");
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((match) => decodeXml([...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((item) => item[1]).join("")));
  const xml = readZipText(file, "xl/worksheets/sheet1.xml");
  const cells = new Map();
  for (const match of xml.matchAll(/<c\s+([^>]*)>([\s\S]*?)<\/c>/g)) {
    const attrs = match[1];
    const body = match[2];
    const ref = attrs.match(/r="([A-Z]+)(\d+)"/);
    if (!ref) continue;
    const type = attrs.match(/t="([^"]+)"/)?.[1] || "";
    let value = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
    if (value != null) value = decodeXml(value);
    if (type === "s" && value != null) value = shared[Number(value)] ?? value;
    cells.set(`${ref[1]}${ref[2]}`, value);
  }
  return {
    get(col, row) {
      const value = cells.get(`${colName(col)}${row}`);
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    },
    text(col, row) {
      return cells.get(`${colName(col)}${row}`) || "";
    },
  };
}

function amountMinor(value) {
  return Math.round((Number(value) || 0) * 100);
}

function rateBps(value) {
  return Math.round((Number(value) || 0) * 10000);
}

function ratePpm(value) {
  return Math.round((Number(value) || 0) * 1000000);
}

function component(componentKey, label, currency, amount, amountCny, sortOrder) {
  const hasAmount = amount != null && Number.isFinite(Number(amount)) && Number(amount) !== 0;
  const hasAmountCny = amountCny != null && Number.isFinite(Number(amountCny)) && Number(amountCny) !== 0;
  if (!hasAmount && !hasAmountCny) return null;
  return {
    component_key: componentKey,
    label,
    currency,
    amount_minor: amountMinor(hasAmount ? amount : 0),
    amount_cny_minor: amountMinor(hasAmountCny ? amountCny : 0),
    sort_order: sortOrder,
  };
}

function findYearGroups(sheet) {
  const groups = [];
  for (let col = 1; col <= 80; col += 1) {
    const year = Number(sheet.text(col, 1));
    if (Number.isInteger(year) && year >= 1900 && year <= 2200) {
      groups.push({ year, startCol: col, endCol: col });
    }
  }
  for (let index = 0; index < groups.length; index += 1) {
    groups[index].endCol = (groups[index + 1]?.startCol || groups[index].startCol + 1) - 1;
  }
  return groups;
}

function groupNumber(sheet, group, row) {
  let value = null;
  for (let col = group.startCol; col <= group.endCol; col += 1) {
    const candidate = sheet.get(col, row);
    if (candidate != null) value = candidate;
  }
  return value;
}

function extractSnapshotsFromSheet(sheet) {
  const snapshots = [];
  for (const group of findYearGroups(sheet)) {
    const year = group.year;
    const fx = groupNumber(sheet, group, 47);
    const usdTotal = groupNumber(sheet, group, 53);
    const domesticTotal = groupNumber(sheet, group, 52);
    const totalAssets = groupNumber(sheet, group, 56);
    const row = {
      year,
      as_of_date: `${year}-12-31`,
      fx_usd_cny_rate: fx ? String(fx) : "",
      usd_investment_year: Math.round(groupNumber(sheet, group, 40) || 0),
      usd_annual_return_bps: rateBps(groupNumber(sheet, group, 30) || 0),
      usd_cagr_bps: rateBps(groupNumber(sheet, group, 41) || 0),
      usd_total_return_multiple_bps: rateBps(groupNumber(sheet, group, 42) || 0),
      total_assets_cny_minor: amountMinor(totalAssets || 0),
      source: "owner_asset_xlsx",
      components: [
        component("usd_account", "美元账户", "USD", usdTotal, usdTotal != null && fx != null ? usdTotal * fx : null, 10),
        component("cny_bank", "人民币银行余额", "CNY", groupNumber(sheet, group, 49), groupNumber(sheet, group, 49), 20),
        component("cny_securities", "证券余额", "CNY", groupNumber(sheet, group, 50), groupNumber(sheet, group, 50), 30),
        component("cny_trust", "家托", "CNY", groupNumber(sheet, group, 51), groupNumber(sheet, group, 51), 40),
        component("cny_domestic_total", "国内总额", "CNY", domesticTotal, domesticTotal, 50),
        component("cny_other_investment", "其它投资", "CNY", groupNumber(sheet, group, 54), groupNumber(sheet, group, 54), 60),
      ].filter(Boolean),
    };
    if (row.total_assets_cny_minor || row.components.length) snapshots.push(row);
  }
  return snapshots;
}

function extractSnapshots(file) {
  return extractSnapshotsFromSheet(parseWorkbook(file));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const file = path.resolve(options.file);
  if (!fs.existsSync(file)) throw new Error(`file_not_found:${file}`);
  const sourceHash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 16);
  const runtime = createFinanceRuntime({ dbPath: options.dbPath || undefined });
  try {
    const snapshots = extractSnapshots(file).map((row) => ({
      ...row,
      source_ref: `${path.basename(file)}:${sourceHash}`,
    }));
    for (const row of snapshots) {
      runtime.ownerAssetService.upsertSnapshot(row, { role: "owner", actorRef: "owner-asset-xlsx-import" });
    }
    const summary = runtime.ownerAssetService.getSummary({}, { role: "owner" });
    const payload = {
      ok: true,
      imported_count: snapshots.length,
      first_year: snapshots[0]?.year || null,
      latest_year: snapshots.at(-1)?.year || null,
      latest_total_assets_cny_minor: summary.latest?.total_assets_cny_minor || 0,
    };
    if (options.json) console.log(JSON.stringify(payload, null, 2));
    else console.log(`imported owner asset snapshots=${payload.imported_count} years=${payload.first_year}-${payload.latest_year}`);
  } finally {
    runtime.close();
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err.message || String(err) }, null, 2));
    process.exit(1);
  }
}

module.exports = {
  extractSnapshots,
  extractSnapshotsFromSheet,
  findYearGroups,
};
