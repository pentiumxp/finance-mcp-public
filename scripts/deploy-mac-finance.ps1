param(
  [string]$HostName = "homeai-macstudio-prod",
  [string]$RemoteDir = "/Users/hermes-host/HermesMobile/plugins/finance",
  [string]$RemoteOwner = "hermes-host",
  [string]$RemoteGroup = "staff",
  [string]$ServiceDomain = "system",
  [string]$ServiceLabel = "com.hermesmobile.plugin.finance",
  [int]$Port = 8791,
  [string]$PasswordFile = "",
  [string]$ExpectedStaticVersion = "finance-replica-20260616c",
  [string]$ExpectedServiceWorker = "finance-mcp-pwa-v143"
)

$ErrorActionPreference = "Stop"

function Invoke-CheckedProcess {
  param(
    [Parameter(Mandatory=$true)][string]$FilePath,
    [Parameter(Mandatory=$true)][AllowEmptyString()][string[]]$Arguments,
    [string]$StandardInput = ""
  )
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $FilePath
  $psi.Arguments = ($Arguments | ForEach-Object {
    $arg = [string]$_
    if ($arg.Length -eq 0) {
      '""'
    } elseif ($arg -match '[\s"]') {
      '"' + ($arg -replace '"', '\"') + '"'
    } else {
      $arg
    }
  }) -join " "
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false
  $process = [System.Diagnostics.Process]::Start($psi)
  if ($StandardInput.Length -gt 0) {
    $process.StandardInput.Write($StandardInput)
  }
  $process.StandardInput.Close()
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    throw "Command failed ($($process.ExitCode)): $FilePath $($Arguments -join ' ')`n$stderr`n$stdout"
  }
  return [pscustomobject]@{ Stdout = $stdout; Stderr = $stderr }
}

