"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PassThrough } = require("node:stream");
const test = require("node:test");

process.env.FINANCE_MCP_DB_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "finance-server-module-")),
  "finance.sqlite3",
);

const { financeAppearanceBootstrap, renderFinanceHtml, resolveClientVersion, resolveEmbeddedAppVersion, resolveListenConfig } = require("../server");
const { createFinanceApiRoutes, createUiProbeStore, isLoopbackAddress, isTrustedGatewayAddress } = require("../server-routes/finance-api-routes");
const { createHermesEmbeddedPluginService } = require("../adapters/finance-hermes-embedded-plugin-service");
const { normalizeHermesCallbackUrl } = require("../adapters/finance-plugin-registration-service");
const { createTestRuntime } = require("./helpers");

const TRUSTED_GATEWAY_ENV_KEYS = [
  "FINANCE_MCP_TRUSTED_GATEWAY_ADDRESSES",
  "FINANCE_MCP_TRUSTED_GATEWAY_CIDRS",
];

async function withCleanTrustedGatewayEnv(callback) {
  const previous = new Map(TRUSTED_GATEWAY_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of TRUSTED_GATEWAY_ENV_KEYS) delete process.env[key];
  try {
    return await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function invokeRoute(routes, { method = "GET", path = "/", headers = {}, body = "", remoteAddress = "127.0.0.1" }) {
  const req = new PassThrough();
  req.method = method;
  req.headers = { host: "127.0.0.1:8791", ...headers };
  req.socket = { remoteAddress };
  const chunks = [];
  const res = {
    status: 0,
    headers: {},
    writeHead(status, responseHeaders = {}) {
      this.status = status;
      this.headers = responseHeaders;
    },
    end(chunk = "") {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      this.ended = true;
    },
  };
  const url = new URL(path, "http://127.0.0.1:8791");
  const pending = routes.handle(req, res, url);
  req.end(body);
  await pending;
  const text = Buffer.concat(chunks).toString("utf8");
  const contentType = String(res.headers["content-type"] || "");
  return { status: res.status, headers: res.headers, text, json: text && contentType.includes("application/json") ? JSON.parse(text) : null };
}

test("server defaults to LAN binding", () => {
  assert.deepEqual(resolveListenConfig({}), {
    host: "0.0.0.0",
    port: 8787,
  });
});

test("server accepts explicit finance listen overrides", () => {
  assert.deepEqual(
    resolveListenConfig({
      FINANCE_MCP_HOST: "127.0.0.1",
      FINANCE_MCP_PORT: "8791",
      HOST: "0.0.0.0",
      PORT: "8787",
    }),
    {
      host: "127.0.0.1",
      port: 8791,
    },
  );
});

test("server falls back to generic host and port overrides", () => {
  assert.deepEqual(
    resolveListenConfig({
      HOST: "192.168.10.20",
      PORT: "8899",
    }),
    {
      host: "192.168.10.20",
      port: 8899,
    },
  );
});

test("server exposes stable client version signature", () => {
  const version = resolveClientVersion();
  assert.equal(typeof version, "string");
  assert.equal(version.length > 20, true);
});

test("finance MCP HTTP bridge is loopback scoped", async () => withCleanTrustedGatewayEnv(async () => {
  assert.equal(isLoopbackAddress("127.0.0.1"), true);
  assert.equal(isLoopbackAddress("::1"), true);
  assert.equal(isLoopbackAddress("::ffff:127.0.0.1"), true);
  assert.equal(isLoopbackAddress("192.168.10.108"), false);
  assert.equal(isLoopbackAddress("10.0.0.20"), false);
  assert.equal(isTrustedGatewayAddress("172.27.192.10", { trustedGatewayCidrs: "172.16.0.0/12" }), true);
  assert.equal(isTrustedGatewayAddress("192.168.10.108", { trustedGatewayAddresses: "192.168.10.108" }), true);
  assert.equal(isTrustedGatewayAddress("192.168.10.109", { trustedGatewayAddresses: "192.168.10.108" }), false);
}));

test("UI probe store keeps only the latest layout probe", () => {
  const store = createUiProbeStore();
  assert.equal(store.getLatest(), null);

  const first = store.save(
    { activeView: "home", viewport: { innerWidth: 390, innerHeight: 844 } },
    { socket: { remoteAddress: "192.168.10.20" }, headers: { "user-agent": "first-device" } },
  );
  assert.equal(first.probe.activeView, "home");
  assert.equal(first.remoteAddress, "192.168.10.20");
  assert.equal(first.userAgent, "first-device");
  assert.equal(typeof first.receivedAt, "string");

  const second = store.save(
    { activeView: "entry", fullCategoryRowsBeforeNote: 3 },
    { socket: { remoteAddress: "127.0.0.1" }, headers: { "user-agent": "desktop-harness" } },
  );
  assert.equal(store.getLatest(), second);
  assert.equal(store.getLatest().probe.activeView, "entry");
  assert.equal(store.getLatest().probe.fullCategoryRowsBeforeNote, 3);
});

test("Hermes embedded manifest endpoint returns plugin shape", async () => {
  const embeddedAppVersion = resolveEmbeddedAppVersion(path.resolve(__dirname, "..", "public"));
  const routes = createFinanceApiRoutes({
    runtime: {
      hermesEmbeddedPluginService: createHermesEmbeddedPluginService({ defaultOrigin: "http://127.0.0.1:8791", embeddedAppVersion }),
    },
  });
  const response = await invokeRoute(routes, {
    path: "/api/v1/hermes/plugin/manifest",
    headers: { "x-forwarded-proto": "https", "x-forwarded-host": "hermes.example.test" },
  });
  assert.equal(response.status, 200);
  assert.equal(response.json.id, "finance");
  assert.equal(response.json.entry, `https://hermes.example.test/finance.html?embed=hermes&v=${embeddedAppVersion}`);
  assert.equal(response.json.embedding.back_event, "hermes.plugin.back");
});

test("Hermes launch route returns one-time entry path and sets session cookie", async () => {
  const embeddedAppVersion = resolveEmbeddedAppVersion(path.resolve(__dirname, "..", "public"));
  const routes = createFinanceApiRoutes({
    runtime: {
      hermesEmbeddedPluginService: createHermesEmbeddedPluginService({ ownerWorkspaceId: "owner-home", embeddedAppVersion }),
    },
  });
  const launch = await invokeRoute(routes, {
    method: "POST",
    path: "/api/v1/hermes/plugin/launch",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspace_id: "owner-home", workspace_key: "route-secret" }),
  });
  assert.equal(launch.status, 200);
  assert.match(launch.json.entry_path, /^\/api\/v1\/hermes\/plugin\/launch\/[A-Za-z0-9_-]+$/);
  assert.equal(launch.json.entry_path.includes("route-secret"), false);

  const redirect = await invokeRoute(routes, {
    path: `${launch.json.entry_path}?pluginActionId=record&pluginRoute=record&pluginItemId=item-1&workspace_key=must-not-forward`,
    headers: { "x-forwarded-proto": "https" },
  });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.location, `/finance.html?embed=hermes&v=${embeddedAppVersion}&pluginActionId=record&pluginRoute=record&pluginItemId=item-1`);
  assert.equal(redirect.headers.location.includes("workspace_key"), false);
  assert.match(redirect.headers["set-cookie"], /finance_hermes_session=/);
  assert.match(redirect.headers["set-cookie"], /SameSite=None/);
  assert.match(redirect.headers["set-cookie"], /Secure/);
});

