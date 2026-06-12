"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { createFinanceRuntime } = require("./adapters/finance-runtime");
const { COOKIE_NAME } = require("./adapters/finance-hermes-embedded-plugin-service");
const {
  createFinanceRecurringSchedulerService,
  resolveRecurringAutoPostConfig,
} = require("./adapters/finance-recurring-scheduler-service");
const { createFinanceApiRoutes } = require("./server-routes/finance-api-routes");

const publicRoot = path.join(__dirname, "public");
const runtime = createFinanceRuntime({ embeddedAppVersion: resolveEmbeddedAppVersion(publicRoot) });
const apiRoutes = createFinanceApiRoutes({ runtime, clientVersion: resolveClientVersion(publicRoot) });

function resolveEmbeddedAppVersion(root = publicRoot) {
  const html = fs.readFileSync(path.join(root, "finance.html"), "utf8");
  const scriptVersion = /app-finance-ui\.js\?v=([^"']+)/.exec(html)?.[1] || "";
  const styleVersion = /styles\.css\?v=([^"']+)/.exec(html)?.[1] || "";
  return scriptVersion || styleVersion || "finance-replica-unknown";
}

function resolveClientVersion(root = publicRoot) {
  const files = [
    "finance.html",
    "styles.css",
    "app-finance-ui.js",
    "manifest.json",
    "manifest.webmanifest",
    "service-worker.js",
    path.join("icons", "finance-icon-192.png"),
    path.join("icons", "finance-icon-512.png"),
    path.join("assets", "wacai-ledger-bg.svg"),
  ];
  const signature = files.map((file) => {
    const stat = fs.statSync(path.join(root, file));
    return `${file}:${stat.mtimeMs}:${stat.size}`;
  }).join("|");
  return Buffer.from(signature).toString("base64url");
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".webmanifest")) return "application/manifest+json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml; charset=utf-8";
  if (filePath.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

function cookieValue(req, name) {
  const header = String(req.headers?.cookie || "");
  for (const item of header.split(";")) {
    const [rawName, ...rest] = item.trim().split("=");
    if (rawName === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function appearanceFromRequest(req, runtimeInstance = runtime) {
  const sessionId = cookieValue(req, COOKIE_NAME);
  const session = sessionId && runtimeInstance.hermesEmbeddedPluginService?.getSession
    ? runtimeInstance.hermesEmbeddedPluginService.getSession(sessionId)
    : null;
  const appearance = session?.appearance || {};
  const clean = {};
  if (["system", "light", "dark"].includes(appearance.theme)) clean.theme = appearance.theme;
  if (["compact", "normal", "large", "xlarge"].includes(appearance.fontSize)) clean.fontSize = appearance.fontSize;
  return clean;
}

function financeAppearanceBootstrap(appearance = {}) {
  const theme = ["system", "light", "dark"].includes(appearance.theme) ? appearance.theme : "";
  const fontSize = ["compact", "normal", "large", "xlarge"].includes(appearance.fontSize) ? appearance.fontSize : "";
  const json = JSON.stringify({
    ...(theme ? { theme } : {}),
    ...(fontSize ? { fontSize } : {}),
  }).replace(/</g, "\\u003c");
  if (json === "{}") return "";
  return `  <script>window.__FINANCE_PLUGIN_APPEARANCE__=${json};</script>\n`;
}

function renderFinanceHtml(html, appearance = {}) {
  return html.replace(/  <script>\r?\n    \(function \(\) \{/, (match) => `${financeAppearanceBootstrap(appearance)}${match}`);
}

function sendFile(req, res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "content-type": contentType(filePath), "cache-control": "no-store" });
    if (path.basename(filePath) === "finance.html") {
      res.end(renderFinanceHtml(data.toString("utf8"), appearanceFromRequest(req)));
      return;
    }
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/finance/") || url.pathname.startsWith("/api/v1/hermes/plugin/")) {
    const handled = await apiRoutes.handle(req, res, url);
    if (handled !== false) return;
  }
  const safePath = url.pathname === "/" ? "/finance.html" : url.pathname;
  const filePath = path.normalize(path.join(publicRoot, safePath));
  if (!filePath.startsWith(publicRoot)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  sendFile(req, res, filePath);
});

function resolveListenConfig(env = process.env) {
  return {
    host: env.FINANCE_MCP_HOST || env.HOST || "0.0.0.0",
    port: Number(env.FINANCE_MCP_PORT || env.PORT || 8787),
  };
}

function createRecurringAutoPostScheduler(runtimeInstance = runtime, env = process.env) {
  const config = resolveRecurringAutoPostConfig(env);
  if (!config.enabled) return null;
  return createFinanceRecurringSchedulerService({
    repository: runtimeInstance.repository,
    recurringService: runtimeInstance.recurringService,
    intervalMs: config.intervalMs,
    maxOccurrences: config.maxOccurrences,
    catchUpPassLimit: config.catchUpPassLimit,
    actorRef: config.actorRef,
    logger: console,
  });
}

if (require.main === module) {
  const { host, port } = resolveListenConfig();
  const recurringAutoPostScheduler = createRecurringAutoPostScheduler();
  server.listen(port, host, () => {
    const displayHost = host === "0.0.0.0" ? "0.0.0.0" : host;
    process.stdout.write(`Finance MCP UI: http://${displayHost}:${port}/finance.html\n`);
    if (recurringAutoPostScheduler) recurringAutoPostScheduler.start();
  });

  function shutdown() {
    if (recurringAutoPostScheduler) recurringAutoPostScheduler.stop();
    server.close(() => {
      runtime.close();
      process.exit(0);
    });
  }

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

module.exports = {
  appearanceFromRequest,
  createRecurringAutoPostScheduler,
  financeAppearanceBootstrap,
  renderFinanceHtml,
  resolveClientVersion,
  resolveEmbeddedAppVersion,
  resolveRecurringAutoPostConfig,
  resolveListenConfig,
  server,
};
