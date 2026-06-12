"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createTestRuntime } = require("./helpers");

function photoFixture(text = "mcp-photo") {
  return {
    file_name: "receipt.png",
    mime_type: "image/png",
    data_base64: Buffer.from(text, "utf8").toString("base64"),
  };
}

test("creates transaction and attaches photos in one service call", () => {
  const runtime = createTestRuntime();
  const created = runtime.transactionAttachmentService.createTransactionWithAttachments({
    type: "expense",
    amount: "22.40",
    idempotency_key: "photo-create-once",
    attachments: [photoFixture()],
  }, { role: "owner", actorRef: "service-photo-test" });

  assert.equal(created.duplicate, false);
  assert.equal(created.transaction.amountMinor, 2240);
  assert.equal(created.transaction.attachmentCount, 1);
  assert.equal(created.transaction.imageAttachmentCount, 1);
  assert.equal(created.attachments.length, 1);
  assert.equal(created.attachments[0].transactionId, created.transaction.id);
  assert.equal(created.attachments[0].isImage, true);
  assert.match(created.attachments[0].url, /\/api\/finance\/attachments\//);

  const stored = runtime.imageStore.getOriginal(created.attachments[0].id);
  assert.equal(stored.mimeType, "image/png");
  assert.equal(stored.buffer.toString("utf8"), "mcp-photo");

  const duplicate = runtime.transactionAttachmentService.createTransactionWithAttachments({
    type: "expense",
    amount: "22.40",
    idempotency_key: "photo-create-once",
    attachments: [photoFixture("replayed-photo")],
  }, { role: "owner", actorRef: "service-photo-test" });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.attachments.length, 0);
  assert.equal(runtime.attachmentService.listTransactionAttachments(created.transaction.id).length, 1);
  runtime.close();
});

test("creates transaction and attaches upload path in one service call", () => {
  const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), "finance-create-upload-root-"));
  const runtime = createTestRuntime({ attachmentUploadRoots: [uploadRoot] });
  const filePath = path.join(uploadRoot, "parking.png");
  fs.writeFileSync(filePath, Buffer.from("parking-create-photo", "utf8"));

  const created = runtime.transactionAttachmentService.createTransactionWithAttachments({
    type: "expense",
    amount: "45.00",
    note: "parking",
    attachments: [{ file_path: filePath }],
  }, { role: "owner", actorRef: "service-photo-test" });

  assert.equal(created.duplicate, false);
  assert.equal(created.transaction.attachmentCount, 1);
  assert.equal(created.attachments.length, 1);
  assert.equal(created.attachments[0].mimeType, "image/png");
  assert.equal(created.attachments[0].fileName, "parking.png");
  const stored = runtime.imageStore.getOriginal(created.attachments[0].id);
  assert.equal(stored.buffer.toString("utf8"), "parking-create-photo");
  runtime.close();
});

test("creates transaction and accepts MEDIA-wrapped upload path in data_url", () => {
  const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), "finance-create-media-root-"));
  const runtime = createTestRuntime({ attachmentUploadRoots: [uploadRoot] });
  const filePath = path.join(uploadRoot, "parking-media.png");
  fs.writeFileSync(filePath, Buffer.from("parking-media-photo", "utf8"));

  const created = runtime.transactionAttachmentService.createTransactionWithAttachments({
    type: "expense",
    amount: "45.00",
    note: "parking",
    attachments: [{ data_url: `MEDIA:${filePath}` }],
  }, { role: "owner", actorRef: "service-photo-test" });

  assert.equal(created.transaction.attachmentCount, 1);
  assert.equal(created.attachments[0].mimeType, "image/png");
  assert.equal(created.attachments[0].fileName, "parking-media.png");
  const stored = runtime.imageStore.getOriginal(created.attachments[0].id);
  assert.equal(stored.buffer.toString("utf8"), "parking-media-photo");
  runtime.close();
});

test("validates create-time attachment envelope before creating transaction", () => {
  const runtime = createTestRuntime();
  assert.throws(() => runtime.transactionAttachmentService.createTransactionWithAttachments({
    type: "expense",
    amount: "1.00",
    attachments: {},
  }, { role: "owner", actorRef: "service-photo-test" }), /attachments_must_be_array/);
  assert.throws(() => runtime.transactionAttachmentService.createTransactionWithAttachments({
    type: "expense",
    amount: "1.00",
    attachments: [photoFixture(), photoFixture(), photoFixture(), photoFixture(), photoFixture(), photoFixture(), photoFixture()],
  }, { role: "owner", actorRef: "service-photo-test" }), /attachments_too_many/);
  assert.equal(runtime.transactionService.listTransactions({}, { role: "owner" }).length, 0);
  runtime.close();
});
