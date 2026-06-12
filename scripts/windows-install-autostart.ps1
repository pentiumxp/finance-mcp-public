param(
  [string]$TaskName = "Finance MCP Backend",
  [string]$WorkspacePath = "",
  [switch]$RunNow
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($WorkspacePath)) {
  $WorkspacePath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
  $WorkspacePath = (Resolve-Path $WorkspacePath).Path
}

$startScript = Join-Path $WorkspacePath "scripts\windows-start-finance-service.ps1"
if (-not (Test-Path $startScript)) {
  throw "Start script not found: $startScript"
}

$argument = "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`" -WorkspacePath `"$WorkspacePath`" -HostName 0.0.0.0 -Port 8791"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argument
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

try {
  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Start the local Finance MCP/UI backend on Windows user logon." `
    -Force | Out-Null

  Write-Output "Registered scheduled task: $TaskName"
} catch {
  $startupDir = [Environment]::GetFolderPath("Startup")
  $shortcutPath = Join-Path $startupDir "$TaskName.lnk"
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = "powershell.exe"
  $shortcut.Arguments = $argument
  $shortcut.WorkingDirectory = $WorkspacePath
  $shortcut.WindowStyle = 7
  $shortcut.Description = "Start the local Finance MCP/UI backend on Windows user logon."
  $shortcut.Save()
  Write-Output "Scheduled task registration failed: $($_.Exception.Message)"
  Write-Output "Registered Startup shortcut fallback: $shortcutPath"
}

if ($RunNow) {
  & $startScript -WorkspacePath $WorkspacePath -HostName "0.0.0.0" -Port 8791
}
