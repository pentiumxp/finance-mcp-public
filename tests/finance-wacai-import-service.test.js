"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestRuntime } = require("./helpers");
const { normalizeAmountForPosting } = require("../adapters/finance-wacai-import-service");
const { inferLedgerNameFromFilename } = require("../scripts/import-wacai-xlsx");

test("normalizes Excel floating artifacts to currency scale", () => {
  assert.equal(normalizeAmountForPosting("70.900000000000006"), "70.90");
  assert.equal(normalizeAmountForPosting("2.4900000000000002"), "2.49");
  assert.equal(normalizeAmountForPosting("1.9999999999999999"), "2.00");
  assert.equal(normalizeAmountForPosting("70.900000000000006", 2, 100), "7090.00");
});

test("infers Wacai ledger name from export filename", () => {
  assert.equal(inferLedgerNameFromFilename("wacai_日常账本_202605301939764_147.xlsx"), "日常账本");
  assert.equal(inferLedgerNameFromFilename("backup.xlsx"), "");
});

test("imports Wacai rows with hierarchy and source fields", () => {
  const runtime = createTestRuntime();
  const rows = [
    {
      __rowIndex: 8,
      日期时间: "2025-12-31 15:23:00",
      类型: "支出",
      类别: "家庭支出/家庭开销",
      金额: "3330.45",
      币种: "人民币",
      收付款人: "自己",
      收付账户: "现金",
      参与人: "家庭公用",
      标签: "家庭支出-wp",
      商家: "",
      属性: "",
      备注: "",
    },
    {
      __rowIndex: 9,
      日期时间: "2025-12-29 18:22:10",
      类型: "支出",
      类别: "居家/生活其他",
      金额: "10",
      币种: "港元",
      收付款人: "自己",
      收付账户: "港币",
      参与人: "自己",
      标签: "日常，逸墅132",
      商家: "",
      属性: "报销",
      备注: "八达通",
    },
    {
      __rowIndex: 10,
      日期时间: "2025-12-09 08:01:42",
      类型: "支出",
      类别: "家庭日常/燃气费",
      金额: "0",
      币种: "人民币",
      收付款人: "自己",
      收付账户: "现金",
      参与人: "家庭公用",
      标签: "东滩",
      商家: "",
      属性: "",
      备注: "1172",
    },
  ];
  const first = runtime.wacaiImportService.importRows(rows, {
    sourceFileName: "sample.xlsx",
    amountMultiplier: 100,
  }, { role: "owner" });
  const second = runtime.wacaiImportService.importRows(rows, {
    sourceFileName: "sample.xlsx",
    amountMultiplier: 100,
  }, { role: "owner" });
  assert.equal(first.importedCount, 3);
  assert.equal(first.skippedCount, 0);
  assert.equal(second.importedCount, 0);
  assert.equal(second.skippedCount, 3);

  const transactions = runtime.transactionService.listTransactions({ limit: 10 }, { role: "owner" });
  assert.equal(transactions.length, 3);
  const hkd = transactions.find((row) => row.currency === "HKD");
  assert.equal(hkd.amount, "1000.00");
  assert.equal(hkd.accountName, "港币");
  assert.equal(hkd.categoryName, "生活其他");
  assert.equal(hkd.categoryIcon, "home-supplies");
  const source = runtime.repository.getTransactionSourceFields(hkd.id);
  const rawRow = JSON.parse(source.raw_row_json);
  assert.equal(source.raw_amount, "10");
  assert.equal(source.raw_currency, "港元");
  assert.equal(source.raw_category_path, "居家/生活其他");
  assert.equal(source.raw_property, "报销");
  assert.equal(source.raw_tags, "日常，逸墅132");
  assert.equal(source.raw_note, "八达通");
  assert.equal(rawRow.备注, "八达通");
  assert.equal(rawRow.标签, "日常，逸墅132");
  assert.equal(rawRow.收付账户, "港币");
  assert.equal(runtime.repository.listCurrencies().some((row) => row.code === "HKD" && row.display_name === "港元"), true);
  assert.equal(runtime.repository.listMembers("daily").some((row) => row.display_name === "家庭公用"), true);
  const categories = runtime.repository.listCategories("daily", "expense");
  assert.equal(categories.some((row) => row.name === "家庭开销" && row.icon === "family-bill"), true);
  assert.equal(categories.some((row) => row.name === "生活其他" && row.icon === "home-supplies"), true);
  assert.equal(categories.some((row) => row.name === "燃气费" && row.icon === "utility-power"), true);
  runtime.close();
});

test("repository backfills stable icons for existing Wacai category paths", () => {
  const runtime = createTestRuntime();
  const parent = runtime.repository.upsertCategory({ ledgerId: "daily", type: "expense", name: "餐饮" });
  runtime.repository.upsertCategory({ ledgerId: "daily", type: "expense", parentId: parent.id, name: "夜宵" });
  runtime.repository.db.prepare("UPDATE finance_categories SET icon = '' WHERE name IN ('餐饮', '夜宵')").run();

  const result = runtime.repository.backfillCategoryIcons();
  const categories = runtime.repository.listCategories("daily", "expense");

  assert.equal(result.updated >= 2, true);
  assert.equal(categories.some((row) => row.name === "餐饮" && row.icon === "food-lunch"), true);
  assert.equal(categories.some((row) => row.name === "夜宵" && row.icon === "food-dinner"), true);
  runtime.close();
});
