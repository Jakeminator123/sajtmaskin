# Internal helper: load VERCEL_* from repo .env.local and invoke prune script.
param(
  [switch]$Force,
  [string[]]$Keep
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $root '.env.local'
if (-not (Test-Path $envFile)) { throw "Missing $envFile" }
Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith('#')) { return }
  $eq = $line.IndexOf('=')
  if ($eq -lt 1) { return }
  $n = $line.Substring(0, $eq).Trim()
  $v = $line.Substring($eq + 1).Trim()
  if ($v.Length -ge 2 -and $v.StartsWith('"') -and $v.EndsWith('"')) {
    $v = $v.Substring(1, $v.Length - 2)
  }
  if ($n -eq 'VERCEL_TOKEN' -or $n -eq 'VERCEL_TEAM_ID') {
    Set-Item -Path "Env:$n" -Value $v
  }
}
if (-not $env:VERCEL_TOKEN -or -not $env:VERCEL_TEAM_ID) {
  throw 'VERCEL_TOKEN or VERCEL_TEAM_ID not found in .env.local'
}
$prune = Join-Path $PSScriptRoot 'prune-vercel-projects.ps1'
if ($Keep -and $Keep.Count -gt 0) {
  & $prune -Keep $Keep -Force:$Force
} else {
  & $prune -Force:$Force
}
