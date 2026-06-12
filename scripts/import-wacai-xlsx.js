"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const crypto = require("node:crypto");
const { createFinanceRuntime } = require("../adapters/finance-runtime");

function xmlText(value = "") {
  return String(value)
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function readZipEntries(buffer) {
  const eocdSig = 0x06054b50;
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === eocdSig) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("xlsx_zip_eocd_not_found");
  const entryCount = buffer.readUInt16LE(eocd + 10);
  let cdOffset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let i = 0; i < entryCount; i += 1) {
    if (buffer.readUInt32LE(cdOffset) !== 0x02014b50) throw new Error("xlsx_zip_central_directory_invalid");
    const method = buffer.readUInt16LE(cdOffset + 10);
    const compressedSize = buffer.readUInt32LE(cdOffset + 20);
    const nameLength = buffer.readUInt16LE(cdOffset + 28);
    const extraLength = buffer.readUInt16LE(cdOffset + 30);
    const commentLength = buffer.readUInt16LE(cdOffset + 32);
    const localOffset = buffer.readUInt32LE(cdOffset + 42);
    const name = buffer.toString("utf8", cdOffset + 46, cdOffset + 46 + nameLength);
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("xlsx_zip_local_header_invalid");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = method === 0 ? compressed : zlib.inflateRawSync(compressed);
    entries.set(name, data.toString("utf8"));
    cdOffset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function sharedStrings(entries) {
  const xml = entries.get("xl/sharedStrings.xml") || "";
  const values = [];
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const text = [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map((item) => xmlText(item[1]))
      .join("");
    values.push(text);
  }
  return values;
}

function columnIndex(ref) {
  const letters = String(ref || "").replace(/[^A-Z]/g, "");
  let value = 0;
  for (const letter of letters) value = value * 26 + (letter.charCodeAt(0) - 64);
  return value - 1;
}

function cellValue(cellXml, shared) {
  const type = (cellXml.match(/\bt="([^"]+)"/) || [])[1] || "";
  if (type === "inlineStr") {
    return xmlText((cellXml.match(/<is\b[^>]*>([\s\S]*?)<\/is>/) || [])[1] || "");
  }
  const raw = xmlText((cellXml.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || "");
  if (type === "s") return shared[Number(raw)] || "";
  return raw;
}

function parseFirstWorksheet(buffer) {
  const entries = readZipEntries(buffer);
  const shared = sharedStrings(entries);
  const sheetName = [...entries.keys()].find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  if (!sheetName) throw new Error("xlsx_no_worksheet");
  const xml = entries.get(sheetName);
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const excelRowIndex = Number(rowMatch[1]);
    const cells = [];
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref = (cellMatch[1].match(/\br="([^"]+)"/) || [])[1] || "";
      cells[columnIndex(ref)] = cellValue(cellMatch[0], shared);
    }
    rows.push({ excelRowIndex, cells: cells.map((value) => value || "") });
  }
  return rows;
}

function wacaiRowsFromWorksheet(rows) {
  const headerIndex = rows.findIndex((row) => row.cells.includes("日期时间") && row.cells.includes("类型") && row.cells.includes("金额"));
  if (headerIndex < 0) throw new Error("wacai_header_not_found");
  const headers = rows[headerIndex].cells.map((item) => String(item || "").trim());
  return rows.slice(headerIndex + 1)
    .filter((row) => row.cells.some((cell) => String(cell || "").trim()))
    .map((row) => {
      const record = { __rowIndex: row.excelRowIndex };
      headers.forEach((header, index) => {
        if (header) record[header] = row.cells[index] || "";
      });
      return record;
    })
    .filter((row) => row["日期时间"] && row["类型"] && row["金额"]);
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function inferLedgerNameFromFilename(filePath) {
  const base = path.basename(filePath).replace(/\.[^.]+$/, "");
  const match = base.match(/^.*?wacai_([^_]+)_/i);
  return match?.[1] || "";
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error("usage: node scripts/import-wacai-xlsx.js <wacai.xlsx>");
  const resolved = path.resolve(inputPath);
  const buffer = fs.readFileSync(resolved);
  const rows = wacaiRowsFromWorksheet(parseFirstWorksheet(buffer));
  const runtime = createFinanceRuntime();
  try {
    const ledgerName = process.env.FINANCE_WACAI_LEDGER_NAME || inferLedgerNameFromFilename(resolved);
    const ledger = process.env.FINANCE_WACAI_LEDGER_ID
      ? runtime.ledgerService.authorizedLedger({ ledger_id: process.env.FINANCE_WACAI_LEDGER_ID }, { role: "owner", actorRef: "wacai-import", financeUserId: "user_xuxin" })
      : runtime.ledgerService.ensureLedgerForName(ledgerName || "日常账本", { role: "owner", actorRef: "wacai-import", financeUserId: "user_xuxin" });
    const result = runtime.wacaiImportService.importRows(rows, {
      ledgerId: ledger.id,
      sourceFileName: path.basename(resolved),
      sourceFileSha256: sha256File(resolved),
      amountMultiplier: Number(process.env.FINANCE_WACAI_AMOUNT_MULTIPLIER || 1),
      forceCurrency: process.env.FINANCE_WACAI_FORCE_CURRENCY || "",
      metadata: { format: "wacai-xlsx", parsedRows: rows.length, ledgerName: ledger.name },
    }, { role: "owner", actorRef: "wacai-import", financeUserId: "user_xuxin", ledgerId: ledger.id });
    process.stdout.write(JSON.stringify({
      ok: result.errors.length === 0,
      batchId: result.batch.id,
      rowCount: rows.length,
      ledgerId: ledger.id,
      ledgerName: ledger.name,
      importedCount: result.importedCount,
      skippedCount: result.skippedCount,
      errors: result.errors.slice(0, 20),
    }, null, 2) + "\n");
    if (result.errors.length) process.exitCode = 1;
  } finally {
    runtime.close();
  }
}

if (require.main === module) main();

module.exports = {
  inferLedgerNameFromFilename,
  parseFirstWorksheet,
  wacaiRowsFromWorksheet,
};
