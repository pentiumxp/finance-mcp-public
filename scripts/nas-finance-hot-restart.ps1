param(
  [string]$NasHost = "192.168.10.99",
  [int]$SshPort = 2222,
  [string]$SshUser = "xuxinxp",
  [string]$SshKeyPath = "$env:USERPROFILE\.ssh\synology_ed25519",
  [string]$FinanceSourcePath = "/volume1/docker/finance-mcp/source",
  [string]$NasSmbSourcePath = "\\$NasHost\docker\finance-mcp\source",
  [string]$ContainerName = "finance-mcp",
  [ValidateSet("auto", "gateway-mcp", "container")]
  [string]$Mode = "auto",
  [switch]$SkipSyntaxCheck,
  [switch]$KeepRemoteScript
)

$ErrorActionPreference = "Stop"

function Write-Utf8NoBomFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Text
  )
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $encoding)
}

function Invoke-CheckedProcess {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath failed with exit code $LASTEXITCODE"
  }
}

if (-not (Test-Path -LiteralPath $SshKeyPath)) {
  throw "SSH key was not found: $SshKeyPath"
}

$remote = "$SshUser@$NasHost"
$scriptName = "finance-nas-hot-restart-$([guid]::NewGuid().ToString('N')).sh"
$remoteScript = "$FinanceSourcePath/.agent-context/$scriptName"
$localScript = Join-Path $env:TEMP "finance-nas-hot-restart-$([guid]::NewGuid().ToString('N')).sh"
$skipSyntax = if ($SkipSyntaxCheck) { "1" } else { "0" }
$keepRemote = if ($KeepRemoteScript) { "1" } else { "0" }

$scriptBody = @'
#!/bin/sh
set -eu

mode="$1"
finance_source="$2"
container_name="$3"
skip_syntax="$4"
keep_remote="$5"
script_path="$6"

log() {
  printf '%s\n' "$*"
}

node_bin() {
  if [ -x /volume1/docker/hermes-mobile/runtime/node-current/bin/node ]; then
    printf '%s\n' /volume1/docker/hermes-mobile/runtime/node-current/bin/node
  elif command -v node >/dev/null 2>&1; then
    command -v node
  else
    printf '%s\n' ""
  fi
}

docker_bin() {
  if [ -x /usr/local/bin/docker ]; then
    printf '%s\n' /usr/local/bin/docker
  elif command -v docker >/dev/null 2>&1; then
    command -v docker
  else
    printf '%s\n' ""
  fi
}

finance_container_restart_helper() {
  if [ -x /usr/local/bin/finance-mcp-restart-container ]; then
    printf '%s\n' /usr/local/bin/finance-mcp-restart-container
  else
    printf '%s\n' ""
  fi
}

syntax_check() {
  if [ "$skip_syntax" = "1" ]; then
    log "syntax_check=skipped"
    return 0
  fi
  python3 -m py_compile "$finance_source/scripts/finance_mcp_stdio.py"
  node_path="$(node_bin)"
  if [ -n "$node_path" ]; then
    "$node_path" --check "$finance_source/scripts/finance-mcp-stdio.js"
    "$node_path" --check "$finance_source/server-routes/finance-api-routes.js"
  else
    log "node_check=skipped_node_not_found"
  fi
  log "syntax_check=ok"
}

wrapper_pids() {
  ps -eo pid=,user=,args= \
    | awk '$0 ~ /finance_mcp_stdio[.]py/ { print $1 }'
}

restart_gateway_wrappers() {
  pids="$(wrapper_pids || true)"
  if [ -z "$pids" ]; then
    log "gateway_wrapper_restart=no_running_processes"
    return 0
  fi
  count="$(printf '%s\n' "$pids" | awk 'NF { n += 1 } END { print n + 0 }')"
  log "gateway_wrapper_restart=terminating count=$count"
  # Scope is intentionally limited to Finance MCP stdio wrapper processes.
  # Gateway should spawn fresh wrapper processes from the deployed source when needed.
  kill -TERM $pids 2>/dev/null || true
  sleep 2
  alive=""
  for pid in $pids; do
    if kill -0 "$pid" 2>/dev/null; then
      alive="$alive $pid"
    fi
  done
  if [ -n "$alive" ]; then
    log "gateway_wrapper_restart=force_terminating"
    kill -KILL $alive 2>/dev/null || true
  fi
  log "gateway_wrapper_restart=ok"
}