test("finance HTML injects only bounded Hermes appearance before first bootstrap script", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "..", "public", "finance.html"), "utf8");
  const rendered = renderFinanceHtml(html, { theme: "dark", fontSize: "compact", token: "must-not-render" });
  const injectedIndex = rendered.indexOf("window.__FINANCE_PLUGIN_APPEARANCE__");
  const bootstrapIndex = rendered.indexOf("var appearance = window.__FINANCE_PLUGIN_APPEARANCE__");
  const stylesheetIndex = rendered.indexOf('rel="stylesheet"');

  assert.equal(financeAppearanceBootstrap({}), "");
  assert.notEqual(injectedIndex, -1);
  assert.equal(rendered.includes("must-not-render"), false);
  assert.equal(injectedIndex < bootstrapIndex, true);
  assert.equal(bootstrapIndex < stylesheetIndex, true);
  assert.match(rendered, /"theme":"dark"/);
  assert.match(rendered, /"fontSize":"compact"/);
});

test("Hermes callback URL registration accepts HTTPS and loopback HTTP only", () => {
  assert.equal(
    normalizeHermesCallbackUrl("https://hermes.example.test/mobile/callback"),
    "https://hermes.example.test/mobile/callback",
  );
  assert.equal(
    normalizeHermesCallbackUrl("http://127.0.0.1:8080/callback"),
    "http://127.0.0.1:8080/callback",
  );
  assert.throws(() => normalizeHermesCallbackUrl("http://hermes.example.test/callback"), /callback_url_must_be_https_or_loopback_http/);
  assert.throws(() => normalizeHermesCallbackUrl("https://user:pass@hermes.example.test/callback"), /callback_url_credentials_forbidden/);
});

