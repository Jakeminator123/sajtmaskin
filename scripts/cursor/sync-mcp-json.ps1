# Sync gitignored .cursor/mcp.json from example into this checkout,
# this machine's user-level Cursor config, and optional sibling worktrees.
param(
  [switch]$AllWorktrees
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$example = Join-Path $root '.cursor\mcp.json.example'
if (-not (Test-Path $example)) { throw "Missing $example" }

function Sync-One([string]$dest) {
  $dir = Split-Path -Parent $dest
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  Copy-Item $example $dest -Force
  Write-Host "Synced $dest"
}

Sync-One (Join-Path $root '.cursor\mcp.json')
Sync-One (Join-Path $env:USERPROFILE '.cursor\mcp.json')

if ($AllWorktrees) {
  Push-Location $root
  try {
    $lines = git worktree list --porcelain
    $paths = @()
    foreach ($line in $lines) {
      if ($line -like 'worktree *') { $paths += $line.Substring(9) }
    }
    foreach ($p in $paths) {
      if ((Resolve-Path $p).Path -ne (Resolve-Path $root).Path) {
        Sync-One (Join-Path $p '.cursor\mcp.json')
      }
    }
  } finally { Pop-Location }
}
