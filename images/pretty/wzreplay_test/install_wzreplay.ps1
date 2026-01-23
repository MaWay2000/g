# Registers wzreplay:// protocol for CURRENT USER (no admin needed)
# Handler is a PowerShell script (no Python required).

$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$handler = Join-Path $here "wzreplay_handler.ps1"

if (!(Test-Path $handler)) {
  throw "Missing file: $handler"
}

$ps = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
if (!(Test-Path $ps)) { throw "powershell.exe not found at $ps" }

Write-Host "Using PowerShell: $ps"
Write-Host "Handler: $handler"

$base = "HKCU:\Software\Classes\wzreplay"
New-Item -Path $base -Force | Out-Null
New-ItemProperty -Path $base -Name "(Default)" -Value "URL:WZ Replay Protocol" -PropertyType String -Force | Out-Null
New-ItemProperty -Path $base -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null

New-Item -Path "$base\DefaultIcon" -Force | Out-Null
New-ItemProperty -Path "$base\DefaultIcon" -Name "(Default)" -Value "$ps,0" -PropertyType String -Force | Out-Null

New-Item -Path "$base\shell\open\command" -Force | Out-Null
$cmdLine = "`"$ps`" -NoProfile -ExecutionPolicy Bypass -File `"$handler`" `"%1`""
New-ItemProperty -Path "$base\shell\open\command" -Name "(Default)" -Value $cmdLine -PropertyType String -Force | Out-Null

Write-Host ""
Write-Host "Installed wzreplay:// handler for current user."
Write-Host "Now click the wzreplay:// link on your test page."
