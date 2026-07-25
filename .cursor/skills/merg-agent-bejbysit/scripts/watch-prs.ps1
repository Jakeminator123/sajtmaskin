<#
.SYNOPSIS
  Billig PR-bevakare för merge-agentrollen (/merg-agent-bejbysit).

.DESCRIPTION
  Pollar öppna PR:er och skriver EN rad per cykel. Agenten ska inte polla själv —
  starta detta i bakgrunden, avsluta turen och vakna på en sentinel-rad:

    NEWPR      #<n>  ny öppen PR upptäckt
    NEWCOMMIT  #<n>  head-SHA ändrad (mognadsklockan startar om)
    FAILED     #<n>  minst en check röd
    ACTIONABLE #<n>  alla checks klara + gröna OCH >= MinutesMature sedan senaste commit

  ACTIONABLE betyder "redo för TRIAGE", inte "merga". Bot-fynd, författarens
  bugg-efterkontroll och P0/P1-läget måste fortfarande bedömas av agenten.

.EXAMPLE
  pwsh -File .cursor/skills/merg-agent-bejbysit/scripts/watch-prs.ps1 -Cycles 40
#>
[CmdletBinding()]
param(
  [int]$IntervalSeconds = 90,
  [int]$MinutesMature = 15,
  [int]$Cycles = 40,
  # PR:er som redan triagerats och blockerats i väntan på författaren. De larmar
  # inte som ACTIONABLE (de är gröna men får ändå inte merge:as), men en NY commit
  # på dem larmar fortfarande - det är signalen att blockeringen kan vara löst.
  [int[]]$Ignore = @(),
  [string]$Repo = "Jakeminator123/sajtmaskin"
)

$ErrorActionPreference = "Continue"
$seenSha = @{}
$known = New-Object System.Collections.Generic.HashSet[int]
# Larma en gång per (PR, SHA, läge). Utan detta upprepas ACTIONABLE varje cykel
# för en PR som blockerats på triage, vilket dränker notiserna och kostar tokens.
$announced = New-Object System.Collections.Generic.HashSet[string]
$first = $true

function Announce([string]$key, [string]$message) {
  if ($announced.Add($key)) { Write-Output $message }
}

function Get-OpenPrs {
  $raw = gh pr list --repo $Repo --state open --json number,isDraft,headRefOid 2>$null | Out-String
  if ($LASTEXITCODE -ne 0 -or -not ($raw -match "\S")) { return $null }
  try { $parsed = $raw | ConvertFrom-Json } catch { return $null }
  $out = @()
  foreach ($pr in @($parsed)) {
    if ($pr.isDraft) { continue }
    $out += [pscustomobject]@{ Number = [int]$pr.number; Sha = [string]$pr.headRefOid }
  }
  return , $out
}

# Minuter sedan head-commiten pushades. Mognadsklockan räknas härifrån - inte
# från PR:ens createdAt - så en ny push från författaragenten förlänger väntan.
function Get-CommitAgeMinutes([string]$sha) {
  $date = gh api "repos/$Repo/commits/$sha" --jq .commit.committer.date 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $date) { return -1 }
  return [int]((Get-Date).ToUniversalTime() - [datetime]::Parse($date).ToUniversalTime()).TotalMinutes
}

function Get-CheckState([int]$number) {
  $out = gh pr checks $number --repo $Repo 2>&1 | Out-String
  # "skipping" innehåller inte "fail"/"pending" - bara faktiska lägen matchas.
  if ($out -match "\bfail\b") { return "failed" }
  if ($out -match "\bpending\b") { return "pending" }
  if ($out -notmatch "\S") { return "unknown" }
  return "green"
}

Write-Output "[watch-prs] start: interval=${IntervalSeconds}s mognad=${MinutesMature}min cykler=$Cycles"

for ($i = 1; $i -le $Cycles; $i++) {
  $prs = Get-OpenPrs
  if ($null -eq $prs) {
    Write-Output "[watch-prs] gh-fel, försöker igen"
    Start-Sleep -Seconds $IntervalSeconds
    continue
  }

  $summary = @()
  foreach ($pr in $prs) {
    $n = $pr.Number
    $sha = $pr.Sha

    if (-not $known.Contains($n)) {
      [void]$known.Add($n)
      # Vid första cykeln är allt "nytt" - larma bara om PR:er som dyker upp sedan start.
      if (-not $first) { Write-Output "NEWPR #$n" }
    }
    if ($seenSha.ContainsKey($n) -and $seenSha[$n] -ne $sha) {
      Write-Output "NEWCOMMIT #$n $($sha.Substring(0,8))"
    }
    $seenSha[$n] = $sha

    $state = Get-CheckState $n
    $age = Get-CommitAgeMinutes $sha
    $summary += "#$n=$state/${age}min"

    if ($state -eq "failed") { Announce "$n/$sha/failed" "FAILED #$n" }
    elseif ($state -eq "green" -and $age -ge $MinutesMature -and $Ignore -notcontains $n) {
      Announce "$n/$sha/actionable" "ACTIONABLE #$n (${age}min sedan senaste commit)"
    }
  }

  if ($prs.Count -eq 0) { $summary = @("inga öppna PR:er") }
  Write-Output ("[{0}] cykel {1}/{2}: {3}" -f (Get-Date -Format "HH:mm"), $i, $Cycles, ($summary -join " "))
  $first = $false
  Start-Sleep -Seconds $IntervalSeconds
}

Write-Output "[watch-prs] klar (cykeltak nått)"
