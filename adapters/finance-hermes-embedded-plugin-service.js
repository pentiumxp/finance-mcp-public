"use strict";

const crypto = require("node:crypto");

const PLUGIN_ID = "finance";
const PLUGIN_TITLE = "记账";
const TOOLSETS = ["finance"];
const PERMISSIONS = ["finance:read", "finance:write"];
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const COOKIE_NAME = "finance_hermes_session";
const REFRESH_THROTTLE_MS = 30000;
const DEFAULT_EMBEDDED_APP_VERSION = "finance-replica-20260620d";
const ROUTE_KEYS = new Set(["name", "depth", "itemId"]);
const THEME_VALUES = new Set(["light", "dark"]);
const FONT_SIZE_VALUES = new Set(["compact", "normal", "large", "xlarge"]);
const HERMES_PLUGIN_ACTIONS = Object.freeze([
  { id: "record", label: "记一笔", route: "record", priority: 10 },
  { id: "voice_record", label: "一句话记账", route: "voice_record", priority: 20 },
  { id: "month_stats", label: "本月统计", route: "month_stats", priority: 30 },
  { id: "year_stats", label: "当年统计", route: "year_stats", priority: 40 },
  { id: "assets", label: "资产状况", route: "assets", priority: 50 },
  { id: "budget", label: "预算检查", route: "budget", priority: 60 },
  { id: "transactions", label: "最近流水", route: "transactions", priority: 70 },
]);

function nowMs(clock = Date) {
  return typeof clock.now === "function" ? clock.now() : Date.now();
}

function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(String(value || "")).digest("hex")}`;
}

function hermesExternalUserId(workspaceId, userKey) {
  return userKey ? sha256(`hermes_mobile:${workspaceId}:${userKey}`) : "";
}

function firstNonEmpty(...values) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function normalizeOrigin(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  const parsed = new URL(raw);
  if (parsed.username || parsed.password) throw new Error("origin_credentials_forbidden");
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("origin_protocol_invalid");
  return parsed.origin;
}

function originFromRequest(req = {}, fallback = "http://127.0.0.1:8791") {
  const headers = req.headers || {};
  const explicit = headers["x-hermes-public-origin"] || headers["x-forwarded-origin"];
  if (explicit) return normalizeOrigin(explicit);
  const proto = firstNonEmpty(headers["x-forwarded-proto"], req.encrypted ? "https" : "", "http").split(",")[0].trim();
  const host = firstNonEmpty(headers["x-forwarded-host"], headers.host, new URL(fallback).host).split(",")[0].trim();
  return normalizeOrigin(`${proto}://${host}`);
}

function embeddedEntryPath(version = DEFAULT_EMBEDDED_APP_VERSION) {
  return `/finance.html?embed=hermes&v=${encodeURIComponent(version || DEFAULT_EMBEDDED_APP_VERSION)}`;
}

function sanitizeRoute(route = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(route || {})) {
    if (!ROUTE_KEYS.has(key)) continue;
    if (key === "depth") {
      const depth = Number(value);
      clean.depth = Number.isFinite(depth) ? Math.max(0, Math.min(4, Math.trunc(depth))) : 0;
    } else {
      clean[key] = String(value || "").slice(0, 96);
    }
  }
  if (!clean.name) clean.name = "ledger";
  if (clean.depth === undefined) clean.depth = 0;
  return clean;
}

function sanitizeRefreshPayload(payload = {}) {
  const reason = String(payload.reason || "state_changed").slice(0, 64);
  return { reason, route: sanitizeRoute(payload.route || {}) };
}

function normalizePluginTheme(value) {
  const raw = String(value || "").trim().toLowerCase();
  return THEME_VALUES.has(raw) ? raw : "";
}

function normalizePluginFontSize(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "small") return "compact";
  if (raw === "medium" || raw === "default") return "normal";
  if (raw === "extra-large" || raw === "xl") return "xlarge";
  return FONT_SIZE_VALUES.has(raw) ? raw : "";
}

function sanitizePluginAppearance(input = {}, headers = {}) {
  const theme = normalizePluginTheme(firstNonEmpty(
    input.pluginTheme,
    input.plugin_theme,
    input.theme,
    headers["x-hermes-plugin-theme"],
  ));
  const fontSize = normalizePluginFontSize(firstNonEmpty(
    input.pluginFontSize,
    input.plugin_font_size,
    input.fontSize,
    input.font_size,
    headers["x-hermes-plugin-font-size"],
  ));
  return {
    ...(theme ? { theme } : {}),
    ...(fontSize ? { fontSize } : {}),
  };
}

