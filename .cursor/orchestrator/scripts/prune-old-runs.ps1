param(
  [int]$Days = 30,
  [switch]$WhatIf
)

# Prune from archive (completed runs live there; run/ stays lean)
$archiveRoot = Join-Path $PSScriptRoot "..\archive"
$threshold = (Get-Date).AddDays(-$Days)

if (-not (Test-Path $archiveRoot)) {
  Write-Host "Archive root not found: $archiveRoot"
  exit 0
}

$targets = Get-ChildItem -Path $archiveRoot -Directory |
  Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}-' } |
  Where-Object { $_.LastWriteTime -lt $threshold }

if (-not $targets) {
  Write-Host "No archived run folders older than $Days days."
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
