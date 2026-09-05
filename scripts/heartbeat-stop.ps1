# Opreste procesul heartbeat pornit de scripts/heartbeat.ps1 (citeste runs/heartbeat.pid).
$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $root "runs\heartbeat.pid"
if (Test-Path $pidFile) {
  $hbPid = [int](Get-Content $pidFile -Raw).Trim()
  if ($hbPid -gt 0) { Stop-Process -Id $hbPid -Force; Write-Output "heartbeat pid $hbPid oprit" }
  Remove-Item $pidFile -Force
} else {
  Write-Output "niciun heartbeat activ (lipseste runs/heartbeat.pid)"
}
Add-Content -Path (Join-Path $root "HEARTBEAT.log") -Value ("[{0}] heartbeat STOP" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss")) -Encoding utf8
