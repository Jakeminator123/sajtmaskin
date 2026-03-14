param(
  [string]$RunName,
  [switch]$WhatIf
)

$runRoot = Join-Path $PSScriptRoot "..\run"
$archiveRoot = Join-Path $PSScriptRoot "..\archive"
$summaryPath = Join-Path $PSScriptRoot "..\run-summaries.md"

function Ensure-SummaryFile {
  if (Test-Path $summaryPath) {
    return
  }

  $initialContent = @(
    "# Orchestrator Run Summaries",
    "",
    "Short summaries of completed orchestrator runs. Agents can read this file for context; use exact archive paths when full run details are needed.",
    "",
    "---",
    ""
  )

  Set-Content -Path $summaryPath -Value $initialContent
}

function Get-FirstParagraphLine {
  param(
    [string[]]$Lines,
    [string]$Heading
  )

  $headingIndex = [Array]::IndexOf($Lines, $Heading)
  if ($headingIndex -lt 0) {
    return $null
  }

  for ($i = $headingIndex + 1; $i -lt $Lines.Length; $i++) {
    $line = $Lines[$i].Trim()
    if (-not $line) {
      continue
    }
    if ($line.StartsWith("## ")) {
      break
    }
    return $line
  }

  return $null
}

function Get-BulletsAfterMarker {
  param(
    [string[]]$Lines,
    [string]$Marker,
    [int]$MaxItems = 3
  )

  $markerIndex = [Array]::IndexOf($Lines, $Marker)
  if ($markerIndex -lt 0) {
    return @()
  }

  $items = New-Object System.Collections.Generic.List[string]
  for ($i = $markerIndex + 1; $i -lt $Lines.Length; $i++) {
    $line = $Lines[$i].Trim()
    if (-not $line) {
      if ($items.Count -gt 0) {
        break
      }
      continue
    }
    if ($line.StartsWith("## ")) {
      break
    }
    if ($line.StartsWith("- ")) {
      $items.Add($line.Substring(2).Trim())
      if ($items.Count -ge $MaxItems) {
        break
      }
    }
  }

  return $items.ToArray()
}

function New-SummaryEntry {
  param(
    [System.IO.DirectoryInfo]$RunDirectory,
    [string]$ArchiveFolderName
  )

  $finalReportPath = Join-Path $RunDirectory.FullName "FINAL_REPORT.md"
  $reportLines = @(Get-Content -Path $finalReportPath)

  $scope = Get-FirstParagraphLine -Lines $reportLines -Heading "## Planned scope vs delivered scope"
  if (-not $scope) {
    $scope = "See archived FINAL_REPORT.md for details."
  }

  $workloadCount = (Get-ChildItem -Path (Join-Path $RunDirectory.FullName "workloads") -File -Filter "*.md" -ErrorAction SilentlyContinue | Measure-Object).Count
  $verificationCount = (Get-ChildItem -Path (Join-Path $RunDirectory.FullName "verification") -File -Filter "*.md" -ErrorAction SilentlyContinue | Measure-Object).Count

  $outcomes = Get-BulletsAfterMarker -Lines $reportLines -Marker "Delivered:" -MaxItems 3
  if ($outcomes.Count -eq 0) {
    $outcomes = @("Archived run details preserved in FINAL_REPORT.md.")
  }

  $archivedAt = Get-Date -Format "yyyy-MM-dd HH:mm"
  $entry = New-Object System.Collections.Generic.List[string]
  $entry.Add("## $($RunDirectory.Name) (archived $archivedAt)")
  $entry.Add("- **Scope:** $scope")
  $entry.Add("- **Workloads:** $workloadCount completed, $verificationCount verified.")
  foreach ($outcome in $outcomes) {
    $entry.Add("- **Outcome:** $outcome")
  }
  $entry.Add('- **Archive path:** `.cursor/orchestrator/archive/' + $ArchiveFolderName + '/`')
  $entry.Add("")

  return $entry.ToArray()
}

function Get-CompletedRunDirectories {
  if (-not (Test-Path $runRoot)) {
    return @()
  }

  $directories = Get-ChildItem -Path $runRoot -Directory |
    Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}-' }

  if ($RunName) {
    $directories = $directories | Where-Object { $_.Name -eq $RunName }
  }

  return $directories | Where-Object {
    $finalSweepPath = Join-Path -Path ($_.FullName) -ChildPath "FINAL_SWEEP.md"
    $finalReportPath = Join-Path -Path ($_.FullName) -ChildPath "FINAL_REPORT.md"
    (Test-Path $finalSweepPath) -and (Test-Path $finalReportPath)
  }
}

if (-not (Test-Path $runRoot)) {
  Write-Host "Run root not found: $runRoot"
  exit 0
}

if (-not (Test-Path $archiveRoot)) {
  if ($WhatIf) {
    Write-Host "[WhatIf] Would create archive root $archiveRoot"
  } else {
    New-Item -Path $archiveRoot -ItemType Directory -Force | Out-Null
  }
}

Ensure-SummaryFile

$targets = @(Get-CompletedRunDirectories)
if (-not $targets) {
  if ($RunName) {
    Write-Host "No completed run named '$RunName' found under $runRoot."
  } else {
    Write-Host "No completed runs found under $runRoot."
  }
  exit 0
}

$summaryContent = if (Test-Path $summaryPath) { Get-Content -Path $summaryPath -Raw } else { "" }

foreach ($target in $targets) {
  $timestamp = Get-Date -Format "HHmmss"
  $archiveFolderName = "$($target.Name)-$timestamp"
  $destination = Join-Path $archiveRoot $archiveFolderName

  while (Test-Path $destination) {
    Start-Sleep -Milliseconds 1100
    $timestamp = Get-Date -Format "HHmmss"
    $archiveFolderName = "$($target.Name)-$timestamp"
    $destination = Join-Path $archiveRoot $archiveFolderName
  }

  if ($WhatIf) {
    Write-Host "[WhatIf] Would archive $($target.FullName) -> $destination"
    continue
  }

  $entry = New-SummaryEntry -RunDirectory $target -ArchiveFolderName $archiveFolderName
  $archivePathLine = '- **Archive path:** `.cursor/orchestrator/archive/' + $archiveFolderName + '/`'
  if ($summaryContent -notmatch [regex]::Escape($archivePathLine)) {
    Add-Content -Path $summaryPath -Value $entry
    $summaryContent += ($entry -join [Environment]::NewLine) + [Environment]::NewLine
  }

  Move-Item -Path $target.FullName -Destination $destination
  Write-Host "Archived $($target.Name) -> $destination"
}
