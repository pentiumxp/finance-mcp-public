"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

function clean(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function splitTags(value) {
  return clean(value)
    .split(/[\u002c\uff0c\u3001]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function defaultId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    apply: false,
    backup: true,
    dbPath: process.env.FINANCE_MCP_DB_PATH || path.join(process.cwd(), "data", "finance.sqlite3"),
    source: "wacai",
    batchLike: "",
    actorRef: "wacai-member-tag-repair-20260606",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--no-backup") {
      options.backup = false;
    } else if (arg === "--db") {
      options.dbPath = argv[++index];
    } else if (arg === "--source") {
      options.source = argv[++index];
    } else if (arg === "--batch-like") {
      options.batchLike = argv[++index];
    } else if (arg === "--actor") {
      options.actorRef = argv[++index];
    } else {
      throw new Error(`unknown_arg:${arg}`);
    }
  }
  return options;
}

function backupDb(dbPath) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const backupPath = `${dbPath}.before-wacai-member-tag-repair-${stamp}.bak`;
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
}

function mapIncrement(map, key, count = 1) {
  map.set(key, (map.get(key) || 0) + count);
}

function makeWhere(options) {
  const where = ["s.source = ?", "t.status = 'active'"];
  const params = [options.source || "wacai"];
  if (options.batchLike) {
    where.push("COALESCE(b.source_file_name, '') LIKE ?");
    params.push(`%${options.batchLike}%`);
  }
  return { where: where.join(" AND "), params };
}

function summarizePlans(plans) {
  const memberChanges = new Map();
  const tagRestores = new Map();
  let memberUpdateCount = 0;
  let tagRestoreCount = 0;
  let skippedExistingTagRows = 0;
  for (const plan of plans) {
    if (plan.memberChange) {
      memberUpdateCount += 1;
      mapIncrement(memberChanges, `${plan.currentMemberName || "(blank)"} -> ${plan.desiredMemberName}`);
    }
    if (plan.tagNames.length && plan.storedTagCount === 0) {
      tagRestoreCount += 1;
      mapIncrement(tagRestores, `${plan.tagNames.length} tag(s)`);
    } else if (plan.tagNames.length && plan.storedTagCount > 0) {
      skippedExistingTagRows += 1;
    }
  }
  return {
    candidateRows: plans.length,
    memberUpdateCount,
    tagRestoreCount,
    skippedExistingTagRows,
    memberChanges: [...memberChanges.entries()].map(([change, count]) => ({ change, count })),
    tagRestores: [...tagRestores.entries()].map(([tagCount, count]) => ({ tagCount, count })),
  };
}

function ensureMember(db, { ledgerId, displayName, timestamp }) {
  const name = clean(displayName);
  if (!name) throw new Error("member_name_required");
  db.prepare(`
    INSERT INTO finance_members
      (id, ledger_id, display_name, is_household, is_active, created_at, updated_at)
    VALUES (?, ?, ?, CASE WHEN ? = '\u5bb6\u5ead\u516c\u7528' THEN 1 ELSE 0 END, 1, ?, ?)
    ON CONFLICT(ledger_id, display_name) DO UPDATE SET
      is_active = 1,
      updated_at = excluded.updated_at
  `).run(defaultId("member"), ledgerId, name, name, timestamp, timestamp);
  return db.prepare("SELECT * FROM finance_members WHERE ledger_id = ? AND display_name = ?").get(ledgerId, name);
}

function ensureTag(db, { ledgerId, name, timestamp }) {
  const cleanName = clean(name);
  if (!cleanName) throw new Error("tag_name_required");
  db.prepare(`
    INSERT INTO finance_tags (id, ledger_id, name, color, created_at, updated_at)
    VALUES (?, ?, ?, '', ?, ?)
    ON CONFLICT(ledger_id, name) DO UPDATE SET updated_at = excluded.updated_at
  `).run(defaultId("tag"), ledgerId, cleanName, timestamp, timestamp);
  return db.prepare("SELECT * FROM finance_tags WHERE ledger_id = ? AND name = ?").get(ledgerId, cleanName);
}

function insertAudit(db, { ledgerId, actorRef, transactionId, before, after, timestamp }) {
  db.prepare(`
    INSERT INTO finance_audit_log
      (id, ledger_id, actor_ref, action, entity_type, entity_id, before_json, after_json, created_at)
    VALUES (?, ?, ?, 'transaction.repair_wacai_member_tags', 'transaction', ?, ?, ?, ?)
  `).run(
    defaultId("audit"),
    ledgerId,
    actorRef,
    transactionId,
    JSON.stringify(before),
    JSON.stringify(after),
    timestamp,
  );
}

