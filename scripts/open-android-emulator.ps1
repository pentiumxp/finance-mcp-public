$ErrorActionPreference = 'Stop'

$avdName = 'Pixel_7_API_35'
$emulatorPath = Join-Path $env:LOCALAPPDATA 'Android\Sdk\emulator\emulator.exe'
if (-not (Test-Path -LiteralPath $emulatorPath)) {
  throw "Android emulator not found: $emulatorPath"
}

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class FinanceWin32 {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@

function Focus-EmulatorWindow {
  $process = Get-Process qemu-system-x86_64 -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -like 'Android Emulator*' -and $_.MainWindowHandle -ne 0 } |
    Select-Object -First 1
  if (-not $process) {
    $process = Get-Process emulator -ErrorAction SilentlyContinue |
      Where-Object { $_.MainWindowTitle -like 'Android Emulator*' -and $_.MainWindowHandle -ne 0 } |
      Select-Object -First 1
  }
  if (-not $process) {
    return $false
  }
  [FinanceWin32]::ShowWindowAsync($process.MainWindowHandle, 9) | Out-Null
  Start-Sleep -Milliseconds 250
  [FinanceWin32]::SetForegroundWindow($process.MainWindowHandle) | Out-Null
  return $true
}

if (Focus-EmulatorWindow) {
  exit 0
}

Start-Process -FilePath $emulatorPath -ArgumentList @('-avd', $avdName) -WorkingDirectory (Split-Path -Parent $emulatorPath)

for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  if (Focus-EmulatorWindow) {
    exit 0
  }
}

throw "Started emulator but could not find a visible Android Emulator window."
