# Sync gitignored .cursor/mcp.json from example into this checkout (and optional sibling worktrees).
param(
  [switch]$AllWorktrees
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$example = Join-Path $root '.cursor\mcp.json.example'
if (-not (Test-Path $example)) { throw "Missing $example" }

function Sync-One([string]$repoRoot) {
  $dest = Join-Path $repoRoot '.cursor\mcp.json'
  $cursorDir = Join-Path $repoRoot '.cursor'
  if (-not (Test-Path $cursorDir)) { New-Item -ItemType Directory -Path $cursorDir | Out-Null }
  Copy-Item $example $dest -Force
  Write-Host "Synced $dest"
}

Sync-One $root

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
        # Use the example from main repo so all worktrees share the same template
        $dest = Join-Path $p '.cursor\mcp.json'
        $cursorDir = Join-Path $p '.cursor'
        if (-not (Test-Path $cursorDir)) { New-Item -ItemType Directory -Path $cursorDir | Out-Null }
        Copy-Item $example $dest -Force
        Write-Host "Synced $dest"
      }
    }
  } finally { Pop-Location }
}
