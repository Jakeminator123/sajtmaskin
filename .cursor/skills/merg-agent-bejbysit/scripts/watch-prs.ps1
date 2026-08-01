<#
.SYNOPSIS
  Billig PR-bevakare för merge-agentrollen (/merg-agent-bejbysit).

.DESCRIPTION
  Pollar öppna PR:er och skriver EN rad per cykel. Agenten ska inte polla själv —
  starta detta i bakgrunden, avsluta turen och vakna på en sentinel-rad:

    NEWPR      #<n>  ny öppen PR upptäckt
    NEWCOMMIT  #<n>  head-SHA ändrad (mognadsklockan startar om)
    FAILED     #<n>  minst en check röd
    BLOCKED    #<n>  bär en blockerande label (do-not-merge m.fl.) - kräver ägarbeslut
    ACTIONABLE #<n>  alla checks klara + gröna OCH >= MinutesMature granskningsbar
                     (minsta av head-synlighet och PR-ålder - se Get-ReviewableMinutes)

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
  #
  # Sträng, inte [int[]]: under `pwsh -File` skickas argument som strängar, och
  # `-Ignore 610,611,615` band tidigare ihop sig till ETT värde (610611615) som
  # aldrig matchade något PR-nummer. Filtret gjorde alltså tyst ingenting medan
  # operatören trodde att blockerade PR:er var dämpade - värre än att inte finnas.
  [string]$Ignore = "",
  # Cykler innan samma larm får upprepas. Utan en påminnelse tystnar en PR som
  # larmats en gång för alltid, även om blockeringen lösts UTAN ny commit (t.ex.
  # författaren lade sign-off eller triagerade ett fynd) - då kommer ingen ny
  # sentinel och agenten väcks aldrig.
  [int]$ReAnnounceCycles = 15,
  [string]$Repo = "Jakeminator123/sajtmaskin",
  # Labels som betyder "rör inte utan medvetet ägarbeslut". De larmar aldrig som
  # ACTIONABLE oavsett hur grön och mogen PR:en är.
  [string[]]$BlockingLabels = @("do-not-merge", "agent:needs-human", "risk:4", "risk:5")
)

$ErrorActionPreference = "Continue"
$ignoredPrs = @($Ignore -split "[,\s]+" | Where-Object { $_ -match "^\d+$" } | ForEach-Object { [int]$_ })
$seenSha = @{}
$known = New-Object System.Collections.Generic.HashSet[int]
# Larma en gång per (PR, SHA, läge), men påminn efter $ReAnnounceCycles. Utan
# strypningen upprepas ACTIONABLE varje cykel för en PR som blockerats på triage,
# vilket dränker notiserna och kostar tokens; utan påminnelsen tystnar i stället
# en PR vars blockering löstes utan ny commit.
$announced = @{}
$first = $true

function Announce([string]$key, [string]$message, [int]$cycle) {
  $last = $announced[$key]
  if ($null -ne $last -and ($cycle - $last) -lt $ReAnnounceCycles) { return }
  $announced[$key] = $cycle
  Write-Output $message
}

