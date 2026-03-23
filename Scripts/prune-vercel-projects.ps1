<#
.SYNOPSIS
  Lista eller radera Vercel-projekt för ett team utom en fast allowlist.

.DESCRIPTION
  Anropar Vercel REST API (Bearer). Standard: torrkörning — skriver bara vad som skulle raderas.
  Lägg till -Force för att verkligen köra DELETE på varje projekt som inte finns i keep-listan.

  Kräver miljövariabler:
  - VERCEL_TOKEN  (token med rätt att lista/radera projekt)
  - VERCEL_TEAM_ID (t.ex. team_...)

.EXAMPLE
  $env:VERCEL_TOKEN = '...'
  $env:VERCEL_TEAM_ID = 'team_...'
  pwsh .\Scripts\prune-vercel-projects.ps1

.EXAMPLE
  pwsh .\Scripts\prune-vercel-projects.ps1 -Force
#>
param(
  [string]$TeamId = $env:VERCEL_TEAM_ID,
  [string]$Token = $env:VERCEL_TOKEN,
  [switch]$Force,
  [string[]]$Keep = @(
    'sajtmaskin',
    'app-directory',
    'flytta_nu',
    'aev',
    'aecv',
    'blazel',
    'dg-97',
    # Samma appar som ovan men skapade med v0-prefix på Vercel
    'v0-dg-97',
    'v0-bla-zel'
  )
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $Token) {
  throw 'Sätt VERCEL_TOKEN (Vercel-kontotoken med behörighet att lista/radera projekt).'
}
if (-not $TeamId) {
  throw 'Sätt VERCEL_TEAM_ID (team_...).'
}

$keepSet = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($k in $Keep) {
  [void]$keepSet.Add($k)
}

$base = 'https://api.vercel.com/v9/projects'
$headers = @{ Authorization = "Bearer $Token" }

function Invoke-VercelProjectsPage {
  param(
    [Nullable[long]]$Until
  )
  if ($null -ne $Until) {
    $uri = "$base" + '?teamId=' + [uri]::EscapeDataString($TeamId) + '&limit=100&until=' + $Until
  } else {
    $uri = "$base" + '?teamId=' + [uri]::EscapeDataString($TeamId) + '&limit=100'
  }
  return Invoke-RestMethod -Uri $uri -Headers $headers -Method Get
}

$all = [System.Collections.Generic.List[object]]::new()
$until = [Nullable[long]]$null
while ($true) {
  $page = Invoke-VercelProjectsPage -Until $until
  foreach ($p in $page.projects) {
    $all.Add($p)
  }
  $next = $page.pagination.next
  if ($null -eq $next) {
    break
  }
  $until = [long]$next
}

$toRemove = @($all | Where-Object { -not $keepSet.Contains($_.name) })

Write-Host "Team: $TeamId"
Write-Host "Behåller ($($Keep.Count)): $($Keep -join ', ')"
Write-Host "Projekt totalt: $($all.Count); skulle radera: $($toRemove.Count)"
Write-Host ''

foreach ($p in ($toRemove | Sort-Object name)) {
  $n = $p.name
  $id = $p.id
  if ($Force) {
    $delUri = "$base/$id" + '?teamId=' + [uri]::EscapeDataString($TeamId)
    try {
      Invoke-RestMethod -Uri $delUri -Headers $headers -Method Delete | Out-Null
      Write-Host "RADERAT $n ($id)"
    } catch {
      Write-Host "MISSLYCKADES $n ($id): $_" -ForegroundColor Red
    }
  } else {
    Write-Host "skulle radera: $n ($id)"
  }
}

if (-not $Force -and $toRemove.Count -gt 0) {
  Write-Host ''
  Write-Host 'Torrkörning. Kör igen med -Force för att radera på riktigt.'
}
