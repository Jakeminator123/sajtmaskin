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

# Datumen hämtas via --jq som RÅA strängar. ConvertFrom-Json omvandlar annars
# ISO-tider till DateTime-objekt, och en [string]-konvertering av dem tappar
# Z-suffixet -> tidsstämpeln tolkas som lokal tid och åldern blir fel med hela
# UTC-offseten (upptäckt i skarp körning: en 3 min gammal PR såg 125 min ut).
function Get-OpenPrs {
  $raw = gh pr list --repo $Repo --state open --json number,isDraft,headRefOid,createdAt `
    --jq '.[] | select(.isDraft == false) | "\(.number)|\(.headRefOid)|\(.createdAt)"' 2>$null | Out-String
  if ($LASTEXITCODE -ne 0) { return $null }
  $out = @()
  foreach ($line in @($raw -split "`n" | Where-Object { $_ -match "\S" })) {
    $parts = $line.Trim() -split "\|"
    if ($parts.Count -lt 3) { continue }
    $out += [pscustomobject]@{
      Number  = [int]$parts[0]
      Sha     = $parts[1]
      Created = $parts[2]
    }
  }
  return , $out
}

function Get-AgeMinutes([string]$isoDate) {
  if (-not $isoDate) { return -1 }
  $styles = [Globalization.DateTimeStyles]::AdjustToUniversal -bor [Globalization.DateTimeStyles]::AssumeUniversal
  $parsed = [datetime]::MinValue
  if (-not [datetime]::TryParse($isoDate, [Globalization.CultureInfo]::InvariantCulture, $styles, [ref]$parsed)) { return -1 }
  return [int]((Get-Date).ToUniversalTime() - $parsed).TotalMinutes
}

function Get-CommitAgeMinutes([string]$sha) {
  $date = gh api "repos/$Repo/commits/$sha" --jq .commit.committer.date 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $date) { return -1 }
  return Get-AgeMinutes $date
}

<#
Hur länge innehållet varit granskningsbart. Två klockor måste båda ha gått:

  commit-åldern  - en ny push från författaragenten startar om väntan, annars
                   kan en sen ändring smygas in precis före merge.
  PR-åldern      - en gammal lokal commit som pushas som ny PR har inte varit
                   synlig för Codex/Vercel/Bugbot en enda minut ännu.

Innehållet blev granskningsbart vid den SENASTE av de två händelserna, så den
förflutna tiden är den MINSTA av de två åldrarna.

Går en klocka inte att läsa (gh-fel) returneras -1 = "vet inte", aldrig den
andra klockan. Att falla tillbaka på PR-åldern vore fail-OPEN: en gammal PR med
en fräsch head-commit skulle se mogen ut om just commit-uppslaget råkade fela,
och en minut gammal kod kunde larmas som redo. En grind ska falla stängd.
#>
function Get-ReviewableMinutes([int]$commitAge, [int]$prAge) {
  if ($commitAge -lt 0 -or $prAge -lt 0) { return -1 }
  return [Math]::Min($commitAge, $prAge)
}

# Exit-koden är den auktoritativa signalen: 0 = alla passerade, 8 = något är
# pending, allt annat = fel eller misslyckad check. Att bara regexa stdout var
# för svagt - `\bfail\b` matchar t.ex. inte en aggregatrad som säger "failing",
# och ett API-fel med tom output hade lästs som grönt. Regexen är kvar enbart
# för att skilja "rött" från "gick inte att läsa" inom samma exit-kod.
function Get-CheckState([int]$number) {
  $out = gh pr checks $number --repo $Repo 2>&1 | Out-String
  $code = $LASTEXITCODE
  if ($code -eq 8) { return "pending" }
  if ($code -eq 0) {
    if ($out -notmatch "\S") { return "unknown" }
    return "green"
  }
  if ($out -match "fail") { return "failed" }
  return "unknown"
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
    $age = Get-ReviewableMinutes (Get-CommitAgeMinutes $sha) (Get-AgeMinutes $pr.Created)
    $summary += "#$n=$state/${age}min"

    if ($state -eq "failed") { Announce "$n/$sha/failed" "FAILED #$n" }
    elseif ($state -eq "green" -and $age -ge $MinutesMature -and $Ignore -notcontains $n) {
      Announce "$n/$sha/actionable" "ACTIONABLE #$n (${age}min granskningsbar)"
    }
  }

  if ($prs.Count -eq 0) { $summary = @("inga öppna PR:er") }
  Write-Output ("[{0}] cykel {1}/{2}: {3}" -f (Get-Date -Format "HH:mm"), $i, $Cycles, ($summary -join " "))
  $first = $false
  Start-Sleep -Seconds $IntervalSeconds
}

Write-Output "[watch-prs] klar (cykeltak nått)"
