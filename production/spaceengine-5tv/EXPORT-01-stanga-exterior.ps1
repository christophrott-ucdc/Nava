param(
  [Parameter(Mandatory=$true)][string]$Master,
  [string]$OutputDirectory = (Join-Path $PSScriptRoot 'exports'),
  [switch]$AllowProvisional,
  [int]$Width = 3840
)
$ErrorActionPreference = 'Stop'
$renderArgs = @((Join-Path $PSScriptRoot 'wall-export.mjs'), 'render', '--master', $Master, '--projection', 'equirect', '--screen', '01-stanga-exterior', '--out', $OutputDirectory, '--width', $Width)
if ($AllowProvisional) { $renderArgs += '--allow-provisional' }
& node @renderArgs
if ($LASTEXITCODE -ne 0) { throw 'Export failed; see the error above.' }
