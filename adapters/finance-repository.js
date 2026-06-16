"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { categoryIconForPath } = require("./finance-category-icons");

const CURRENT_SCHEMA_VERSION = 12;

function defaultId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function boolInt(value) {
  return value ? 1 : 0;
}

function applyTransactionFilters({ where, params, filters, tagAlias = "" }) {
  if (filters.categoryId) {
    where.push("t.category_id = ?");
    params.push(filters.categoryId);
  }
  if (filters.categoryParentId) {
    where.push("(t.category_id = ? OR c.parent_id = ?)");
    params.push(filters.categoryParentId, filters.categoryParentId);
  }
  if (filters.accountId) {
    where.push("(t.account_id = ? OR t.target_account_id = ?)");
    params.push(filters.accountId, filters.accountId);
  }
  if (filters.merchantId) {
    where.push("t.merchant_id = ?");
    params.push(filters.merchantId);
  }
  if (filters.memberId) {
    where.push("(t.booked_by_member_id = ? OR t.payer_member_id = ?)");
    params.push(filters.memberId, filters.memberId);
  }
  if (filters.currency) {
    where.push("t.currency = ?");
    params.push(String(filters.currency).toUpperCase());
  }
  if (filters.tagId) {
    if (filters.tagId === "untagged") {
      where.push("NOT EXISTS (SELECT 1 FROM finance_transaction_tags ftt WHERE ftt.transaction_id = t.id)");
    } else if (tagAlias) {
      where.push(`${tagAlias}.tag_id = ?`);
      params.push(filters.tagId);
    } else {
      where.push("EXISTS (SELECT 1 FROM finance_transaction_tags ftt WHERE ftt.transaction_id = t.id AND ftt.tag_id = ?)");
      params.push(filters.tagId);
    }
  }
}

function normalizedSearch(value = "") {
  return String(value || "").trim().slice(0, 80);
}

