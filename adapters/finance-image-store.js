"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

function nowIso() {
  return new Date().toISOString();
}

function blobHash(buffer) {
  return `sha256:${crypto.createHash("sha256").update(buffer).digest("hex")}`;
}

function createFinanceImageStore({ dbPath, clock = nowIso } = {}) {
  const resolvedDbPath = dbPath || path.join(process.cwd(), "data", "finance-images.sqlite3");
  fs.mkdirSync(path.dirname(resolvedDbPath), { recursive: true });
  const db = new DatabaseSync(resolvedDbPath);

  function tableColumns(tableName) {
    return db.prepare(`PRAGMA table_info(${tableName})`).all().map((row) => row.name);
  }

  function migrate() {
    const existingColumns = tableColumns("finance_attachment_blobs");
    if (existingColumns.includes("kind")) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS finance_attachment_blobs_v2 (
          attachment_id TEXT PRIMARY KEY,
          mime_type TEXT NOT NULL DEFAULT '',
          sha256 TEXT NOT NULL DEFAULT '',
          byte_length INTEGER NOT NULL DEFAULT 0,
          data BLOB NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT OR REPLACE INTO finance_attachment_blobs_v2
          (attachment_id, mime_type, sha256, byte_length, data, created_at, updated_at)
        SELECT attachment_id, mime_type, sha256, byte_length, data, created_at, updated_at
        FROM finance_attachment_blobs
        WHERE kind = 'original';
        DROP TABLE finance_attachment_blobs;
        ALTER TABLE finance_attachment_blobs_v2 RENAME TO finance_attachment_blobs;
      `);
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS finance_attachment_blobs (
        attachment_id TEXT PRIMARY KEY,
        mime_type TEXT NOT NULL DEFAULT '',
        sha256 TEXT NOT NULL DEFAULT '',
        byte_length INTEGER NOT NULL DEFAULT 0,
        data BLOB NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  function putOriginal({ attachmentId, buffer, mimeType = "application/octet-stream", createdAt } = {}) {
    const id = String(attachmentId || "").trim();
    if (!id) throw new Error("attachment_id_required");
    const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
    if (!data.length) throw new Error("attachment_blob_empty");
    const ts = createdAt || clock();
    db.prepare(`
      INSERT INTO finance_attachment_blobs
        (attachment_id, mime_type, sha256, byte_length, data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(attachment_id) DO UPDATE SET
        mime_type = excluded.mime_type,
        sha256 = excluded.sha256,
        byte_length = excluded.byte_length,
        data = excluded.data,
        updated_at = excluded.updated_at
    `).run(id, mimeType, blobHash(data), data.length, data, ts, ts);
    return getOriginal(id);
  }

  function getOriginal(attachmentId) {
    const row = db.prepare(`
      SELECT attachment_id, mime_type, sha256, byte_length, data, created_at, updated_at
      FROM finance_attachment_blobs
      WHERE attachment_id = ?
    `).get(String(attachmentId || ""));
    if (!row) return null;
    return {
      attachmentId: row.attachment_id,
      mimeType: row.mime_type || "application/octet-stream",
      sha256: row.sha256 || "",
      byteLength: Number(row.byte_length || 0),
      buffer: Buffer.from(row.data || []),
      createdAt: row.created_at || "",
      updatedAt: row.updated_at || "",
    };
  }

  function close() {
    db.close();
  }

  migrate();
  return {
    close,
    dbPath: resolvedDbPath,
    getOriginal,
    migrate,
    putOriginal,
  };
}

module.exports = {
  createFinanceImageStore,
};
