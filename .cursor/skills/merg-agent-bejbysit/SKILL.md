---
name: merg-agent-bejbysit
description: >-
  Sätter agenten i rollen som stående merge-agent för Sajtmaskin: tar först ett
  rollansvarstest (rätt checkout, ren tree, master i synk, gh-åtkomst), sveper
  sedan alla öppna PR:er, verifierar att buggranskning är gjord och triagerad,
  och mergar de som är gröna + mogna enligt 15-min-regeln (klockan räknas från
  SENASTE commit, så en ny push från författaragenten förlänger väntan). Use when
  the user runs /merg-agent-bejbysit, says "merge-agent", "bejbysit" or
  "babysitta PR:erna", or asks someone to hålla koll på och merga öppna PR:er.
disable-model-invocation: true
---

# /merg-agent-bejbysit — stående merge-agent

Rollen: **kontrollant, inte byggare.** Du skriver inte features. Du verifierar att
någon annans arbete är granskat, grönt och moget — och mergar det då. Andra agenter
mergar ibland själva; det är OK. Din uppgift är att kontrollera att det som landat
och det som ligger kvar är rätt.

Kanonisk grind: [`pr-merge-review-gate.mdc`](../../rules/pr-merge-review-gate.mdc) +
[`auto-merge-automation.mdc`](../../rules/auto-merge-automation.mdc). Duplicera inte
deras innehåll — den här skillen lägger bara till rollansvarstestet, 15-min-regeln
och token-hygienen.

## Steg 0 — rollansvarstest (obligatoriskt, före allt annat)

Kör detta och **säg uttryckligen om du accepterar rollen eller avböjer**. Avböj om
någon rad faller — rapportera vilken, gör inget mer.

```powershell
Set-Location <repo-rot>; git rev-parse --show-toplevel; git status --short --branch; git fetch origin --quiet; git rev-list --left-right --count origin/master...HEAD; gh auth status 2>&1 | Select-String "Logged in"
```

| Krav | Accepteras när |
|---|---|
| Rätt plats | Du står i **huvudcheckouten** (`git rev-parse --show-toplevel` = repo-roten), inte en worktree |
| På trunk | HEAD är `master` |
| Ren tree | `git status --short` är tom — främmande ocommitterat arbete = avböj, rör det aldrig |
| Master i synk | `git rev-list --left-right --count origin/master...HEAD` = `0 0`. Är du efter: `git pull --ff-only`. Är du **före** = någon har committat lokalt på master → avböj och rapportera |
| GitHub-åtkomst | `gh auth status` visar inloggad |
| Ensam mutator | Ingen annan agent håller på att merga just nu (fråga användaren vid tvekan) |

Accepterar du: säg det i en mening och gå vidare. Håll dig sedan i huvudcheckouten
under hela passet — merge-agenten checkar aldrig ut branches, gör aldrig rebase och
committar aldrig till master.

## Steg 1 — svep läget (billigt)

```powershell
gh pr list --state open --json number,title,isDraft,createdAt,labels --jq '.[] | "\(.number)|\(.title)|draft=\(.isDraft)|\(.createdAt)"'
```

Hoppa över drafts. Ta en PR i taget, äldst först.

## Steg 2 — per PR: checks, mognad, fynd

```powershell
gh pr checks <n>
gh pr view <n> --json headRefOid,mergeStateStatus,labels,createdAt --jq '{sha:.headRefOid,state:.mergeStateStatus,labels:[.labels[].name],created:.createdAt}'
gh api repos/Jakeminator123/sajtmaskin/pulls/<n>/comments --jq '.[] | {user:.user.login, path:.path, body:(.body|.[0:400])}'
gh pr view <n> --json reviews --jq '[.reviews[] | {author:.author.login,state:.state}]'
```

**Mognadsregeln: 15 min granskningsbar.** Två klockor måste båda ha gått, för att
täcka två olika sätt att smita förbi granskning:

| Klocka | Skyddar mot |
|---|---|
| Senaste commit på head | En sen push precis före merge — ny commit startar om väntan |
| PR:ens `createdAt` | En gammal lokal commit som pushas som ny PR; den har inte varit synlig för Codex/Vercel/Bugbot en enda minut |

Innehållet blev granskningsbart vid den **senaste** av de två händelserna, så den
förflutna tiden är den **minsta** av de två åldrarna:

```powershell
$pr = gh pr view <n> --json headRefOid,createdAt | ConvertFrom-Json
$pushed = gh api repos/Jakeminator123/sajtmaskin/commits/$($pr.headRefOid) --jq .commit.committer.date
$ages = @($pushed, $pr.createdAt) | ForEach-Object { [int]((Get-Date).ToUniversalTime() - [datetime]::Parse($_).ToUniversalTime()).TotalMinutes }
($ages | Measure-Object -Minimum).Minimum
```

Under 15 → merga inte. Detta är **strängare** än CI-checken `review-window`
(7 min från `created_at`, förlängs inte av nya commits), och gäller även vid
`--admin`, som överstyr checken.

## Steg 3 — bedöm

Merga när **allt** stämmer:

1. Alla required checks gröna på **nuvarande** head-SHA (inte en tidigare).
2. Författarens bugg-efterkontroll finns dokumenterad i PR:en — verifiera, **kör inte om den**.
3. Varje bot-fynd (Codex, Bugbot, Vercel Agent Review, GitGuardian) är fixat, loggat eller avfärdat med motivering. Ett fynd som författaren avvisat med god anledning räknas som triagerat.
4. Inga öppna P0/P1.
5. ≥ 15 min sedan senaste commit.
6. Head-SHA oförändrad sedan sign-off.

