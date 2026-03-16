param(
  [string]$RunName
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$ControlRoot = Join-Path $RepoRoot ".cursor\control-agent"
$RunRoot = Join-Path $ControlRoot "run"
$ArchiveRoot = Join-Path $ControlRoot "archive"
$SummaryPath = Join-Path $ControlRoot "review-summaries.md"

New-Item -ItemType Directory -Force -Path $ArchiveRoot | Out-Null

function Get-RunFolders {
  if (-not (Test-Path $RunRoot)) { return @() }
  Get-ChildItem -Path $RunRoot -Directory | Where-Object { $_.Name -ne "README.md" }
}

function Append-Summary {
  param(
    [string]$RunFolderName,
    [string]$ArchivedFolderName
  )

  if (-not (Test-Path $SummaryPath)) { return }

  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
  $entry = @"

## $RunFolderName (archived $timestamp)
- **Scope:** Local control-agent review archive.
- **Status:** See archived run contents.
- **Top findings:** None summarized automatically.
- **Archive path:** `.cursor/control-agent/archive/$ArchivedFolderName/`
"@

  Add-Content -Path $SummaryPath -Value $entry
}

$targets = if ($RunName) {
  Get-RunFolders | Where-Object { $_.Name -eq $RunName }
} else {
  Get-RunFolders
}

foreach ($folder in $targets) {
  $suffix = Get-Date -Format "HHmmss"
  $destinationName = "$($folder.Name)-$suffix"
  $destinationPath = Join-Path $ArchiveRoot $destinationName
  Move-Item -Path $folder.FullName -Destination $destinationPath
  Append-Summary -RunFolderName $folder.Name -ArchivedFolderName $destinationName
  Write-Host "Archived $($folder.Name) -> $destinationName"
}
