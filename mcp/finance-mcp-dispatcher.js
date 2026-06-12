"use strict";

const { MEMBER_DEFAULT_TOOLS } = require("./finance-tool-contract");
const { normalizeArgs } = require("./finance-mcp-args");
const { applyHermesIdentity, authorizedLedgerId } = require("./finance-mcp-context");
const { dispatchLedgerTool } = require("./dispatchers/finance-ledger-dispatcher");
const { dispatchMasterDataTool } = require("./dispatchers/finance-master-data-dispatcher");
const { dispatchRecurringTool } = require("./dispatchers/finance-recurring-dispatcher");
const { dispatchReferenceTool } = require("./dispatchers/finance-reference-dispatcher");
const { dispatchOwnerAssetTool } = require("./dispatchers/finance-owner-asset-dispatcher");
const { dispatchReportTool } = require("./dispatchers/finance-report-dispatcher");
const { dispatchTransactionTool } = require("./dispatchers/finance-transaction-dispatcher");

const DOMAIN_DISPATCHERS = Object.freeze([
  dispatchTransactionTool,
  dispatchReferenceTool,
  dispatchOwnerAssetTool,
  dispatchRecurringTool,
  dispatchReportTool,
  dispatchLedgerTool,
  dispatchMasterDataTool,
]);

function createFinanceMcpDispatcherCore({ runtime, schemas } = {}) {
  if (!runtime) throw new Error("runtime_required");
  if (!Array.isArray(schemas)) throw new Error("schemas_required");

  async function dispatch(name, args = {}, context = {}) {
    const usesDefaultMember = MEMBER_DEFAULT_TOOLS.has(name);
    const normalized = applyHermesIdentity(runtime, normalizeArgs(args), context, {
      defaultMember: usesDefaultMember,
      resolveMember: usesDefaultMember || name === "finance.resolve_current_member",
    });
    const input = normalized.input;
    const dispatchContext = normalized.context;
    const authorizedLedger = (ledgerInput = input, ledgerContext = dispatchContext) => authorizedLedgerId(runtime, ledgerInput, ledgerContext);
    for (const domainDispatch of DOMAIN_DISPATCHERS) {
      const dispatched = domainDispatch({
        name,
        args,
        input,
        context: dispatchContext,
        runtime,
        authorizedLedgerId: authorizedLedger,
      });
      if (dispatched?.handled) return dispatched.result;
    }
    throw new Error("unknown_finance_tool");
  }

  function register(ctx) {
    for (const schema of schemas) {
      ctx.register_tool({
        name: schema.name,
        toolset: "finance",
        schema,
        description: schema.description,
        handler: (args, handlerContext = {}) => dispatch(schema.name, args, handlerContext)
          .then((result) => JSON.stringify({ ok: true, result }, null, 2))
          .catch((err) => JSON.stringify({ ok: false, error: err.message || String(err) }, null, 2)),
      });
    }
  }

  return { dispatch, register, schemas };
}

module.exports = {
  createFinanceMcpDispatcherCore,
};
