"use strict";

const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const {
  decodeAttachmentPayload,
  normalizeUploadRoots,
  resolveAllowedUploadPath,
  safeFilename,
  validateDecodedPayload,
} = require("./finance-attachment-input-service");

function defaultId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function actorRef(context = {}) {
  return context.actorRef || context.actorWorkspaceId || context.externalWorkspaceId || "local";
}

function requireWrite(context = {}) {
  if (context.readOnly) throw new Error("finance_write_denied");
}

function publicAttachment(row) {
  if (!row) return null;
  const ledgerId = row.ledger_id || row.ledgerId || "";
  const query = ledgerId ? `?ledger_id=${encodeURIComponent(ledgerId)}` : "";
  const hasThumbnail = Boolean(row.thumbnail_ref || row.thumbnailRef);
  return {
    id: row.id,
    transactionId: row.transaction_id,
    ledgerId,
    mimeType: row.mime_type || "application/octet-stream",
    thumbnailMimeType: row.thumbnail_mime_type || row.thumbnailMimeType || "",
    fileName: row.file_ref ? path.basename(String(row.file_ref)).replace(/^attachment_[^-]+-/, "") : "",
    isImage: String(row.mime_type || "").toLowerCase().startsWith("image/"),
    sha256: row.sha256 || "",
    createdAt: row.created_at || "",
    url: `/api/finance/attachments/${encodeURIComponent(row.id)}${query}`,
    thumbnailUrl: hasThumbnail ? `/api/finance/attachments/${encodeURIComponent(row.id)}/thumbnail${query}` : "",
  };
}

function isImageMime(mimeType = "") {
  return String(mimeType || "").toLowerCase().startsWith("image/");
}

function findFfmpegPath() {
  return process.env.FINANCE_FFMPEG_PATH || "ffmpeg";
}