test("Hermes approved workspace binding creates a finance user", async () => {
  const runtime = createTestRuntime();
  const routes = createFinanceApiRoutes({ runtime });
  const response = await invokeRoute(routes, {
    method: "POST",
    path: "/api/v1/hermes/plugin/users/bind",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ target_workspace_id: "approved-workspace", display_name: "Approved Workspace" }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.json.ok, true);
  assert.equal(response.json.result.user.display_name, "Approved Workspace");
  assert.notEqual(response.json.result.ledger.id, "daily");

  const launch = await invokeRoute(routes, {
    method: "POST",
    path: "/api/v1/hermes/plugin/launch",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspace_id: "approved-workspace", workspace_key: "workspace-secret" }),
  });
  assert.equal(launch.status, 200);
  runtime.close();
});

test("Hermes workspace binding route is loopback only", async () => {
  const runtime = createTestRuntime();
  const routes = createFinanceApiRoutes({ runtime });
  const response = await invokeRoute(routes, {
    method: "POST",
    path: "/api/v1/hermes/plugin/users/bind",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ target_workspace_id: "remote-workspace" }),
    remoteAddress: "192.168.10.20",
  });
  assert.equal(response.status, 400);
  assert.equal(response.json.ok, false);
  assert.match(response.json.error, /loopback_only/);
  runtime.close();
});

test("Finance MCP dispatch requires workspace-local key for wrapper context and strips it before dispatcher", async () => {
  const runtime = createTestRuntime();
  const registered = runtime.userBindingService.registerHermesWorkspaceUser({
    target_workspace_id: "wrapper-workspace",
    display_name: "Wrapper Workspace",
  }, { role: "owner", actorRef: "admin" });
  const routes = createFinanceApiRoutes({ runtime });

  const missingKey = await invokeRoute(routes, {
    method: "POST",
    path: "/api/finance/mcp/dispatch",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tool: "finance.list_ledgers",
      args: {},
      context: { source: "finance-mcp-wrapper", workspace_id: "wrapper-workspace" },
    }),
  });
  assert.equal(missingKey.status, 400);
  assert.match(missingKey.json.error, /finance_mcp_workspace_key_required/);

  const listed = await invokeRoute(routes, {
    method: "POST",
    path: "/api/finance/mcp/dispatch",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tool: "finance.list_ledgers",
      args: {},
      context: { source: "finance-mcp-wrapper", workspace_id: "wrapper-workspace", workspace_key: "fixture-workspace-key" },
    }),
  });
  assert.equal(listed.status, 200);
  assert.equal(listed.json.ok, true);
  assert.equal(listed.json.result.ledgers.some((ledger) => ledger.id === registered.ledger.id), true);
  runtime.close();
});

test("Finance MCP bridge allows trusted WSL Gateway source only with workspace context", async () => withCleanTrustedGatewayEnv(async () => {
  const runtime = createTestRuntime();
  try {
    runtime.userBindingService.registerHermesWorkspaceUser({
      target_workspace_id: "wsl-workspace",
      display_name: "WSL Workspace",
    }, { role: "owner", actorRef: "admin" });
    const routes = createFinanceApiRoutes({
      runtime,
      trustedGatewayCidrs: "172.16.0.0/12",
    });

    const denied = await invokeRoute(routes, {
      path: "/api/finance/mcp/schemas",
      remoteAddress: "192.168.10.50",
    });
    assert.equal(denied.status, 400);
    assert.match(denied.json.error, /finance_mcp_dispatch_loopback_only/);

    const missingContext = await invokeRoute(routes, {
      path: "/api/finance/mcp/schemas",
      remoteAddress: "172.27.192.20",
    });
    assert.equal(missingContext.status, 400);
    assert.match(missingContext.json.error, /finance_mcp_workspace_id_required|finance_mcp_workspace_key_required/);

    const schemas = await invokeRoute(routes, {
      path: "/api/finance/mcp/schemas",
      headers: {
        "x-finance-mcp-workspace-id": "wsl-workspace",
        "x-finance-mcp-workspace-key": "fixture-workspace-key",
      },
      remoteAddress: "172.27.192.20",
    });
    assert.equal(schemas.status, 200);
    assert.equal(schemas.json.schemas.some((schema) => schema.name === "finance.list_ledgers"), true);

    const listed = await invokeRoute(routes, {
      method: "POST",
      path: "/api/finance/mcp/dispatch",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tool: "finance.list_ledgers",
        args: {},
        context: { source: "finance-mcp-wrapper", workspace_id: "wsl-workspace", workspace_key: "fixture-workspace-key" },
      }),
      remoteAddress: "172.27.192.20",
    });
    assert.equal(listed.status, 200);
    assert.equal(listed.json.ok, true);
  } finally {
    runtime.close();
  }
}));

