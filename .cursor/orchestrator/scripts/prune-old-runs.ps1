param(
  [int]$Days = 5,
  [switch]$WhatIf
)

$runRoot = Join-Path $PSScriptRoot "..\run"
$threshold = (Get-Date).AddDays(-$Days)

if (-not (Test-Path $runRoot)) {
  Write-Host "Run root not found: $runRoot"
  exit 0
}

$targets = Get-ChildItem -Path $runRoot -Directory |
  Where-Object { $_.Name -ne "README.md" } |
  Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}-' } |
  Where-Object { $_.LastWriteTime -lt $threshold }

if (-not $targets) {
  Write-Host "No dated run folders older than $Days days."
  exit 0
}

foreach ($target in $targets) {
  if ($WhatIf) {
    Write-Host "[WhatIf] Would remove $($target.FullName)"
    continue
  }

  Remove-Item -Path $target.FullName -Recurse -Force
  Write-Host "Removed $($target.FullName)"
}
