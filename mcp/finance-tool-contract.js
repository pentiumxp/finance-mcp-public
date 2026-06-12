"use strict";

const {
  MAX_CREATE_ATTACHMENTS,
  attachmentPayloadAnyOf,
  attachmentPayloadProperties,
} = require("../adapters/finance-attachment-input-service");

const TOOLSET = "finance";

const TOOL_SCHEMAS = [
  {
    name: "finance.create_transaction",
    toolset: "finance",
    description: "Create one finance income, expense, or transfer transaction.",
    parameters: {
      type: "object",
      properties: {
        ledger_id: { type: "string", description: "Ledger id. Defaults to daily." },
        type: { type: "string", enum: ["expense", "income", "transfer"] },
        amount: { type: "string", description: "Decimal amount string, for example 86.50." },
        currency: { type: "string", default: "CNY" },
        occurred_at: { type: "string" },
        category_hint: { type: "string" },
        account_hint: { type: "string" },
        target_account_hint: { type: "string" },
        member_hint: { type: "string" },
        merchant: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        note: { type: "string" },
        raw_text: { type: "string" },
        attachments: {
          type: "array",
          maxItems: MAX_CREATE_ATTACHMENTS,
          description: "Optional photos or files to attach while creating the transaction. Use file_path or upload_path for server-local Hermes upload files; use base64 only when bytes are already available.",
          items: {
            type: "object",
            properties: {
              file_name: { type: "string", description: "Original filename, for example receipt.jpg." },
              mime_type: { type: "string", description: "Content type, for example image/jpeg." },
              ...attachmentPayloadProperties(),
            },
            anyOf: attachmentPayloadAnyOf()
          }
        },
        idempotency_key: { type: "string" }
      },
      required: ["type", "amount"]
    }
  },
  {
    name: "finance.list_transactions",
    toolset: "finance",
    description: "List bounded finance transactions for the authorized ledger.",
    parameters: {
      type: "object",
      properties: {
        ledger_id: { type: "string" },
        type: { type: "string" },
        start_date: { type: "string" },
        end_date: { type: "string" },
        currency: { type: "string", default: "CNY" },
        category_id: { type: "string" },
        category_parent_id: { type: "string" },
        member_id: { type: "string" },
        account_id: { type: "string" },
        merchant_id: { type: "string" },
        tag_id: { type: "string" },
        search: { type: "string" },
        include_voided: { type: "boolean" },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
        offset: { type: "integer", minimum: 0, default: 0 }
      }
    }
  },
  {
    name: "finance.reference_object_types",
    toolset: "finance",
    description: "List Finance object types that can be referenced by Home AI Reference / Memory Graph.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "finance.reference_get",
    toolset: "finance",
    description: "Return one permission-checked bounded Finance object reference. Full Finance facts remain owned by Finance.",
    parameters: {
      type: "object",
      properties: {
        ledger_id: { type: "string", description: "Optional ledger id for object types that need ledger disambiguation." },
        object_type: { type: "string", enum: ["transaction", "account", "category"] },
        object_id: { type: "string" }
      },
      required: ["object_type", "object_id"]
    }
  },
  {
    name: "finance.reference_summarize",
    toolset: "finance",
    description: "Return a permission-checked bounded summary for a Finance object reference.",
    parameters: {
      type: "object",
      properties: {
        ledger_id: { type: "string", description: "Optional ledger id for object types that need ledger disambiguation." },
        object_type: { type: "string", enum: ["transaction", "account", "category"] },
        object_id: { type: "string" },
        purpose: { type: "string", description: "Optional short purpose for shaping the bounded summary." }
      },
      required: ["object_type", "object_id"]
    }
  },
  {
    name: "finance.add_transaction_attachment",
    toolset: "finance",
    description: "Attach one photo or file to an existing finance transaction. Use file_path or upload_path for server-local Hermes upload files; use base64 only when bytes are already available.",
    parameters: {
      type: "object",
      properties: {
        ledger_id: { type: "string", description: "Ledger id for scoped access validation." },
        transaction_id: { type: "string", description: "Existing transaction id to attach the file to." },
        file_name: { type: "string", description: "Original filename, for example receipt.jpg." },
        mime_type: { type: "string", description: "Content type, for example image/jpeg." },
        ...attachmentPayloadProperties(),
      },
      required: ["transaction_id"],
      anyOf: attachmentPayloadAnyOf()
    }
  },
  {
    name: "finance.create_recurring_rule",
    toolset: "finance",
    description: "Create a recurring bookkeeping rule that can generate due income, expense, or transfer transactions.",
    parameters: {
      type: "object",
      properties: {
        ledger_id: { type: "string" },
        title: { type: "string" },
        type: { type: "string", enum: ["expense", "income", "transfer"] },
        amount: { type: "string" },
        currency: { type: "string", default: "CNY" },
        category_hint: { type: "string" },
        account_hint: { type: "string" },
        target_account_hint: { type: "string" },
        member_hint: { type: "string" },
        merchant: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        note: { type: "string" },
        frequency: { type: "string", enum: ["daily", "weekly", "monthly", "yearly"] },
        interval_count: { type: "integer", minimum: 1, maximum: 99, default: 1 },
        weekdays: { type: "array", items: { type: "integer", minimum: 1, maximum: 7 } },
        day_of_month: { type: "integer", minimum: 1, maximum: 31 },
        month_of_year: { type: "integer", minimum: 1, maximum: 12 },
        start_at: { type: "string" },
        end_at: { type: "string" },
        time_of_day: { type: "string", default: "09:00" }
      },
      required: ["title", "type", "amount", "frequency", "start_at"]
    }
  },
  {
    name: "finance.list_recurring_rules",
    toolset: "finance",
    description: "List recurring bookkeeping rules for the authorized ledger.",
    parameters: {
      type: "object",
      properties: {
        ledger_id: { type: "string" },
        status: { type: "string", enum: ["active", "paused", "completed", "deleted"] }
      }
    }
  },
  {
    name: "finance.update_recurring_rule",
    toolset: "finance",
    description: "Update one recurring bookkeeping rule. Historical generated transactions are not changed.",
    parameters: {
      type: "object",
      properties: {
        rule_id: { type: "string" },
        patch: { type: "object" }
      },
      required: ["rule_id", "patch"]
    }
  },
  {
    name: "finance.set_recurring_rule_status",
    toolset: "finance",
    description: "Pause or resume one recurring bookkeeping rule.",
    parameters: {
      type: "object",
      properties: {
        rule_id: { type: "string" },
        status: { type: "string", enum: ["active", "paused"] }
      },
      required: ["rule_id", "status"]
    }
  },
  {
    name: "finance.delete_recurring_rule",
    toolset: "finance",
    description: "Delete one recurring rule. Generated transactions are retained unless void_generated is true.",
    parameters: {
      type: "object",
      properties: {
        rule_id: { type: "string" },
        void_generated: { type: "boolean", default: false }
      },
      required: ["rule_id"]
    }
  },
  {
    name: "finance.generate_due_recurring_transactions",
    toolset: "finance",
    description: "Generate all due recurring transactions through the specified timestamp. Idempotent.",
    parameters: {
      type: "object",
      properties: {
        ledger_id: { type: "string" },
        through_at: { type: "string" },
        max_occurrences: { type: "integer", minimum: 1, maximum: 100, default: 50 }
      }
    }
  },
  {
    name: "finance.update_transaction",
    toolset: "finance",
    description: "Update one active finance transaction.",
    parameters: {
      type: "object",
      properties: {
        transaction_id: { type: "string" },
        patch: { type: "object" }
      },
      required: ["transaction_id", "patch"]
    }
  },
  {
    name: "finance.void_transaction",
    toolset: "finance",
    description: "Soft-delete one transaction and write audit metadata.",
    parameters: {
      type: "object",
      properties: {
        transaction_id: { type: "string" },
        reason: { type: "string" }
      },
      required: ["transaction_id"]
    }
  },
  {
    name: "finance.upsert_owner_asset_snapshot",
    toolset: "finance",
    description: "Owner-only. Create or update one structured annual owner asset snapshot and replace its asset components.",
    parameters: {
      type: "object",
      properties: {
        year: { type: "integer", minimum: 1900, maximum: 2200 },
        as_of_date: { type: "string", description: "Snapshot date, defaults to year-12-31." },
        fx_usd_cny_rate: { type: "string", description: "USD to CNY exchange rate, for example 7.3." },
        usd_investment_year: { type: "integer", minimum: 0 },
        usd_annual_return_bps: { type: "integer", description: "Annual USD-account return in basis points." },
        usd_cagr_bps: { type: "integer", description: "USD-account compound annual growth rate in basis points." },
        usd_total_return_multiple_bps: { type: "integer", description: "Total USD-account return multiple, where 1.0x is 10000." },
        total_assets_cny_minor: { type: "integer", description: "Total assets in CNY minor units." },
        source_ref: { type: "string" },
        notes: { type: "string" },
        components: {
          type: "array",
          maxItems: 32,
          items: {
            type: "object",
            properties: {
              component_key: { type: "string", description: "Stable component key such as usd_account, cny_bank, cny_securities, cny_trust, cny_other_investment." },
              label: { type: "string" },
              currency: { type: "string", default: "CNY" },
              amount_minor: { type: "integer" },
              amount_cny_minor: { type: "integer" },
              sort_order: { type: "integer" }
            },
            required: ["component_key"]
          }
        }
      },
      required: ["year"]
    }
  },
  {
    name: "finance.list_owner_asset_snapshots",
    toolset: "finance",
    description: "Owner-only. List structured owner asset snapshots and their components.",
    parameters: {
      type: "object",
      properties: {
        start_year: { type: "integer" },
        end_year: { type: "integer" },
        limit: { type: "integer", minimum: 1, maximum: 500, default: 200 }
      }
    }
  },
  {
    name: "finance.get_owner_asset_summary",
    toolset: "finance",
    description: "Owner-only. Return latest owner total assets plus bounded historical coverage, refreshing and persisting current USD/CNY total-assets projection.",
    parameters: {
      type: "object",
      properties: {
        start_year: { type: "integer" },
        end_year: { type: "integer" }
      }
    }
  },
  {
    name: "finance.upsert_owner_stock_snapshot",
    toolset: "finance",
    description: "Owner-only low-level snapshot maintenance. Normal stock updates should use natural-language position deltas and live market data instead of user-supplied prices.",
    parameters: {
      type: "object",
      properties: {
        as_of_date: { type: "string", description: "Snapshot date, YYYY-MM-DD." },
        base_currency: { type: "string", default: "USD" },
        price_as_of: { type: "string" },
        source_ref: { type: "string" },
        notes: { type: "string" },
        positions: {
          type: "array",
          maxItems: 64,
          items: {
            type: "object",
            properties: {
              position_key: { type: "string" },
              label: { type: "string" },
              ticker: { type: "string" },
              market: { type: "string" },
              currency: { type: "string" },
              quantity_wan: { type: "number" },
              quantity_units: { type: "number" },
              average_cost: { type: "number" },
              opening_price: { type: "number" },
              current_price: { type: "number" },
              fx_to_base_rate: { type: "number", description: "Units of position currency per one base currency unit." },
              sort_order: { type: "integer" }
            },
            required: ["label", "currency", "current_price"]
          }
        }
      },
      required: ["as_of_date", "positions"]
    }
  },
  {
    name: "finance.apply_owner_stock_position_delta",
    toolset: "finance",
    description: "Owner-only. Apply a stock position buy/sell/adjustment delta, then persist a new snapshot with live price and FX supplied by the tool runtime.",
    parameters: {
      type: "object",
      properties: {
        as_of_date: { type: "string", description: "Snapshot date, YYYY-MM-DD." },
        position_hint: { type: "string", description: "Natural language holding hint, for example 腾讯港股通 or 特斯拉." },
        action: { type: "string", enum: ["buy", "sell", "adjust"] },
        quantity_wan_delta: { type: "number", description: "Delta in ten-thousand shares. Sell values may be positive when action=sell." },
        quantity_units_delta: { type: "number", description: "Delta in shares." },
        average_cost: { type: "number", description: "Optional trade price/cost basis when the user states it; not a live quote field." },
        note: { type: "string" }
      },
      required: ["position_hint", "action"]
    }
  },
  {
    name: "finance.list_owner_stock_snapshots",
    toolset: "finance",
    description: "Owner-only. List structured stock holding snapshots and positions.",
    parameters: {
      type: "object",
      properties: {
        start_date: { type: "string" },
        end_date: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 }
      }
    }
  },
  {
    name: "finance.get_owner_stock_summary",
    toolset: "finance",
    description: "Owner-only. Return the latest stock holding snapshot and bounded recent snapshots.",
    parameters: {
      type: "object",
      properties: {
        start_date: { type: "string" },
        end_date: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 }
      }
    }
  },
  {
    name: "finance.get_summary",
    toolset: "finance",
    description: "Return income, expense, net, count, and period basis.",
    parameters: {
      type: "object",
      properties: {
        ledger_id: { type: "string" },
        period: { type: "string", enum: ["month", "quarter", "year", "custom", "all"] },
        currency: { type: "string", default: "CNY" },
        start_date: { type: "string" },
        end_date: { type: "string" }
      }
    }
  },
  {
    name: "finance.get_report",
    toolset: "finance",
    description: "Return trend or breakdown report by category, subcategory, member, account, merchant, or tag.",
    parameters: {
      type: "object",
      properties: {
        ledger_id: { type: "string" },
        period: { type: "string", enum: ["month", "quarter", "year", "custom", "all"] },
        metric: { type: "string", enum: ["expense", "income", "net"] },
        currency: {
          type: "string",
          description: "Optional report currency. Non-account reports default to CNY; omit for account reports to include original-currency accounts."
        },
        dimension: { type: "string", enum: ["trend", "category", "subcategory", "member", "account", "merchant", "tag"] },
        start_date: { type: "string" },
        end_date: { type: "string" },
        filters: {
          type: "object",
          properties: {
            category_id: { type: "string" },
            category_parent_id: { type: "string" },
            member_id: { type: "string" },
            account_id: { type: "string" },
            merchant_id: { type: "string" },
            tag_id: { type: "string" }
          },
          additionalProperties: false
        }
      }
    }
  },
  {
    name: "finance.list_ledgers",
    toolset: "finance",
    description: "List ledgers owned by the current Finance user.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "finance.create_ledger",
    toolset: "finance",
    description: "Create a new ledger for the current Finance user, optionally from a Wacai-like template.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        template_id: { type: "string" },
        base_currency: { type: "string", default: "CNY" },
        timezone: { type: "string", default: "Asia/Shanghai" }
      }
    }
  },
  {
    name: "finance.list_ledger_templates",
    toolset: "finance",
    description: "List Wacai-like ledger creation templates.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "finance.get_ledger_share",
    toolset: "finance",
    description: "Return shared users and member dimensions for a ledger. Shared ledger users see all ledger content; members are reporting dimensions, not visibility scopes.",
    parameters: { type: "object", properties: { ledger_id: { type: "string" } } }
  },
  {
    name: "finance.share_ledger",
    toolset: "finance",
    description: "Share a ledger with another Finance user. Owner only; shared users see all ledger content.",
    parameters: {
      type: "object",
      properties: {
        ledger_id: { type: "string" },
        finance_user_id: { type: "string" },
        finance_user_key: { type: "string" },
        role: { type: "string", enum: ["admin", "editor", "viewer"] }
      },
      required: ["ledger_id"]
    }
  },
  {
    name: "finance.request_ledger_join",
    toolset: "finance",
    description: "Create a ledger join request and return a bounded Hermes Inbox event for host delivery. No QR code or invite link is used.",
    parameters: {
      type: "object",
      properties: {
        ledger_id: { type: "string" },
        role: { type: "string", enum: ["editor", "viewer"] },
        message: { type: "string" }
      },
      required: ["ledger_id"]
    }
  },
  {
    name: "finance.create_ledger_invitation",
    toolset: "finance",
    description: "Owner creates a ledger invitation for a target Finance user and returns a bounded Hermes Inbox event.",
    parameters: {
      type: "object",
      properties: {
        ledger_id: { type: "string" },
        target_finance_user_id: { type: "string" },
        target_finance_user_key: { type: "string" },
        role: { type: "string", enum: ["editor", "viewer"] }
      },
      required: ["ledger_id"]
    }
  },
  {
    name: "finance.accept_ledger_invitation",
    toolset: "finance",
    description: "Accept a host-mediated ledger invitation using the current Hermes/Finance user context.",
    parameters: {
      type: "object",
      properties: {
        invitation_id: { type: "string" }
      },
      required: ["invitation_id"]
    }
  },
  {
    name: "finance.list_ledger_join_requests",
    toolset: "finance",
    description: "List pending ledger join requests targeted at the current Finance user.",
    parameters: { type: "object", properties: { status: { type: "string", enum: ["pending", "approved", "rejected", "cancelled"] } } }
  },
  {
    name: "finance.review_ledger_join_request",
    toolset: "finance",
    description: "Approve or reject a ledger join request. Owner only; approval creates shared-ledger membership for all ledger content.",
    parameters: {
      type: "object",
      properties: {
        request_id: { type: "string" },
        decision: { type: "string", enum: ["approve", "reject"] },
        role: { type: "string", enum: ["editor", "viewer"] }
      },
      required: ["request_id", "decision"]
    }
  },
  {
    name: "finance.list_accounts",
    toolset: "finance",
    description: "List accounts for the authorized ledger.",
    parameters: { type: "object", properties: { ledger_id: { type: "string" } } }
  },
  {
    name: "finance.list_currencies",
    toolset: "finance",
    description: "List supported currencies for transaction entry and reporting.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "finance.list_categories",
    toolset: "finance",
    description: "List categories for the authorized ledger.",
    parameters: { type: "object", properties: { ledger_id: { type: "string" }, type: { type: "string" } } }
  },
  {
    name: "finance.list_members",
    toolset: "finance",
    description: "List members for the authorized ledger.",
    parameters: { type: "object", properties: { ledger_id: { type: "string" } } }
  },
  {
    name: "finance.resolve_current_member",
    toolset: "finance",
    description: "Resolve or create the Finance member for the current Hermes Mobile workspace user key.",
    parameters: {
      type: "object",
      properties: {
        ledger_id: { type: "string" },
        external_workspace_id: { type: "string" },
        display_name: { type: "string" }
      }
    }
  },
  {
    name: "finance.bind_member",
    toolset: "finance",
    description: "Bind one finance member to a Hermes Mobile identity.",
    parameters: {
      type: "object",
      properties: {
        ledger_id: { type: "string" },
        member_id: { type: "string" },
        external_workspace_id: { type: "string" },
        external_user_id: { type: "string" }
      },
      required: ["member_id"]
    }
  }
];

const MEMBER_DEFAULT_TOOLS = new Set([
  "finance.create_transaction",
  "finance.list_transactions",
  "finance.create_recurring_rule",
]);

module.exports = {
  MEMBER_DEFAULT_TOOLS,
  TOOL_SCHEMAS,
  TOOLSET,
};