function createFinanceAttachmentService({
  repository,
  imageStore = null,
  storageRoot = path.join(process.cwd(), "data", "finance-attachments"),
  uploadRoots,
  clock = nowIso,
  idGenerator = defaultId,
  maxBytes = 12 * 1024 * 1024,
} = {}) {
  if (!repository) throw new Error("repository_required");
  const allowedUploadRoots = normalizeUploadRoots(uploadRoots);

  function assertTransactionAccess(transactionId, context = {}) {
    const transaction = repository.getTransaction(transactionId);
    if (!transaction) throw new Error("transaction_not_found");
    if (context.ledgerId && transaction.ledgerId !== context.ledgerId) throw new Error("finance_ledger_access_denied");
    return transaction;
  }

  function attachmentPath(row) {
    const fileRef = String(row?.file_ref || "");
    const resolved = path.resolve(storageRoot, fileRef);
    const root = path.resolve(storageRoot);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("attachment_path_invalid");
    return resolved;
  }

  function originalBlob(row) {
    if (!row || !imageStore?.getOriginal) return null;
    const blob = imageStore.getOriginal(row.id);
    if (blob) return blob;
    const sourcePath = attachmentPath(row);
    if (!fs.existsSync(sourcePath)) return null;
    return imageStore.putOriginal({
      attachmentId: row.id,
      buffer: fs.readFileSync(sourcePath),
      mimeType: row.mime_type || "application/octet-stream",
      createdAt: row.created_at || clock(),
    });
  }

  function ensureOriginalStored(row) {
    if (row) originalBlob(row);
    return row;
  }

  function ensureOriginalCacheFile(row) {
    const sourcePath = attachmentPath(row);
    if (fs.existsSync(sourcePath)) return sourcePath;
    const blob = originalBlob(row);
    if (!blob) return sourcePath;
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, blob.buffer);
    return sourcePath;
  }

  function ensureThumbnail(row) {
    if (!row || !isImageMime(row.mime_type || row.mimeType)) return row;
    originalBlob(row);
    if (row.thumbnail_ref) {
      const existingPath = attachmentPath({ file_ref: row.thumbnail_ref });
      if (fs.existsSync(existingPath)) return row;
    }
    const sourcePath = ensureOriginalCacheFile(row);
    if (!fs.existsSync(sourcePath)) return row;
    const thumbRef = path
      .join(row.ledger_id || row.ledgerId || "", row.transaction_id || row.transactionId || "", `${row.id}-thumb.jpg`)
      .replaceAll("\\", "/");
    const thumbPath = attachmentPath({ file_ref: thumbRef });
    fs.mkdirSync(path.dirname(thumbPath), { recursive: true });
    const generated = spawnSync(findFfmpegPath(), [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      sourcePath,
      "-vf",
      "scale=240:-1:force_original_aspect_ratio=decrease",
      "-frames:v",
      "1",
      thumbPath,
    ], { windowsHide: true });
    if (generated.status !== 0 || !fs.existsSync(thumbPath)) {
      fs.copyFileSync(sourcePath, thumbPath);
      return repository.updateAttachmentThumbnail(row.id, thumbRef, row.mime_type || "application/octet-stream");
    }
    return repository.updateAttachmentThumbnail(row.id, thumbRef, "image/jpeg");
  }

  function addAttachment(input = {}, context = {}) {
    requireWrite(context);
    const transactionId = String(input.transactionId || input.transaction_id || "").trim();
    if (!transactionId) throw new Error("transaction_id_required");
    const transaction = assertTransactionAccess(transactionId, context);
    const decoded = decodeAttachmentPayload(input, allowedUploadRoots);
    validateDecodedPayload(decoded, maxBytes);
    const id = idGenerator("attachment");
    const fileName = safeFilename(input.fileName || input.file_name || decoded.fileName || "attachment.bin");
    const fileRef = path.join(transaction.ledgerId, transaction.id, `${id}-${fileName}`).replaceAll("\\", "/");
    const fullPath = attachmentPath({ file_ref: fileRef });
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, decoded.buffer);
    const sha256 = `sha256:${crypto.createHash("sha256").update(decoded.buffer).digest("hex")}`;
    let inserted = repository.insertAttachment({
      id,
      transactionId: transaction.id,
      fileRef,
      mimeType: decoded.mimeType,
      sha256,
      createdAt: clock(),
    });
    imageStore?.putOriginal?.({
      attachmentId: inserted.id,
      buffer: decoded.buffer,
      mimeType: decoded.mimeType,
      createdAt: inserted.created_at || clock(),
    });
    inserted = ensureThumbnail(inserted);
    repository.insertAudit({
      ledgerId: transaction.ledgerId,
      actorRef: actorRef(context),
      action: "transaction.attach",
      entityType: "attachment",
      entityId: inserted.id,
      after: {
        transactionId: transaction.id,
        mimeType: inserted.mime_type,
        sha256: inserted.sha256,
      },
    });
    return publicAttachment(inserted);
  }

  function validateAttachmentInput(input = {}) {
    return validateDecodedPayload(decodeAttachmentPayload(input, allowedUploadRoots), maxBytes);
  }

  function listTransactionAttachments(transactionId, context = {}) {
    assertTransactionAccess(transactionId, context);
    return repository.listAttachments(transactionId).map(ensureOriginalStored).map(ensureThumbnail).map(publicAttachment);
  }

  function backfillOriginalBlobs() {
    if (!imageStore?.getOriginal || !repository.listAllAttachments) return { checked: 0, stored: 0, missing: 0 };
    let checked = 0;
    let stored = 0;
    let missing = 0;
    for (const row of repository.listAllAttachments()) {
      checked += 1;
      if (imageStore.getOriginal(row.id)) continue;
      const blob = originalBlob(row);
      if (blob) stored += 1;
      else missing += 1;
    }
    return { checked, stored, missing };
  }

  function getAttachment(id, context = {}) {
    const attachment = repository.getAttachment(id);
    if (!attachment) throw new Error("attachment_not_found");
    if (context.ledgerId && attachment.ledger_id !== context.ledgerId) throw new Error("finance_ledger_access_denied");
    const blob = originalBlob(attachment);
    const filePath = attachmentPath(attachment);
    if (!blob && !fs.existsSync(filePath)) throw new Error("attachment_file_missing");
    return {
      row: publicAttachment(attachment),
      filePath: blob ? "" : filePath,
      buffer: blob?.buffer,
      mimeType: blob?.mimeType || attachment.mime_type || "application/octet-stream",
    };
  }

  function getAttachmentThumbnail(id, context = {}) {
    const attachment = ensureThumbnail(repository.getAttachment(id));
    if (!attachment) throw new Error("attachment_not_found");
    if (context.ledgerId && attachment.ledger_id !== context.ledgerId) throw new Error("finance_ledger_access_denied");
    const ref = attachment.thumbnail_ref || attachment.file_ref;
    const filePath = attachmentPath({ file_ref: ref });
    if (!fs.existsSync(filePath)) throw new Error("attachment_file_missing");
    return {
      row: publicAttachment(attachment),
      filePath,
      mimeType: attachment.thumbnail_mime_type || attachment.mime_type || "application/octet-stream",
    };
  }

  return {
    addAttachment,
    backfillOriginalBlobs,
    getAttachment,
    getAttachmentThumbnail,
    listTransactionAttachments,
    validateAttachmentInput,
  };
}

module.exports = {
  createFinanceAttachmentService,
  normalizeUploadRoots,
  resolveAllowedUploadPath,
};
