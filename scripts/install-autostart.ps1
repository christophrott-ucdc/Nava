# Inregistreaza NavaPlayer la logon prin Task Scheduler (task "NavaPlayer"): porneste executabilul portabil cu
# --kiosk cand utilizatorul curent se logheaza, dupa o mica intarziere (TV-urile si reteaua au timp sa apara).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-autostart.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-autostart.ps1 -ExePath "D:\Nava\NavaPlayer-0.1.0-x64-portable.exe"
#   powershell ... -File scripts/install-autostart.ps1 -ExePath "C:\Nava\NavaPlayer.exe" -DelaySeconds 30 -Arguments "--kiosk --config config.json"
#
# Fara -ExePath, scriptul cauta NavaPlayer*-portable.exe in dist-app\ (langa acest repo) si apoi orice NavaPlayer*.exe.
# Dezinstalare: scripts/uninstall-autostart.ps1. Alternativa (mai slaba): config.autostart=true -> cheie Run in HKCU,
# setata chiar de executabilul impachetat (src/main/main.ts, applyAutostart).
#
# Taskul ruleaza ca utilizatorul curent, interactiv (are nevoie de desktop), fara limita de timp, nu se opreste pe
# baterie, se relanseaza de 3 ori la 1 minut daca procesul cade, si nu porneste o a doua instanta.
# Daca primesti "Access is denied", ruleaza PowerShell ca administrator (unele politici cer asta la Register-ScheduledTask).
[CmdletBinding()]
param(
  [string]$ExePath = "",
  [string]$TaskName = "NavaPlayer",
  [string]$Arguments = "--kiosk",
  [int]$DelaySeconds = 15,
  [string]$WorkingDirectory = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

function Find-NavaExe {
  $candidates = @()
  $distApp = Join-Path $root "dist-app"
  if (Test-Path $distApp) {
    $candidates += Get-ChildItem -Path $distApp -Filter "NavaPlayer*-portable.exe" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
    $candidates += Get-ChildItem -Path $distApp -Filter "NavaPlayer*.exe" -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -notlike "*setup*" } | Sort-Object LastWriteTime -Descending
  }
  $candidates += Get-ChildItem -Path $root -Filter "NavaPlayer*.exe" -File -ErrorAction SilentlyContinue
  if ($candidates.Count -gt 0) { return $candidates[0].FullName }
  return $null
}

if (-not $ExePath) {
  $ExePath = Find-NavaExe
  if (-not $ExePath) {
    Write-Error "Nu am gasit NavaPlayer*.exe. Ruleaza 'npm run dist' sau da calea cu -ExePath <cale catre exe>."
    exit 1
  }
}
$ExePath = (Resolve-Path $ExePath).Path
if (-not (Test-Path $ExePath -PathType Leaf)) {
  Write-Error "Executabilul nu exista: $ExePath"
  exit 1
}
if (-not $WorkingDirectory) { $WorkingDirectory = Split-Path -Parent $ExePath }

$user = "$env:USERDOMAIN\$env:USERNAME"
Write-Host "[autostart] task     : $TaskName"
Write-Host "[autostart] exe      : $ExePath $Arguments"
Write-Host "[autostart] cwd      : $WorkingDirectory"
Write-Host "[autostart] utilizator: $user (la logon, intarziere ${DelaySeconds}s)"

$action = New-ScheduledTaskAction -Execute $ExePath -Argument $Arguments -WorkingDirectory $WorkingDirectory
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
if ($DelaySeconds -gt 0) { $trigger.Delay = "PT${DelaySeconds}S" }
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -DontStopOnIdleEnd `
  -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "[autostart] taskul exista deja -> il inlocuiesc"
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description "A Patra Lume - NavaPlayer: porneste playerul in mod kiosk la logon." | Out-Null

$task = Get-ScheduledTask -TaskName $TaskName
Write-Host "[autostart] inregistrat: $($task.TaskName) (stare: $($task.State))"
Write-Host "[autostart] test imediat: Start-ScheduledTask -TaskName $TaskName"
Write-Host "[autostart] dezinstalare: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/uninstall-autostart.ps1"
