"use strict";

const fs = require("node:fs");
const { createFinanceMcpDispatcher, TOOL_SCHEMAS } = require("../mcp/finance-mcp-server");

function readJson(req, { maxBytes = 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) {
        reject(new Error("request_too_large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

const HERMES_PLUGIN_ROUTE_QUERY_KEYS = Object.freeze([
  "pluginActionId",
  "pluginRoute",
  "pluginItemId",
  "pluginThreadId",
  "pluginTaskId",
  "sourceTurnId",
  "pluginId",
]);

function appendHermesPluginRouteParams(entryPath, url) {
  const base = String(entryPath || "").trim();
  if (!base || !url?.searchParams) return base;
  const parsed = new URL(base, "http://finance.local");
  HERMES_PLUGIN_ROUTE_QUERY_KEYS.forEach((key) => {
    const value = String(url.searchParams.get(key) || "").trim().slice(0, 180);
    if (value) parsed.searchParams.set(key, value);
  });
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function sendFile(res, { filePath, buffer, mimeType }) {
  res.writeHead(200, {
    "content-type": mimeType || "application/octet-stream",
    "cache-control": "private, max-age=3600",
  });
  res.end(buffer || fs.readFileSync(filePath));
}

function cookieValue(req, name) {
  const cookie = String(req.headers?.cookie || "");
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("=") || "");
  }
  return "";
}

function createUiProbeStore() {
  let latest = null;
  return {
    save(probe = {}, req) {
      latest = {
        receivedAt: new Date().toISOString(),
        remoteAddress: req.socket?.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
        probe,
      };
      return latest;
    },
    getLatest() {
      return latest;
    },
  };
}

function parseFinanceFilters(params) {
  const filters = {};
  const pairs = [
    ["category_id", "categoryId"],
    ["category_parent_id", "categoryParentId"],
    ["member_id", "memberId"],
    ["account_id", "accountId"],
    ["merchant_id", "merchantId"],
    ["tag_id", "tagId"],
  ];
  for (const [queryName, filterName] of pairs) {
    const value = params.get(queryName) || params.get(filterName);
    if (value) filters[filterName] = value;
  }
  return filters;
}

function parseFinanceQuery(url) {
  const raw = Object.fromEntries(url.searchParams);
  return { ...raw, filters: parseFinanceFilters(url.searchParams) };
}

function isLoopbackAddress(address = "") {
  const value = String(address || "").toLowerCase();
  return value === "127.0.0.1"
    || value === "::1"
    || value === "::ffff:127.0.0.1"
    || value === "localhost";
}

function normalizeRemoteAddress(address = "") {
  return String(address || "").trim().toLowerCase().replace(/^::ffff:/, "");
}

function ipv4ToNumber(address = "") {
  const parts = normalizeRemoteAddress(address).split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    value = (value << 8) + octet;
  }
  return value >>> 0;
}

function ipv4InCidr(address = "", cidr = "") {
  const [base, prefixText] = String(cidr || "").trim().split("/");
  const prefix = Number(prefixText);
  const addressNumber = ipv4ToNumber(address);
  const baseNumber = ipv4ToNumber(base);
  if (addressNumber === null || baseNumber === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (addressNumber & mask) === (baseNumber & mask);
}

function listFromEnv(value = "") {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function isTrustedGatewayAddress(address = "", options = {}) {
  const remote = normalizeRemoteAddress(address);
  if (!remote) return false;
  const exact = new Set([
    ...listFromEnv(process.env.FINANCE_MCP_TRUSTED_GATEWAY_ADDRESSES),
    ...listFromEnv(options.trustedGatewayAddresses),
  ].map(normalizeRemoteAddress));
  if (exact.has(remote)) return true;
  const cidrs = [
    ...listFromEnv(process.env.FINANCE_MCP_TRUSTED_GATEWAY_CIDRS),
    ...listFromEnv(options.trustedGatewayCidrs),
  ];
  return cidrs.some((cidr) => ipv4InCidr(remote, cidr));
}

function createFinanceApiRoutes({ runtime, clientVersion = "", trustedGatewayAddresses = "", trustedGatewayCidrs = "" }) {
  const dispatcher = createFinanceMcpDispatcher(runtime);
  const uiProbeStore = createUiProbeStore();

  function financeContext(req) {
    const base = { role: "owner", actorRef: "local-ui", financeUserId: "user_xuxin", ledgerId: "daily" };
    const bearer = String(req.headers?.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
    if (bearer && runtime.userBindingService?.resolveAccessToken) {
      const resolved = runtime.userBindingService.resolveAccessToken(bearer);
      if (!resolved) throw new Error("finance_access_token_invalid");
      return {
        role: "owner",
        actorRef: `finance-user:${resolved.user.user_key}`,
        financeUserId: resolved.user.id,
        ledgerId: resolved.ledger.id,
      };
    }
    const sessionId = cookieValue(req, "finance_hermes_session");
    const session = sessionId && runtime.hermesEmbeddedPluginService?.getSession
      ? runtime.hermesEmbeddedPluginService.getSession(sessionId)
      : null;
    if (session && runtime.userBindingService?.resolveUserForHermesContext) {
      const resolved = runtime.userBindingService.resolveUserForHermesContext({
        externalWorkspaceId: session.workspaceId,
        externalUserId: session.externalUserId || "",
      });
      if (!resolved) throw new Error("finance_user_binding_required");
      return {
        role: session.role || "member",
        actorRef: `hermes:${session.workspaceId}`,
        externalWorkspaceId: session.workspaceId,
        externalUserId: session.externalUserId || "",
        financeUserId: resolved.user.id,
        ledgerId: resolved.ledger.id,
      };
    }
    return base;
  }

  function contextForLedger(input = {}, context = {}) {
    return runtime.ledgerService?.contextForLedger
      ? runtime.ledgerService.contextForLedger(input, context)
      : context;
  }

  function requireLoopback(req) {
    if (!isLoopbackAddress(req.socket?.remoteAddress || "")) throw new Error("finance_mcp_dispatch_loopback_only");
  }

  function authorizeMcpWorkspaceContext(inputContext = {}) {
    const source = String(inputContext.source || "");
    const workspaceKey = String(inputContext.workspaceKey || inputContext.workspace_key || "").trim();
    const workspaceId = String(
      inputContext.externalWorkspaceId
        || inputContext.workspaceId
        || inputContext.workspace_id
        || inputContext.actorWorkspaceId
        || "",
    ).trim();
    const requiresWorkspaceKey = source === "finance-mcp-wrapper" || Boolean(workspaceKey);
    if (!requiresWorkspaceKey) return inputContext;
    if (!workspaceId) throw new Error("finance_mcp_workspace_id_required");
    if (!workspaceKey) throw new Error("finance_mcp_workspace_key_required");
    if (runtime.hermesEmbeddedPluginService?.isWorkspaceAuthorized && !runtime.hermesEmbeddedPluginService.isWorkspaceAuthorized(workspaceId)) {
      throw new Error("workspace_not_authorized");
    }
    const clean = { ...inputContext };
    delete clean.workspaceKey;
    delete clean.workspace_key;
    clean.externalWorkspaceId = clean.externalWorkspaceId || workspaceId;
    clean.workspaceId = clean.workspaceId || workspaceId;
    clean.source = "finance-mcp-wrapper";
    return clean;
  }

  function mcpHeaderContext(req = {}) {
    const headers = req.headers || {};
    return {
      source: "finance-mcp-wrapper",
      externalWorkspaceId: headers["x-finance-mcp-workspace-id"] || headers["x-hermes-workspace-id"] || "",
      workspaceId: headers["x-finance-mcp-workspace-id"] || headers["x-hermes-workspace-id"] || "",
      workspace_id: headers["x-finance-mcp-workspace-id"] || headers["x-hermes-workspace-id"] || "",
      workspaceKey: headers["x-finance-mcp-workspace-key"] || "",
      workspace_key: headers["x-finance-mcp-workspace-key"] || "",
    };
  }

  function requireMcpBridgeAccess(req, inputContext = {}) {
    const remoteAddress = req.socket?.remoteAddress || "";
    if (isLoopbackAddress(remoteAddress)) return authorizeMcpWorkspaceContext(inputContext);
    if (!isTrustedGatewayAddress(remoteAddress, { trustedGatewayAddresses, trustedGatewayCidrs })) throw new Error("finance_mcp_dispatch_loopback_only");
    return authorizeMcpWorkspaceContext(inputContext);
  }

  async function handle(req, res, url) {
    try {
      const context = financeContext(req);
      if (req.method === "GET" && url.pathname === "/api/finance/client-version") {
        return sendJson(res, 200, { ok: true, version: clientVersion });
      }
      if (req.method === "GET" && url.pathname === "/api/v1/hermes/plugin/manifest") {
        return sendJson(res, 200, runtime.hermesEmbeddedPluginService.createManifest(req));
      }
      if (req.method === "POST" && url.pathname === "/api/v1/hermes/plugin/launch") {
        const body = await readJson(req);
        const result = runtime.hermesEmbeddedPluginService.createLaunch(body, req);
        return sendJson(res, 200, result);
      }
      if (req.method === "GET" && url.pathname.startsWith("/api/v1/hermes/plugin/launch/")) {
        const token = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) || "");
        const result = runtime.hermesEmbeddedPluginService.consumeLaunchToken(token);
        const location = appendHermesPluginRouteParams(result.entryPath, url);
        res.writeHead(302, {
          location,
          "set-cookie": runtime.hermesEmbeddedPluginService.createSessionCookie(result.sessionId, req),
          "cache-control": "no-store",
        });
        res.end();
        return true;
      }
      if (req.method === "POST" && url.pathname === "/api/v1/hermes/plugin/users/bind") {
        requireLoopback(req);
        const body = await readJson(req);
        const result = runtime.userBindingService.registerHermesWorkspaceUser(body, {
          role: "owner",
          actorRef: body.admin_workspace_id || body.adminWorkspaceId || "hermes-admin",
          externalWorkspaceId: body.admin_workspace_id || body.adminWorkspaceId || "",
        });
        return sendJson(res, 200, { ok: true, result });
      }
      if (req.method === "POST" && url.pathname === "/api/v1/finance/users/access-tokens") {
        requireLoopback(req);
        const body = await readJson(req);
        const result = runtime.userBindingService.createAccessToken(body, context);
        return sendJson(res, 200, { ok: true, result });
      }
      if (req.method === "POST" && url.pathname === "/api/finance/ui-probe") {
        const body = await readJson(req);
        const result = uiProbeStore.save(body, req);
        return sendJson(res, 200, { ok: true, result: { receivedAt: result.receivedAt } });
      }
      if (req.method === "GET" && url.pathname === "/api/finance/ui-probe/latest") {
        return sendJson(res, 200, { ok: true, result: uiProbeStore.getLatest() });
      }
      if (req.method === "GET" && url.pathname === "/api/finance/mcp/schemas") {
        requireMcpBridgeAccess(req, mcpHeaderContext(req));
        return sendJson(res, 200, { ok: true, schemas: TOOL_SCHEMAS });
      }
      if (req.method === "POST" && url.pathname === "/api/finance/mcp/dispatch") {
        const body = await readJson(req);
        const dispatchContext = requireMcpBridgeAccess(req, body.context || {});
        const result = await dispatcher.dispatch(body.tool || body.name, body.args || {}, dispatchContext);
        return sendJson(res, 200, { ok: true, result });
      }
      if (req.method === "POST" && url.pathname === "/api/finance/mcp/register") {
        requireLoopback(req);
        const body = await readJson(req);
        const result = runtime.pluginRegistrationService.registerHermesCallback(body, body.context || {});
        return sendJson(res, 200, { ok: true, result });
      }
      if (req.method === "GET" && url.pathname === "/api/finance/mcp/registration") {
        requireLoopback(req);
        const result = runtime.pluginRegistrationService.getHermesCallback(parseFinanceQuery(url), context);
        return sendJson(res, 200, { ok: true, result });
      }
        if (req.method === "GET" && url.pathname === "/api/finance/ledgers") {
          return sendJson(res, 200, {
            ok: true,
            ledgers: runtime.ledgerService.listLedgers(context),
            currentLedger: runtime.ledgerService.authorizedLedger(parseFinanceQuery(url), context),
            templates: runtime.ledgerService.listLedgerTemplates(),
          });
        }
        if (req.method === "POST" && url.pathname === "/api/finance/ledgers") {
          const body = await readJson(req);
          const result = runtime.ledgerService.createLedger(body, context);
          return sendJson(res, 200, { ok: true, result });
        }
        const shareMatch = url.pathname.match(/^\/api\/finance\/ledgers\/([^/]+)\/share$/);
        if (req.method === "GET" && shareMatch) {
          const result = runtime.ledgerService.getLedgerShare(decodeURIComponent(shareMatch[1]), context);
          return sendJson(res, 200, { ok: true, result });
        }
        if (req.method === "POST" && shareMatch) {
          const body = await readJson(req);
          const result = runtime.ledgerService.shareLedger({ ...body, ledger_id: decodeURIComponent(shareMatch[1]) }, context);
          return sendJson(res, 200, { ok: true, result });
        }
        const joinRequestsMatch = url.pathname.match(/^\/api\/finance\/ledgers\/([^/]+)\/join-requests$/);
        if (req.method === "POST" && joinRequestsMatch) {
          const body = await readJson(req);
          const result = runtime.ledgerService.requestLedgerJoin({ ...body, ledger_id: decodeURIComponent(joinRequestsMatch[1]) }, context);
          return sendJson(res, 200, { ok: true, result });
        }
        const invitationsMatch = url.pathname.match(/^\/api\/finance\/ledgers\/([^/]+)\/invitations$/);
        if (req.method === "POST" && invitationsMatch) {
          const body = await readJson(req);
          const result = runtime.ledgerService.createLedgerInvitation({ ...body, ledger_id: decodeURIComponent(invitationsMatch[1]) }, context);
          return sendJson(res, 200, { ok: true, result });
        }
        if (req.method === "GET" && url.pathname === "/api/finance/ledger-invitations") {
          const result = runtime.ledgerService.listLedgerInvitations(parseFinanceQuery(url), context);
          return sendJson(res, 200, { ok: true, result });
        }
        const invitationAcceptMatch = url.pathname.match(/^\/api\/finance\/ledger-invitations\/([^/]+)\/accept$/);
        if (req.method === "POST" && invitationAcceptMatch) {
          const body = await readJson(req);
          const result = runtime.ledgerService.acceptLedgerInvitation({ ...body, invitation_id: decodeURIComponent(invitationAcceptMatch[1]) }, context);
          return sendJson(res, 200, { ok: true, result });
        }
        if (req.method === "GET" && url.pathname === "/api/finance/ledger-join-requests") {
          const result = runtime.ledgerService.listLedgerJoinRequests(parseFinanceQuery(url), context);
          return sendJson(res, 200, { ok: true, result });
        }
        const joinReviewMatch = url.pathname.match(/^\/api\/finance\/ledger-join-requests\/([^/]+)\/review$/);
        if (req.method === "POST" && joinReviewMatch) {
          const body = await readJson(req);
          const result = runtime.ledgerService.reviewLedgerJoinRequest({ ...body, request_id: decodeURIComponent(joinReviewMatch[1]) }, context);
          return sendJson(res, 200, { ok: true, result });
        }
      if (req.method === "GET" && url.pathname === "/api/finance/overview") {
          const overviewQuery = parseFinanceQuery(url);
          const scopedContext = contextForLedger(overviewQuery, context);
          const ledgerId = scopedContext.ledgerId || "daily";
          const currency = overviewQuery.currency || overviewQuery.filters?.currency || "CNY";
          const summaryOnly = overviewQuery.summary_only === "1" || overviewQuery.summary_only === "true";
          const summary = runtime.reportService.getSummary({ period: "month", currency }, scopedContext);
          const yearSummary = runtime.reportService.getSummary({ period: "year", currency }, scopedContext);
          const report = runtime.reportService.getReport({ period: "all", metric: "expense", dimension: "category", currency }, scopedContext);
          let ownerAssetSummary = null;
          let ownerStockSummary = null;
          try {
            ownerAssetSummary = await runtime.ownerAssetService?.getSummary({ refresh_live_fx: !summaryOnly }, context) || null;
          } catch (err) {
            if (err?.message !== "finance_owner_assets_owner_required") throw err;
          }
          try {
            ownerStockSummary = runtime.ownerStockService?.getSummary({}, context) || null;
          } catch (err) {
            if (err?.message !== "finance_stocks_access_required") throw err;
          }
          const transactions = runtime.transactionService.listTransactions({ ...overviewQuery, limit: overviewQuery.limit || 30 }, scopedContext);
          return sendJson(res, 200, {
            ok: true,
            currentLedger: runtime.repository.getLedger(ledgerId),
            ledgers: runtime.ledgerService.listLedgers(scopedContext),
            summary,
            yearSummary,
            report,
            transactions,
            accounts: runtime.repository.listAccounts(ledgerId),
            currencies: runtime.repository.listCurrencies(),
            categories: runtime.repository.listCategories(ledgerId),
            categoryUsage: runtime.repository.listCategoryUsage({ ledgerId }),
            members: runtime.ledgerService.listVisibleMembers(ledgerId, scopedContext),
            tags: runtime.repository.listTags(ledgerId),
            recurringRules: runtime.recurringService.listRecurringRules(overviewQuery, scopedContext),
            ownerAssetSummary,
            ownerStockSummary,
          });
        }
      if (req.method === "GET" && url.pathname === "/api/finance/owner-assets/summary") {
        const query = parseFinanceQuery(url);
        const result = await runtime.ownerAssetService.getSummary(query, context);
        return sendJson(res, 200, { ok: true, result });
      }
      if (req.method === "GET" && url.pathname === "/api/finance/owner-assets/snapshots") {
        const query = parseFinanceQuery(url);
        const result = runtime.ownerAssetService.listSnapshots(query, context);
        return sendJson(res, 200, { ok: true, result });
      }
      if (req.method === "GET" && url.pathname === "/api/finance/owner-stocks/summary") {
        const query = parseFinanceQuery(url);
        const result = query.live === "1" || query.live === "true"
          ? await runtime.ownerStockService.getLiveSummary(query, context)
          : runtime.ownerStockService.getSummary(query, context);
        return sendJson(res, 200, { ok: true, result });
      }
      if (req.method === "GET" && url.pathname === "/api/finance/owner-stocks/snapshots") {
        const query = parseFinanceQuery(url);
        const result = runtime.ownerStockService.listSnapshots(query, context);
        return sendJson(res, 200, { ok: true, result });
      }
      if (req.method === "GET" && url.pathname === "/api/finance/recurring-rules") {
        const query = parseFinanceQuery(url);
        const result = runtime.recurringService.listRecurringRules(query, contextForLedger(query, context));
        return sendJson(res, 200, { ok: true, rules: result });
      }
      if (req.method === "POST" && url.pathname === "/api/finance/recurring-rules") {
        const body = await readJson(req);
        const result = runtime.recurringService.createRecurringRule(body, contextForLedger({ ...parseFinanceQuery(url), ...body }, context));
        return sendJson(res, 200, { ok: true, result });
      }
      if (req.method === "POST" && url.pathname === "/api/finance/recurring-rules/generate-due") {
        const body = await readJson(req);
        const result = runtime.recurringService.generateDueTransactions(body, contextForLedger({ ...parseFinanceQuery(url), ...body }, context));
        return sendJson(res, 200, { ok: true, result });
      }
      const recurringMatch = url.pathname.match(/^\/api\/finance\/recurring-rules\/([^/]+)$/);
      if ((req.method === "PATCH" || req.method === "PUT") && recurringMatch) {
        const body = await readJson(req);
        const result = runtime.recurringService.updateRecurringRule(decodeURIComponent(recurringMatch[1]), body, contextForLedger({ ...parseFinanceQuery(url), ...body }, context));
        return sendJson(res, 200, { ok: true, result });
      }
      if (req.method === "DELETE" && recurringMatch) {
        const body = await readJson(req);
        const result = runtime.recurringService.deleteRecurringRule(decodeURIComponent(recurringMatch[1]), body, contextForLedger({ ...parseFinanceQuery(url), ...body }, context));
        return sendJson(res, 200, { ok: true, result });
      }
      const recurringStatusMatch = url.pathname.match(/^\/api\/finance\/recurring-rules\/([^/]+)\/(pause|resume)$/);
      if (req.method === "POST" && recurringStatusMatch) {
        const query = parseFinanceQuery(url);
        const status = recurringStatusMatch[2] === "pause" ? "paused" : "active";
        const result = runtime.recurringService.setRecurringRuleStatus(decodeURIComponent(recurringStatusMatch[1]), status, contextForLedger(query, context));
        return sendJson(res, 200, { ok: true, result });
      }
      if (req.method === "POST" && url.pathname === "/api/finance/attachments") {
        const body = await readJson(req, { maxBytes: 16 * 1024 * 1024 });
        const result = runtime.attachmentService.addAttachment(body, contextForLedger({ ...parseFinanceQuery(url), ...body }, context));
        return sendJson(res, 200, { ok: true, result });
      }
      if (req.method === "GET" && url.pathname.startsWith("/api/finance/attachments/") && url.pathname.endsWith("/thumbnail")) {
        const segments = url.pathname.split("/").filter(Boolean);
        const id = decodeURIComponent(segments.at(-2) || "");
        const result = runtime.attachmentService.getAttachmentThumbnail(id, contextForLedger(parseFinanceQuery(url), context));
        sendFile(res, result);
        return true;
      }
      if (req.method === "GET" && url.pathname.startsWith("/api/finance/attachments/")) {
        const id = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) || "");
        const result = runtime.attachmentService.getAttachment(id, contextForLedger(parseFinanceQuery(url), context));
        sendFile(res, result);
        return true;
      }
      if (req.method === "GET" && url.pathname.startsWith("/api/finance/transactions/") && url.pathname.endsWith("/attachments")) {
        const segments = url.pathname.split("/").filter(Boolean);
        const id = decodeURIComponent(segments.at(-2) || "");
        const result = runtime.attachmentService.listTransactionAttachments(id, contextForLedger(parseFinanceQuery(url), context));
        return sendJson(res, 200, { ok: true, attachments: result });
      }
      if (req.method === "GET" && url.pathname === "/api/finance/transactions") {
        const query = parseFinanceQuery(url);
        const scopedContext = contextForLedger(query, context);
        const transactions = runtime.transactionService.listTransactions({ ...query, ...query.filters }, scopedContext);
        return sendJson(res, 200, { ok: true, transactions });
      }
      if (req.method === "GET" && url.pathname === "/api/finance/report") {
        const query = parseFinanceQuery(url);
        const report = runtime.reportService.getReport(query, contextForLedger(query, context));
        return sendJson(res, 200, { ok: true, report });
      }
      if (req.method === "POST" && url.pathname === "/api/finance/transactions") {
        const body = await readJson(req);
        const result = runtime.transactionService.createTransaction(body, contextForLedger({ ...parseFinanceQuery(url), ...body }, context));
        return sendJson(res, 200, { ok: true, result });
      }
      if ((req.method === "PATCH" || req.method === "PUT") && url.pathname.startsWith("/api/finance/transactions/")) {
        const segments = url.pathname.split("/").filter(Boolean);
        if (segments.length === 4) {
          const id = segments.at(-1);
          const body = await readJson(req);
          const result = runtime.transactionService.updateTransaction(id, body, contextForLedger({ ...parseFinanceQuery(url), ...body }, context));
          return sendJson(res, 200, { ok: true, result });
        }
      }
      if (req.method === "POST" && url.pathname.endsWith("/void")) {
        const id = url.pathname.split("/").filter(Boolean).at(-2);
        const body = await readJson(req);
        const result = runtime.transactionService.voidTransaction(id, body.reason || "local-ui", contextForLedger({ ...parseFinanceQuery(url), ...body }, context));
        return sendJson(res, 200, { ok: true, result });
      }
      return false;
    } catch (err) {
      sendJson(res, 400, { ok: false, error: err.message || String(err) });
      return true;
    }
  }

  return { handle };
}

module.exports = {
  createFinanceApiRoutes,
  createUiProbeStore,
  isTrustedGatewayAddress,
  isLoopbackAddress,
  parseFinanceFilters,
};