test("independent finance access token scopes UI API to the token user", async () => {
  const runtime = createTestRuntime();
  const routes = createFinanceApiRoutes({ runtime });
  const issued = await invokeRoute(routes, {
    method: "POST",
    path: "/api/v1/finance/users/access-tokens",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ finance_user_key: "xuxin", label: "test login" }),
  });
  assert.equal(issued.status, 200);
  assert.match(issued.json.result.accessToken, /^fin_/);

  const overview = await invokeRoute(routes, {
    path: "/api/finance/overview",
    headers: { authorization: `Bearer ${issued.json.result.accessToken}` },
  });
  assert.equal(overview.status, 200);
  assert.equal(overview.json.ok, true);
  runtime.close();
});

test("owner asset UI API is visible only to Owner", async () => {
  const runtime = createTestRuntime({
    stockQuoteProvider: (symbol) => (symbol === "CNY=X" ? 7.25 : 1),
  });
  runtime.ownerAssetService.upsertSnapshot({
    year: 2026,
    total_assets_cny_minor: 127698709300,
    usd_cagr_bps: 2308,
    components: [{ component_key: "usd_account", currency: "USD", amount_minor: 15068062500, amount_cny_minor: 102462825000 }],
  }, { role: "owner", financeUserId: "user_xuxin", actorRef: "route-test" });
  const routes = createFinanceApiRoutes({ runtime });

  const ownerOverview = await invokeRoute(routes, { path: "/api/finance/overview" });
  assert.equal(ownerOverview.status, 200);
  assert.equal(ownerOverview.json.ownerAssetSummary.latest.year, 2026);
  assert.equal(ownerOverview.json.ownerAssetSummary.latest.current_usd_cny_rate, "7.25");
  assert.equal(ownerOverview.json.ownerAssetSummary.latest.current_total_assets_usd_minor, Math.round(127698709300 / 7.25));
  assert.equal(ownerOverview.json.ownerAssetSummary.snapshots.length, 1);

  const registered = runtime.userBindingService.registerHermesWorkspaceUser({
    target_workspace_id: "asset-non-owner",
    display_name: "Asset Non Owner",
  }, { role: "owner", actorRef: "admin" });
  const issued = await invokeRoute(routes, {
    method: "POST",
    path: "/api/v1/finance/users/access-tokens",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ finance_user_id: registered.user.id, label: "asset scoped login" }),
  });
  const nonOwnerOverview = await invokeRoute(routes, {
    path: "/api/finance/overview",
    headers: { authorization: `Bearer ${issued.json.result.accessToken}` },
  });
  assert.equal(nonOwnerOverview.status, 200);
  assert.equal(nonOwnerOverview.json.ownerAssetSummary, null);

  const denied = await invokeRoute(routes, {
    path: "/api/finance/owner-assets/summary",
    headers: { authorization: `Bearer ${issued.json.result.accessToken}` },
  });
  assert.equal(denied.status, 400);
  assert.equal(denied.json.error, "finance_owner_assets_owner_required");
  runtime.close();
});

