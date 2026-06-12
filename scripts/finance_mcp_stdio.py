#!/usr/bin/env python3
"""Finance MCP stdio wrapper for Hermes Mobile Gateway profiles.

The wrapper is intentionally thin: it reads workspace-local Finance identity,
then forwards MCP tool calls to the local Finance service loopback bridge.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable


PROTOCOL_VERSION = "2024-11-05"
DEFAULT_API_BASE_URL = "http://127.0.0.1:8791"
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
CONFIG_DIR = ".hermes-finance"
CONFIG_FILE = "config.json"
DEFAULT_KEY_FILE = "access-key.txt"
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


class FinanceMcpError(Exception):
    """Bounded wrapper error."""


def non_empty(*values: Any) -> str:
    for value in values:
        text = str(value or "").strip()
        if text:
            return text
    return ""


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Finance MCP stdio wrapper")
    parser.add_argument("--workspace", default="")
    parser.add_argument("--no-workspace-override", action="store_true")
    parser.add_argument("--api-base-url", default="")
    args = parser.parse_args(argv)
    args.workspace = non_empty(
        args.workspace,
        os.environ.get("FINANCE_MCP_WORKSPACE"),
        os.environ.get("FINANCE_HERMES_WORKSPACE_ROOT"),
        os.environ.get("HERMES_MCP_WORKSPACE"),
    )
    args.api_base_url = non_empty(
        args.api_base_url,
        os.environ.get("FINANCE_MCP_URL"),
        os.environ.get("FINANCE_API_BASE_URL"),
    )
    if str(os.environ.get("FINANCE_MCP_NO_WORKSPACE_OVERRIDE") or "").strip().lower() in {"1", "true", "yes"}:
        args.no_workspace_override = True
    return args


def load_workspace(args: argparse.Namespace) -> dict[str, Any]:
    if not args.workspace:
        raise FinanceMcpError("finance_mcp_workspace_required")
    workspace_root = Path(args.workspace).resolve()
    config_dir = workspace_root / CONFIG_DIR
    config_path = config_dir / CONFIG_FILE
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise FinanceMcpError("finance_mcp_workspace_config_missing") from exc
    except Exception as exc:
        raise FinanceMcpError("finance_mcp_workspace_config_invalid") from exc
    if not isinstance(config, dict):
        raise FinanceMcpError("finance_mcp_workspace_config_invalid")

    key_file = non_empty(config.get("access_key_file"), config.get("accessKeyFile"), DEFAULT_KEY_FILE)
    key_path = Path(key_file)
    if key_path.is_absolute():
        raise FinanceMcpError("finance_mcp_key_path_must_be_relative")
    resolved_key = (config_dir / key_path).resolve()
    try:
        resolved_key.relative_to(config_dir.resolve())
    except ValueError as exc:
        raise FinanceMcpError("finance_mcp_key_path_outside_config_dir") from exc
    try:
        workspace_key = resolved_key.read_text(encoding="utf-8").strip()
    except FileNotFoundError as exc:
        raise FinanceMcpError("finance_mcp_workspace_key_missing") from exc
    except Exception as exc:
        raise FinanceMcpError("finance_mcp_workspace_key_unreadable") from exc
    if not workspace_key:
        raise FinanceMcpError("finance_mcp_workspace_key_empty")

    workspace_id = non_empty(config.get("workspace_id"), config.get("workspaceId"), config.get("hermes_workspace_id"), config.get("hermesWorkspaceId"), workspace_root.name)
    if not workspace_id:
        raise FinanceMcpError("finance_mcp_workspace_id_required")

    context: dict[str, Any] = {
        "source": "finance-mcp-wrapper",
        "role": non_empty(config.get("role"), "member"),
        "actorRef": f"finance-mcp:{workspace_id}",
        "externalWorkspaceId": workspace_id,
        "workspaceId": workspace_id,
        "workspace_id": workspace_id,
        "workspaceKey": workspace_key,
        "workspace_key": workspace_key,
    }
    finance_user_id = non_empty(config.get("finance_user_id"), config.get("financeUserId"))
    ledger_id = non_empty(config.get("ledger_id"), config.get("ledgerId"))
    display_name = non_empty(config.get("display_name"), config.get("displayName"))
    if finance_user_id:
        context["financeUserId"] = finance_user_id
    if ledger_id:
        context["ledgerId"] = ledger_id
    if display_name:
        context["displayName"] = display_name

    return {
        "workspace_root": str(workspace_root),
        "api_base_url": non_empty(args.api_base_url, config.get("api_base_url"), config.get("apiBaseUrl"), DEFAULT_API_BASE_URL).rstrip("/"),
        "no_workspace_override": bool(args.no_workspace_override),
        "context": context,
    }


def mcp_name(finance_name: str) -> str:
    if finance_name.startswith("finance."):
        return finance_name[len("finance.") :]
    return finance_name.replace(".", "_")


def finance_name(tool_name: str) -> str:
    if tool_name.startswith("mcp_finance_"):
        return f"finance.{tool_name[len('mcp_finance_'):]}"
    if not tool_name.startswith("finance."):
        return f"finance.{tool_name}"
    return tool_name


def bounded_error(exc: BaseException | str) -> str:
    message = str(exc)
    if any(word in message.lower() for word in ("token", "cookie", "secret", "password")):
        return "finance_mcp_error"
    if "key" in message.lower() and not message.startswith("finance_mcp_workspace_key_") and not message.startswith("finance_mcp_key_"):
        return "finance_mcp_error"
    return message or "finance_mcp_error"


def mcp_headers(session: dict[str, Any] | None = None) -> dict[str, str]:
    if not session:
        return {"Content-Type": "application/json"}
    context = session.get("context") if isinstance(session.get("context"), dict) else {}
    workspace_id = non_empty(context.get("workspace_id"), context.get("workspaceId"), context.get("externalWorkspaceId"))
    workspace_key = non_empty(context.get("workspace_key"), context.get("workspaceKey"))
    headers = {"Content-Type": "application/json"}
    if workspace_id:
        headers["X-Finance-MCP-Workspace-Id"] = workspace_id
    if workspace_key:
        headers["X-Finance-MCP-Workspace-Key"] = workspace_key
    return headers


def request_json(api_base_url: str, path: str, payload: dict[str, Any] | None = None, timeout: int = 30, session: dict[str, Any] | None = None) -> dict[str, Any]:
    url = f"{api_base_url}{path}"
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers=mcp_headers(session),
        method="POST" if data is not None else "GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read(MAX_RESPONSE_BYTES + 1)
            if len(raw) > MAX_RESPONSE_BYTES:
                raise FinanceMcpError("finance_mcp_response_too_large")
            parsed = json.loads(raw.decode("utf-8") or "{}")
            if not isinstance(parsed, dict):
                raise FinanceMcpError("finance_mcp_invalid_response")
            if parsed.get("ok") is False:
                raise FinanceMcpError(str(parsed.get("error") or "finance_mcp_request_failed"))
            return parsed
    except urllib.error.HTTPError as exc:
        raw = exc.read(MAX_RESPONSE_BYTES)
        try:
            parsed = json.loads(raw.decode("utf-8") or "{}")
        except Exception:
            parsed = {}
        if isinstance(parsed, dict) and parsed.get("error"):
            raise FinanceMcpError(str(parsed["error"])) from exc
        raise FinanceMcpError(f"finance_mcp_http_{exc.code}") from exc
    except FinanceMcpError:
        raise
    except Exception as exc:
        raise FinanceMcpError(f"finance_mcp_unavailable:{type(exc).__name__}") from exc


def strip_private_args(args: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in (args or {}).items()
        if key not in SECRET_ARG_KEYS and key not in WORKSPACE_OVERRIDE_KEYS
    }


def assert_no_workspace_override(args: dict[str, Any], workspace_root: str, enabled: bool) -> None:
    if not enabled:
        return
    expected = str(Path(workspace_root).resolve()).rstrip("\\/").lower()
    for key in WORKSPACE_OVERRIDE_KEYS:
        value = (args or {}).get(key)
        if value in (None, ""):
            continue
        if str(Path(str(value)).resolve()).rstrip("\\/").lower() != expected:
            raise FinanceMcpError("workspace_override_not_allowed")


def tools_list(session: dict[str, Any]) -> list[dict[str, Any]]:
    payload = request_json(session["api_base_url"], "/api/finance/mcp/schemas", timeout=10, session=session)
    schemas = payload.get("schemas")
    if not isinstance(schemas, list):
        raise FinanceMcpError("finance_mcp_schema_unavailable")
    tools = []
    for schema in schemas:
        if not isinstance(schema, dict):
            continue
        name = str(schema.get("name") or "")
        if not name.startswith("finance."):
            continue
        tools.append({
            "name": mcp_name(name),
            "description": schema.get("description") or "Finance MCP tool.",
            "inputSchema": schema.get("parameters") or {"type": "object", "properties": {}},
        })
    return tools


def call_tool(session: dict[str, Any], tool_name: str, args: dict[str, Any]) -> Any:
    assert_no_workspace_override(args, session["workspace_root"], session["no_workspace_override"])
    payload = request_json(session["api_base_url"], "/api/finance/mcp/dispatch", {
        "tool": finance_name(tool_name),
        "args": strip_private_args(args),
        "context": session["context"],
    }, session=session)
    return payload.get("result", payload)


def encode_message(payload: dict[str, Any], framing: str = "content-length") -> bytes:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if framing == "ndjson":
        return body + b"\n"
    return f"Content-Length: {len(body)}\r\n\r\n".encode("ascii") + body


def parse_messages(on_message: Callable[[dict[str, Any], str], None]) -> None:
    buffer = b""
    while True:
        chunk = sys.stdin.buffer.read1(65536)
        if not chunk:
            return
        buffer += chunk
        while True:
            stripped = buffer.lstrip()
            if stripped.startswith(b"{"):
                newline = stripped.find(b"\n")
                if newline < 0:
                    break
                raw_line = stripped[:newline].strip()
                buffer = stripped[newline + 1 :]
                if not raw_line:
                    continue
                on_message(json.loads(raw_line.decode("utf-8")), "ndjson")
                continue
            header_end = buffer.find(b"\r\n\r\n")
            if header_end < 0:
                break
            header = buffer[:header_end].decode("ascii", errors="replace")
            length = 0
            for line in header.splitlines():
                if line.lower().startswith("content-length:"):
                    length = int(line.split(":", 1)[1].strip())
                    break
            body_start = header_end + 4
            body_end = body_start + length
            if not length or len(buffer) < body_end:
                break
            body = buffer[body_start:body_end]
            buffer = buffer[body_end:]
            on_message(json.loads(body.decode("utf-8")), "content-length")


def handle_message(session: dict[str, Any], message: dict[str, Any]) -> dict[str, Any] | None:
    method = str(message.get("method") or "")
    if method == "initialize":
        return {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "finance", "version": "0.1.0"},
        }
    if method == "tools/list":
        return {"tools": tools_list(session)}
    if method == "tools/call":
        params = message.get("params") if isinstance(message.get("params"), dict) else {}
        result = call_tool(session, str(params.get("name") or ""), params.get("arguments") if isinstance(params.get("arguments"), dict) else {})
        return {"content": [{"type": "text", "text": json.dumps({"ok": True, "result": result}, ensure_ascii=False, indent=2)}]}
    if method == "ping":
        return {}
    if method.startswith("notifications/"):
        return None
    raise FinanceMcpError("method_not_found")


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    session = load_workspace(args)

    def on_message(message: dict[str, Any], framing: str = "content-length") -> None:
        if "id" not in message:
            return
        try:
            result = handle_message(session, message)
            if result is None:
                return
            sys.stdout.buffer.write(encode_message({"jsonrpc": "2.0", "id": message["id"], "result": result}, framing))
        except Exception as exc:
            sys.stdout.buffer.write(encode_message({
                "jsonrpc": "2.0",
                "id": message["id"],
                "error": {"code": -32000, "message": bounded_error(exc)},
            }, framing))
        sys.stdout.buffer.flush()

    parse_messages(on_message)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except Exception as exc:
        sys.stderr.write(f"{bounded_error(exc)}\n")
        raise SystemExit(1)