# Datumen hämtas via --jq som RÅA strängar. ConvertFrom-Json omvandlar annars
# ISO-tider till DateTime-objekt, och en [string]-konvertering av dem tappar
# Z-suffixet -> tidsstämpeln tolkas som lokal tid och åldern blir fel med hela
# UTC-offseten (upptäckt i skarp körning: en 3 min gammal PR såg 125 min ut).
function Get-OpenPrs {
  $raw = gh pr list --repo $Repo --state open --json number,isDraft,headRefOid,createdAt,labels `
    --jq '.[] | select(.isDraft == false) | "\(.number)|\(.headRefOid)|\(.createdAt)|\([.labels[].name] | index("merge:ready") != null)|\([.labels[].name] | join(","))"' 2>$null | Out-String
  if ($LASTEXITCODE -ne 0) { return $null }
  $out = @()
  foreach ($line in @($raw -split "`n" | Where-Object { $_ -match "\S" })) {
    $parts = $line.Trim() -split "\|"
    if ($parts.Count -lt 5) { continue }
    $labels = @($parts[4] -split "," | Where-Object { $_ -match "\S" } | ForEach-Object { $_.Trim() })
    $out += [pscustomobject]@{
      Number  = [int]$parts[0]
      Sha     = $parts[1]
      Created = $parts[2]
      # En label som säger stopp väger tyngre än en som säger klart: en PR kan
      # bära kvarglömd merge:ready OCH do-not-merge samtidigt. Bevakaren larmar
      # då BLOCKED i stället för ACTIONABLE, så ingen agent väcks till en PR som
      # kräver ett medvetet ägarbeslut.
      Blocked = @($labels | Where-Object { $BlockingLabels -contains $_ })
      # ENBART att labeln finns - inte att sign-offen avser nuvarande head.
      # Labeln ska tas bort vid ny commit, men det är agent-disciplin och inte
      # tvingat, så en kvarglömd label kan peka på en äldre SHA. Larmet säger
      # därför "label:merge:ready", inte "signerad"; SHA-verifieringen görs i
      # Steg 4 och kan inte hoppas över för att larmet såg positivt ut.
      Signed  = ($parts[3] -eq "true")
    }
  }
  # Unärt komma = standardidiomet för att BEVARA arrayen; PowerShell packar upp
  # exakt en nivå vid retur, så kommat neutraliserar den uppackningen (utan det
  # blir en tom array till ingenting och en enelementsarray till en skalär).
  # Verifierat: 0/1/3 element ger 0/1/3 iterationer. Anroparen itererar ändå
  # över @(...) så beteendet inte hänger på att läsaren kan idiomet.
  return , $out
}

function Get-AgeMinutes([string]$isoDate) {
  if (-not $isoDate) { return -1 }
  $styles = [Globalization.DateTimeStyles]::AdjustToUniversal -bor [Globalization.DateTimeStyles]::AssumeUniversal
  $parsed = [datetime]::MinValue
  if (-not [datetime]::TryParse($isoDate, [Globalization.CultureInfo]::InvariantCulture, $styles, [ref]$parsed)) { return -1 }
  return [int]((Get-Date).ToUniversalTime() - $parsed).TotalMinutes
}

<#
Hur länge head-SHA:t varit SYNLIGT på GitHub - inte hur gammal commiten är.