test("stock UI API exposes live user-partitioned stock summary", async () => {
  const runtime = createTestRuntime({
    stockQuoteProvider: (symbol) => ({
      "0700.HK": 510,
      "HKD=X": 7.8,
      "TSLA": 320,
    }[symbol] || 1),
  });
  runtime.ownerStockService.upsertSnapshot({
    as_of_date: "2026-06-11",
    positions: [
      { position_key: "tencent_hk", label: "腾讯控股", ticker: "0700.HK", currency: "HKD", quantity_wan: 1, average_cost: 250, opening_price: 400, current_price: 500, fx_to_base_rate: 7.8 },
    ],
  }, { role: "owner", financeUserId: "user_xuxin" });
  const routes = createFinanceApiRoutes({ runtime });

  const ownerOverview = await invokeRoute(routes, { path: "/api/finance/overview" });
  assert.equal(ownerOverview.status, 200);
  assert.equal(ownerOverview.json.ownerStockSummary.live, undefined);
  assert.equal(ownerOverview.json.ownerStockSummary.latest.positions[0].current_price_minor, 50000);

  const liveSummary = await invokeRoute(routes, { path: "/api/finance/owner-stocks/summary?live=1" });
  assert.equal(liveSummary.status, 200);
  assert.equal(liveSummary.json.result.persisted, false);
  assert.equal(liveSummary.json.result.latest.positions[0].fx_to_base_ppm, 7800000);
  runtime.close();
});

test("overview summary_only avoids live asset and stock refresh for fast embedded loading", async () => {
  let quoteCount = 0;
  const runtime = createTestRuntime({
    stockQuoteProvider: (symbol) => {
      quoteCount += 1;
      return { "0700.HK": 510, "HKD=X": 7.8 }[symbol] || 1;
    },
  });
  runtime.ownerAssetService.upsertSnapshot({
    year: 2026,
    as_of_date: "2026-06-11",
    fx_usd_cny_rate: 7.25,
    total_assets_cny: 725,
    components: [
      { component_key: "usd_account", label: "美元账户", currency: "USD", amount: 100 },
      { component_key: "cny_bank", label: "银行", currency: "CNY", amount: 725 },
    ],
  }, { role: "owner", financeUserId: "user_xuxin" });
  runtime.ownerStockService.upsertSnapshot({
    as_of_date: "2026-06-11",
    positions: [
      { position_key: "tencent_hk", label: "腾讯控股", ticker: "0700.HK", currency: "HKD", quantity_wan: 1, average_cost: 250, opening_price: 400, current_price: 500, fx_to_base_rate: 7.8 },
    ],
  }, { role: "owner", financeUserId: "user_xuxin" });
  const routes = createFinanceApiRoutes({ runtime });

  const summaryOnly = await invokeRoute(routes, { path: "/api/finance/overview?currency=HKD&summary_only=1" });
  assert.equal(summaryOnly.status, 200);
  assert.equal(summaryOnly.json.ok, true);
  assert.ok(summaryOnly.json.ownerAssetSummary);
  assert.equal(summaryOnly.json.ownerAssetSummary.latest.current_fx_error, undefined);
  assert.ok(summaryOnly.json.ownerStockSummary);
  assert.equal(summaryOnly.json.ownerStockSummary.live, undefined);
  assert.ok(Array.isArray(summaryOnly.json.transactions));
  assert.ok(Array.isArray(summaryOnly.json.accounts));
  assert.ok(Array.isArray(summaryOnly.json.categories));
  assert.equal(summaryOnly.json.summary.appliedFilters.currency, "HKD");
  assert.equal(quoteCount, 0);

  const liveAsset = await invokeRoute(routes, { path: "/api/finance/owner-assets/summary?refresh_live_fx=1" });
  assert.equal(liveAsset.status, 200);
  assert.equal(quoteCount, 1);
  runtime.close();
});

test("scoped finance access token cannot override ledger through UI API", async () => {
  const runtime = createTestRuntime();
  const registered = runtime.userBindingService.registerHermesWorkspaceUser({
    target_workspace_id: "token-workspace",
    display_name: "Token Workspace",
  }, { role: "owner", actorRef: "admin" });
  const routes = createFinanceApiRoutes({ runtime });
  const issued = await invokeRoute(routes, {
    method: "POST",
    path: "/api/v1/finance/users/access-tokens",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ finance_user_id: registered.user.id, label: "scoped login" }),
  });

  const created = await invokeRoute(routes, {
    method: "POST",
    path: "/api/finance/transactions",
    headers: { "content-type": "application/json", authorization: `Bearer ${issued.json.result.accessToken}` },
    body: JSON.stringify({ ledger_id: "daily", type: "expense", amount: "8.00" }),
  });
  assert.equal(created.status, 200);
  assert.equal(created.json.result.transaction.ledgerId, registered.ledger.id);

  const overview = await invokeRoute(routes, {
    path: "/api/finance/overview?ledger_id=daily",
    headers: { authorization: `Bearer ${issued.json.result.accessToken}` },
  });
  assert.equal(overview.status, 200);
  assert.equal(overview.json.summary.ledgerId, registered.ledger.id);
  assert.equal(overview.json.accounts.every((row) => row.ledger_id === registered.ledger.id), true);
  assert.equal(overview.json.categories.every((row) => row.ledger_id === registered.ledger.id), true);
  assert.equal(overview.json.members.every((row) => row.ledger_id === registered.ledger.id), true);
  runtime.close();
});

