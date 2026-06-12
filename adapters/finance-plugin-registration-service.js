"use strict";

function actorRef(context = {}) {
  return context.actorRef || context.actorWorkspaceId || context.externalWorkspaceId || "local";
}

function firstNonEmpty(...values) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function externalWorkspaceIdFrom(input = {}, context = {}) {
  return firstNonEmpty(
    input.externalWorkspaceId,
    input.external_workspace_id,
    input.workspaceId,
    input.workspace_id,
    context.externalWorkspaceId,
    context.external_workspace_id,
    context.actorWorkspaceId,
    context.workspaceId,
    context.workspace_id,
  );
}

function normalizeHermesCallbackUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("callback_url_required");
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (err) {
    throw new Error("callback_url_invalid");
  }
  if (parsed.username || parsed.password) throw new Error("callback_url_credentials_forbidden");
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol === "https:") return parsed.toString();
  const isLoopbackHttp = parsed.protocol === "http:"
    && (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]");
  if (isLoopbackHttp) return parsed.toString();
  throw new Error("callback_url_must_be_https_or_loopback_http");
}

function createFinancePluginRegistrationService({ repository } = {}) {
  if (!repository) throw new Error("repository_required");

  function registerHermesCallback(input = {}, context = {}) {
    const callbackUrl = normalizeHermesCallbackUrl(input.callbackUrl || input.callback_url);
    const externalWorkspaceId = externalWorkspaceIdFrom(input, context);
    const registration = repository.upsertPluginRegistration({
      provider: "hermes_mobile",
      toolset: "finance",
      externalWorkspaceId,
      callbackUrl,
    });
    const audit = repository.insertAudit({
      ledgerId: input.ledgerId || input.ledger_id || context.ledgerId || "daily",
      actorRef: actorRef({ ...context, externalWorkspaceId }),
      action: "plugin.register_callback",
      entityType: "plugin_registration",
      entityId: registration.id,
      after: {
        id: registration.id,
        provider: registration.provider,
        toolset: registration.toolset,
        external_workspace_id: registration.external_workspace_id,
        callback_url: registration.callback_url,
      },
    });
    return { registration, auditId: audit.id };
  }

  function getHermesCallback(input = {}, context = {}) {
    const registration = repository.getPluginRegistration({
      provider: "hermes_mobile",
      toolset: "finance",
      externalWorkspaceId: externalWorkspaceIdFrom(input, context),
    });
    return { registration };
  }

  return { getHermesCallback, registerHermesCallback };
}

module.exports = {
  createFinancePluginRegistrationService,
  normalizeHermesCallbackUrl,
};