function rowToTransaction(row) {
  if (!row) return null;
  return {
    id: row.id,
    ledgerId: row.ledger_id,
    type: row.type,
    status: row.status,
    amountMinor: row.amount_minor,
    scale: row.scale,
    currency: row.currency,
    occurredAt: row.occurred_at,
    categoryId: row.category_id,
    accountId: row.account_id,
    targetAccountId: row.target_account_id,
    bookedByMemberId: row.booked_by_member_id,
    payerMemberId: row.payer_member_id,
    merchantId: row.merchant_id,
    note: row.note,
    source: row.source,
    sourceRef: row.source_ref,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    voidedAt: row.voided_at,
  };
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function rowToRecurringRule(row) {
  if (!row) return null;
  return {
    id: row.id,
    ledgerId: row.ledger_id,
    status: row.status,
    title: row.title,
    transactionType: row.transaction_type,
    amountMinor: row.amount_minor,
    scale: row.scale,
    currency: row.currency,
    categoryId: row.category_id,
    categoryName: row.category_name || "",
    accountId: row.account_id,
    accountName: row.account_name || "",
    targetAccountId: row.target_account_id,
    targetAccountName: row.target_account_name || "",
    memberId: row.member_id,
    memberName: row.member_name || "",
    merchantName: row.merchant_name,
    note: row.note,
    tags: parseJsonArray(row.tags_json),
    frequency: row.frequency,
    intervalCount: row.interval_count,
    weekdays: parseJsonArray(row.weekdays_json),
    dayOfMonth: row.day_of_month,
    monthOfYear: row.month_of_year,
    startAt: row.start_at,
    endAt: row.end_at,
    timeOfDay: row.time_of_day,
    nextDueAt: row.next_due_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function rowToOwnerAssetSnapshot(row) {
  if (!row) return null;
  return {
    id: row.id,
    financeUserId: row.finance_user_id,
    year: row.snapshot_year,
    asOfDate: row.as_of_date,
    baseCurrency: row.base_currency,
    fxUsdCnyPpm: row.fx_usd_cny_ppm,
    usdInvestmentYear: row.usd_investment_year,
    usdAnnualReturnBps: row.usd_annual_return_bps,
    usdCagrBps: row.usd_cagr_bps,
    usdTotalReturnMultipleBps: row.usd_total_return_multiple_bps,
    totalAssetsCnyMinor: row.total_assets_cny_minor,
    currentUsdCnyPpm: row.current_usd_cny_ppm || 0,
    currentTotalAssetsUsdMinor: row.current_total_assets_usd_minor || 0,
    currentFxUpdatedAt: row.current_fx_updated_at || "",
    currentFxSource: row.current_fx_source || "",
    source: row.source,
    sourceRef: row.source_ref,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToOwnerAssetComponent(row) {
  if (!row) return null;
  return {
    id: row.id,
    snapshotId: row.snapshot_id,
    componentKey: row.component_key,
    label: row.label,
    currency: row.currency,
    amountMinor: row.amount_minor,
    amountCnyMinor: row.amount_cny_minor,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToOwnerStockSnapshot(row) {
  if (!row) return null;
  return {
    id: row.id,
    financeUserId: row.finance_user_id,
    asOfDate: row.as_of_date,
    baseCurrency: row.base_currency,
    baseScale: row.base_scale,
    priceAsOf: row.price_as_of,
    totalMarketValueMinor: row.total_market_value_minor,
    totalCostBasisMinor: row.total_cost_basis_minor,
    totalUnrealizedGainMinor: row.total_unrealized_gain_minor,
    totalAnnualGainMinor: row.total_annual_gain_minor,
    annualChangeBps: row.annual_change_bps,
    source: row.source,
    sourceRef: row.source_ref,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToOwnerStockPosition(row) {
  if (!row) return null;
  return {
    id: row.id,
    snapshotId: row.snapshot_id,
    positionKey: row.position_key,
    label: row.label,
    ticker: row.ticker,
    market: row.market,
    currency: row.currency,
    scale: row.scale,
    quantityUnitsMicro: row.quantity_units_micro,
    quantityUnit: row.quantity_unit,
    averageCostMinor: row.average_cost_minor,
    openingPriceMinor: row.opening_price_minor,
    currentPriceMinor: row.current_price_minor,
    costBasisMinor: row.cost_basis_minor,
    openingMarketValueMinor: row.opening_market_value_minor,
    currentMarketValueMinor: row.current_market_value_minor,
    costBasisBaseMinor: row.cost_basis_base_minor,
    openingMarketValueBaseMinor: row.opening_market_value_base_minor,
    marketValueBaseMinor: row.market_value_base_minor,
    unrealizedGainBaseMinor: row.unrealized_gain_base_minor,
    annualGainBaseMinor: row.annual_gain_base_minor,
    annualChangeBps: row.annual_change_bps,
    cumulativeChangeBps: row.cumulative_change_bps,
    allocationBps: row.allocation_bps,
    fxToBasePpm: row.fx_to_base_ppm,
    sortOrder: row.sort_order,
    sourceRowIndex: row.source_row_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createFinanceRepository({ dbPath, idGenerator = defaultId, clock = nowIso } = {}) {
  const resolvedDbPath = dbPath || path.join(process.cwd(), "data", "finance.sqlite3");
  ensureParent(resolvedDbPath);
  const db = new DatabaseSync(resolvedDbPath);
  db.exec("PRAGMA foreign_keys = ON");

  function tableColumns(tableName) {
    return db.prepare(`PRAGMA table_info(${tableName})`).all().map((row) => row.name);
  }

  function migrate() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS finance_schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS finance_ledgers (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL DEFAULT 'user_xuxin',
        name TEXT NOT NULL,
        base_currency TEXT NOT NULL DEFAULT 'CNY',
        timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS finance_users (
        id TEXT PRIMARY KEY,
        user_key TEXT NOT NULL,
        display_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(user_key)
      );
      CREATE TABLE IF NOT EXISTS finance_user_bindings (
        id TEXT PRIMARY KEY,
        finance_user_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        external_workspace_id TEXT NOT NULL DEFAULT '',
        external_user_id TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT 'owner',
        binding_status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (finance_user_id) REFERENCES finance_users(id)
      );
      CREATE TABLE IF NOT EXISTS finance_access_tokens (
        id TEXT PRIMARY KEY,
        finance_user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        expires_at TEXT NOT NULL DEFAULT '',
        last_used_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(token_hash),
        FOREIGN KEY (finance_user_id) REFERENCES finance_users(id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_user_binding_workspace_user
        ON finance_user_bindings(provider, external_workspace_id, external_user_id)
        WHERE binding_status = 'active' AND external_workspace_id <> '' AND external_user_id <> '';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_user_binding_workspace_only
        ON finance_user_bindings(provider, external_workspace_id)
        WHERE binding_status = 'active' AND external_workspace_id <> '' AND external_user_id = '';
      CREATE INDEX IF NOT EXISTS idx_finance_access_tokens_user
        ON finance_access_tokens(finance_user_id, status);
      CREATE TABLE IF NOT EXISTS finance_members (
        id TEXT PRIMARY KEY,
        ledger_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        avatar_ref TEXT NOT NULL DEFAULT '',
        is_household INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (ledger_id) REFERENCES finance_ledgers(id)
      );
      CREATE TABLE IF NOT EXISTS finance_ledger_memberships (
        id TEXT PRIMARY KEY,
        ledger_id TEXT NOT NULL,
        finance_user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer',
        status TEXT NOT NULL DEFAULT 'active',
        invited_by_user_id TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (ledger_id) REFERENCES finance_ledgers(id),
        FOREIGN KEY (finance_user_id) REFERENCES finance_users(id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_ledger_memberships_active
        ON finance_ledger_memberships(ledger_id, finance_user_id)
        WHERE status = 'active';
      CREATE TABLE IF NOT EXISTS finance_member_visibility (
        id TEXT PRIMARY KEY,
        ledger_id TEXT NOT NULL,
        finance_user_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (ledger_id) REFERENCES finance_ledgers(id),
        FOREIGN KEY (finance_user_id) REFERENCES finance_users(id),
        FOREIGN KEY (member_id) REFERENCES finance_members(id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_member_visibility_user_member
        ON finance_member_visibility(ledger_id, finance_user_id, member_id);
      CREATE TABLE IF NOT EXISTS finance_ledger_join_requests (
        id TEXT PRIMARY KEY,
        ledger_id TEXT NOT NULL,
        requester_finance_user_id TEXT NOT NULL,
        target_finance_user_id TEXT NOT NULL,
        requested_role TEXT NOT NULL DEFAULT 'viewer',
        requested_member_ids_json TEXT NOT NULL DEFAULT '[]',
        message TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        decided_by_user_id TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        decided_at TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (ledger_id) REFERENCES finance_ledgers(id),
        FOREIGN KEY (requester_finance_user_id) REFERENCES finance_users(id),
        FOREIGN KEY (target_finance_user_id) REFERENCES finance_users(id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_ledger_join_requests_pending
        ON finance_ledger_join_requests(ledger_id, requester_finance_user_id)
        WHERE status = 'pending';
      CREATE TABLE IF NOT EXISTS finance_ledger_invitations (
        id TEXT PRIMARY KEY,
        ledger_id TEXT NOT NULL,
        inviter_finance_user_id TEXT NOT NULL,
        target_finance_user_id TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT 'viewer',
        member_ids_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        accepted_at TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (ledger_id) REFERENCES finance_ledgers(id),
        FOREIGN KEY (inviter_finance_user_id) REFERENCES finance_users(id)
      );
      CREATE TABLE IF NOT EXISTS finance_currencies (
        code TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        symbol TEXT NOT NULL DEFAULT '',
        scale INTEGER NOT NULL DEFAULT 2,
        is_active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS finance_member_bindings (
        id TEXT PRIMARY KEY,
        ledger_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        external_user_id TEXT NOT NULL DEFAULT '',
        external_workspace_id TEXT NOT NULL DEFAULT '',
        binding_status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (ledger_id) REFERENCES finance_ledgers(id),
        FOREIGN KEY (member_id) REFERENCES finance_members(id)
      );
      DROP INDEX IF EXISTS idx_finance_member_binding_workspace;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_member_binding_workspace_user
        ON finance_member_bindings(provider, external_workspace_id, external_user_id)
        WHERE binding_status = 'active' AND external_workspace_id <> '' AND external_user_id <> '';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_member_binding_workspace_only
        ON finance_member_bindings(provider, external_workspace_id)
        WHERE binding_status = 'active' AND external_workspace_id <> '' AND external_user_id = '';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_member_binding_user_only
        ON finance_member_bindings(provider, external_user_id)
        WHERE binding_status = 'active' AND external_workspace_id = '' AND external_user_id <> '';
      CREATE TABLE IF NOT EXISTS finance_plugin_registrations (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        toolset TEXT NOT NULL,
        external_workspace_id TEXT NOT NULL DEFAULT '',
        callback_url TEXT NOT NULL,
        registration_status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_plugin_registration_active
        ON finance_plugin_registrations(provider, toolset, external_workspace_id)
        WHERE registration_status = 'active';
      CREATE TABLE IF NOT EXISTS finance_accounts (
        id TEXT PRIMARY KEY,
        ledger_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'CNY',
        opening_balance_minor INTEGER NOT NULL DEFAULT 0,
        current_balance_minor INTEGER NOT NULL DEFAULT 0,
        is_liability INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (ledger_id) REFERENCES finance_ledgers(id)
      );
      CREATE TABLE IF NOT EXISTS finance_categories (
        id TEXT PRIMARY KEY,
        ledger_id TEXT NOT NULL,
        type TEXT NOT NULL,
        parent_id TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (ledger_id) REFERENCES finance_ledgers(id)
      );
      CREATE TABLE IF NOT EXISTS finance_merchants (
        id TEXT PRIMARY KEY,
        ledger_id TEXT NOT NULL,
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (ledger_id, normalized_name),
        FOREIGN KEY (ledger_id) REFERENCES finance_ledgers(id)
      );
      CREATE TABLE IF NOT EXISTS finance_tags (
        id TEXT PRIMARY KEY,
        ledger_id TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (ledger_id, name),
        FOREIGN KEY (ledger_id) REFERENCES finance_ledgers(id)
      );
      CREATE TABLE IF NOT EXISTS finance_transactions (
        id TEXT PRIMARY KEY,
        ledger_id TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        amount_minor INTEGER NOT NULL,
        scale INTEGER NOT NULL DEFAULT 2,
        currency TEXT NOT NULL DEFAULT 'CNY',
        occurred_at TEXT NOT NULL,
        category_id TEXT NOT NULL DEFAULT '',
        account_id TEXT NOT NULL,
        target_account_id TEXT NOT NULL DEFAULT '',
        booked_by_member_id TEXT NOT NULL DEFAULT '',
        payer_member_id TEXT NOT NULL DEFAULT '',
        merchant_id TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        source_ref TEXT NOT NULL DEFAULT '',
        idempotency_key TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        voided_at TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (ledger_id) REFERENCES finance_ledgers(id),
        FOREIGN KEY (account_id) REFERENCES finance_accounts(id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_transactions_idempotency
        ON finance_transactions(ledger_id, idempotency_key)
        WHERE idempotency_key <> '';
      CREATE INDEX IF NOT EXISTS idx_finance_transactions_time
        ON finance_transactions(ledger_id, occurred_at);
      CREATE INDEX IF NOT EXISTS idx_finance_transactions_type_time
        ON finance_transactions(ledger_id, type, occurred_at);
      CREATE TABLE IF NOT EXISTS finance_transaction_participants (
        id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        share_minor INTEGER NOT NULL DEFAULT 0,
        role TEXT NOT NULL DEFAULT 'participant',
        FOREIGN KEY (transaction_id) REFERENCES finance_transactions(id)
      );
      CREATE TABLE IF NOT EXISTS finance_transaction_tags (
        transaction_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        PRIMARY KEY (transaction_id, tag_id),
        FOREIGN KEY (transaction_id) REFERENCES finance_transactions(id),
        FOREIGN KEY (tag_id) REFERENCES finance_tags(id)
      );
      CREATE TABLE IF NOT EXISTS finance_attachments (
        id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL,
        file_ref TEXT NOT NULL,
        thumbnail_ref TEXT NOT NULL DEFAULT '',
        thumbnail_mime_type TEXT NOT NULL DEFAULT '',
        mime_type TEXT NOT NULL DEFAULT '',
        sha256 TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (transaction_id) REFERENCES finance_transactions(id)
      );
      CREATE TABLE IF NOT EXISTS finance_plans (
        id TEXT PRIMARY KEY,
        ledger_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        due_at TEXT NOT NULL,
        amount_minor INTEGER NOT NULL,
        scale INTEGER NOT NULL DEFAULT 2,
        currency TEXT NOT NULL DEFAULT 'CNY',
        category_id TEXT NOT NULL DEFAULT '',
        account_id TEXT NOT NULL DEFAULT '',
        member_id TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        recurrence_rule TEXT NOT NULL DEFAULT '',
        paid_transaction_id TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (ledger_id) REFERENCES finance_ledgers(id)
      );
      CREATE TABLE IF NOT EXISTS finance_recurring_rules (
        id TEXT PRIMARY KEY,
        ledger_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        title TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        amount_minor INTEGER NOT NULL,
        scale INTEGER NOT NULL DEFAULT 2,
        currency TEXT NOT NULL DEFAULT 'CNY',
        category_id TEXT NOT NULL DEFAULT '',
        account_id TEXT NOT NULL,
        target_account_id TEXT NOT NULL DEFAULT '',
        member_id TEXT NOT NULL DEFAULT '',
        merchant_name TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        tags_json TEXT NOT NULL DEFAULT '[]',
        frequency TEXT NOT NULL,
        interval_count INTEGER NOT NULL DEFAULT 1,
        weekdays_json TEXT NOT NULL DEFAULT '[]',
        day_of_month INTEGER NOT NULL DEFAULT 0,
        month_of_year INTEGER NOT NULL DEFAULT 0,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL DEFAULT '',
        time_of_day TEXT NOT NULL DEFAULT '09:00',
        next_due_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (ledger_id) REFERENCES finance_ledgers(id)
      );
      CREATE INDEX IF NOT EXISTS idx_finance_recurring_rules_due
        ON finance_recurring_rules(ledger_id, status, next_due_at);
      CREATE TABLE IF NOT EXISTS finance_owner_asset_snapshots (
        id TEXT PRIMARY KEY,
        finance_user_id TEXT NOT NULL,
        snapshot_year INTEGER NOT NULL,
        as_of_date TEXT NOT NULL DEFAULT '',
        base_currency TEXT NOT NULL DEFAULT 'CNY',
        fx_usd_cny_ppm INTEGER NOT NULL DEFAULT 0,
        usd_investment_year INTEGER NOT NULL DEFAULT 0,
        usd_annual_return_bps INTEGER NOT NULL DEFAULT 0,
        usd_cagr_bps INTEGER NOT NULL DEFAULT 0,
        usd_total_return_multiple_bps INTEGER NOT NULL DEFAULT 0,
        total_assets_cny_minor INTEGER NOT NULL DEFAULT 0,
        current_usd_cny_ppm INTEGER NOT NULL DEFAULT 0,
        current_total_assets_usd_minor INTEGER NOT NULL DEFAULT 0,
        current_fx_updated_at TEXT NOT NULL DEFAULT '',
        current_fx_source TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        source_ref TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(finance_user_id, snapshot_year),
        FOREIGN KEY (finance_user_id) REFERENCES finance_users(id)
      );
      CREATE TABLE IF NOT EXISTS finance_owner_asset_components (
        id TEXT PRIMARY KEY,
        snapshot_id TEXT NOT NULL,
        component_key TEXT NOT NULL,
        label TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'CNY',
        amount_minor INTEGER NOT NULL DEFAULT 0,
        amount_cny_minor INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(snapshot_id, component_key),
        FOREIGN KEY (snapshot_id) REFERENCES finance_owner_asset_snapshots(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_finance_owner_asset_snapshots_user_year
        ON finance_owner_asset_snapshots(finance_user_id, snapshot_year);
      CREATE INDEX IF NOT EXISTS idx_finance_owner_asset_components_snapshot
        ON finance_owner_asset_components(snapshot_id, sort_order);
      CREATE TABLE IF NOT EXISTS finance_owner_stock_snapshots (
        id TEXT PRIMARY KEY,
        finance_user_id TEXT NOT NULL,
        as_of_date TEXT NOT NULL DEFAULT '',
        base_currency TEXT NOT NULL DEFAULT 'USD',
        base_scale INTEGER NOT NULL DEFAULT 2,
        price_as_of TEXT NOT NULL DEFAULT '',
        total_market_value_minor INTEGER NOT NULL DEFAULT 0,
        total_cost_basis_minor INTEGER NOT NULL DEFAULT 0,
        total_unrealized_gain_minor INTEGER NOT NULL DEFAULT 0,
        total_annual_gain_minor INTEGER NOT NULL DEFAULT 0,
        annual_change_bps INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT '',
        source_ref TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(finance_user_id, as_of_date),
        FOREIGN KEY (finance_user_id) REFERENCES finance_users(id)
      );
      CREATE TABLE IF NOT EXISTS finance_owner_stock_positions (
        id TEXT PRIMARY KEY,
        snapshot_id TEXT NOT NULL,
        position_key TEXT NOT NULL,
        label TEXT NOT NULL,
        ticker TEXT NOT NULL DEFAULT '',
        market TEXT NOT NULL DEFAULT '',
        currency TEXT NOT NULL DEFAULT 'USD',
        scale INTEGER NOT NULL DEFAULT 2,
        quantity_units_micro INTEGER NOT NULL DEFAULT 0,
        quantity_unit TEXT NOT NULL DEFAULT 'share',
        average_cost_minor INTEGER NOT NULL DEFAULT 0,
        opening_price_minor INTEGER NOT NULL DEFAULT 0,
        current_price_minor INTEGER NOT NULL DEFAULT 0,
        cost_basis_minor INTEGER NOT NULL DEFAULT 0,
        opening_market_value_minor INTEGER NOT NULL DEFAULT 0,
        current_market_value_minor INTEGER NOT NULL DEFAULT 0,
        cost_basis_base_minor INTEGER NOT NULL DEFAULT 0,
        opening_market_value_base_minor INTEGER NOT NULL DEFAULT 0,
        market_value_base_minor INTEGER NOT NULL DEFAULT 0,
        unrealized_gain_base_minor INTEGER NOT NULL DEFAULT 0,
        annual_gain_base_minor INTEGER NOT NULL DEFAULT 0,
        annual_change_bps INTEGER NOT NULL DEFAULT 0,
        cumulative_change_bps INTEGER NOT NULL DEFAULT 0,
        allocation_bps INTEGER NOT NULL DEFAULT 0,
        fx_to_base_ppm INTEGER NOT NULL DEFAULT 1000000,
        sort_order INTEGER NOT NULL DEFAULT 0,
        source_row_index INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(snapshot_id, position_key),
        FOREIGN KEY (snapshot_id) REFERENCES finance_owner_stock_snapshots(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_finance_owner_stock_snapshots_user_date
        ON finance_owner_stock_snapshots(finance_user_id, as_of_date);
      CREATE INDEX IF NOT EXISTS idx_finance_owner_stock_positions_snapshot
        ON finance_owner_stock_positions(snapshot_id, sort_order);
      CREATE TABLE IF NOT EXISTS finance_audit_log (
        id TEXT PRIMARY KEY,
        ledger_id TEXT NOT NULL,
        actor_ref TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        before_json TEXT NOT NULL DEFAULT '',
        after_json TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (ledger_id) REFERENCES finance_ledgers(id)
      );
      CREATE TABLE IF NOT EXISTS finance_import_batches (
        id TEXT PRIMARY KEY,
        ledger_id TEXT NOT NULL,
        source TEXT NOT NULL,
        source_file_name TEXT NOT NULL DEFAULT '',
        source_file_sha256 TEXT NOT NULL DEFAULT '',
        row_count INTEGER NOT NULL DEFAULT 0,
        imported_count INTEGER NOT NULL DEFAULT 0,
        skipped_count INTEGER NOT NULL DEFAULT 0,
        metadata_json TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (ledger_id) REFERENCES finance_ledgers(id)
      );
      CREATE TABLE IF NOT EXISTS finance_transaction_source_fields (
        transaction_id TEXT PRIMARY KEY,
        ledger_id TEXT NOT NULL,
        source TEXT NOT NULL,
        source_row_index INTEGER NOT NULL DEFAULT 0,
        raw_datetime TEXT NOT NULL DEFAULT '',
        raw_type TEXT NOT NULL DEFAULT '',
        raw_category_path TEXT NOT NULL DEFAULT '',
        raw_amount TEXT NOT NULL DEFAULT '',
        raw_currency TEXT NOT NULL DEFAULT '',
        raw_counterparty TEXT NOT NULL DEFAULT '',
        raw_account_name TEXT NOT NULL DEFAULT '',
        raw_participant_name TEXT NOT NULL DEFAULT '',
        raw_tags TEXT NOT NULL DEFAULT '',
        raw_merchant TEXT NOT NULL DEFAULT '',
        raw_property TEXT NOT NULL DEFAULT '',
        raw_note TEXT NOT NULL DEFAULT '',
        raw_row_json TEXT NOT NULL DEFAULT '',
        import_batch_id TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (transaction_id) REFERENCES finance_transactions(id),
        FOREIGN KEY (ledger_id) REFERENCES finance_ledgers(id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_accounts_ledger_name_currency
        ON finance_accounts(ledger_id, name, currency);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_members_ledger_name
        ON finance_members(ledger_id, display_name);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_categories_ledger_type_parent_name
        ON finance_categories(ledger_id, type, parent_id, name);
    `);
    if (!tableColumns("finance_ledgers").includes("owner_user_id")) {
      db.exec("ALTER TABLE finance_ledgers ADD COLUMN owner_user_id TEXT NOT NULL DEFAULT 'user_xuxin'");
    }
    if (!tableColumns("finance_ledgers").includes("template_id")) {
      db.exec("ALTER TABLE finance_ledgers ADD COLUMN template_id TEXT NOT NULL DEFAULT 'daily'");
    }
    if (!tableColumns("finance_ledgers").includes("cover_ref")) {
      db.exec("ALTER TABLE finance_ledgers ADD COLUMN cover_ref TEXT NOT NULL DEFAULT ''");
    }
    if (!tableColumns("finance_ledgers").includes("month_start_day")) {
      db.exec("ALTER TABLE finance_ledgers ADD COLUMN month_start_day INTEGER NOT NULL DEFAULT 1");
    }
    if (!tableColumns("finance_ledger_invitations").includes("target_finance_user_id")) {
      db.exec("ALTER TABLE finance_ledger_invitations ADD COLUMN target_finance_user_id TEXT NOT NULL DEFAULT ''");
    }
    if (!tableColumns("finance_attachments").includes("thumbnail_ref")) {
      db.exec("ALTER TABLE finance_attachments ADD COLUMN thumbnail_ref TEXT NOT NULL DEFAULT ''");
    }
    if (!tableColumns("finance_attachments").includes("thumbnail_mime_type")) {
      db.exec("ALTER TABLE finance_attachments ADD COLUMN thumbnail_mime_type TEXT NOT NULL DEFAULT ''");
    }
    if (!tableColumns("finance_categories").includes("icon")) {
      db.exec("ALTER TABLE finance_categories ADD COLUMN icon TEXT NOT NULL DEFAULT ''");
    }
    const ownerAssetColumns = tableColumns("finance_owner_asset_snapshots");
    if (!ownerAssetColumns.includes("current_usd_cny_ppm")) {
      db.exec("ALTER TABLE finance_owner_asset_snapshots ADD COLUMN current_usd_cny_ppm INTEGER NOT NULL DEFAULT 0");
    }
    if (!ownerAssetColumns.includes("current_total_assets_usd_minor")) {
      db.exec("ALTER TABLE finance_owner_asset_snapshots ADD COLUMN current_total_assets_usd_minor INTEGER NOT NULL DEFAULT 0");
    }
    if (!ownerAssetColumns.includes("current_fx_updated_at")) {
      db.exec("ALTER TABLE finance_owner_asset_snapshots ADD COLUMN current_fx_updated_at TEXT NOT NULL DEFAULT ''");
    }
    if (!ownerAssetColumns.includes("current_fx_source")) {
      db.exec("ALTER TABLE finance_owner_asset_snapshots ADD COLUMN current_fx_source TEXT NOT NULL DEFAULT ''");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_finance_ledgers_owner_user ON finance_ledgers(owner_user_id)");
    db.prepare("UPDATE finance_accounts SET name = '现金' WHERE id = 'acct_cash'").run();
    db.prepare("UPDATE finance_accounts SET name = '银行卡' WHERE id = 'acct_bank'").run();
    db.prepare("UPDATE finance_accounts SET name = '应付' WHERE id = 'acct_payable'").run();
    db.prepare("UPDATE finance_ledgers SET name = '日常账本' WHERE id = 'daily' AND name = 'Daily ledger'").run();
    db.prepare("UPDATE finance_members SET display_name = '自己' WHERE id = 'member_self'").run();
    db.prepare("UPDATE finance_members SET display_name = '家庭公用' WHERE id = 'member_household'").run();
    db.prepare("UPDATE finance_categories SET name = '餐饮' WHERE id = 'cat_food'").run();
    db.prepare("UPDATE finance_categories SET name = '交通' WHERE id = 'cat_transport'").run();
    db.prepare("UPDATE finance_categories SET name = '居家' WHERE id = 'cat_home'").run();
    db.prepare("UPDATE finance_categories SET name = '服饰' WHERE id = 'cat_clothing'").run();
    db.prepare("UPDATE finance_categories SET name = '医疗' WHERE id = 'cat_health'").run();
    db.prepare("UPDATE finance_categories SET name = '工资薪水' WHERE id = 'cat_salary'").run();
    db.prepare("UPDATE finance_categories SET name = '奖金' WHERE id = 'cat_bonus'").run();
    db.prepare("UPDATE finance_categories SET name = '退款' WHERE id = 'cat_refund'").run();
    const existing = db.prepare("SELECT version FROM finance_schema_migrations WHERE version = ?").get(CURRENT_SCHEMA_VERSION);
    if (!existing) {
      db.prepare("INSERT INTO finance_schema_migrations (version, applied_at) VALUES (?, ?)").run(CURRENT_SCHEMA_VERSION, clock());
    }
  }

  function transaction(fn) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }

  function seedDefaults() {
    const ts = clock();
    db.prepare(`
      INSERT INTO finance_users (id, user_key, display_name, status, created_at, updated_at)
      VALUES ('user_xuxin', 'xuxin', 'xuxin', 'active', ?, ?)
      ON CONFLICT(user_key) DO UPDATE SET
        display_name = excluded.display_name,
        status = 'active',
        updated_at = excluded.updated_at
    `).run(ts, ts);
    db.prepare(`
      INSERT INTO finance_user_bindings
        (id, finance_user_id, provider, external_workspace_id, external_user_id, role, binding_status, created_at, updated_at)
      VALUES ('user_binding_xuxin_owner_workspace', 'user_xuxin', 'hermes_mobile', ?, '', 'owner', 'active', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        finance_user_id = excluded.finance_user_id,
        external_workspace_id = excluded.external_workspace_id,
        role = excluded.role,
        binding_status = 'active',
        updated_at = excluded.updated_at
    `).run(process.env.FINANCE_HERMES_OWNER_WORKSPACE_ID || "owner", ts, ts);
    db.prepare(`
      INSERT OR IGNORE INTO finance_ledgers (id, owner_user_id, name, base_currency, timezone, created_at, updated_at)
      VALUES ('daily', 'user_xuxin', '日常账本', 'CNY', 'Asia/Shanghai', ?, ?)
    `).run(ts, ts);
    upsertLedgerMembership({
      ledgerId: "daily",
      financeUserId: "user_xuxin",
      role: "owner",
      invitedByUserId: "user_xuxin",
    });
    const currencies = [
      ["CNY", "人民币", "¥", 2, 10],
      ["HKD", "港元", "HK$", 2, 20],
      ["USD", "美元", "$", 2, 30],
      ["EUR", "欧元", "€", 2, 40],
      ["JPY", "日元", "¥", 0, 50],
    ];
    for (const row of currencies) {
      db.prepare(`
        INSERT INTO finance_currencies
          (code, display_name, symbol, scale, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(code) DO UPDATE SET
          display_name = excluded.display_name,
          symbol = excluded.symbol,
          scale = excluded.scale,
          is_active = 1,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at
      `).run(...row, ts, ts);
    }
    const accounts = [
      ["acct_cash", "daily", "现金", "cash", "CNY", 0, 0],
      ["acct_bank", "daily", "银行卡", "bank", "CNY", 0, 0],
      ["acct_payable", "daily", "应付", "payable", "CNY", 0, 1],
    ];
    for (const row of accounts) {
      db.prepare(`
        INSERT OR IGNORE INTO finance_accounts
          (id, ledger_id, name, type, currency, opening_balance_minor, current_balance_minor, is_liability, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
      `).run(...row, ts, ts);
    }
    const members = [
      ["member_self", "daily", "自己", 0],
      ["member_household", "daily", "家庭公用", 1],
    ];
    for (const row of members) {
      db.prepare(`
        INSERT OR IGNORE INTO finance_members
          (id, ledger_id, display_name, is_household, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(...row, ts, ts);
    }
    const categories = [
      ["cat_food", "daily", "expense", "餐饮", "food-lunch", 10],
      ["cat_transport", "daily", "expense", "交通", "transport", 20],
      ["cat_home", "daily", "expense", "居家", "home-house", 30],
      ["cat_clothing", "daily", "expense", "服饰", "clothing-shirt", 40],
      ["cat_health", "daily", "expense", "医疗", "medical-pill", 50],
      ["cat_salary", "daily", "income", "工资薪水", "income-salary", 10],
      ["cat_bonus", "daily", "income", "奖金", "income-bonus", 20],
      ["cat_refund", "daily", "income", "退款", "income-refund", 30],
    ];
    for (const row of categories) {
      db.prepare(`
        INSERT OR IGNORE INTO finance_categories
          (id, ledger_id, type, name, icon, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(...row, ts, ts);
    }
  }

  function getLedger(id = "daily") {
    return db.prepare("SELECT * FROM finance_ledgers WHERE id = ?").get(id) || null;
  }

  function findLedgerByName(financeUserId, name) {
    return db.prepare(`
      SELECT * FROM finance_ledgers
      WHERE owner_user_id = ? AND name = ?
      ORDER BY CASE WHEN id = 'daily' THEN 0 ELSE 1 END, id
      LIMIT 1
    `).get(financeUserId, String(name || "").trim()) || null;
  }

  function getFinanceUser(id) {
    return db.prepare("SELECT * FROM finance_users WHERE id = ?").get(id) || null;
  }

  function getFinanceUserByKey(userKey) {
    return db.prepare("SELECT * FROM finance_users WHERE user_key = ?").get(String(userKey || "").trim()) || null;
  }

  function listFinanceUsers({ status = "active" } = {}) {
    const cleanStatus = String(status || "").trim();
    return cleanStatus
      ? db.prepare("SELECT * FROM finance_users WHERE status = ? ORDER BY display_name, user_key").all(cleanStatus)
      : db.prepare("SELECT * FROM finance_users ORDER BY status, display_name, user_key").all();
  }

  function upsertFinanceUser({ id = "", userKey, displayName, status = "active" }) {
    const cleanKey = String(userKey || "").trim();
    if (!cleanKey) throw new Error("finance_user_key_required");
    const ts = clock();
    const nextId = id || idGenerator("user");
    db.prepare(`
      INSERT INTO finance_users (id, user_key, display_name, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_key) DO UPDATE SET
        display_name = excluded.display_name,
        status = excluded.status,
        updated_at = excluded.updated_at
    `).run(nextId, cleanKey, String(displayName || cleanKey).trim(), status || "active", ts, ts);
    return getFinanceUserByKey(cleanKey);
  }

  function upsertLedger({
    id,
    ownerUserId,
    name,
    baseCurrency = "CNY",
    timezone = "Asia/Shanghai",
    templateId = "daily",
    coverRef = "",
    monthStartDay = 1,
  }) {
    if (!id) throw new Error("ledger_id_required");
    if (!ownerUserId) throw new Error("ledger_owner_required");
    const ts = clock();
    db.prepare(`
      INSERT INTO finance_ledgers
        (id, owner_user_id, name, base_currency, timezone, template_id, cover_ref, month_start_day, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        owner_user_id = excluded.owner_user_id,
        name = excluded.name,
        base_currency = excluded.base_currency,
        timezone = excluded.timezone,
        template_id = excluded.template_id,
        cover_ref = excluded.cover_ref,
        month_start_day = excluded.month_start_day,
        updated_at = excluded.updated_at
    `).run(id, ownerUserId, name || id, baseCurrency, timezone, templateId || "daily", coverRef || "", Number(monthStartDay) || 1, ts, ts);
    upsertLedgerMembership({
      ledgerId: id,
      financeUserId: ownerUserId,
      role: "owner",
      invitedByUserId: ownerUserId,
    });
    return getLedger(id);
  }

  function listLedgersByUser(financeUserId) {
    return db.prepare(`
      SELECT
        l.*,
        (SELECT COUNT(*) FROM finance_transactions t WHERE t.ledger_id = l.id AND t.status = 'active') AS transaction_count,
        (SELECT COUNT(*) FROM finance_accounts a WHERE a.ledger_id = l.id AND a.is_active = 1) AS account_count,
        (SELECT COUNT(*) FROM finance_members m WHERE m.ledger_id = l.id AND m.is_active = 1) AS member_count,
        (SELECT COUNT(*) FROM finance_ledger_memberships lm WHERE lm.ledger_id = l.id AND lm.status = 'active') AS shared_user_count,
        COALESCE(lm.role, CASE WHEN l.owner_user_id = ? THEN 'owner' ELSE 'viewer' END) AS access_role
      FROM finance_ledgers l
      LEFT JOIN finance_ledger_memberships lm
        ON lm.ledger_id = l.id AND lm.finance_user_id = ? AND lm.status = 'active'
      WHERE l.owner_user_id = ? OR lm.finance_user_id = ?
      ORDER BY CASE WHEN l.id = 'daily' THEN 0 ELSE 1 END, l.updated_at DESC, l.id
    `).all(financeUserId, financeUserId, financeUserId, financeUserId);
  }

  function getLedgerMembership(ledgerId, financeUserId) {
    if (!ledgerId || !financeUserId) return null;
    return db.prepare(`
      SELECT * FROM finance_ledger_memberships
      WHERE ledger_id = ? AND finance_user_id = ? AND status = 'active'
    `).get(ledgerId, financeUserId) || null;
  }

  function listLedgerMemberships(ledgerId) {
    return db.prepare(`
      SELECT lm.*, u.user_key, u.display_name
      FROM finance_ledger_memberships lm
      LEFT JOIN finance_users u ON u.id = lm.finance_user_id
      WHERE lm.ledger_id = ? AND lm.status = 'active'
      ORDER BY CASE lm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'editor' THEN 2 ELSE 3 END, u.display_name
    `).all(ledgerId);
  }

  function upsertLedgerMembership({
    ledgerId,
    financeUserId,
    role = "viewer",
    invitedByUserId = "",
  }) {
    if (!ledgerId) throw new Error("ledger_id_required");
    if (!financeUserId) throw new Error("finance_user_required");
    const ts = clock();
    const existing = getLedgerMembership(ledgerId, financeUserId);
    if (existing) {
      db.prepare(`
        UPDATE finance_ledger_memberships
        SET role = ?, invited_by_user_id = ?, updated_at = ?
        WHERE id = ?
      `).run(role || "viewer", invitedByUserId || "", ts, existing.id);
      return db.prepare("SELECT * FROM finance_ledger_memberships WHERE id = ?").get(existing.id);
    }
    const id = idGenerator("ledger_member");
    db.prepare(`
      INSERT INTO finance_ledger_memberships
        (id, ledger_id, finance_user_id, role, status, invited_by_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
    `).run(id, ledgerId, financeUserId, role || "viewer", invitedByUserId || "", ts, ts);
    return db.prepare("SELECT * FROM finance_ledger_memberships WHERE id = ?").get(id);
  }

  function replaceMemberVisibility({ ledgerId, financeUserId, memberIds = [] }) {
    if (!ledgerId) throw new Error("ledger_id_required");
    if (!financeUserId) throw new Error("finance_user_required");
    const ts = clock();
    db.prepare("DELETE FROM finance_member_visibility WHERE ledger_id = ? AND finance_user_id = ?").run(ledgerId, financeUserId);
    const insert = db.prepare(`
      INSERT OR IGNORE INTO finance_member_visibility
        (id, ledger_id, finance_user_id, member_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const memberId of memberIds.filter(Boolean)) {
      insert.run(idGenerator("member_visibility"), ledgerId, financeUserId, memberId, ts, ts);
    }
    return listVisibleMembersForUser(ledgerId, financeUserId);
  }

  function listVisibleMembersForUser(ledgerId, financeUserId) {
    return db.prepare(`
      SELECT m.*
      FROM finance_member_visibility mv
      JOIN finance_members m ON m.id = mv.member_id
      WHERE mv.ledger_id = ? AND mv.finance_user_id = ? AND m.is_active = 1
      ORDER BY m.is_household DESC, m.display_name
    `).all(ledgerId, financeUserId);
  }

  function getLedgerJoinRequest(id) {
    if (!id) return null;
    return db.prepare("SELECT * FROM finance_ledger_join_requests WHERE id = ?").get(id) || null;
  }

  function findPendingLedgerJoinRequest(ledgerId, requesterFinanceUserId) {
    return db.prepare(`
      SELECT * FROM finance_ledger_join_requests
      WHERE ledger_id = ? AND requester_finance_user_id = ? AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(ledgerId, requesterFinanceUserId) || null;
  }

  function insertLedgerJoinRequest({
    ledgerId,
    requesterFinanceUserId,
    targetFinanceUserId,
    requestedRole = "viewer",
    requestedMemberIds = [],
    message = "",
  }) {
    if (!ledgerId) throw new Error("ledger_id_required");
    if (!requesterFinanceUserId) throw new Error("requester_finance_user_required");
    if (!targetFinanceUserId) throw new Error("target_finance_user_required");
    const existing = findPendingLedgerJoinRequest(ledgerId, requesterFinanceUserId);
    if (existing) return existing;
    const ts = clock();
    const id = idGenerator("ledger_join");
    db.prepare(`
      INSERT INTO finance_ledger_join_requests
        (id, ledger_id, requester_finance_user_id, target_finance_user_id, requested_role, requested_member_ids_json, message, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      id,
      ledgerId,
      requesterFinanceUserId,
      targetFinanceUserId,
      requestedRole || "viewer",
      JSON.stringify(Array.isArray(requestedMemberIds) ? requestedMemberIds.filter(Boolean) : []),
      String(message || "").trim(),
      ts,
      ts,
    );
    return getLedgerJoinRequest(id);
  }

  function listLedgerJoinRequests({ ledgerId = "", targetFinanceUserId = "", requesterFinanceUserId = "", status = "pending" } = {}) {
    const where = [];
    const params = [];
    if (ledgerId) {
      where.push("jr.ledger_id = ?");
      params.push(ledgerId);
    }
    if (targetFinanceUserId) {
      where.push("jr.target_finance_user_id = ?");
      params.push(targetFinanceUserId);
    }
    if (requesterFinanceUserId) {
      where.push("jr.requester_finance_user_id = ?");
      params.push(requesterFinanceUserId);
    }
    if (status) {
      where.push("jr.status = ?");
      params.push(status);
    }
    return db.prepare(`
      SELECT
        jr.*,
        l.name AS ledger_name,
        requester.display_name AS requester_display_name,
        target.display_name AS target_display_name
      FROM finance_ledger_join_requests jr
      LEFT JOIN finance_ledgers l ON l.id = jr.ledger_id
      LEFT JOIN finance_users requester ON requester.id = jr.requester_finance_user_id
      LEFT JOIN finance_users target ON target.id = jr.target_finance_user_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY jr.created_at DESC, jr.id
    `).all(...params);
  }

  function updateLedgerJoinRequestStatus({ id, status, decidedByUserId = "" }) {
    if (!id) throw new Error("join_request_id_required");
    const cleanStatus = String(status || "").trim();
    if (!["approved", "rejected", "cancelled"].includes(cleanStatus)) throw new Error("join_request_status_invalid");
    const ts = clock();
    db.prepare(`
      UPDATE finance_ledger_join_requests
      SET status = ?, decided_by_user_id = ?, decided_at = ?, updated_at = ?
      WHERE id = ?
    `).run(cleanStatus, decidedByUserId || "", ts, ts, id);
    return getLedgerJoinRequest(id);
  }

  function getLedgerInvitation(id) {
    if (!id) return null;
    return db.prepare("SELECT * FROM finance_ledger_invitations WHERE id = ?").get(id) || null;
  }

  function listLedgerInvitations({ targetFinanceUserId = "", status = "pending" } = {}) {
    const where = [];
    const params = [];
    if (targetFinanceUserId) {
      where.push("i.target_finance_user_id = ?");
      params.push(targetFinanceUserId);
    }
    if (status) {
      where.push("i.status = ?");
      params.push(status);
    }
    return db.prepare(`
      SELECT
        i.*,
        l.name AS ledger_name,
        l.template_id AS ledger_template_id,
        u.display_name AS inviter_display_name,
        u.user_key AS inviter_user_key
      FROM finance_ledger_invitations i
      LEFT JOIN finance_ledgers l ON l.id = i.ledger_id
      LEFT JOIN finance_users u ON u.id = i.inviter_finance_user_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY i.created_at DESC, i.id
    `).all(...params);
  }

  function insertLedgerInvitation({
    ledgerId,
    inviterFinanceUserId,
    targetFinanceUserId,
    role = "viewer",
    memberIds = [],
  }) {
    if (!ledgerId) throw new Error("ledger_id_required");
    if (!inviterFinanceUserId) throw new Error("inviter_finance_user_required");
    if (!targetFinanceUserId) throw new Error("target_finance_user_required");
    const ts = clock();
    const id = idGenerator("ledger_invite");
    db.prepare(`
      INSERT INTO finance_ledger_invitations
        (id, ledger_id, inviter_finance_user_id, target_finance_user_id, role, member_ids_json, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      id,
      ledgerId,
      inviterFinanceUserId,
      targetFinanceUserId,
      role || "viewer",
      JSON.stringify(Array.isArray(memberIds) ? memberIds.filter(Boolean) : []),
      ts,
      ts,
    );
    return getLedgerInvitation(id);
  }

  function acceptLedgerInvitation({ id, targetFinanceUserId }) {
    if (!id) throw new Error("ledger_invitation_id_required");
    if (!targetFinanceUserId) throw new Error("target_finance_user_required");
    const ts = clock();
    db.prepare(`
      UPDATE finance_ledger_invitations
      SET target_finance_user_id = ?, status = 'accepted', accepted_at = ?, updated_at = ?
      WHERE id = ? AND status = 'pending'
    `).run(targetFinanceUserId, ts, ts, id);
    return getLedgerInvitation(id);
  }

  function bindFinanceUser({ financeUserId, provider = "hermes_mobile", externalWorkspaceId = "", externalUserId = "", role = "owner" }) {
    if (!financeUserId) throw new Error("finance_user_required");
    const current = resolveFinanceUserBinding({ provider, externalWorkspaceId, externalUserId, allowWorkspaceFallback: false });
    const ts = clock();
    if (current) {
      db.prepare(`
        UPDATE finance_user_bindings
        SET finance_user_id = ?, role = ?, updated_at = ?
        WHERE id = ?
      `).run(financeUserId, role || "owner", ts, current.id);
      return db.prepare("SELECT * FROM finance_user_bindings WHERE id = ?").get(current.id);
    }
    const id = idGenerator("user_binding");
    db.prepare(`
      INSERT INTO finance_user_bindings
        (id, finance_user_id, provider, external_workspace_id, external_user_id, role, binding_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(id, financeUserId, provider, externalWorkspaceId || "", externalUserId || "", role || "owner", ts, ts);
    return db.prepare("SELECT * FROM finance_user_bindings WHERE id = ?").get(id);
  }

  function resolveFinanceUserBinding({ provider = "hermes_mobile", externalWorkspaceId = "", externalUserId = "", allowWorkspaceFallback = true } = {}) {
    if (externalWorkspaceId && externalUserId) {
      const exact = db.prepare(`
        SELECT * FROM finance_user_bindings
        WHERE provider = ? AND external_workspace_id = ? AND external_user_id = ? AND binding_status = 'active'
      `).get(provider, externalWorkspaceId, externalUserId);
      if (exact || !allowWorkspaceFallback) return exact || null;
    }
    if (externalWorkspaceId) {
      return db.prepare(`
        SELECT * FROM finance_user_bindings
        WHERE provider = ? AND external_workspace_id = ? AND external_user_id = '' AND binding_status = 'active'
      `).get(provider, externalWorkspaceId) || null;
    }
    if (externalUserId) {
      return db.prepare(`
        SELECT * FROM finance_user_bindings
        WHERE provider = ? AND external_workspace_id = '' AND external_user_id = ? AND binding_status = 'active'
      `).get(provider, externalUserId) || null;
    }
    return null;
  }

  function insertFinanceAccessToken({ financeUserId, tokenHash, label = "", expiresAt = "" }) {
    if (!financeUserId) throw new Error("finance_user_required");
    if (!tokenHash) throw new Error("token_hash_required");
    const ts = clock();
    const id = idGenerator("access_token");
    db.prepare(`
      INSERT INTO finance_access_tokens
        (id, finance_user_id, token_hash, label, status, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
    `).run(id, financeUserId, tokenHash, String(label || ""), String(expiresAt || ""), ts, ts);
    return db.prepare("SELECT * FROM finance_access_tokens WHERE id = ?").get(id);
  }

  function findFinanceAccessToken(tokenHash) {
    if (!tokenHash) return null;
    return db.prepare(`
      SELECT at.*, u.user_key, u.display_name
      FROM finance_access_tokens at
      JOIN finance_users u ON u.id = at.finance_user_id
      WHERE at.token_hash = ? AND at.status = 'active' AND u.status = 'active'
    `).get(tokenHash) || null;
  }

  function touchFinanceAccessToken(id) {
    db.prepare("UPDATE finance_access_tokens SET last_used_at = ?, updated_at = ? WHERE id = ?").run(clock(), clock(), id);
  }

  function listAccounts(ledgerId = "daily") {
    return db.prepare("SELECT * FROM finance_accounts WHERE ledger_id = ? ORDER BY is_active DESC, type, name").all(ledgerId);
  }

  function listCurrencies() {
    return db.prepare("SELECT * FROM finance_currencies WHERE is_active = 1 ORDER BY sort_order, code").all();
  }

  function upsertCurrency({ code, displayName, symbol = "", scale = 2, sortOrder = 999 }) {
    const cleanCode = String(code || "").trim().toUpperCase();
    if (!cleanCode) throw new Error("currency_code_required");
    const ts = clock();
    db.prepare(`
      INSERT INTO finance_currencies
        (code, display_name, symbol, scale, sort_order, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(code) DO UPDATE SET
        display_name = excluded.display_name,
        symbol = excluded.symbol,
        scale = excluded.scale,
        sort_order = excluded.sort_order,
        is_active = 1,
        updated_at = excluded.updated_at
    `).run(cleanCode, displayName || cleanCode, symbol, scale, sortOrder, ts, ts);
    return db.prepare("SELECT * FROM finance_currencies WHERE code = ?").get(cleanCode);
  }

  function getAccount(id) {
    return db.prepare("SELECT * FROM finance_accounts WHERE id = ?").get(id) || null;
  }

  function upsertAccount({ ledgerId = "daily", name, type = "cash", currency = "CNY", isLiability = 0 }) {
    const clean = String(name || "").trim();
    if (!clean) throw new Error("account_name_required");
    const ts = clock();
    const id = idGenerator("acct");
    db.prepare(`
      INSERT INTO finance_accounts
        (id, ledger_id, name, type, currency, opening_balance_minor, current_balance_minor, is_liability, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?)
      ON CONFLICT(ledger_id, name, currency) DO UPDATE SET
        type = excluded.type,
        is_liability = excluded.is_liability,
        is_active = 1,
        updated_at = excluded.updated_at
    `).run(id, ledgerId, clean, type, currency, boolInt(isLiability), ts, ts);
    return db.prepare("SELECT * FROM finance_accounts WHERE ledger_id = ? AND name = ? AND currency = ?").get(ledgerId, clean, currency);
  }

  function listCategories(ledgerId = "daily", type = "") {
    const sql = type
      ? "SELECT * FROM finance_categories WHERE ledger_id = ? AND type = ? ORDER BY sort_order, name"
      : "SELECT * FROM finance_categories WHERE ledger_id = ? ORDER BY type, sort_order, name";
    return type ? db.prepare(sql).all(ledgerId, type) : db.prepare(sql).all(ledgerId);
  }

  function categoryPath(row, byId) {
    const parts = [];
    let current = row;
    const seen = new Set();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      if (current.name) parts.unshift(current.name);
      current = current.parent_id ? byId.get(current.parent_id) : null;
    }
    return parts.join("/");
  }

  function backfillCategoryIcons() {
    const rows = db.prepare("SELECT * FROM finance_categories ORDER BY ledger_id, type, parent_id, sort_order, name").all();
    const byId = new Map(rows.map((row) => [row.id, row]));
    const update = db.prepare("UPDATE finance_categories SET icon = ?, updated_at = ? WHERE id = ? AND icon <> ?");
    let updated = 0;
    for (const row of rows) {
      if (row.icon && row.icon !== "category-generic") continue;
      const icon = categoryIconForPath(categoryPath(row, byId) || row.name, row.type);
      if (!icon || row.icon === icon) continue;
      update.run(icon, clock(), row.id, icon);
      updated += 1;
    }
    return { updated };
  }

  function upsertCategory({ ledgerId = "daily", type, name, parentId = "", icon = "", sortOrder = 0 }) {
    const clean = String(name || "").trim();
    if (!clean) throw new Error("category_name_required");
    const ts = clock();
    const id = idGenerator("cat");
    const cleanIcon = String(icon || "").trim();
    db.prepare(`
      INSERT INTO finance_categories
        (id, ledger_id, type, parent_id, name, icon, sort_order, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(ledger_id, type, parent_id, name) DO UPDATE SET
        icon = CASE WHEN excluded.icon <> '' THEN excluded.icon ELSE finance_categories.icon END,
        sort_order = CASE WHEN excluded.sort_order > 0 THEN excluded.sort_order ELSE finance_categories.sort_order END,
        is_active = 1,
        updated_at = excluded.updated_at
    `).run(id, ledgerId, type, parentId || "", clean, cleanIcon, sortOrder, ts, ts);
    return db.prepare(`
      SELECT * FROM finance_categories
      WHERE ledger_id = ? AND type = ? AND parent_id = ? AND name = ?
    `).get(ledgerId, type, parentId || "", clean);
  }

  function listMembers(ledgerId = "daily") {
    return db.prepare("SELECT * FROM finance_members WHERE ledger_id = ? ORDER BY is_active DESC, is_household DESC, display_name").all(ledgerId);
  }

  function upsertMember({ ledgerId = "daily", displayName, isHousehold = 0 }) {
    const clean = String(displayName || "").trim();
    if (!clean) throw new Error("member_name_required");
    const ts = clock();
    const id = idGenerator("member");
    db.prepare(`
      INSERT INTO finance_members
        (id, ledger_id, display_name, is_household, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(ledger_id, display_name) DO UPDATE SET
        is_household = CASE WHEN excluded.is_household = 1 THEN 1 ELSE finance_members.is_household END,
        is_active = 1,
        updated_at = excluded.updated_at
    `).run(id, ledgerId, clean, boolInt(isHousehold), ts, ts);
    return db.prepare("SELECT * FROM finance_members WHERE ledger_id = ? AND display_name = ?").get(ledgerId, clean);
  }

  function listTags(ledgerId = "daily") {
    return db.prepare("SELECT * FROM finance_tags WHERE ledger_id = ? ORDER BY name").all(ledgerId);
  }

  function upsertTag({ ledgerId = "daily", name, color = "" }) {
    const ts = clock();
    const id = defaultId("tag");
    db.prepare(`
      INSERT INTO finance_tags (id, ledger_id, name, color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(ledger_id, name) DO UPDATE SET color = excluded.color, updated_at = excluded.updated_at
    `).run(id, ledgerId, String(name || "").trim(), color, ts, ts);
    return db.prepare("SELECT * FROM finance_tags WHERE ledger_id = ? AND name = ?").get(ledgerId, String(name || "").trim());
  }

  function upsertMerchant({ ledgerId = "daily", name }) {
    const clean = String(name || "").trim();
    if (!clean) return null;
    const normalized = clean.toLowerCase();
    const ts = clock();
    const id = defaultId("merchant");
    db.prepare(`
      INSERT INTO finance_merchants (id, ledger_id, name, normalized_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(ledger_id, normalized_name) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at
    `).run(id, ledgerId, clean, normalized, ts, ts);
    return db.prepare("SELECT * FROM finance_merchants WHERE ledger_id = ? AND normalized_name = ?").get(ledgerId, normalized);
  }

  function insertAudit({ ledgerId, actorRef, action, entityType, entityId, before = null, after = null }) {
    const audit = {
      id: defaultId("audit"),
      ledgerId,
      actorRef: actorRef || "system",
      action,
      entityType,
      entityId,
      beforeJson: before ? JSON.stringify(before) : "",
      afterJson: after ? JSON.stringify(after) : "",
      createdAt: clock(),
    };
    db.prepare(`
      INSERT INTO finance_audit_log
        (id, ledger_id, actor_ref, action, entity_type, entity_id, before_json, after_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(audit.id, audit.ledgerId, audit.actorRef, audit.action, audit.entityType, audit.entityId, audit.beforeJson, audit.afterJson, audit.createdAt);
    return audit;
  }

  function insertImportBatch({
    ledgerId = "daily",
    source,
    sourceFileName = "",
    sourceFileSha256 = "",
    rowCount = 0,
    importedCount = 0,
    skippedCount = 0,
    metadata = null,
  }) {
    const batch = {
      id: idGenerator("import"),
      ledgerId,
      source: String(source || ""),
      sourceFileName: String(sourceFileName || ""),
      sourceFileSha256: String(sourceFileSha256 || ""),
      rowCount: Number(rowCount || 0),
      importedCount: Number(importedCount || 0),
      skippedCount: Number(skippedCount || 0),
      metadataJson: metadata ? JSON.stringify(metadata) : "",
      createdAt: clock(),
    };
    db.prepare(`
      INSERT INTO finance_import_batches
        (id, ledger_id, source, source_file_name, source_file_sha256, row_count,
         imported_count, skipped_count, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      batch.id, batch.ledgerId, batch.source, batch.sourceFileName, batch.sourceFileSha256,
      batch.rowCount, batch.importedCount, batch.skippedCount, batch.metadataJson, batch.createdAt,
    );
    return batch;
  }

  function updateImportBatchCounts(id, { importedCount = 0, skippedCount = 0 }) {
    db.prepare("UPDATE finance_import_batches SET imported_count = ?, skipped_count = ? WHERE id = ?")
      .run(Number(importedCount || 0), Number(skippedCount || 0), id);
    return db.prepare("SELECT * FROM finance_import_batches WHERE id = ?").get(id) || null;
  }

  function insertTransactionSourceFields(row) {
    db.prepare(`
      INSERT OR REPLACE INTO finance_transaction_source_fields
        (transaction_id, ledger_id, source, source_row_index, raw_datetime, raw_type,
         raw_category_path, raw_amount, raw_currency, raw_counterparty, raw_account_name,
         raw_participant_name, raw_tags, raw_merchant, raw_property, raw_note, raw_row_json,
         import_batch_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.transactionId, row.ledgerId, row.source, Number(row.sourceRowIndex || 0),
      row.rawDatetime || "", row.rawType || "", row.rawCategoryPath || "", row.rawAmount || "",
      row.rawCurrency || "", row.rawCounterparty || "", row.rawAccountName || "",
      row.rawParticipantName || "", row.rawTags || "", row.rawMerchant || "", row.rawProperty || "",
      row.rawNote || "", row.rawRowJson || "", row.importBatchId || "", clock(),
    );
  }

  function getTransactionSourceFields(transactionId) {
    return db.prepare("SELECT * FROM finance_transaction_source_fields WHERE transaction_id = ?").get(transactionId) || null;
  }

  function updateAccountBalance(accountId, deltaMinor) {
    db.prepare("UPDATE finance_accounts SET current_balance_minor = current_balance_minor + ?, updated_at = ? WHERE id = ?")
      .run(Number(deltaMinor || 0), clock(), accountId);
  }

  function insertTransaction(row) {
    db.prepare(`
      INSERT INTO finance_transactions
        (id, ledger_id, type, status, amount_minor, scale, currency, occurred_at, category_id, account_id,
         target_account_id, booked_by_member_id, payer_member_id, merchant_id, note, source, source_ref,
         idempotency_key, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.id, row.ledgerId, row.type, row.amountMinor, row.scale, row.currency, row.occurredAt,
      row.categoryId || "", row.accountId, row.targetAccountId || "", row.bookedByMemberId || "",
      row.payerMemberId || "", row.merchantId || "", row.note || "", row.source || "",
      row.sourceRef || "", row.idempotencyKey || "", row.createdAt, row.updatedAt,
    );
    return getTransaction(row.id);
  }

  function getTransaction(id) {
    return rowToTransaction(db.prepare("SELECT * FROM finance_transactions WHERE id = ?").get(id));
  }

  function findTransactionByIdempotency(ledgerId, idempotencyKey) {
    if (!idempotencyKey) return null;
    return rowToTransaction(db.prepare("SELECT * FROM finance_transactions WHERE ledger_id = ? AND idempotency_key = ?").get(ledgerId, idempotencyKey));
  }

  function transactionProjectionSql() {
    return `
      SELECT t.*, c.name AS category_name, c.parent_id AS category_parent_id, pc.name AS parent_category_name,
             c.icon AS category_icon, pc.icon AS parent_category_icon,
             a.name AS account_name, ta.name AS target_account_name,
             m.display_name AS member_name, merchant.name AS merchant_name,
             COALESCE((
               SELECT json_group_array(tag.name)
               FROM finance_transaction_tags ftt
               JOIN finance_tags tag ON tag.id = ftt.tag_id
               WHERE ftt.transaction_id = t.id
             ), '[]') AS tags_json,
             (SELECT COUNT(*) FROM finance_attachments fa WHERE fa.transaction_id = t.id) AS attachment_count,
             (SELECT COUNT(*) FROM finance_attachments fa WHERE fa.transaction_id = t.id AND fa.mime_type LIKE 'image/%') AS image_attachment_count,
             (SELECT fa.id FROM finance_attachments fa WHERE fa.transaction_id = t.id AND fa.mime_type LIKE 'image/%' ORDER BY fa.created_at ASC LIMIT 1) AS first_image_attachment_id
      FROM finance_transactions t
      LEFT JOIN finance_categories c ON c.id = t.category_id
      LEFT JOIN finance_categories pc ON pc.id = c.parent_id
      LEFT JOIN finance_accounts a ON a.id = t.account_id
      LEFT JOIN finance_accounts ta ON ta.id = t.target_account_id
      LEFT JOIN finance_members m ON m.id = t.booked_by_member_id
      LEFT JOIN finance_merchants merchant ON merchant.id = t.merchant_id
    `;
  }

  function getTransactionProjection(id) {
    return db.prepare(`${transactionProjectionSql()} WHERE t.id = ?`).get(id) || null;
  }

  function updateTransactionRow(id, patch) {
    const current = getTransaction(id);
    if (!current) throw new Error("transaction_not_found");
    const next = { ...current, ...patch, updatedAt: clock() };
    db.prepare(`
      UPDATE finance_transactions SET
        type = ?, amount_minor = ?, scale = ?, currency = ?, occurred_at = ?, category_id = ?,
        account_id = ?, target_account_id = ?, booked_by_member_id = ?, payer_member_id = ?,
        merchant_id = ?, note = ?, source = ?, source_ref = ?, updated_at = ?
      WHERE id = ?
    `).run(
      next.type, next.amountMinor, next.scale, next.currency, next.occurredAt, next.categoryId || "",
      next.accountId, next.targetAccountId || "", next.bookedByMemberId || "", next.payerMemberId || "",
      next.merchantId || "", next.note || "", next.source || "", next.sourceRef || "", next.updatedAt, id,
    );
    return getTransaction(id);
  }

  function setTransactionVoided(id) {
    const ts = clock();
    db.prepare("UPDATE finance_transactions SET status = 'voided', voided_at = ?, updated_at = ? WHERE id = ?")
      .run(ts, ts, id);
    return getTransaction(id);
  }

  function replaceTransactionTags(transactionId, tagIds = []) {
    db.prepare("DELETE FROM finance_transaction_tags WHERE transaction_id = ?").run(transactionId);
    for (const tagId of tagIds) {
      db.prepare("INSERT OR IGNORE INTO finance_transaction_tags (transaction_id, tag_id) VALUES (?, ?)").run(transactionId, tagId);
    }
  }

  function listTransactions(filters = {}) {
    const params = [filters.ledgerId || "daily"];
    const where = ["t.ledger_id = ?"];
    if (!filters.includeVoided) where.push("t.status = 'active'");
    if (filters.type) {
      where.push("t.type = ?");
      params.push(filters.type);
    }
    if (filters.startDate) {
      where.push("t.occurred_at >= ?");
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      where.push("t.occurred_at <= ?");
      params.push(filters.endDate);
    }
    applyTransactionFilters({ where, params, filters });
    const search = normalizedSearch(filters.search || filters.q);
    if (search) {
      const pattern = `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
      where.push(`(
        t.note LIKE ? ESCAPE '\\'
        OR t.source LIKE ? ESCAPE '\\'
        OR t.source_ref LIKE ? ESCAPE '\\'
        OR CAST(ABS(t.amount_minor) AS TEXT) LIKE ? ESCAPE '\\'
        OR c.name LIKE ? ESCAPE '\\'
        OR pc.name LIKE ? ESCAPE '\\'
        OR a.name LIKE ? ESCAPE '\\'
        OR ta.name LIKE ? ESCAPE '\\'
        OR m.display_name LIKE ? ESCAPE '\\'
        OR merchant.name LIKE ? ESCAPE '\\'
      )`);
      params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern);
    }
    const limit = Math.max(1, Math.min(Number(filters.limit || 50), 200));
    const offset = Math.max(0, Math.trunc(Number(filters.offset || 0)));
    params.push(limit, offset);
    return db.prepare(`
      ${transactionProjectionSql()}
      WHERE ${where.join(" AND ")}
      ORDER BY t.occurred_at DESC, t.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params);
  }

  function listCategoryUsage(filters = {}) {
    const params = [filters.ledgerId || "daily"];
    const where = ["t.ledger_id = ?", "t.status = 'active'", "c.name IS NOT NULL", "c.name <> ''"];
    if (filters.type) {
      where.push("t.type = ?");
      params.push(filters.type);
    }
    return db.prepare(`
      SELECT
        t.type AS type,
        c.id AS category_id,
        c.name AS category_name,
        COUNT(*) AS transaction_count,
        MAX(t.occurred_at) AS last_occurred_at
      FROM finance_transactions t
      LEFT JOIN finance_categories c ON c.id = t.category_id
      WHERE ${where.join(" AND ")}
      GROUP BY t.type, c.id, c.name
      ORDER BY transaction_count DESC, last_occurred_at DESC, c.name ASC
    `).all(...params);
  }

  function insertAttachment(row) {
    const ts = clock();
    const id = row.id || idGenerator("attachment");
    db.prepare(`
      INSERT INTO finance_attachments
        (id, transaction_id, file_ref, mime_type, sha256, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      row.transactionId || row.transaction_id,
      row.fileRef || row.file_ref,
      row.mimeType || row.mime_type || "",
      row.sha256 || "",
      row.createdAt || row.created_at || ts,
    );
    return getAttachment(id);
  }

  function updateAttachmentThumbnail(id, thumbnailRef, thumbnailMimeType) {
    db.prepare(`
      UPDATE finance_attachments
      SET thumbnail_ref = ?, thumbnail_mime_type = ?
      WHERE id = ?
    `).run(thumbnailRef || "", thumbnailMimeType || "", id);
    return getAttachment(id);
  }

  function getAttachment(id) {
    return db.prepare(`
      SELECT
        a.*,
        t.ledger_id AS ledger_id,
        t.status AS transaction_status
      FROM finance_attachments a
      JOIN finance_transactions t ON t.id = a.transaction_id
      WHERE a.id = ?
    `).get(id) || null;
  }

  function listAttachments(transactionId) {
    return db.prepare(`
      SELECT
        a.*,
        t.ledger_id AS ledger_id,
        t.status AS transaction_status
      FROM finance_attachments a
      JOIN finance_transactions t ON t.id = a.transaction_id
      WHERE a.transaction_id = ?
      ORDER BY a.created_at ASC
    `).all(transactionId);
  }

  function listAllAttachments() {
    return db.prepare(`
      SELECT
        a.*,
        t.ledger_id AS ledger_id,
        t.status AS transaction_status
      FROM finance_attachments a
      JOIN finance_transactions t ON t.id = a.transaction_id
      ORDER BY a.created_at ASC
    `).all();
  }

  function reportRows(filters = {}) {
    const params = [filters.ledgerId || "daily"];
    const where = ["t.ledger_id = ?", "t.status = 'active'"];
    if (filters.type) {
      where.push("t.type = ?");
      params.push(filters.type);
    }
    if (filters.startDate) {
      where.push("t.occurred_at >= ?");
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      where.push("t.occurred_at <= ?");
      params.push(filters.endDate);
    }
    applyTransactionFilters({ where, params, filters });
    return db.prepare(`
      SELECT t.*, c.name AS category_name, c.parent_id AS category_parent_id, pc.name AS parent_category_name,
             c.icon AS category_icon, pc.icon AS parent_category_icon,
             a.name AS account_name, ta.name AS target_account_name,
             m.display_name AS member_name, merchant.name AS merchant_name
      FROM finance_transactions t
      LEFT JOIN finance_categories c ON c.id = t.category_id
      LEFT JOIN finance_categories pc ON pc.id = c.parent_id
      LEFT JOIN finance_accounts a ON a.id = t.account_id
      LEFT JOIN finance_accounts ta ON ta.id = t.target_account_id
      LEFT JOIN finance_members m ON m.id = t.booked_by_member_id
      LEFT JOIN finance_merchants merchant ON merchant.id = t.merchant_id
      WHERE ${where.join(" AND ")}
      ORDER BY t.occurred_at DESC, t.created_at DESC
    `).all(...params);
  }

  function reportTagRows(filters = {}) {
    const params = [filters.ledgerId || "daily"];
    const where = ["t.ledger_id = ?", "t.status = 'active'"];
    if (filters.type) {
      where.push("t.type = ?");
      params.push(filters.type);
    }
    if (filters.startDate) {
      where.push("t.occurred_at >= ?");
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      where.push("t.occurred_at <= ?");
      params.push(filters.endDate);
    }
    applyTransactionFilters({ where, params, filters, tagAlias: "tt" });
    return db.prepare(`
      SELECT t.*, tag.id AS tag_id, tag.name AS tag_name
      FROM finance_transactions t
      LEFT JOIN finance_categories c ON c.id = t.category_id
      LEFT JOIN finance_transaction_tags tt ON tt.transaction_id = t.id
      LEFT JOIN finance_tags tag ON tag.id = tt.tag_id
      WHERE ${where.join(" AND ")}
      ORDER BY t.occurred_at DESC, t.created_at DESC
    `).all(...params);
  }

  function recurringRuleSelectSql() {
    return `
      SELECT r.*, c.name AS category_name, a.name AS account_name,
             ta.name AS target_account_name, m.display_name AS member_name
      FROM finance_recurring_rules r
      LEFT JOIN finance_categories c ON c.id = r.category_id
      LEFT JOIN finance_accounts a ON a.id = r.account_id
      LEFT JOIN finance_accounts ta ON ta.id = r.target_account_id
      LEFT JOIN finance_members m ON m.id = r.member_id
    `;
  }

  function getRecurringRule(id) {
    return rowToRecurringRule(db.prepare(`${recurringRuleSelectSql()} WHERE r.id = ?`).get(id));
  }

  function listRecurringRules({ ledgerId = "daily", status = "" } = {}) {
    const params = [ledgerId];
    const where = ["r.ledger_id = ?"];
    if (status) {
      where.push("r.status = ?");
      params.push(status);
    } else {
      where.push("r.status <> 'deleted'");
    }
    return db.prepare(`
      ${recurringRuleSelectSql()}
      WHERE ${where.join(" AND ")}
      ORDER BY CASE r.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
               r.next_due_at, r.created_at DESC
    `).all(...params).map(rowToRecurringRule);
  }

  function listDueRecurringRules({ ledgerId = "daily", throughAt }) {
    return db.prepare(`
      ${recurringRuleSelectSql()}
      WHERE r.ledger_id = ? AND r.status = 'active' AND r.next_due_at <> '' AND r.next_due_at <= ?
      ORDER BY r.next_due_at, r.created_at
    `).all(ledgerId, throughAt).map(rowToRecurringRule);
  }

  function listLedgerIdsWithDueRecurringRules(throughAt) {
    return db.prepare(`
      SELECT DISTINCT ledger_id
      FROM finance_recurring_rules
      WHERE status = 'active' AND next_due_at <> '' AND next_due_at <= ?
      ORDER BY ledger_id
    `).all(throughAt).map((row) => row.ledger_id);
  }

  function insertRecurringRule(row) {
    db.prepare(`
      INSERT INTO finance_recurring_rules
        (id, ledger_id, status, title, transaction_type, amount_minor, scale, currency,
         category_id, account_id, target_account_id, member_id, merchant_name, note, tags_json,
         frequency, interval_count, weekdays_json, day_of_month, month_of_year,
         start_at, end_at, time_of_day, next_due_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.id, row.ledgerId, row.status || "active", row.title, row.transactionType,
      row.amountMinor, row.scale, row.currency, row.categoryId || "", row.accountId,
      row.targetAccountId || "", row.memberId || "", row.merchantName || "", row.note || "",
      JSON.stringify(row.tags || []), row.frequency, row.intervalCount, JSON.stringify(row.weekdays || []),
      row.dayOfMonth || 0, row.monthOfYear || 0, row.startAt, row.endAt || "",
      row.timeOfDay || "09:00", row.nextDueAt, row.createdAt, row.updatedAt,
    );
    return getRecurringRule(row.id);
  }

  function updateRecurringRule(row) {
    db.prepare(`
      UPDATE finance_recurring_rules
      SET status = ?, title = ?, transaction_type = ?, amount_minor = ?, scale = ?, currency = ?,
          category_id = ?, account_id = ?, target_account_id = ?, member_id = ?, merchant_name = ?,
          note = ?, tags_json = ?, frequency = ?, interval_count = ?, weekdays_json = ?,
          day_of_month = ?, month_of_year = ?, start_at = ?, end_at = ?, time_of_day = ?,
          next_due_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      row.status || "active", row.title, row.transactionType, row.amountMinor, row.scale, row.currency,
      row.categoryId || "", row.accountId, row.targetAccountId || "", row.memberId || "", row.merchantName || "",
      row.note || "", JSON.stringify(row.tags || []), row.frequency, row.intervalCount, JSON.stringify(row.weekdays || []),
      row.dayOfMonth || 0, row.monthOfYear || 0, row.startAt, row.endAt || "", row.timeOfDay || "09:00",
      row.nextDueAt, row.updatedAt, row.id,
    );
    return getRecurringRule(row.id);
  }

  function setRecurringRuleStatus(id, status, updatedAt, deletedAt = "") {
    db.prepare(`
      UPDATE finance_recurring_rules
      SET status = ?, updated_at = ?, deleted_at = ?
      WHERE id = ?
    `).run(status, updatedAt, deletedAt || "", id);
    return getRecurringRule(id);
  }

  function updateRecurringRuleNextDue(id, nextDueAt, updatedAt) {
    db.prepare("UPDATE finance_recurring_rules SET next_due_at = ?, updated_at = ? WHERE id = ?").run(nextDueAt || "", updatedAt, id);
    return getRecurringRule(id);
  }

  function listGeneratedTransactionsForRecurringRule(ruleId, ledgerId = "daily") {
    return db.prepare(`
      SELECT t.*
      FROM finance_transactions t
      WHERE t.ledger_id = ? AND t.source = 'recurring' AND t.source_ref LIKE ?
      ORDER BY t.occurred_at DESC, t.created_at DESC
    `).all(ledgerId, `recurring:${ruleId}:%`);
  }

  function upsertOwnerAssetSnapshot(row) {
    const ts = clock();
    const existing = db.prepare(`
      SELECT * FROM finance_owner_asset_snapshots
      WHERE finance_user_id = ? AND snapshot_year = ?
    `).get(row.financeUserId, Number(row.year));
    const id = existing?.id || row.id || idGenerator("asset_snapshot");
    if (existing) {
      db.prepare(`
        UPDATE finance_owner_asset_snapshots
        SET as_of_date = ?, base_currency = ?, fx_usd_cny_ppm = ?,
            usd_investment_year = ?, usd_annual_return_bps = ?,
            usd_cagr_bps = ?, usd_total_return_multiple_bps = ?,
            total_assets_cny_minor = ?, source = ?, source_ref = ?,
            notes = ?, updated_at = ?
        WHERE id = ?
      `).run(
        row.asOfDate || "", row.baseCurrency || "CNY", Number(row.fxUsdCnyPpm) || 0,
        Number(row.usdInvestmentYear) || 0, Number(row.usdAnnualReturnBps) || 0,
        Number(row.usdCagrBps) || 0, Number(row.usdTotalReturnMultipleBps) || 0,
        Number(row.totalAssetsCnyMinor) || 0, row.source || "", row.sourceRef || "",
        row.notes || "", ts, id,
      );
    } else {
      db.prepare(`
        INSERT INTO finance_owner_asset_snapshots
          (id, finance_user_id, snapshot_year, as_of_date, base_currency,
           fx_usd_cny_ppm, usd_investment_year, usd_annual_return_bps,
           usd_cagr_bps, usd_total_return_multiple_bps, total_assets_cny_minor,
           source, source_ref, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, row.financeUserId, Number(row.year), row.asOfDate || "",
        row.baseCurrency || "CNY", Number(row.fxUsdCnyPpm) || 0,
        Number(row.usdInvestmentYear) || 0, Number(row.usdAnnualReturnBps) || 0,
        Number(row.usdCagrBps) || 0, Number(row.usdTotalReturnMultipleBps) || 0,
        Number(row.totalAssetsCnyMinor) || 0, row.source || "", row.sourceRef || "",
        row.notes || "", ts, ts,
      );
    }
    return getOwnerAssetSnapshot(id);
  }

  function replaceOwnerAssetComponents(snapshotId, components = []) {
    const ts = clock();
    db.prepare("DELETE FROM finance_owner_asset_components WHERE snapshot_id = ?").run(snapshotId);
    const insert = db.prepare(`
      INSERT INTO finance_owner_asset_components
        (id, snapshot_id, component_key, label, currency, amount_minor, amount_cny_minor, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const [index, component] of components.entries()) {
      insert.run(
        component.id || idGenerator("asset_component"),
        snapshotId,
        component.componentKey,
        component.label,
        component.currency || "CNY",
        Number(component.amountMinor) || 0,
        Number(component.amountCnyMinor) || 0,
        Number(component.sortOrder ?? index) || 0,
        ts,
        ts,
      );
    }
    return listOwnerAssetComponents(snapshotId);
  }

  function getOwnerAssetSnapshot(id) {
    return rowToOwnerAssetSnapshot(db.prepare("SELECT * FROM finance_owner_asset_snapshots WHERE id = ?").get(id));
  }

  function getOwnerAssetSnapshotByYear(financeUserId, year) {
    return rowToOwnerAssetSnapshot(db.prepare(`
      SELECT * FROM finance_owner_asset_snapshots
      WHERE finance_user_id = ? AND snapshot_year = ?
    `).get(financeUserId, Number(year)));
  }

  function listOwnerAssetSnapshots({ financeUserId, startYear = 0, endYear = 9999, limit = 200 } = {}) {
    return db.prepare(`
      SELECT *
      FROM finance_owner_asset_snapshots
      WHERE finance_user_id = ? AND snapshot_year >= ? AND snapshot_year <= ?
      ORDER BY snapshot_year ASC
      LIMIT ?
    `).all(financeUserId, Number(startYear) || 0, Number(endYear) || 9999, Number(limit) || 200)
      .map(rowToOwnerAssetSnapshot);
  }

  function getLatestOwnerAssetSnapshot(financeUserId) {
    return rowToOwnerAssetSnapshot(db.prepare(`
      SELECT *
      FROM finance_owner_asset_snapshots
      WHERE finance_user_id = ?
      ORDER BY snapshot_year DESC
      LIMIT 1
    `).get(financeUserId));
  }

  function updateOwnerAssetCurrentUsdProjection({ id, currentUsdCnyPpm = 0, currentTotalAssetsUsdMinor = 0, currentFxSource = "" } = {}) {
    if (!id) throw new Error("asset_snapshot_id_required");
    const ts = clock();
    db.prepare(`
      UPDATE finance_owner_asset_snapshots
      SET current_usd_cny_ppm = ?,
          current_total_assets_usd_minor = ?,
          current_fx_updated_at = ?,
          current_fx_source = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      Number(currentUsdCnyPpm) || 0,
      Number(currentTotalAssetsUsdMinor) || 0,
      ts,
      currentFxSource || "",
      ts,
      id,
    );
    return getOwnerAssetSnapshot(id);
  }

  function listOwnerAssetComponents(snapshotId) {
    return db.prepare(`
      SELECT *
      FROM finance_owner_asset_components
      WHERE snapshot_id = ?
      ORDER BY sort_order ASC, component_key ASC
    `).all(snapshotId).map(rowToOwnerAssetComponent);
  }

  function upsertOwnerStockSnapshot(row) {
    const ts = clock();
    const existing = db.prepare(`
      SELECT * FROM finance_owner_stock_snapshots
      WHERE finance_user_id = ? AND as_of_date = ?
    `).get(row.financeUserId, row.asOfDate || "");
    const id = existing?.id || row.id || idGenerator("stock_snapshot");
    if (existing) {
      db.prepare(`
        UPDATE finance_owner_stock_snapshots
        SET base_currency = ?, base_scale = ?, price_as_of = ?,
            total_market_value_minor = ?, total_cost_basis_minor = ?,
            total_unrealized_gain_minor = ?, total_annual_gain_minor = ?,
            annual_change_bps = ?, source = ?, source_ref = ?,
            notes = ?, updated_at = ?
        WHERE id = ?
      `).run(
        row.baseCurrency || "USD", Number(row.baseScale) || 2, row.priceAsOf || "",
        Number(row.totalMarketValueMinor) || 0, Number(row.totalCostBasisMinor) || 0,
        Number(row.totalUnrealizedGainMinor) || 0, Number(row.totalAnnualGainMinor) || 0,
        Number(row.annualChangeBps) || 0, row.source || "", row.sourceRef || "",
        row.notes || "", ts, id,
      );
    } else {
      db.prepare(`
        INSERT INTO finance_owner_stock_snapshots
          (id, finance_user_id, as_of_date, base_currency, base_scale,
           price_as_of, total_market_value_minor, total_cost_basis_minor,
           total_unrealized_gain_minor, total_annual_gain_minor,
           annual_change_bps, source, source_ref, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, row.financeUserId, row.asOfDate || "", row.baseCurrency || "USD",
        Number(row.baseScale) || 2, row.priceAsOf || "",
        Number(row.totalMarketValueMinor) || 0, Number(row.totalCostBasisMinor) || 0,
        Number(row.totalUnrealizedGainMinor) || 0, Number(row.totalAnnualGainMinor) || 0,
        Number(row.annualChangeBps) || 0, row.source || "", row.sourceRef || "",
        row.notes || "", ts, ts,
      );
    }
    return getOwnerStockSnapshot(id);
  }

  function replaceOwnerStockPositions(snapshotId, positions = []) {
    const ts = clock();
    db.prepare("DELETE FROM finance_owner_stock_positions WHERE snapshot_id = ?").run(snapshotId);
    const insert = db.prepare(`
      INSERT INTO finance_owner_stock_positions
        (id, snapshot_id, position_key, label, ticker, market, currency, scale,
         quantity_units_micro, quantity_unit, average_cost_minor, opening_price_minor,
         current_price_minor, cost_basis_minor, opening_market_value_minor,
         current_market_value_minor, cost_basis_base_minor, opening_market_value_base_minor,
         market_value_base_minor, unrealized_gain_base_minor, annual_gain_base_minor,
         annual_change_bps, cumulative_change_bps, allocation_bps, fx_to_base_ppm,
         sort_order, source_row_index, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const [index, position] of positions.entries()) {
      insert.run(
        position.id || idGenerator("stock_position"),
        snapshotId,
        position.positionKey,
        position.label,
        position.ticker || "",
        position.market || "",
        position.currency || "USD",
        Number(position.scale) || 2,
        Number(position.quantityUnitsMicro) || 0,
        position.quantityUnit || "share",
        Number(position.averageCostMinor) || 0,
        Number(position.openingPriceMinor) || 0,
        Number(position.currentPriceMinor) || 0,
        Number(position.costBasisMinor) || 0,
        Number(position.openingMarketValueMinor) || 0,
        Number(position.currentMarketValueMinor) || 0,
        Number(position.costBasisBaseMinor) || 0,
        Number(position.openingMarketValueBaseMinor) || 0,
        Number(position.marketValueBaseMinor) || 0,
        Number(position.unrealizedGainBaseMinor) || 0,
        Number(position.annualGainBaseMinor) || 0,
        Number(position.annualChangeBps) || 0,
        Number(position.cumulativeChangeBps) || 0,
        Number(position.allocationBps) || 0,
        Number(position.fxToBasePpm) || 1000000,
        Number(position.sortOrder ?? index) || 0,
        Number(position.sourceRowIndex ?? index + 1) || 0,
        ts,
        ts,
      );
    }
    return listOwnerStockPositions(snapshotId);
  }

  function getOwnerStockSnapshot(id) {
    return rowToOwnerStockSnapshot(db.prepare("SELECT * FROM finance_owner_stock_snapshots WHERE id = ?").get(id));
  }

  function getLatestOwnerStockSnapshot(financeUserId) {
    return rowToOwnerStockSnapshot(db.prepare(`
      SELECT *
      FROM finance_owner_stock_snapshots
      WHERE finance_user_id = ?
      ORDER BY as_of_date DESC
      LIMIT 1
    `).get(financeUserId));
  }

  function listOwnerStockSnapshots({ financeUserId, startDate = "", endDate = "", limit = 50 } = {}) {
    const where = ["finance_user_id = ?"];
    const params = [financeUserId];
    if (startDate) {
      where.push("as_of_date >= ?");
      params.push(startDate);
    }
    if (endDate) {
      where.push("as_of_date <= ?");
      params.push(endDate);
    }
    params.push(Number(limit) || 50);
    return db.prepare(`
      SELECT *
      FROM finance_owner_stock_snapshots
      WHERE ${where.join(" AND ")}
      ORDER BY as_of_date DESC
      LIMIT ?
    `).all(...params).map(rowToOwnerStockSnapshot);
  }

  function listOwnerStockPositions(snapshotId) {
    return db.prepare(`
      SELECT *
      FROM finance_owner_stock_positions
      WHERE snapshot_id = ?
      ORDER BY sort_order ASC, position_key ASC
    `).all(snapshotId).map(rowToOwnerStockPosition);
  }

  function bindMember(row) {
    const existing = resolveBinding({
      provider: row.provider,
      externalWorkspaceId: row.externalWorkspaceId || "",
      externalUserId: row.externalUserId || "",
    });
    if (existing) return existing;
    const ts = clock();
    const id = defaultId("binding");
    db.prepare(`
      INSERT INTO finance_member_bindings
        (id, ledger_id, member_id, provider, external_user_id, external_workspace_id, binding_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(id, row.ledgerId, row.memberId, row.provider, row.externalUserId || "", row.externalWorkspaceId || "", ts, ts);
    return db.prepare("SELECT * FROM finance_member_bindings WHERE id = ?").get(id);
  }

  function resolveBinding({ provider = "hermes_mobile", externalWorkspaceId = "", externalUserId = "" }) {
    if (externalWorkspaceId && externalUserId) {
      return db.prepare(`
        SELECT * FROM finance_member_bindings
        WHERE provider = ? AND external_workspace_id = ? AND external_user_id = ? AND binding_status = 'active'
      `).get(provider, externalWorkspaceId, externalUserId) || null;
    }
    if (externalWorkspaceId) {
      return db.prepare(`
        SELECT * FROM finance_member_bindings
        WHERE provider = ? AND external_workspace_id = ? AND external_user_id = '' AND binding_status = 'active'
      `).get(provider, externalWorkspaceId) || null;
    }
    if (externalUserId) {
      return db.prepare("SELECT * FROM finance_member_bindings WHERE provider = ? AND external_workspace_id = '' AND external_user_id = ? AND binding_status = 'active'")
        .get(provider, externalUserId) || null;
    }
    return null;
  }

  function getPluginRegistration({ provider = "hermes_mobile", toolset = "finance", externalWorkspaceId = "" } = {}) {
    return db.prepare(`
      SELECT * FROM finance_plugin_registrations
      WHERE provider = ? AND toolset = ? AND external_workspace_id = ? AND registration_status = 'active'
    `).get(provider, toolset, externalWorkspaceId || "") || null;
  }

  function upsertPluginRegistration({
    provider = "hermes_mobile",
    toolset = "finance",
    externalWorkspaceId = "",
    callbackUrl,
  } = {}) {
    const cleanCallbackUrl = String(callbackUrl || "").trim();
    if (!cleanCallbackUrl) throw new Error("callback_url_required");
    const ts = clock();
    const current = getPluginRegistration({ provider, toolset, externalWorkspaceId });
    if (current) {
      db.prepare(`
        UPDATE finance_plugin_registrations
        SET callback_url = ?, updated_at = ?
        WHERE id = ?
      `).run(cleanCallbackUrl, ts, current.id);
      return db.prepare("SELECT * FROM finance_plugin_registrations WHERE id = ?").get(current.id);
    }
    const id = idGenerator("plugin_reg");
    db.prepare(`
      INSERT INTO finance_plugin_registrations
        (id, provider, toolset, external_workspace_id, callback_url, registration_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(id, provider, toolset, externalWorkspaceId || "", cleanCallbackUrl, ts, ts);
    return db.prepare("SELECT * FROM finance_plugin_registrations WHERE id = ?").get(id);
  }

  function close() {
    db.close();
  }

  return {
    boolInt,
    bindMember,
    close,
    db,
    acceptLedgerInvitation,
    findFinanceAccessToken,
    findLedgerByName,
    findTransactionByIdempotency,
    getAccount,
    getFinanceUser,
    getFinanceUserByKey,
    getLedger,
    getLedgerJoinRequest,
    getLedgerInvitation,
    getAttachment,
    getLedgerMembership,
    getLatestOwnerAssetSnapshot,
    getLatestOwnerStockSnapshot,
    getOwnerAssetSnapshot,
    getOwnerAssetSnapshotByYear,
    getOwnerStockSnapshot,
    getPluginRegistration,
    getRecurringRule,
    getTransaction,
    getTransactionProjection,
    getTransactionSourceFields,
    idGenerator,
    insertImportBatch,
    insertAudit,
    insertAttachment,
    updateAttachmentThumbnail,
    insertFinanceAccessToken,
    insertLedgerJoinRequest,
    insertLedgerInvitation,
    insertRecurringRule,
    insertTransaction,
    insertTransactionSourceFields,
    bindFinanceUser,
    listAccounts,
    listAllAttachments,
    listAttachments,
    listCategories,
    listCategoryUsage,
    listCurrencies,
    listFinanceUsers,
    listLedgerJoinRequests,
    listLedgerInvitations,
    listLedgerMemberships,
    listLedgersByUser,
    listLedgerIdsWithDueRecurringRules,
    listMembers,
    listDueRecurringRules,
    listGeneratedTransactionsForRecurringRule,
    listRecurringRules,
    listOwnerAssetComponents,
    listOwnerAssetSnapshots,
    listOwnerStockPositions,
    listOwnerStockSnapshots,
    listVisibleMembersForUser,
    listTags,
    listTransactions,
    migrate,
    replaceTransactionTags,
    backfillCategoryIcons,
    replaceMemberVisibility,
    reportTagRows,
    reportRows,
    resolveBinding,
    resolveFinanceUserBinding,
    seedDefaults,
    setRecurringRuleStatus,
    setTransactionVoided,
    touchFinanceAccessToken,
    transaction,
    upsertAccount,
    upsertCategory,
    upsertCurrency,
    upsertFinanceUser,
    upsertLedger,
    upsertPluginRegistration,
    updateImportBatchCounts,
    updateAccountBalance,
    updateLedgerJoinRequestStatus,
    updateRecurringRule,
    updateRecurringRuleNextDue,
    updateTransactionRow,
    updateOwnerAssetCurrentUsdProjection,
    upsertOwnerAssetSnapshot,
    upsertOwnerStockSnapshot,
    upsertMember,
    upsertLedgerMembership,
    upsertMerchant,
    replaceOwnerAssetComponents,
    replaceOwnerStockPositions,
    upsertTag,
  };
}

module.exports = {
  CURRENT_SCHEMA_VERSION,
  createFinanceRepository,
};
