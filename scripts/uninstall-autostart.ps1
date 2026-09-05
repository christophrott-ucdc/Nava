# Scoate taskul Task Scheduler "NavaPlayer" creat de scripts/install-autostart.ps1.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/uninstall-autostart.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/uninstall-autostart.ps1 -TaskName "NavaPlayer"
#
# Nu atinge cheia Run din HKCU pe care o scrie executabilul cand config.autostart=true; pentru aceea pune
# "autostart": false in config.json si porneste o data aplicatia (isi scoate singura intrarea).
[CmdletBinding()]
param(
  [string]$TaskName = "NavaPlayer"
)

$ErrorActionPreference = "Stop"

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  Write-Host "[autostart] taskul '$TaskName' nu exista - nimic de facut."
  exit 0
}

if ($task.State -eq "Running") {
  Write-Host "[autostart] taskul ruleaza -> il opresc (inchide si playerul pornit de el)"
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "[autostart] taskul '$TaskName' a fost sters."