test("UI API updates and voids transactions through the transaction service", async () => {
  const runtime = createTestRuntime();
  const routes = createFinanceApiRoutes({ runtime });
  const created = await invokeRoute(routes, {
    method: "POST",
    path: "/api/finance/transactions",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "expense", amount: "10", note: "before" }),
  });
  assert.equal(created.status, 200);
  const id = created.json.result.transaction.id;

  const updated = await invokeRoute(routes, {
    method: "PATCH",
    path: `/api/finance/transactions/${id}`,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "expense", amount: "12", note: "after" }),
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.json.result.transaction.id, id);
  assert.equal(updated.json.result.transaction.amountMinor, 1200);
  assert.equal(updated.json.result.transaction.note, "after");

  const removed = await invokeRoute(routes, {
    method: "POST",
    path: `/api/finance/transactions/${id}/void`,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: "ui-test" }),
  });
  assert.equal(removed.status, 200);
  assert.equal(removed.json.result.alreadyVoided, false);

  const listed = await invokeRoute(routes, { path: "/api/finance/transactions" });
  assert.equal(listed.status, 200);
  assert.equal(listed.json.transactions.some((row) => row.id === id), false);
  runtime.close();
});

test("overview exposes category usage and attachment routes preserve file content type", async () => {
  const runtime = createTestRuntime();
  const routes = createFinanceApiRoutes({ runtime });
  const created = await invokeRoute(routes, {
    method: "POST",
    path: "/api/finance/transactions",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "expense", amount: "16", category_hint: "餐饮" }),
  });
  assert.equal(created.status, 200);
  const transactionId = created.json.result.transaction.id;

  const overview = await invokeRoute(routes, { path: "/api/finance/overview" });
  assert.equal(overview.status, 200);
  assert.equal(overview.json.yearSummary.appliedFilters.period, "year");
  assert.ok(overview.json.categoryUsage.some((row) => row.type === "expense" && Number(row.transaction_count) >= 1));

  const uploaded = await invokeRoute(routes, {
    method: "POST",
    path: "/api/finance/attachments",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      transaction_id: transactionId,
      file_name: "receipt.png",
      mime_type: "image/png",
      data_base64: Buffer.from("png-body", "utf8").toString("base64"),
    }),
  });
  assert.equal(uploaded.status, 200);
  assert.equal(uploaded.json.result.transactionId, transactionId);
  assert.equal(uploaded.json.result.isImage, true);
  assert.equal(uploaded.json.result.ledgerId, "daily");
  assert.match(uploaded.json.result.url, /\?ledger_id=daily$/);
  assert.match(uploaded.json.result.thumbnailUrl, /\/thumbnail\?ledger_id=daily$/);
  const storedBlob = runtime.imageStore.getOriginal(uploaded.json.result.id);
  assert.equal(storedBlob.mimeType, "image/png");
  assert.equal(storedBlob.buffer.toString("utf8"), "png-body");

  const listed = await invokeRoute(routes, { path: `/api/finance/transactions/${transactionId}/attachments` });
  assert.equal(listed.status, 200);
  assert.equal(listed.json.attachments.length, 1);
  assert.equal(listed.json.attachments[0].isImage, true);
  assert.equal(listed.json.attachments[0].thumbnailUrl, uploaded.json.result.thumbnailUrl);

  const file = await invokeRoute(routes, { path: uploaded.json.result.url });
  assert.equal(file.status, 200);
  assert.equal(file.headers["content-type"], "image/png");
  assert.equal(file.text, "png-body");

  const thumbnail = await invokeRoute(routes, { path: uploaded.json.result.thumbnailUrl });
  assert.equal(thumbnail.status, 200);
  assert.match(thumbnail.headers["content-type"], /^image\//);

  const transactions = await invokeRoute(routes, { path: "/api/finance/transactions" });
  assert.equal(transactions.status, 200);
  const projected = transactions.json.transactions.find((row) => row.id === transactionId);
  assert.equal(projected.attachmentCount, 1);
  assert.equal(projected.imageAttachmentCount, 1);
  assert.equal(projected.firstImageAttachmentId, uploaded.json.result.id);
  assert.equal(projected.firstImageUrl, uploaded.json.result.url);
  assert.equal(projected.firstImageThumbnailUrl, uploaded.json.result.thumbnailUrl);

  const fileWithLedger = await invokeRoute(routes, { path: `${uploaded.json.result.url}` });
  assert.equal(fileWithLedger.status, 200);
  assert.equal(fileWithLedger.headers["content-type"], "image/png");
  runtime.close();
});

