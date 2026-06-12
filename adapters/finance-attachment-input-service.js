"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MAX_CREATE_ATTACHMENTS = 6;
const ATTACHMENT_PAYLOAD_SOURCE_FIELDS = Object.freeze(["data_base64", "data_url", "file_path", "upload_path"]);

const MIME_TYPES_BY_EXT = new Map([
  [".gif", "image/gif"],
  [".heic", "image/heic"],
  [".heif", "image/heif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".txt", "text/plain"],
  [".webp", "image/webp"],
]);

function safeFilename(input = "attachment.bin") {
  const name = path.basename(String(input || "attachment.bin")).trim() || "attachment.bin";
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 96) || "attachment.bin";
}

function comparePath(value) {
  const resolved = path.resolve(String(value || ""));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function splitRoots(value) {
  if (Array.isArray(value)) return value;
  return String(value || "")
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
}

function defaultUploadRoots() {
  const roots = [
    ...splitRoots(process.env.FINANCE_ATTACHMENT_UPLOAD_ROOTS),
    path.join(process.cwd(), "data", "uploads"),
    path.resolve(process.cwd(), "..", "..", "data", "drive", "users"),
  ];
  const hermesDataRoot = process.env.HERMES_MOBILE_DATA_ROOT || process.env.HERMES_DATA_ROOT || "";
  if (hermesDataRoot) roots.push(path.join(hermesDataRoot, "drive", "users"));
  if (process.platform === "win32") {
    roots.push(path.join(process.env.ProgramData || "C:\\ProgramData", "HermesMobile", "data", "drive", "users"));
  }
  return roots;
}

function normalizeUploadRoots(input) {
  const roots = splitRoots(input === undefined ? defaultUploadRoots() : input);
  const normalized = [];
  for (const root of roots) {
    const resolved = path.resolve(root);
    let real = resolved;
    try {
      real = fs.realpathSync(resolved);
    } catch {
      real = resolved;
    }
    const key = comparePath(real);
    const hermesUsersRoot = /(?:^|[\\/])data[\\/]drive[\\/]users$/i.test(real);
    if (!normalized.some((item) => item.key === key)) normalized.push({ path: real, key, hermesUsersRoot });
  }
  return normalized;
}

function normalizeAttachmentInput(input = {}) {
  return {
    ...input,
    transactionId: input.transactionId || input.transaction_id,
    fileName: input.fileName || input.file_name,
    mimeType: input.mimeType || input.mime_type,
    dataBase64: input.dataBase64 || input.data_base64,
    dataUrl: input.dataUrl || input.data_url,
    filePath: input.filePath || input.file_path,
    uploadPath: input.uploadPath || input.upload_path,
  };
}

function inputFilePath(input = {}) {
  const normalized = normalizeAttachmentInput(input);
  return String(normalized.filePath || normalized.uploadPath || "").trim();
}

function legacyUploadPathFromDataUrl(value = "") {
  const dataUrl = String(value || "").trim();
  if (!dataUrl || dataUrl.startsWith("data:")) return "";
  const mediaMatch = dataUrl.match(/^MEDIA:\s*(.+)$/i);
  const candidate = String(mediaMatch ? mediaMatch[1] : dataUrl).trim();
  return path.isAbsolute(candidate) ? candidate : "";
}

function inferMimeType(filePath) {
  return MIME_TYPES_BY_EXT.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
}

function isHermesUploadFile(filePath) {
  const parts = comparePath(filePath).split(/[\\/]+/);
  return parts.some((part, index) => part === ".hermes-mobile" && parts[index + 1] === "uploads");
}

function resolveAllowedUploadPath(filePath, uploadRoots = []) {
  const raw = String(filePath || "").trim();
  if (!raw) throw new Error("attachment_file_path_required");
  const resolved = path.resolve(raw);
  const stat = fs.statSync(resolved, { throwIfNoEntry: false });
  if (!stat) throw new Error("attachment_file_path_missing");
  if (!stat.isFile()) throw new Error("attachment_file_path_not_file");
  const realPath = fs.realpathSync(resolved);
  const realKey = comparePath(realPath);
  const matchingRoot = uploadRoots.find((root) => realKey === root.key || realKey.startsWith(`${root.key}${path.sep}`));
  if (!matchingRoot) throw new Error("attachment_file_path_not_allowed");
  if (matchingRoot.hermesUsersRoot && !isHermesUploadFile(realPath)) throw new Error("attachment_file_path_not_allowed");
  return realPath;
}

function decodeBase64Payload(input = {}) {
  const normalized = normalizeAttachmentInput(input);
  const dataUrl = String(normalized.dataUrl || "");
  if (dataUrl) {
    const match = dataUrl.match(/^data:([^;,]+)?;base64,(.+)$/);
    if (!match) throw new Error("attachment_data_url_invalid");
    return {
      buffer: Buffer.from(match[2], "base64"),
      mimeType: normalized.mimeType || match[1] || "application/octet-stream",
    };
  }
  const base64 = String(normalized.dataBase64 || "");
  if (!base64) throw new Error("attachment_data_required");
  return {
    buffer: Buffer.from(base64, "base64"),
    mimeType: normalized.mimeType || "application/octet-stream",
  };
}

function decodeAttachmentPayload(input = {}, uploadRoots = []) {
  const normalized = normalizeAttachmentInput(input);
  const filePath = inputFilePath(normalized);
  const dataUrl = String(normalized.dataUrl || "").trim();
  const legacyPath = legacyUploadPathFromDataUrl(dataUrl);
  const uploadPath = filePath || legacyPath;
  if (!uploadPath) return decodeBase64Payload(normalized);
  const resolved = resolveAllowedUploadPath(uploadPath, uploadRoots);
  return {
    buffer: fs.readFileSync(resolved),
    mimeType: normalized.mimeType || inferMimeType(resolved),
    fileName: normalized.fileName || path.basename(resolved),
    filePath: resolved,
  };
}

function validateDecodedPayload(decoded = {}, maxBytes = 0) {
  if (!decoded.buffer?.length) throw new Error("attachment_empty");
  if (decoded.buffer.length > maxBytes) throw new Error("attachment_too_large");
  return {
    byteLength: decoded.buffer.length,
    mimeType: decoded.mimeType,
  };
}

function normalizeCreateAttachments(input = {}) {
  const raw = input.attachments;
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error("attachments_must_be_array");
  if (raw.length > MAX_CREATE_ATTACHMENTS) throw new Error("attachments_too_many");
  return raw.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("attachment_invalid");
    return normalizeAttachmentInput(item);
  });
}

function attachmentPayloadAnyOf() {
  return ATTACHMENT_PAYLOAD_SOURCE_FIELDS.map((field) => ({ required: [field] }));
}

function attachmentPayloadProperties() {
  return {
    data_base64: { type: "string", description: "Base64-encoded file bytes." },
    data_url: { type: "string", description: "Data URL with a base64 payload. Legacy absolute upload paths and MEDIA:<path> wrappers are accepted only under allowed upload roots." },
    file_path: { type: "string", description: "Server-local upload file path under an allowed upload root. Prefer this for Hermes upload files instead of reading binary bytes into base64." },
    upload_path: { type: "string", description: "Alias for file_path. Prefer this for Hermes upload files instead of reading binary bytes into base64." },
  };
}

module.exports = {
  ATTACHMENT_PAYLOAD_SOURCE_FIELDS,
  MAX_CREATE_ATTACHMENTS,
  attachmentPayloadAnyOf,
  attachmentPayloadProperties,
  decodeAttachmentPayload,
  normalizeAttachmentInput,
  normalizeCreateAttachments,
  normalizeUploadRoots,
  resolveAllowedUploadPath,
  safeFilename,
  validateDecodedPayload,
};