function Convert-ToTarPath {
  param([string]$Path)
  return $Path.Replace("\", "/")
}

function Quote-RemoteArg {
  param([string]$Value)
  return "'" + ($Value -replace "'", "'\''") + "'"
}

$root = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
if ([string]::IsNullOrWhiteSpace($PasswordFile)) {
  $PasswordFile = Join-Path ([Environment]::GetFolderPath("Desktop")) "NAS.TXT"
}
if (!(Test-Path -LiteralPath $PasswordFile)) {
  throw "Password file not found: $PasswordFile"
}
$sudoPassword = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $PasswordFile)).TrimEnd("`r", "`n")
if ([string]::IsNullOrWhiteSpace($sudoPassword)) {
  throw "Password file is empty: $PasswordFile"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "finance-mac-deploy-$stamp"
New-Item -ItemType Directory -Path $tempRoot | Out-Null
$archive = Join-Path $tempRoot "finance-mcp-$stamp.tar.gz"
$remoteArchive = "/tmp/finance-mcp-$stamp.tar.gz"
$remoteScript = "/tmp/finance-mcp-deploy-$stamp.sh"
$localScript = Join-Path $tempRoot "finance-mcp-deploy-$stamp.sh"

$deployItems = @(
  "adapters",
  "docs",
  "gateway-plugins",
  "mcp",
  "public",
  "scripts",
  "server-routes",
  "tests",
  "AGENTS.md",
  ".gitattributes",
  ".gitignore",
  "package.json",
  "server.js"
)

Push-Location $root
try {
  $tarItems = $deployItems | Where-Object { Test-Path -LiteralPath $_ } | ForEach-Object { Convert-ToTarPath $_ }
  if (!$tarItems.Length) {
    throw "No deployment items found under $root"
  }
  & tar.exe -czf $archive @tarItems
  if ($LASTEXITCODE -ne 0) {
    throw "tar.exe failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

$remoteShell = @'
set -euo pipefail

archive="$1"
prod="$2"
owner="$3"
group="$4"
service_domain="$5"
service_label="$6"
port="$7"
expected_static="$8"
expected_sw="$9"
stamp="${10}"

backup_root="/Users/${owner}/HermesMobile/backups/finance-deploy"
node_bin="/Users/${owner}/HermesMobile/runtime/node-current/bin/node"
mkdir -p "$backup_root"

if [ ! -d "$prod" ]; then
  echo "production directory missing: $prod" >&2
  exit 1
fi

source_backup="${backup_root}/finance-source-${stamp}.tar.gz"
db_backup=""
images_db_backup=""

backup_items=()
for item in adapters docs gateway-plugins mcp public scripts server-routes tests AGENTS.md .gitattributes .gitignore package.json package-lock.json server.js; do
  if [ -e "${prod}/${item}" ]; then
    backup_items+=("$item")
  fi
done
if [ "${#backup_items[@]}" -gt 0 ]; then
  (cd "$prod" && tar -czf "$source_backup" "${backup_items[@]}")
fi

if [ -f "${prod}/data/finance.sqlite3" ]; then
  db_backup="${prod}/data/finance.sqlite3.before-mac-deploy-${stamp}.bak"
  cp "${prod}/data/finance.sqlite3" "$db_backup"
  chown "$owner:$group" "$db_backup"
fi
if [ -f "${prod}/data/finance-images.sqlite3" ]; then
  images_db_backup="${prod}/data/finance-images.sqlite3.before-mac-deploy-${stamp}.bak"
  cp "${prod}/data/finance-images.sqlite3" "$images_db_backup"
  chown "$owner:$group" "$images_db_backup"
fi

for item in adapters docs gateway-plugins mcp public scripts server-routes tests AGENTS.md .gitattributes .gitignore package.json server.js; do
  rm -rf "${prod}/${item}"
done
tar -xzf "$archive" -C "$prod"

for item in adapters docs gateway-plugins mcp public scripts server-routes tests AGENTS.md .gitattributes .gitignore package.json server.js; do
  if [ -e "${prod}/${item}" ]; then
    chown -R "$owner:$group" "${prod}/${item}"
  fi
done

(cd "$prod" && "$node_bin" --check public/app-finance-ui.js)
(cd "$prod" && "$node_bin" tests/app-finance-ui.test.js)

launchctl kickstart -k "${service_domain}/${service_label}"

deadline=$((SECONDS + 40))
until curl -fsS "http://127.0.0.1:${port}/api/finance/client-version" >/dev/null; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "service did not become ready on port ${port}" >&2
    exit 1
  fi
  sleep 1
done

html="$(curl -fsS "http://127.0.0.1:${port}/finance.html")"
sw="$(curl -fsS "http://127.0.0.1:${port}/service-worker.js")"
printf "%s" "$html" | grep -q "$expected_static"
printf "%s" "$sw" | grep -q "$expected_sw"

echo "source_backup=$source_backup"
if [ -n "$db_backup" ]; then echo "db_backup=$db_backup"; fi
if [ -n "$images_db_backup" ]; then echo "images_db_backup=$images_db_backup"; fi
echo "static=$expected_static"
echo "service_worker=$expected_sw"
echo "service=${service_domain}/${service_label}"
'@

[System.IO.File]::WriteAllText($localScript, $remoteShell, [System.Text.UTF8Encoding]::new($false))

Invoke-CheckedProcess -FilePath "scp.exe" -Arguments @($archive, "${HostName}:${remoteArchive}") | Out-Null
Invoke-CheckedProcess -FilePath "scp.exe" -Arguments @($localScript, "${HostName}:${remoteScript}") | Out-Null

$sudoInput = $sudoPassword + "`n"
$remoteCommand = @(
  "sudo",
  "-S",
  "-p",
  (Quote-RemoteArg ""),
  "bash",
  (Quote-RemoteArg $remoteScript),
  (Quote-RemoteArg $remoteArchive),
  (Quote-RemoteArg $RemoteDir),
  (Quote-RemoteArg $RemoteOwner),
  (Quote-RemoteArg $RemoteGroup),
  (Quote-RemoteArg $ServiceDomain),
  (Quote-RemoteArg $ServiceLabel),
  (Quote-RemoteArg ([string]$Port)),
  (Quote-RemoteArg $ExpectedStaticVersion),
  (Quote-RemoteArg $ExpectedServiceWorker),
  (Quote-RemoteArg $stamp)
) -join " "
$remoteArgs = @($HostName, $remoteCommand)
$result = Invoke-CheckedProcess -FilePath "ssh.exe" -Arguments $remoteArgs -StandardInput $sudoInput
$stdout = $result.Stdout.Trim()
$stderr = $result.Stderr.Trim()
if ($stderr) {
  Write-Host $stderr
}
Write-Host $stdout

Invoke-CheckedProcess -FilePath "ssh.exe" -Arguments @($HostName, "rm", "-f", $remoteArchive, $remoteScript) | Out-Null
Remove-Item -LiteralPath $tempRoot -Recurse -Force