function createHermesEmbeddedPluginService(options = {}) {
  const clock = options.clock || Date;
  const tokenTtlMs = options.tokenTtlMs || DEFAULT_TTL_MS;
  const sessionTtlMs = options.sessionTtlMs || SESSION_TTL_MS;
  const embeddedAppVersion = firstNonEmpty(options.embeddedAppVersion, process.env.FINANCE_EMBEDDED_APP_VERSION, DEFAULT_EMBEDDED_APP_VERSION);
  const ownerWorkspaceId = options.ownerWorkspaceId || process.env.FINANCE_HERMES_OWNER_WORKSPACE_ID || "owner";
  const workspaceAuthorizer = typeof options.workspaceAuthorizer === "function" ? options.workspaceAuthorizer : null;
  const allowedWorkspaceIds = new Set([
    ownerWorkspaceId,
    ...String(options.allowedWorkspaces || process.env.FINANCE_HERMES_ALLOWED_WORKSPACES || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ]);
  const tokens = new Map();
  const sessions = new Map();
  let lastRefreshAt = 0;

  function createManifest(req) {
    const origin = originFromRequest(req, options.defaultOrigin);
    return {
      id: PLUGIN_ID,
      title: PLUGIN_TITLE,
      type: "embedded-app",
      entry: `${origin}${embeddedEntryPath(embeddedAppVersion)}`,
      launch: `${origin}/api/v1/hermes/plugin/launch`,
      toolsets: TOOLSETS,
      mcpServer: "finance",
      permissions: PERMISSIONS,
      actions: HERMES_PLUGIN_ACTIONS.map((action) => ({
        id: action.id,
        label: action.label,
        placement: ["plugin_drawer_frequent", "dock_long_press", "search"],
        priority: action.priority,
        entry: { type: "plugin_route", pluginRoute: action.route },
      })),
      embedding: {
        state_event: "finance.plugin.navigation",
        back_event: "hermes.plugin.back",
        back_result_event: "finance.plugin.back_result",
        refresh_required_event: "finance.plugin.refresh_required",
        preserve_iframe_state: true,
      },
    };
  }

  function isWorkspaceAuthorized(workspaceId) {
    return allowedWorkspaceIds.has(workspaceId) || Boolean(workspaceAuthorizer?.(workspaceId));
  }

  function createLaunch(input = {}, req = {}) {
    const headers = req.headers || {};
    const workspaceId = firstNonEmpty(input.workspaceId, input.workspace_id, headers["x-hermes-workspace-id"]);
    const workspaceKey = firstNonEmpty(input.workspaceKey, input.workspace_key, headers["x-hermes-workspace-key"], headers.authorization?.replace(/^Bearer\s+/i, ""));
    const userKey = firstNonEmpty(input.userKey, input.user_key, headers["x-hermes-user-key"]);
    const role = firstNonEmpty(input.role, headers["x-hermes-role"], workspaceId === ownerWorkspaceId ? "owner" : "member");
    if (!workspaceId) throw new Error("workspace_id_required");
    if (!workspaceKey) throw new Error("workspace_key_required");
    if (!isWorkspaceAuthorized(workspaceId)) throw new Error("workspace_not_authorized");

    const token = randomToken();
    const createdAt = nowMs(clock);
    tokens.set(token, {
      workspaceId,
      role,
      workspaceKeyHash: sha256(`${workspaceId}:${workspaceKey}`),
      userKeyHash: userKey ? sha256(`${workspaceId}:${userKey}`) : "",
      externalUserId: hermesExternalUserId(workspaceId, userKey),
      appearance: sanitizePluginAppearance(input, headers),
      createdAt,
      expiresAt: createdAt + tokenTtlMs,
      consumed: false,
    });
    return { ok: true, entry_path: `/api/v1/hermes/plugin/launch/${token}` };
  }

  function consumeLaunchToken(token) {
    const record = tokens.get(token);
    if (!record) throw new Error("launch_token_invalid");
    if (record.consumed) throw new Error("launch_token_consumed");
    if (record.expiresAt < nowMs(clock)) {
      tokens.delete(token);
      throw new Error("launch_token_expired");
    }
    record.consumed = true;
    tokens.delete(token);
    const sessionId = randomToken();
    sessions.set(sessionId, {
      workspaceId: record.workspaceId,
      role: record.role,
      userKeyHash: record.userKeyHash,
      externalUserId: record.externalUserId,
      appearance: record.appearance || {},
      createdAt: nowMs(clock),
      expiresAt: nowMs(clock) + sessionTtlMs,
    });
    return {
      sessionId,
      entryPath: embeddedEntryPath(embeddedAppVersion),
      session: {
        workspaceId: record.workspaceId,
        role: record.role,
        appearance: record.appearance || {},
        expiresAt: new Date(nowMs(clock) + sessionTtlMs).toISOString(),
      },
    };
  }

  function createSessionCookie(sessionId, req = {}, cookiePath = "/") {
    const headers = req.headers || {};
    const secure = String(headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https" || req.encrypted;
    const sameSite = secure ? "None" : "Lax";
    return [
      `${COOKIE_NAME}=${encodeURIComponent(sessionId)}`,
      "HttpOnly",
      `Path=${cookiePath || "/"}`,
      `Max-Age=${Math.floor(sessionTtlMs / 1000)}`,
      `SameSite=${sameSite}`,
      secure ? "Secure" : "",
    ].filter(Boolean).join("; ");
  }

  function getSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return null;
    if (session.expiresAt < nowMs(clock)) {
      sessions.delete(sessionId);
      return null;
    }
    return session;
  }

  function shouldSendRefresh(now = nowMs(clock)) {
    if (now - lastRefreshAt < REFRESH_THROTTLE_MS) return false;
    lastRefreshAt = now;
    return true;
  }

  return {
    createLaunch,
    createManifest,
    consumeLaunchToken,
    createSessionCookie,
    getSession,
    isWorkspaceAuthorized,
    sanitizeRefreshPayload,
    sanitizeRoute,
    shouldSendRefresh,
  };
}

module.exports = {
  COOKIE_NAME,
  createHermesEmbeddedPluginService,
  normalizePluginFontSize,
  normalizePluginTheme,
  sanitizePluginAppearance,
  sanitizeRefreshPayload,
  sanitizeRoute,
};
