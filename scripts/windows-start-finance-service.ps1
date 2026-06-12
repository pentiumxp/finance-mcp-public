param(
  [string]$WorkspacePath = "",
  [string]$HostName = "",
  [int]$Port = 8791
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($WorkspacePath)) {
  $WorkspacePath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
  $WorkspacePath = (Resolve-Path $WorkspacePath).Path
}

if ([string]::IsNullOrWhiteSpace($HostName)) {
  $HostName = if ([string]::IsNullOrWhiteSpace($env:FINANCE_MCP_HOST)) { "0.0.0.0" } else { $env:FINANCE_MCP_HOST }
}

if ($Port -le 0) {
  $Port = if ([string]::IsNullOrWhiteSpace($env:FINANCE_MCP_PORT)) { 8791 } else { [int]$env:FINANCE_MCP_PORT }
}

$dataDir = Join-Path $WorkspacePath "data"
$logDir = Join-Path $dataDir "logs"
$pidFile = Join-Path $dataDir "finance-server.pid"
$stdoutFile = Join-Path $logDir "finance-server.out.log"
$stderrFile = Join-Path $logDir "finance-server.err.log"
$healthUrl = "http://127.0.0.1:$Port/api/finance/client-version"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Test-FinanceHealth {
  try {
    $response = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    return [bool]$response.ok
  } catch {
    return $false
  }
}

if (Test-FinanceHealth) {
  Write-Output "Finance service is already running on $healthUrl"
  exit 0
}

$listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listeners) {
  $owners = ($listeners | Select-Object -ExpandProperty OwningProcess -Unique) -join ","
  throw "Port $Port is already in use by process id(s): $owners, but Finance health check failed."
}

$node = (Get-Command node -ErrorAction Stop).Source

$env:FINANCE_MCP_HOST = $HostName
$env:FINANCE_MCP_PORT = [string]$Port

$process = Start-Process `
  -FilePath $node `
  -ArgumentList @("server.js") `
  -WorkingDirectory $WorkspacePath `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutFile `
  -RedirectStandardError $stderrFile `
  -PassThru

Set-Content -Path $pidFile -Value ([string]$process.Id) -Encoding utf8

$deadline = (Get-Date).AddSeconds(25)
while ((Get-Date) -lt $deadline) {
  if ($process.HasExited) {
    throw "Finance service process exited early with code $($process.ExitCode). See $stderrFile"
  }
  if (Test-FinanceHealth) {
    Write-Output "Finance service started. PID=$($process.Id), URL=http://127.0.0.1:$Port/finance.html"
    exit 0
  }
  Start-Sleep -Milliseconds 500
}

throw "Finance service did not become healthy within 25 seconds. PID=$($process.Id), stderr=$stderrFile"
