"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  ATTACHMENT_PAYLOAD_SOURCE_FIELDS,
  MAX_CREATE_ATTACHMENTS,
  attachmentPayloadAnyOf,
  attachmentPayloadProperties,
  decodeAttachmentPayload,
  normalizeCreateAttachments,
  normalizeUploadRoots,
  validateDecodedPayload,
} = require("../adapters/finance-attachment-input-service");

test("attachment payload schema helpers use the service source-field registry", () => {
  assert.deepEqual(ATTACHMENT_PAYLOAD_SOURCE_FIELDS, ["data_base64", "data_url", "file_path", "upload_path"]);
  assert.deepEqual(attachmentPayloadAnyOf(), ATTACHMENT_PAYLOAD_SOURCE_FIELDS.map((field) => ({ required: [field] })));
  const properties = attachmentPayloadProperties();
  for (const field of ATTACHMENT_PAYLOAD_SOURCE_FIELDS) assert.equal(Boolean(properties[field]), true);
  assert.match(properties.file_path.description, /server-local upload file path/i);
  assert.equal(MAX_CREATE_ATTACHMENTS, 6);
});

test("normalizes create-time attachment envelopes before transaction writes", () => {
  const attachments = normalizeCreateAttachments({
    attachments: [{
      file_name: "receipt.png",
      mime_type: "image/png",
      data_base64: Buffer.from("payload", "utf8").toString("base64"),
    }],
  });
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].fileName, "receipt.png");
  assert.equal(attachments[0].mimeType, "image/png");
  assert.equal(Boolean(attachments[0].dataBase64), true);

  assert.throws(() => normalizeCreateAttachments({ attachments: {} }), /attachments_must_be_array/);
  assert.throws(() => normalizeCreateAttachments({ attachments: new Array(MAX_CREATE_ATTACHMENTS + 1).fill({ data_base64: "x" }) }), /attachments_too_many/);
  assert.throws(() => normalizeCreateAttachments({ attachments: [null] }), /attachment_invalid/);
});

test("decodes data URLs, base64, upload paths, and MEDIA-wrapped upload paths through one path", () => {
  const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), "finance-attachment-input-"));
  const uploadRoots = normalizeUploadRoots([uploadRoot]);
  const filePath = path.join(uploadRoot, "receipt.png");
  fs.writeFileSync(filePath, Buffer.from("path-payload", "utf8"));

  const dataUrl = decodeAttachmentPayload({
    data_url: `data:image/jpeg;base64,${Buffer.from("url-payload", "utf8").toString("base64")}`,
  }, uploadRoots);
  assert.equal(dataUrl.mimeType, "image/jpeg");
  assert.equal(dataUrl.buffer.toString("utf8"), "url-payload");

  const base64 = decodeAttachmentPayload({
    mime_type: "text/plain",
    data_base64: Buffer.from("base64-payload", "utf8").toString("base64"),
  }, uploadRoots);
  assert.equal(base64.mimeType, "text/plain");
  assert.equal(base64.buffer.toString("utf8"), "base64-payload");

  const pathPayload = decodeAttachmentPayload({ file_path: filePath }, uploadRoots);
  assert.equal(pathPayload.mimeType, "image/png");
  assert.equal(pathPayload.fileName, "receipt.png");
  assert.equal(pathPayload.buffer.toString("utf8"), "path-payload");

  const mediaPayload = decodeAttachmentPayload({ data_url: `MEDIA: ${filePath}` }, uploadRoots);
  assert.equal(mediaPayload.fileName, "receipt.png");
  assert.equal(mediaPayload.buffer.toString("utf8"), "path-payload");
});

test("reports attachment source errors before persistence", () => {
  const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), "finance-attachment-input-denied-"));
  const uploadRoots = normalizeUploadRoots([uploadRoot]);
  const deniedPath = path.join(os.tmpdir(), `finance-denied-${Date.now()}.png`);
  fs.writeFileSync(deniedPath, Buffer.from("denied", "utf8"));

  assert.throws(() => decodeAttachmentPayload({}, uploadRoots), /attachment_data_required/);
  assert.throws(() => decodeAttachmentPayload({ data_url: "not-a-data-url" }, uploadRoots), /attachment_data_url_invalid/);
  assert.throws(() => decodeAttachmentPayload({ file_path: deniedPath }, uploadRoots), /attachment_file_path_not_allowed/);
  assert.throws(() => validateDecodedPayload({ buffer: Buffer.alloc(0), mimeType: "text/plain" }, 10), /attachment_empty/);
  assert.throws(() => validateDecodedPayload({ buffer: Buffer.from("too-large"), mimeType: "text/plain" }, 2), /attachment_too_large/);
});
