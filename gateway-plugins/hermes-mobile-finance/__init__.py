"""Finance MCP bridge plugin for Hermes Mobile Gateway profiles."""

from __future__ import annotations

import json
import os
from pathlib import Path
import urllib.error
import urllib.request
from typing import Any


DEFAULT_FINANCE_MCP_URL = "http://127.0.0.1:8791"
DEFAULT_TIMEOUT_SECONDS = 30
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
IDENTITY_KEYS = {
    "hermes_workspace_user_key",
    "hermesWorkspaceUserKey",
    "workspace_user_key",
    "workspaceUserKey",
    "user_key",
    "userKey",
    "principal_key",
    "principalKey",
    "external_workspace_id",
    "externalWorkspaceId",
    "workspace_id",
    "workspaceId",
    "display_name",
    "displayName",
}
CALLBACK_ENV_KEYS = (
    "FINANCE_HERMES_CALLBACK_URL",
    "HERMES_MOBILE_CALLBACK_URL",
    "HERMES_WEB_CALLBACK_URL",
)
WORKSPACE_ENV_KEYS = (
    "FINANCE_MCP_WORKSPACE",
    "FINANCE_HERMES_WORKSPACE_ROOT",
    "HERMES_MCP_WORKSPACE",
)
WORKSPACE_OVERRIDE_KEYS = {
    "workspace",
    "workspace_path",
    "workspacePath",
    "workspace_root",
    "workspaceRoot",
    "hermes_workspace_root",
    "hermesWorkspaceRoot",
}
SECRET_ARG_KEYS = {
    "workspace_key",
    "workspaceKey",
    "access_key",
    "accessKey",
    "owner_key",
    "ownerKey",
    "launch_token",
    "launchToken",
    "cookie",
    "session",
}