test("UI API lists, creates, and switches ledgers for the current finance user", async () => {
  const runtime = createTestRuntime();
  const routes = createFinanceApiRoutes({ runtime });

  const ledgers = await invokeRoute(routes, { path: "/api/finance/ledgers" });
  assert.equal(ledgers.status, 200);
  assert.equal(ledgers.json.ledgers[0].name, "日常账本");

  const created = await invokeRoute(routes, {
    method: "POST",
    path: "/api/finance/ledgers",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "旅行账本" }),
  });
  assert.equal(created.status, 200);
  assert.equal(created.json.result.ledger.name, "旅行账本");

  const transaction = await invokeRoute(routes, {
    method: "POST",
    path: `/api/finance/transactions?ledger_id=${encodeURIComponent(created.json.result.ledger.id)}`,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "expense", amount: "20", account_hint: "现金" }),
  });
  assert.equal(transaction.status, 200);
  assert.equal(transaction.json.result.transaction.ledgerId, created.json.result.ledger.id);

  const overview = await invokeRoute(routes, { path: `/api/finance/overview?ledger_id=${encodeURIComponent(created.json.result.ledger.id)}` });
  assert.equal(overview.status, 200);
  assert.equal(overview.json.currentLedger.name, "旅行账本");
  assert.equal(overview.json.transactions.length, 1);
  runtime.close();
});

test("UI API exposes all member dimensions to shared ledger users", async () => {
  const runtime = createTestRuntime();
  const routes = createFinanceApiRoutes({ runtime });
  const invited = runtime.repository.upsertFinanceUser({
    id: "user_share_route",
    userKey: "share_route",
    displayName: "Share Route",
  });
  const ledger = runtime.ledgerService.authorizedLedger({}, { financeUserId: "user_xuxin" });
  const members = runtime.repository.listMembers(ledger.id);

  const shared = await invokeRoute(routes, {
    method: "POST",
    path: `/api/finance/ledgers/${ledger.id}/share`,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ finance_user_id: invited.id, role: "viewer" }),
  });
  assert.equal(shared.status, 200);

  const issued = await invokeRoute(routes, {
    method: "POST",
    path: "/api/v1/finance/users/access-tokens",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ finance_user_id: invited.id, label: "shared route" }),
  });
  const shareRead = await invokeRoute(routes, {
    path: `/api/finance/ledgers/${ledger.id}/share`,
    headers: { authorization: `Bearer ${issued.json.result.accessToken}` },
  });
  assert.equal(shareRead.status, 200);
  assert.equal(shareRead.json.result.access_role, "viewer");
  assert.deepEqual(shareRead.json.result.member_candidates.map((row) => row.id).sort(), members.map((row) => row.id).sort());
  assert.equal(shareRead.json.result.member_scope, "all_shared_ledger_members");
  assert.equal(shareRead.json.result.shared_users.length, 0);
  runtime.close();
});