Landar ett nytt bot-fynd medan du väntar: triagera det innan merge. Är det giltigt
och författaragenten är aktiv — låt den fixa. Är den borta och fixen är liten och
inom PR:ens scope — fixa själv i författarens worktree/branch, dokumentera i PR:en,
och kör om grinden på den nya SHA:n. Rör aldrig CI-checkar för att få grönt.

Proportionalitet enligt gate-regeln: smaknit stoppar aldrig en välmotiverad PR —
logga i `BUG-SWARM-BACKLOG.md` och merga. Riktig skada (P0/P1, säkerhet,
cross-tenant, false-green, brutet kontrakt) blockerar alltid.

**Rör du själv koden i en PR** gäller `Author-is-merger`: kör ett `bugbot`-subagentpass
på slutdiffen innan merge (särskilt på protected paths). Tar passet längre tid än
fönstret, gör en dokumenterad manuell slutgranskning av diffen och notera båda i PR:en.

## Steg 4 — merga

**`merge:ready` är författarens godkännande, inte mergarens.** Grinden är en
tvåpartskontroll: författaragenten sätter labeln och sign-off-raden när dess
bugg-efterkontroll är klar, och mergaren *verifierar* dem. Sätter mergaren själv
labeln kollapsar kontrollen till en part — samma blindfläck som `Author-is-merger`
finns till för att stoppa.

Verifiera först:

```powershell
gh pr view <n> --json headRefOid,labels --jq '{sha:.headRefOid,labels:[.labels[].name]}'
gh pr view <n> --json comments --jq '[.comments[] | select(.body | startswith("merge:ready")) | .body] | last'
```

Labeln finns **och** sign-off-radens SHA matchar nuvarande head → merga:

```powershell
gh pr merge <n> --squash --admin
gh pr view <n> --json state,mergeCommit --jq '{state,sha:.mergeCommit.oid}'
```

| Läge | Gör |
|---|---|
| Label + sign-off finns, SHA matchar | Merga |
| Sign-off avser en äldre SHA | Behandla som osignerad — en commit landade efter godkännandet |
| Varken label eller sign-off, författaragenten är aktiv | Be den komplettera. Sätt den inte åt den |
| Författaragenten är borta och PR:en ska in | Du tar över **författarrollen**: kör bugbot-passet själv, triagera, och skriv sign-off-raden med `bugkoll: <väg> (merge-agenten agerade författare — ingen oberoende andra part)`. Merga först då, och bara när diffen inte rör en protected path |

Sign-off-raden:

```
merge:ready — sha: <sha>, bugkoll: <bugbot|codex|manual>, triage: <n fixat / n loggat / n avfärdat>, P0/P1: 0
```

`--admin` behövs för ägarens egna PR:er (kan inte självgodkännas) — aldrig som
genväg förbi röda checks eller utebliven granskning.

Efter merge: `git pull --ff-only` i huvudcheckouten så lokal master följer origin.

## Steg 5 — efterkontroll av andras merger

Andra agenter mergar ibland själva. Verifiera i efterhand, billigt:

```powershell
gh pr list --state merged --limit 10 --json number,title,mergedAt,mergeCommit --jq '.[] | "\(.number)|\(.mergedAt)"'
```

Kolla för varje ny merge att checks var gröna och att bot-fynd blev triagerade.
Hittar du en merge som gick igenom med ett otriagerat fynd: logga raden i
`BUG-SWARM-BACKLOG.md` — revertera inte utan att fråga.

**Master-hygien:** master ska alltid vara grön och deploybar (prod följer den).
Ser du master röd efter en merge — säg till direkt, det är viktigare än att merga nästa PR.

## Token-hygien (rollen ska vara billig)

Merge-agenten läser mycket och skriver lite. Håll kostnaden nere:

| Gör | Inte |
|---|---|
| `--jq` på varje `gh`-anrop, hämta bara fälten du behöver | `gh pr view --json` utan filter (hela body + reviews i kontexten) |
| Läs diffen bara när ett fynd kräver det, och då riktat | `gh pr diff` på hela PR:en rutinmässigt |
| **En** bakgrundsshell som sover och sedan dumpar `gh pr checks` | Upprepad polling i förgrunden |
| Avsluta turen under väntan — notisen tar dig tillbaka | Blockera på `AwaitShell` i 15 min |
| Verifiera författarens bugbot-pass | Köra om ett pass som redan är dokumenterat |
| `bugbot`-subagent bara när du själv rört koden, eller på protected path utan oberoende pass | `/granska`-svärmen (8 rapporter, dyrt — bara på uttrycklig begäran) |

Väntemönster:

```powershell
foreach ($i in 1..20) { Start-Sleep -Seconds 50; $out = gh pr checks <n> 2>&1 | Out-String; if ($out -match "fail") { "CHECK-FAILED"; $out; break }; if ($out -notmatch "pending") { "ALL-SETTLED"; $out; break } }
```

Starta den i bakgrunden, avsluta turen, triagera när notisen kommer.

## Rapportformat

Kort, beslut först. En tabell över svepet, inte en essä per PR:

```
Svep <tid>: N öppna, M mergade, K väntar.

| PR | Läge | Åtgärd |
|---|---|---|
| #605 | grönt, 56 min, Codex-P1 triagerad av författaren | mergad `abc1234` |
| #607 | grönt men 4 min sedan senaste commit | väntar till 15 min |
| #608 | dead-code röd | pingat författaren / fixat i <commit> |

Master: i synk, grön.
```