restart_container_if_allowed() {
  if [ "$mode" = "gateway-mcp" ]; then
    log "container_restart=skipped_mode_gateway_mcp"
    return 0
  fi

  docker_path="$(docker_bin)"
  if [ -z "$docker_path" ]; then
    if [ "$mode" = "container" ]; then
      log "container_restart=failed_docker_not_found"
      return 20
    fi
    log "container_restart=unavailable_docker_not_found"
    return 0
  fi

  if "$docker_path" ps >/dev/null 2>&1; then
    "$docker_path" restart "$container_name" >/dev/null
    log "container_restart=ok method=direct"
    return 0
  fi

  if command -v sudo >/dev/null 2>&1 && sudo -n "$docker_path" ps >/dev/null 2>&1; then
    if sudo -n "$docker_path" restart "$container_name" >/dev/null 2>&1; then
      log "container_restart=ok method=sudo_n"
      return 0
    fi
  fi

  helper_path="$(finance_container_restart_helper)"
  if [ -n "$helper_path" ] && command -v sudo >/dev/null 2>&1 && sudo -n "$helper_path" >/dev/null 2>&1; then
    log "container_restart=ok method=sudo_helper"
    return 0
  fi

  if [ "$mode" = "container" ]; then
    log "container_restart=failed_permission_denied"
    return 21
  fi
  log "container_restart=unavailable_permission_denied"
  return 0
}

smoke_http() {
  if command -v curl >/dev/null 2>&1; then
    code=""
    for attempt in 1 2 3 4 5 6 7 8 9 10; do
      code="$(curl -sS -m 5 -o /tmp/finance-hot-restart-client-version.json -w '%{http_code}' http://127.0.0.1:8791/api/finance/client-version 2>/dev/null || true)"
      if [ "$code" = "200" ]; then
        log "client_version_http=200 attempt=$attempt"
        return 0
      fi
      sleep 2
    done
    log "client_version_http=$code"
  else
    log "client_version_http=skipped_curl_not_found"
  fi
}

cleanup() {
  if [ "$keep_remote" != "1" ] && [ -n "$script_path" ]; then
    rm -f "$script_path" 2>/dev/null || true
  fi
}

trap cleanup EXIT

log "finance_hot_restart_begin mode=$mode"
syntax_check
restart_gateway_wrappers
restart_container_if_allowed
smoke_http
log "finance_hot_restart_done"
'@

try {
  Write-Utf8NoBomFile -Path $localScript -Text $scriptBody
  $copied = $false
  if ($NasSmbSourcePath -and (Test-Path -LiteralPath $NasSmbSourcePath)) {
    $smbAgentContext = Join-Path $NasSmbSourcePath ".agent-context"
    if (-not (Test-Path -LiteralPath $smbAgentContext)) {
      New-Item -ItemType Directory -Path $smbAgentContext | Out-Null
    }
    Copy-Item -LiteralPath $localScript -Destination (Join-Path $smbAgentContext $scriptName) -Force
    $copied = $true
  }
  if (-not $copied) {
    Invoke-CheckedProcess -FilePath "scp" -Arguments @(
      "-i", $SshKeyPath,
      "-P", [string]$SshPort,
      "-o", "BatchMode=yes",
      "-o", "StrictHostKeyChecking=accept-new",
      $localScript,
      "${remote}:$remoteScript"
    )
  }
  Invoke-CheckedProcess -FilePath "ssh" -Arguments @(
    "-i", $SshKeyPath,
    "-p", [string]$SshPort,
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    $remote,
    "sh '$remoteScript' '$Mode' '$FinanceSourcePath' '$ContainerName' '$skipSyntax' '$keepRemote' '$remoteScript'"
  )
} finally {
  Remove-Item -LiteralPath $localScript -Force -ErrorAction SilentlyContinue
}