test("UI API creates host-mediated ledger invitation and accepts it by current user context", async () => {
  const runtime = createTestRuntime();
  const routes = createFinanceApiRoutes({ runtime });
  const invited = runtime.repository.upsertFinanceUser({
    id: "user_share_key_route",
    userKey: "test-account",
    displayName: "Test Account",
  });
  const ledger = runtime.ledgerService.authorizedLedger({}, { financeUserId: "user_xuxin" });
  const created = await invokeRoute(routes, {
    method: "POST",
    path: `/api/finance/ledgers/${ledger.id}/invitations`,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ target_finance_user_id: invited.id, role: "editor" }),
  });
  assert.equal(created.status, 200);
  assert.equal(created.json.result.hermes_inbox_event.type, "finance.ledger_invitation_request");
  assert.equal(created.json.result.hermes_inbox_event.target.finance_user_id, invited.id);

  const issued = await invokeRoute(routes, {
    method: "POST",
    path: "/api/v1/finance/users/access-tokens",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ finance_user_id: invited.id, label: "invite accept" }),
  });
  const pending = await invokeRoute(routes, {
    path: "/api/finance/ledger-invitations?status=pending",
    headers: { authorization: `Bearer ${issued.json.result.accessToken}` },
  });
  assert.equal(pending.status, 200);
  assert.equal(pending.json.result.invitations.length, 1);
  assert.equal(pending.json.result.invitations[0].id, created.json.result.invitation.id);
  assert.equal(pending.json.result.invitations[0].ledger_name, ledger.name);

  const accepted = await invokeRoute(routes, {
    method: "POST",
    path: `/api/finance/ledger-invitations/${created.json.result.invitation.id}/accept`,
    headers: { "content-type": "application/json", authorization: `Bearer ${issued.json.result.accessToken}` },
    body: "{}",
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.json.result.membership.finance_user_id, invited.id);
  assert.equal(accepted.json.result.membership.role, "editor");
  runtime.close();
});

test("UI API supports ledger join request and owner review without invite links", async () => {
  const runtime = createTestRuntime();
  const routes = createFinanceApiRoutes({ runtime });
  const requester = runtime.repository.upsertFinanceUser({
    id: "user_join_route",
    userKey: "join_route",
    displayName: "Join Route",
  });
  const ledger = runtime.ledgerService.authorizedLedger({}, { financeUserId: "user_xuxin" });
  const issued = await invokeRoute(routes, {
    method: "POST",
    path: "/api/v1/finance/users/access-tokens",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ finance_user_id: requester.id, label: "join requester" }),
  });

  const requested = await invokeRoute(routes, {
    method: "POST",
    path: `/api/finance/ledgers/${ledger.id}/join-requests`,
    headers: { "content-type": "application/json", authorization: `Bearer ${issued.json.result.accessToken}` },
    body: JSON.stringify({ role: "viewer" }),
  });
  assert.equal(requested.status, 200);
  assert.equal(requested.json.result.hermes_inbox_event.type, "finance.ledger_join_request");
  assert.equal(Object.prototype.hasOwnProperty.call(requested.json.result.hermes_inbox_event, "url"), false);

  const listed = await invokeRoute(routes, { path: "/api/finance/ledger-join-requests" });
  assert.equal(listed.status, 200);
  assert.equal(listed.json.result.requests.length, 1);

  const reviewed = await invokeRoute(routes, {
    method: "POST",
    path: `/api/finance/ledger-join-requests/${requested.json.result.request.id}/review`,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision: "approve" }),
  });
  assert.equal(reviewed.status, 200);
  assert.equal(reviewed.json.result.member_scope, "all_shared_ledger_members");
  assert.equal(reviewed.json.result.request.status, "approved");
  assert.equal(reviewed.json.result.membership.finance_user_id, requester.id);
  runtime.close();
});

test("UI API creates and generates recurring rules", async () => {
  const runtime = createTestRuntime();
  const routes = createFinanceApiRoutes({ runtime });
  const created = await invokeRoute(routes, {
    method: "POST",
    path: "/api/finance/recurring-rules",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Route recurring",
      type: "expense",
      amount: "18.00",
      account_hint: "现金",
      category_hint: "居家",
      frequency: "monthly",
      start_at: "2026-03-02",
    }),
  });
  assert.equal(created.status, 200);
  assert.equal(created.json.result.rule.title, "Route recurring");

  const generated = await invokeRoute(routes, {
    method: "POST",
    path: "/api/finance/recurring-rules/generate-due",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ through_at: "2026-03-03T00:00:00.000Z" }),
  });
  assert.equal(generated.status, 200);
  assert.equal(generated.json.result.count, 1);

  const listed = await invokeRoute(routes, { path: "/api/finance/recurring-rules" });
  assert.equal(listed.status, 200);
  assert.equal(listed.json.rules.some((row) => row.id === created.json.result.rule.id), true);
  runtime.close();
});
