"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createHermesEmbeddedPluginService,
  normalizePluginFontSize,
  normalizePluginTheme,
  sanitizePluginAppearance,
  sanitizeRefreshPayload,
  sanitizeRoute,
} = require("../adapters/finance-hermes-embedded-plugin-service");

const EMBEDDED_APP_VERSION = "finance-replica-20260620b";

test("Hermes embedded manifest exposes stable plugin contract", () => {
  const service = createHermesEmbeddedPluginService({ defaultOrigin: "http://127.0.0.1:8791", embeddedAppVersion: EMBEDDED_APP_VERSION });
  const manifest = service.createManifest({
    headers: {
      "x-forwarded-proto": "https",
      "x-forwarded-host": "hermes.example.test",
    },
  });

  assert.equal(manifest.id, "finance");
  assert.equal(manifest.title, "记账");
  assert.equal(manifest.type, "embedded-app");
  assert.equal(manifest.entry, `https://hermes.example.test/finance.html?embed=hermes&v=${EMBEDDED_APP_VERSION}`);
  assert.equal(manifest.launch, "https://hermes.example.test/api/v1/hermes/plugin/launch");
  assert.deepEqual(manifest.toolsets, ["finance"]);
  assert.equal(manifest.mcpServer, "finance");
  assert.deepEqual(manifest.permissions, ["finance:read", "finance:write"]);
  assert.deepEqual(manifest.actions.find((action) => action.id === "record"), {
    id: "record",
    label: "记一笔",
    placement: ["plugin_drawer_frequent", "dock_long_press", "search"],
    priority: 10,
    entry: { type: "plugin_route", pluginRoute: "record" },
  });
  assert.deepEqual(manifest.embedding, {
    state_event: "finance.plugin.navigation",
    back_event: "hermes.plugin.back",
    back_result_event: "finance.plugin.back_result",
    refresh_required_event: "finance.plugin.refresh_required",
    preserve_iframe_state: true,
  });
});

test("Hermes launch exchange keeps long workspace key out of entry URL", () => {
  let current = 1000;
  const service = createHermesEmbeddedPluginService({
    clock: { now: () => current },
    embeddedAppVersion: EMBEDDED_APP_VERSION,
    ownerWorkspaceId: "owner-home",
    tokenTtlMs: 1000,
  });
  const result = service.createLaunch({
    workspace_id: "owner-home",
    workspace_key: "workspace-secret-for-test",
    user_key: "user-secret-for-test",
  });

  assert.equal(result.ok, true);
  assert.match(result.entry_path, /^\/api\/v1\/hermes\/plugin\/launch\/[A-Za-z0-9_-]+$/);
  assert.equal(result.entry_path.includes("workspace-secret-for-test"), false);
  assert.equal(result.entry_path.includes("user-secret-for-test"), false);

  const token = result.entry_path.split("/").at(-1);
  const consumed = service.consumeLaunchToken(token);
  assert.equal(consumed.entryPath, `/finance.html?embed=hermes&v=${EMBEDDED_APP_VERSION}`);
  assert.equal(consumed.session.workspaceId, "owner-home");
  assert.throws(() => service.consumeLaunchToken(token), /launch_token_invalid|launch_token_consumed/);

  const cookie = service.createSessionCookie(consumed.sessionId, { headers: { "x-forwarded-proto": "https" } });
  assert.match(cookie, /finance_hermes_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=None/);
  assert.match(cookie, /Secure/);

  const late = service.createLaunch({ workspace_id: "owner-home", workspace_key: "short-lived" });
  current += 1001;
  assert.throws(() => service.consumeLaunchToken(late.entry_path.split("/").at(-1)), /launch_token_expired/);
});

test("Hermes launch stores only bounded plugin appearance settings in session", () => {
  const service = createHermesEmbeddedPluginService({ ownerWorkspaceId: "owner-home" });
  const result = service.createLaunch({
    workspace_id: "owner-home",
    workspace_key: "workspace-secret-for-test",
    pluginTheme: "light",
    pluginFontSize: "large",
    launchToken: "must-not-appear",
    cookie: "must-not-appear",
  });
  assert.equal(result.entry_path.includes("light"), false);
  assert.equal(result.entry_path.includes("large"), false);
  assert.equal(result.entry_path.includes("must-not-appear"), false);

  const consumed = service.consumeLaunchToken(result.entry_path.split("/").at(-1));
  assert.deepEqual(consumed.session.appearance, { theme: "light", fontSize: "large" });
  assert.deepEqual(service.getSession(consumed.sessionId).appearance, { theme: "light", fontSize: "large" });
});

test("Hermes plugin appearance sanitizer rejects unbounded values", () => {
  assert.equal(normalizePluginTheme("auto"), "");
  assert.equal(normalizePluginTheme("dark"), "dark");
  assert.equal(normalizePluginTheme("javascript:alert(1)"), "");
  assert.equal(normalizePluginFontSize("small"), "compact");
  assert.equal(normalizePluginFontSize("xl"), "xlarge");
  assert.equal(normalizePluginFontSize("999px"), "");
  assert.deepEqual(
    sanitizePluginAppearance({ plugin_theme: "system", plugin_font_size: "extra-large", token: "secret" }),
    { fontSize: "xlarge" },
  );
});

test("Hermes launch requires per-workspace authorization", () => {
  const service = createHermesEmbeddedPluginService({
    ownerWorkspaceId: "owner-home",
    allowedWorkspaces: "family-a",
  });

  assert.doesNotThrow(() => service.createLaunch({ workspace_id: "owner-home", workspace_key: "owner-key" }));
  assert.doesNotThrow(() => service.createLaunch({ workspace_id: "family-a", workspace_key: "member-key" }));
  assert.throws(() => service.createLaunch({ workspace_id: "family-b", workspace_key: "member-key" }), /workspace_not_authorized/);
  assert.throws(() => service.createLaunch({ workspace_id: "family-b", workspace_key: "member-key", role: "owner" }), /workspace_not_authorized/);
});

test("Hermes route and refresh payload sanitizers only keep bounded metadata", () => {
  assert.deepEqual(
    sanitizeRoute({
      name: "ledger-detail",
      depth: 99,
      itemId: "tx-1",
      amount: "999999",
      note: "private",
    }),
    { name: "ledger-detail", depth: 4, itemId: "tx-1" },
  );
  assert.deepEqual(
    sanitizeRefreshPayload({
      reason: "auth_state_changed",
      route: { name: "ledger-detail", depth: 1, itemId: "tx-1", rawContent: "private" },
      token: "must-not-forward",
    }),
    { reason: "auth_state_changed", route: { name: "ledger-detail", depth: 1, itemId: "tx-1" } },
  );
});

test("Hermes refresh notifications are throttled", () => {
  let current = 1000;
  const service = createHermesEmbeddedPluginService({ clock: { now: () => current } });
  assert.equal(service.shouldSendRefresh(), false);
  current += 30000;
  assert.equal(service.shouldSendRefresh(), true);
  assert.equal(service.shouldSendRefresh(), false);
});