def _json_result(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def _finance_url() -> str:
    configured = os.environ.get("FINANCE_MCP_URL")
    if not configured:
        config = _workspace_config_metadata()
        configured = str(config.get("api_base_url") or config.get("apiBaseUrl") or "")
    return (configured or DEFAULT_FINANCE_MCP_URL).rstrip("/")


def _callback_url() -> str:
    for key in CALLBACK_ENV_KEYS:
        value = (os.environ.get(key) or "").strip()
        if value:
            return value
    return ""


def _workspace_root() -> str:
    for key in WORKSPACE_ENV_KEYS:
        value = (os.environ.get(key) or "").strip()
        if value:
            return str(Path(value).resolve())
    return ""


def _workspace_config_metadata() -> dict[str, Any]:
    root = _workspace_root()
    if not root:
        return {}
    try:
        parsed = json.loads((Path(root) / ".hermes-finance" / "config.json").read_text(encoding="utf-8"))
    except Exception:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _no_workspace_override() -> bool:
    return (os.environ.get("FINANCE_MCP_NO_WORKSPACE_OVERRIDE") or "").strip().lower() in {"1", "true", "yes"}


def _load_workspace_identity() -> dict[str, Any]:
    root = _workspace_root()
    if not root:
        return {}
    config_dir = Path(root) / ".hermes-finance"
    config_path = config_dir / "config.json"
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {"error": "finance_mcp_workspace_config_missing"}
    except Exception:
        return {"error": "finance_mcp_workspace_config_invalid"}
    if not isinstance(config, dict):
        return {"error": "finance_mcp_workspace_config_invalid"}
    key_file = str(config.get("access_key_file") or config.get("accessKeyFile") or "access-key.txt")
    key_path = Path(key_file)
    if key_path.is_absolute():
        return {"error": "finance_mcp_key_path_must_be_relative"}
    resolved_key_path = (config_dir / key_file).resolve()
    try:
        resolved_key_path.relative_to(config_dir.resolve())
    except ValueError:
        return {"error": "finance_mcp_key_path_outside_config_dir"}
    try:
        workspace_key = resolved_key_path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return {"error": "finance_mcp_workspace_key_missing"}
    except Exception:
        return {"error": "finance_mcp_workspace_key_unreadable"}
    if not workspace_key:
        return {"error": "finance_mcp_workspace_key_empty"}
    workspace_id = str(config.get("workspace_id") or config.get("workspaceId") or Path(root).name).strip()
    if not workspace_id:
        return {"error": "finance_mcp_workspace_id_required"}
    return {
        "source": "finance-mcp-wrapper",
        "role": str(config.get("role") or "member"),
        "actorRef": f"finance-mcp:{workspace_id}",
        "externalWorkspaceId": workspace_id,
        "workspaceId": workspace_id,
        "workspace_id": workspace_id,
        "workspaceKey": workspace_key,
        "workspace_key": workspace_key,
        **({"financeUserId": str(config.get("finance_user_id") or config.get("financeUserId"))} if (config.get("finance_user_id") or config.get("financeUserId")) else {}),
        **({"ledgerId": str(config.get("ledger_id") or config.get("ledgerId"))} if (config.get("ledger_id") or config.get("ledgerId")) else {}),
        **({"displayName": str(config.get("display_name") or config.get("displayName"))} if (config.get("display_name") or config.get("displayName")) else {}),
    }


def _workspace_headers(context: dict[str, Any] | None = None) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if not isinstance(context, dict) or context.get("error"):
        return headers
    workspace_id = str(context.get("workspace_id") or context.get("workspaceId") or context.get("externalWorkspaceId") or "").strip()
    workspace_key = str(context.get("workspace_key") or context.get("workspaceKey") or "").strip()
    if workspace_id:
        headers["X-Finance-MCP-Workspace-Id"] = workspace_id
    if workspace_key:
        headers["X-Finance-MCP-Workspace-Key"] = workspace_key
    return headers


def _request_json(path: str, payload: dict[str, Any] | None = None, timeout: int = DEFAULT_TIMEOUT_SECONDS, context: dict[str, Any] | None = None) -> dict[str, Any]:
    url = f"{_finance_url()}{path}"
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers=_workspace_headers(context),
        method="POST" if body is not None else "GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = response.read(MAX_RESPONSE_BYTES + 1)
            if len(data) > MAX_RESPONSE_BYTES:
                return {"ok": False, "error": "finance_mcp_response_too_large"}
            parsed = json.loads(data.decode("utf-8") or "{}")
            return parsed if isinstance(parsed, dict) else {"ok": False, "error": "finance_mcp_invalid_response"}
    except urllib.error.HTTPError as exc:
        data = exc.read(MAX_RESPONSE_BYTES)
        try:
            parsed = json.loads(data.decode("utf-8") or "{}")
        except Exception:
            parsed = {}
        if isinstance(parsed, dict) and parsed:
            parsed.setdefault("status", exc.code)
            return parsed
        return {"ok": False, "status": exc.code, "error": "finance_mcp_http_error"}
    except Exception as exc:
        return {"ok": False, "error": f"finance_mcp_unavailable:{type(exc).__name__}"}


def _tool_schemas() -> list[dict[str, Any]]:
    context = _load_workspace_identity()
    if context.get("error"):
        return []
    payload = _request_json("/api/finance/mcp/schemas", timeout=10, context=context)
    schemas = payload.get("schemas") if isinstance(payload, dict) else None
    return schemas if isinstance(schemas, list) else []


def _register_callback_if_configured() -> None:
    callback = _callback_url()
    if not callback:
        return
    _request_json("/api/finance/mcp/register", {
        "callback_url": callback,
        "source": "hermes-mobile-finance-plugin",
    }, timeout=10)


def _flatten_context(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    context: dict[str, Any] = {}
    for key, item in value.items():
        if key in IDENTITY_KEYS or key in {"role", "actorRef", "actorWorkspaceId", "ledgerId", "ledger_id"}:
            context[key] = item
        elif key in {"context", "run_context", "handler_context", "access_policy_context", "principal"}:
            context.update(_flatten_context(item))
    return context


def _context_from(args: dict[str, Any], kwargs: dict[str, Any]) -> dict[str, Any]:
    workspace_context = _load_workspace_identity()
    if workspace_context.get("error"):
        return workspace_context
    context = _flatten_context(kwargs)
    context.update({key: args.get(key) for key in IDENTITY_KEYS if key in args})
    context.update(workspace_context)
    context.setdefault("source", "hermes-mobile-finance-plugin")
    context.setdefault("role", "member")
    return {key: value for key, value in context.items() if value not in (None, "")}


def _public_args(args: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in args.items() if key not in IDENTITY_KEYS and key not in SECRET_ARG_KEYS and key not in WORKSPACE_OVERRIDE_KEYS}


def _workspace_override_error(args: dict[str, Any]) -> str:
    if not _no_workspace_override():
        return ""
    root = _workspace_root()
    if not root:
        return ""
    expected = str(Path(root).resolve()).rstrip("\\/").lower()
    for key in WORKSPACE_OVERRIDE_KEYS:
        value = args.get(key)
        if value in (None, ""):
            continue
        if str(Path(str(value)).resolve()).rstrip("\\/").lower() != expected:
            return "workspace_override_not_allowed"
    return ""


def _handler(tool_name: str):
    def handle(args: dict[str, Any], **kwargs: Any) -> str:
        clean_args = args if isinstance(args, dict) else {}
        override_error = _workspace_override_error(clean_args)
        if override_error:
            return _json_result({"ok": False, "error": override_error})
        context = _context_from(clean_args, kwargs)
        if context.get("error"):
            return _json_result({"ok": False, "error": context["error"]})
        payload = _request_json("/api/finance/mcp/dispatch", {
            "tool": tool_name,
            "args": _public_args(clean_args),
            "context": context,
        }, context=context)
        return _json_result(payload)
    return handle


def register(ctx: Any) -> None:
    _register_callback_if_configured()
    schemas = _tool_schemas()
    for schema in schemas:
        name = str(schema.get("name") or "").strip()
        if not name.startswith("finance."):
            continue
        ctx.register_tool(
            name=name,
            toolset="finance",
            schema=schema,
            handler=_handler(name),
            description=schema.get("description") or "Finance MCP tool.",
            emoji="finance",
        )
    try:
        from model_tools import _tool_defs_cache
        _tool_defs_cache.clear()
    except Exception:
        pass
