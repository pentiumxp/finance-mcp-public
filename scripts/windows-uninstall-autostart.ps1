param(
  [string]$TaskName = "Finance MCP Backend"
)

$ErrorActionPreference = "Stop"

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Output "Removed scheduled task: $TaskName"
} else {
  Write-Output "Scheduled task not found: $TaskName"
}

$startupDir = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDir "$TaskName.lnk"
if (Test-Path $shortcutPath) {
  Remove-Item -LiteralPath $shortcutPath -Force
  Write-Output "Removed Startup shortcut: $shortcutPath"
} else {
  Write-Output "Startup shortcut not found: $shortcutPath"
}
