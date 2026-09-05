# Heartbeat de continuitate: la fiecare N secunde scrie in HEARTBEAT.log ce s-a schimbat in repo.
# Ruleaza detasat (Start-Process ... -WindowStyle Hidden) ca sa supravietuiasca sesiunii care l-a pornit.
#   pornire:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/heartbeat.ps1 [-IntervalSec 60]
#   oprire:   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/heartbeat-stop.ps1
param([int]$IntervalSec = 60)

$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path -Parent $PSScriptRoot
$log = Join-Path $root "HEARTBEAT.log"
$runs = Join-Path $root "runs"
New-Item -ItemType Directory -Force -Path $runs | Out-Null
$pidFile = Join-Path $runs "heartbeat.pid"
Set-Content -Path $pidFile -Value $PID -Encoding ascii

$watch = @("src", "scripts", "docs", "assets\show", "assets\voice\ro\manifest.json", "HANDOFF.md", "HANDOFF-LIVE.md", "package.json", "config.example.json")
Add-Content -Path $log -Value ("[{0}] heartbeat START pid={1} interval={2}s" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $PID, $IntervalSec) -Encoding utf8

while ($true) {
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $since = (Get-Date).AddSeconds(-($IntervalSec + 15))
  $recent = @()
  foreach ($w in $watch) {
    $p = Join-Path $root $w
    if (Test-Path $p -PathType Container) {
      $recent += Get-ChildItem -Path $p -Recurse -File | Where-Object { $_.LastWriteTime -gt $since } | ForEach-Object { $_.FullName.Substring($root.Length + 1) }
    } elseif (Test-Path $p) {
      $f = Get-Item $p
      if ($f.LastWriteTime -gt $since) { $recent += $w }
    }
  }
  $porcelain = @(git -C $root status --porcelain 2>$null)
  $changed = $porcelain.Count
  $head = (git -C $root rev-parse --short HEAD 2>$null)
  $last = (Get-Content (Join-Path $root "HANDOFF-LIVE.md") -Tail 1 -Encoding utf8)
  $recentTxt = if ($recent.Count -gt 0) { ($recent | Select-Object -Unique | Select-Object -First 25) -join ", " } else { "-" }
  $line = "[{0}] head={1} uncommitted={2} modified<{3}s: {4} | last-live: {5}" -f $ts, $head, $changed, ($IntervalSec + 15), $recentTxt, $last
  Add-Content -Path $log -Value $line -Encoding utf8
  Start-Sleep -Seconds $IntervalSec
}