`.commit.committer.date` är metadata från när commiten skapades lokalt. En
författare kan committa klockan 03:00 och pusha den till en befintlig PR strax
före merge; commit-tiden hade då sagt "en timme gammal" i samma stund som koden
blev granskningsbar, och hela poängen med att en sen push startar om väntan
faller (Codex P1 på #612).

CI triggas av pushen, så den tidigaste check-runens `started_at` är en bra proxy
för när head:et blev synligt.

Returnerar -1 när klockan inte går att belägga: både API-fel och "inga
check-runs registrerade". Båda betyder samma sak för grinden - vi vet inte hur
länge head:et varit synligt - och då larmas inte PR:en.

Att i stället gissa (0, eller bevakarens egen observationstid) ger antingen en
PR som fastnar under tröskeln för alltid, eller ett larm som går innan
granskarna kunde se koden. Ingen av dem är ärlig. Fallet syns i cykelraden som
`inga-check-runs`, så permanent frånvaro blir synlig i stället för tyst.
#>
function Get-HeadVisibleMinutes([string]$sha) {
  $earliest = gh api "repos/$Repo/commits/$sha/check-runs?per_page=100" `
    --jq '[.check_runs[].started_at] | map(select(. != null)) | sort | first' 2>$null
  if ($LASTEXITCODE -ne 0) { return -1 }
  if (-not $earliest -or $earliest -eq "null") { return -1 }
  return Get-AgeMinutes $earliest
}

<#
Hur länge innehållet varit granskningsbart. Två klockor måste båda ha gått:

  head-synlighet - en ny push startar om väntan, annars kan en sen ändring
                   smygas in precis före merge. Mäts från när head:et blev
                   synligt (push), inte från commitens metadata-tid.
  PR-åldern      - en gammal lokal commit som pushas som ny PR har inte varit
                   synlig för Codex/Vercel/Bugbot en enda minut ännu.

Innehållet blev granskningsbart vid den SENASTE av de två händelserna, så den
förflutna tiden är den MINSTA av de två åldrarna.

Går en klocka inte att läsa (gh-fel) returneras -1 = "vet inte", aldrig den
andra klockan. Att falla tillbaka på PR-åldern vore fail-OPEN: en gammal PR med
en fräsch head-commit skulle se mogen ut om just commit-uppslaget råkade fela,
och en minut gammal kod kunde larmas som redo. En grind ska falla stängd.
#>
function Get-ReviewableMinutes([int]$headAge, [int]$prAge) {
  if ($headAge -lt 0 -or $prAge -lt 0) { return -1 }
  return [Math]::Min($headAge, $prAge)
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

$ignoreText = $(if ($ignoredPrs.Count -gt 0) { $ignoredPrs -join "," } else { "inga" })
Write-Output "[watch-prs] start: interval=${IntervalSeconds}s mognad=${MinutesMature}min cykler=$Cycles dampade=$ignoreText"

for ($i = 1; $i -le $Cycles; $i++) {
  $prs = Get-OpenPrs
  if ($null -eq $prs) {
    Write-Output "[watch-prs] gh-fel, försöker igen"
    Start-Sleep -Seconds $IntervalSeconds
    continue
  }

  $summary = @()
  foreach ($pr in @($prs)) {
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
    # Utan check-runs finns ingen ärlig klocka. En tidigare version använde
    # bevakarens egen första observation som proxy, men den kan ligga FÖRE
    # botarnas: är CI fördröjd startar Codex/Vercel också sent, så en lokal
    # tidsstämpel hade larmat innan granskarna ens kunde se koden - och ett
    # skickat ACTIONABLE går inte att ta tillbaka. Läget syns i cykelraden i
    # stället, så en PR som permanent saknar check-runs blir synlig för
    # operatören utan att grinden hittar på en mognad den inte kan belägga.
    $headAge = Get-HeadVisibleMinutes $sha
    $age = Get-ReviewableMinutes $headAge (Get-AgeMinutes $pr.Created)
    $ageText = $(if ($age -lt 0) { "obelagd-klocka" } else { "${age}min" })
    $summary += "#$n=$state/$ageText"

    $signed = $(if ($pr.Signed) { "label:merge:ready" } else { "OSIGNERAD" })
    # BLOCKED före FAILED. Kommentaren vid `Blocked` ovan säger att en
    # stopp-label väger tyngre, men ordningen här gjorde motsatsen: en PR med
    # do-not-merge OCH röd CI larmade FAILED, vilket väcker en agent till
    # CI-felsökning på en PR som väntar på ett medvetet ägarbeslut. Röd CI är
    # dessutom ofta en följd av att arbetet medvetet parkerats. Larmnyckeln
    # bär läget, så en PR som senare bara är röd får sitt FAILED-larm då.
    if (@($pr.Blocked).Count -gt 0) {
      Announce "$n/$sha/blocked" ("BLOCKED #$n (" + (@($pr.Blocked) -join ",") + ")") $i
    }
    elseif ($state -eq "failed") { Announce "$n/$sha/failed" "FAILED #$n" $i }
    elseif ($state -eq "green" -and $age -ge $MinutesMature -and $ignoredPrs -notcontains $n) {
      # Signaturläget ingår i nyckeln: när författaren sätter merge:ready UTAN
      # ny commit ändras varken SHA eller läge, och utan detta hade larmet tystats
      # till nästa påminnelse - fast det är precis då PR:en blir mergebar.
      Announce "$n/$sha/actionable/$signed" "ACTIONABLE #$n (${age}min granskningsbar, $signed)" $i
    }
  }

  if (@($prs).Count -eq 0) { $summary = @("inga öppna PR:er") }
  Write-Output ("[{0}] cykel {1}/{2}: {3}" -f (Get-Date -Format "HH:mm"), $i, $Cycles, ($summary -join " "))
  $first = $false
  Start-Sleep -Seconds $IntervalSeconds
}

Write-Output "[watch-prs] klar (cykeltak nått)"