function loadPlans(db, options) {
  const { where, params } = makeWhere(options);
  const rows = db.prepare(`
    SELECT
      t.id,
      t.ledger_id,
      t.booked_by_member_id,
      t.payer_member_id,
      COALESCE(booked.display_name, '') AS booked_member_name,
      COALESCE(payer.display_name, '') AS payer_member_name,
      COALESCE(s.raw_participant_name, '') AS raw_participant_name,
      COALESCE(s.raw_tags, '') AS raw_tags,
      COALESCE((
        SELECT COUNT(*) FROM finance_transaction_tags tt WHERE tt.transaction_id = t.id
      ), 0) AS stored_tag_count
    FROM finance_transaction_source_fields s
    JOIN finance_transactions t ON t.id = s.transaction_id
    LEFT JOIN finance_members booked ON booked.id = t.booked_by_member_id
    LEFT JOIN finance_members payer ON payer.id = t.payer_member_id
    LEFT JOIN finance_import_batches b ON b.id = s.import_batch_id
    WHERE ${where}
  `).all(...params);

  return rows
    .map((row) => {
      const desiredMemberName = clean(row.raw_participant_name);
      const tagNames = splitTags(row.raw_tags);
      return {
        ...row,
        desiredMemberName,
        currentMemberName: clean(row.booked_member_name),
        memberChange: Boolean(desiredMemberName && desiredMemberName !== clean(row.booked_member_name)),
        tagNames,
        storedTagCount: Number(row.stored_tag_count || 0),
      };
    })
    .filter((plan) => plan.memberChange || (plan.tagNames.length && plan.storedTagCount === 0));
}

function applyPlans(db, plans, options) {
  const updateTransaction = db.prepare(`
    UPDATE finance_transactions SET
      booked_by_member_id = ?,
      payer_member_id = CASE
        WHEN payer_member_id = '' OR payer_member_id = ? THEN ?
        ELSE payer_member_id
      END,
      updated_at = ?
    WHERE id = ?
  `);
  const deleteTags = db.prepare("DELETE FROM finance_transaction_tags WHERE transaction_id = ?");
  const insertTag = db.prepare("INSERT OR IGNORE INTO finance_transaction_tags (transaction_id, tag_id) VALUES (?, ?)");
  let memberUpdates = 0;
  let tagRestores = 0;
  let auditRows = 0;

  db.exec("BEGIN IMMEDIATE");
  try {
    for (const plan of plans) {
      const timestamp = nowIso();
      let newMemberId = plan.booked_by_member_id;
      let newPayerMemberId = plan.payer_member_id;
      let restoredTagCount = 0;

      if (plan.memberChange) {
        const member = ensureMember(db, {
          ledgerId: plan.ledger_id,
          displayName: plan.desiredMemberName,
          timestamp,
        });
        newMemberId = member.id;
        if (!plan.payer_member_id || plan.payer_member_id === plan.booked_by_member_id) {
          newPayerMemberId = member.id;
        }
        updateTransaction.run(newMemberId, plan.booked_by_member_id, newMemberId, timestamp, plan.id);
        memberUpdates += 1;
      }

      if (plan.tagNames.length && plan.storedTagCount === 0) {
        deleteTags.run(plan.id);
        for (const tagName of plan.tagNames) {
          const tag = ensureTag(db, { ledgerId: plan.ledger_id, name: tagName, timestamp });
          insertTag.run(plan.id, tag.id);
          restoredTagCount += 1;
        }
        tagRestores += 1;
      }

      insertAudit(db, {
        ledgerId: plan.ledger_id,
        actorRef: options.actorRef,
        transactionId: plan.id,
        timestamp,
        before: {
          bookedByMemberId: plan.booked_by_member_id,
          payerMemberId: plan.payer_member_id,
          storedTagCount: plan.storedTagCount,
        },
        after: {
          bookedByMemberId: newMemberId,
          payerMemberId: newPayerMemberId,
          restoredTagCount,
        },
      });
      auditRows += 1;
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return { memberUpdates, tagRestores, auditRows };
}

function repairWacaiMemberTags(options = {}) {
  const finalOptions = {
    apply: false,
    backup: true,
    dbPath: process.env.FINANCE_MCP_DB_PATH || path.join(process.cwd(), "data", "finance.sqlite3"),
    source: "wacai",
    batchLike: "",
    actorRef: "wacai-member-tag-repair-20260606",
    ...options,
  };
  const db = new DatabaseSync(finalOptions.dbPath);
  try {
    db.exec("PRAGMA foreign_keys = ON");
    const plans = loadPlans(db, finalOptions);
    const summary = summarizePlans(plans);
    let backupPath = "";
    let applied = null;
    if (finalOptions.apply && plans.length) {
      if (finalOptions.backup) backupPath = backupDb(finalOptions.dbPath);
      applied = applyPlans(db, plans, finalOptions);
    }
    return {
      ok: true,
      mode: finalOptions.apply ? "apply" : "dry-run",
      dbPath: finalOptions.dbPath,
      source: finalOptions.source,
      batchLike: finalOptions.batchLike,
      backupPath,
      ...summary,
      applied,
    };
  } finally {
    db.close();
  }
}

function main() {
  const result = repairWacaiMemberTags(parseArgs());
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {
  repairWacaiMemberTags,
  splitTags,
};
