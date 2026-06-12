"use strict";

const crypto = require("node:crypto");

function clean(value) {
  return String(value || "").trim();
}

function firstNonEmpty(...values) {
  return values.map(clean).find(Boolean) || "";
}

function hashIdentity(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function randomAccessToken() {
  return `fin_${crypto.randomBytes(32).toString("base64url")}`;
}

function tokenHash(token) {
  return `sha256:${hashIdentity(String(token || ""))}`;
}

function hermesWorkspaceId(input = {}, context = {}) {
  return firstNonEmpty(
    input.targetWorkspaceId,
    input.target_workspace_id,
    input.externalWorkspaceId,
    input.external_workspace_id,
    input.workspaceId,
    input.workspace_id,
    context.externalWorkspaceId,
    context.actorWorkspaceId,
    context.workspaceId,
    context.workspace_id,
  );
}

function hermesWorkspaceUserKey(input = {}, context = {}) {
  return firstNonEmpty(
    input.targetUserKey,
    input.target_user_key,
    input.hermesWorkspaceUserKey,
    input.hermes_workspace_user_key,
    input.workspaceUserKey,
    input.workspace_user_key,
    input.userKey,
    input.user_key,
    context.hermesWorkspaceUserKey,
    context.hermes_workspace_user_key,
    context.workspaceUserKey,
    context.workspace_user_key,
    context.userKey,
    context.user_key,
  );
}

function hermesExternalUserId(input = {}, context = {}) {
  const alreadyScoped = firstNonEmpty(input.externalUserId, input.external_user_id, context.externalUserId, context.external_user_id);
  if (alreadyScoped) return alreadyScoped.startsWith("sha256:") ? alreadyScoped : `sha256:${hashIdentity(alreadyScoped)}`;
  const userKey = hermesWorkspaceUserKey(input, context);
  if (!userKey) return "";
  const workspaceId = hermesWorkspaceId(input, context) || "default";
  return `sha256:${hashIdentity(`hermes_mobile:${workspaceId}:${userKey}`)}`;
}

function defaultDisplayName(input = {}, workspaceId = "", externalUserId = "") {
  return firstNonEmpty(input.displayName, input.display_name, input.title, input.name)
    || (workspaceId ? `Hermes ${workspaceId}` : `Finance user ${externalUserId.slice(-12)}`);
}

function financeUserKeyForHermes(input = {}, context = {}) {
  const explicit = firstNonEmpty(input.financeUserKey, input.finance_user_key, input.userKeyAlias, input.user_key_alias);
  if (explicit) return explicit;
  const workspaceId = hermesWorkspaceId(input, context);
  const userKey = hermesWorkspaceUserKey(input, context);
  if (userKey) return `hermes-user:${hashIdentity(`${workspaceId}:${userKey}`).slice(0, 20)}`;
  return `hermes-workspace:${hashIdentity(workspaceId).slice(0, 20)}`;
}

function createFinanceUserBindingService({ repository, ownerWorkspaceId = process.env.FINANCE_HERMES_OWNER_WORKSPACE_ID || "owner" } = {}) {
  if (!repository) throw new Error("repository_required");

  function ledgerIdForUser(financeUser) {
    if (financeUser.id === "user_xuxin") return "daily";
    return `ledger_${hashIdentity(financeUser.id).slice(0, 16)}`;
  }

  function seedLedgerDefaults(ledgerId) {
    repository.upsertAccount({ ledgerId, name: "现金", type: "cash", currency: "CNY" });
    repository.upsertAccount({ ledgerId, name: "银行卡", type: "bank", currency: "CNY" });
    repository.upsertAccount({ ledgerId, name: "应付", type: "payable", currency: "CNY", isLiability: 1 });
    repository.upsertMember({ ledgerId, displayName: "自己", isHousehold: 0 });
    repository.upsertMember({ ledgerId, displayName: "家庭公用", isHousehold: 1 });
    for (const row of [
      ["expense", "餐饮", 10],
      ["expense", "交通", 20],
      ["expense", "居家", 30],
      ["expense", "服饰", 40],
      ["expense", "医疗", 50],
      ["income", "工资薪水", 10],
      ["income", "奖金", 20],
      ["income", "退款", 30],
    ]) {
      repository.upsertCategory({ ledgerId, type: row[0], name: row[1], sortOrder: row[2] });
    }
  }

  function ensureLedgerForUser(financeUser) {
    const existing = repository.listLedgersByUser(financeUser.id)[0];
    if (existing) return existing;
    const ledger = repository.upsertLedger({
      id: ledgerIdForUser(financeUser),
      ownerUserId: financeUser.id,
      name: financeUser.id === "user_xuxin" ? "日常账本" : `${financeUser.display_name}账本`,
    });
    seedLedgerDefaults(ledger.id);
    return ledger;
  }

  function registerHermesWorkspaceUser(input = {}, context = {}) {
    if (context.role && context.role !== "owner") throw new Error("finance_user_binding_denied");
    const workspaceId = hermesWorkspaceId(input, context);
    if (!workspaceId) throw new Error("target_workspace_id_required");
    const externalUserId = hermesExternalUserId(input, { ...context, externalWorkspaceId: workspaceId });
    const existing = repository.resolveFinanceUserBinding({
      provider: "hermes_mobile",
      externalWorkspaceId: workspaceId,
      externalUserId,
    });
    if (existing) {
      const user = repository.getFinanceUser(existing.finance_user_id);
      return { user, ledger: ensureLedgerForUser(user), binding: existing, created: false };
    }
    const isOwnerWorkspace = workspaceId === ownerWorkspaceId && !externalUserId;
    const user = isOwnerWorkspace
      ? repository.getFinanceUser("user_xuxin")
      : repository.upsertFinanceUser({
        userKey: financeUserKeyForHermes(input, { ...context, externalWorkspaceId: workspaceId }),
        displayName: defaultDisplayName(input, workspaceId, externalUserId),
      });
    const ledger = ensureLedgerForUser(user);
    const binding = repository.bindFinanceUser({
      financeUserId: user.id,
      provider: "hermes_mobile",
      externalWorkspaceId: workspaceId,
      externalUserId,
      role: input.role || "owner",
    });
    repository.insertAudit({
      ledgerId: ledger.id,
      actorRef: context.actorRef || context.externalWorkspaceId || "hermes-admin",
      action: "finance_user.bind_hermes_workspace",
      entityType: "finance_user_binding",
      entityId: binding.id,
      after: {
        id: binding.id,
        finance_user_id: binding.finance_user_id,
        provider: binding.provider,
        external_workspace_id: binding.external_workspace_id,
        external_user_id: binding.external_user_id,
      },
    });
    return { user, ledger, binding, created: true };
  }

  function resolveUserForHermesContext(context = {}) {
    const externalWorkspaceId = hermesWorkspaceId({}, context);
    const externalUserId = hermesExternalUserId({}, context);
    if (!externalWorkspaceId && !externalUserId) return null;
    const binding = repository.resolveFinanceUserBinding({
      provider: "hermes_mobile",
      externalWorkspaceId,
      externalUserId,
    });
    if (!binding) return null;
    const user = repository.getFinanceUser(binding.finance_user_id);
    if (!user) return null;
    return { user, ledger: ensureLedgerForUser(user), binding };
  }

  function createAccessToken(input = {}, context = {}) {
    if (context.role && context.role !== "owner") throw new Error("finance_access_token_denied");
    const user = input.financeUserId || input.finance_user_id
      ? repository.getFinanceUser(input.financeUserId || input.finance_user_id)
      : repository.getFinanceUserByKey(input.financeUserKey || input.finance_user_key || "xuxin");
    if (!user) throw new Error("finance_user_not_found");
    const token = randomAccessToken();
    const row = repository.insertFinanceAccessToken({
      financeUserId: user.id,
      tokenHash: tokenHash(token),
      label: input.label || "",
      expiresAt: input.expiresAt || input.expires_at || "",
    });
    return {
      accessToken: token,
      token: { id: row.id, financeUserId: row.finance_user_id, label: row.label, expiresAt: row.expires_at },
    };
  }

  function resolveAccessToken(token) {
    const row = repository.findFinanceAccessToken(tokenHash(token));
    if (!row) return null;
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
    repository.touchFinanceAccessToken(row.id);
    const user = repository.getFinanceUser(row.finance_user_id);
    return { user, ledger: ensureLedgerForUser(user), token: row };
  }

  return {
    createAccessToken,
    registerHermesWorkspaceUser,
    resolveAccessToken,
    resolveUserForHermesContext,
  };
}

module.exports = {
  createFinanceUserBindingService,
  hermesExternalUserId,
  tokenHash,
};
