---
name: merg-agent-bejbysit
description: >-
  Sätter agenten i rollen som stående merge-agent för Sajtmaskin: tar först ett
  rollansvarstest (rätt checkout, ingen lokal master-commit, gh-åtkomst), sveper
  sedan alla öppna PR:er, verifierar att buggranskning är gjord och triagerad,
  och mergar de som är gröna + mogna enligt 15-min-regeln (minsta av
  head-synlighet och PR-ålder, så både en sen push och en gammal lokal commit i
  en ny PR hanteras). Use when
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

| Krav                      | Accepteras när                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Rätt plats                | Du står i **huvudcheckouten** (`git rev-parse --show-toplevel` = repo-roten), inte en worktree                                             |
| På trunk                  | HEAD är `master`                                                                                                                           |
| Ingen lokal master-commit | `git rev-list --left-right --count origin/master...HEAD` — är högersiffran > 0 har någon committat lokalt på master → avböj och rapportera |
| GitHub-åtkomst            | `gh auth status` visar inloggad                                                                                                            |
| Ensam mutator             | Ingen annan agent håller på att merga just nu (fråga användaren vid tvekan)                                                                |

Accepterar du: säg det i en mening och gå vidare. Håll dig sedan i huvudcheckouten
under hela passet — merge-agenten checkar aldrig ut branches, gör aldrig rebase och
committar aldrig till master.

**Varken ocommitterat arbete eller en eftersläpande lokal master avböjer rollen.**
Merge-agenten arbetar via `gh` och rör aldrig working tree, så inget av det
påverkar dess uppgift. Ocommitterat är dessutom normalt pågående arbete enligt
[`git.mdc`](../../rules/git.mdc) — rör det inte, staga det aldrig.

Ligger du efter origin: kör `git pull --ff-only` för ordningens skull. Felar den
(t.ex. för att ocommitterat arbete skulle skrivas över) — notera det och gå vidare
ändå. Att göra den pullen till ett rollkrav skulle låsa agenten ute permanent så
fort någon har en fil öppen, och det skyddar ingenting.

Det enda som avböjer är att någon **committat lokalt på master**: det är arbete
som ingen PR äger, och det ska redas ut innan något mergas.

## Steg 1 — svep läget (billigt)

```powershell
gh pr list --state open --json number,title,isDraft,createdAt,labels,author --jq '.[] | "\(.number)|\(.title)|draft=\(.isDraft)|\(.createdAt)|\(.author.login)|\([.labels[].name] | join(","))"'
```

Hoppa över drafts. Ta en PR i taget, äldst först. Labels och författare kostar
inget extra att hämta här och avgör i Steg 3 om PR:en över huvud taget får röras.

## Steg 2 — per PR: checks, mognad, fynd

```powershell
gh pr checks <n>
gh pr view <n> --json headRefOid,mergeStateStatus,labels,createdAt --jq '{sha:.headRefOid,state:.mergeStateStatus,labels:[.labels[].name],created:.createdAt}'
gh api --method GET --paginate -F per_page=100 repos/Jakeminator123/sajtmaskin/pulls/<n>/comments --jq '.[] | {user:.user.login, sha:.original_commit_id, path:.path, body:(.body|.[0:400])}'
gh pr view <n> --json reviews --jq '[.reviews[] | {author:.author.login,state:.state}]'
```

### Hämta ALLA fynd. Filtrera aldrig på tid.

Frågan är **"är varje fynd på den här PR:en åtgärdat på nuvarande head?"** — aldrig
"har något nytt landat sedan jag sist tittade?". Ett fynd hör till en SHA och till
om det är fixat, inte till när du råkade titta.

Ett tidsfilter felar åt **båda** hållen — det har både släppt förbi ett olöst fynd
och blockerat på ett redan löst ([`references/incidenter.md`](references/incidenter.md)).

Hämta därför alltid hela listan och jämför varje fynds `original_commit_id` mot
nuvarande head. Ligger ett fynd på en äldre SHA: kontrollera i koden eller i
commit-loggen om det är åtgärdat — anta det inte i någondera riktningen.

**Paginera.** REST-API:ets standardsida är 30 poster, så en PR med fler
kommentarer tappar de äldsta tyst — och de äldsta är precis de som hunnit bli
olösta länge. Ett sidfilter är samma fel som ett tidsfilter, bara med en annan
axel. Använd `--method GET --paginate -F per_page=100` på varje fyndhämtning,
som [`pr-bot-findings-sweep.mdc`](../../rules/pr-bot-findings-sweep.mdc) föreskriver.

**Grönt `gh pr checks` betyder inte "inga fynd".** Enligt
[`pr-bot-findings-sweep.mdc`](../../rules/pr-bot-findings-sweep.mdc) lägger flera
botar sina fynd på ytor som statuslistan inte visar — Vercel Agent Review (VADE)
skriver i check-runens `output`/`annotations`, och PR-nivånotiser hamnar bland
`issues/comments` i stället för de radbundna `pulls/comments`. Svep därför båda:

```powershell
gh api --method GET --paginate -F per_page=100 "repos/Jakeminator123/sajtmaskin/commits/<sha>/check-runs" --jq '.check_runs[] | {id, name, conclusion, title:.output.title, summary:(.output.summary // "" | .[0:400]), annotations:.output.annotations_count}'
gh api --method GET --paginate -F per_page=100 repos/Jakeminator123/sajtmaskin/issues/<n>/comments --jq '.[] | select(.user.type == "Bot") | {user:.user.login, body:(.body|.[0:400])}'
```

`output` räcker inte: ett fynd kan ligga **bara** som annotation, och de hämtas
från en egen endpoint. Har en check-run `annotations_count > 0`, hämta dem —
annars kan grinden se helt triagerad ut med ett öppet P1 kvar:

```powershell
gh api --paginate "repos/Jakeminator123/sajtmaskin/check-runs/<check-run-id>/annotations" --jq '.[] | {level:.annotation_level, path, line:.start_line, message:(.message|.[0:300])}'
```

**Mognadsregeln: 15 min granskningsbar.** Två klockor måste båda ha gått, för att
täcka två olika sätt att smita förbi granskning:

| Klocka                              | Skyddar mot                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| När head:et blev **synligt** (push) | En sen push precis före merge — nytt head startar om väntan                                                  |
| PR:ens `createdAt`                  | En gammal lokal commit som pushas som ny PR; den har inte varit synlig för Codex/Vercel/Bugbot en enda minut |

Mät head-klockan från **pushen**, inte från `.commit.committer.date` — commit-tiden
är metadata och kan vara timmar äldre än ögonblicket koden blev granskningsbar
([`references/incidenter.md`](references/incidenter.md)). CI triggas av pushen, så
tidigaste `started_at` bland head:ets check-runs är rätt proxy.

Innehållet blev granskningsbart vid den **senaste** av de två händelserna, så den
förflutna tiden är den **minsta** av de två åldrarna:

Hämta båda tiderna som **råa strängar** via `--jq`. `ConvertFrom-Json` gör om
ISO-tider till `DateTime`-objekt, och en `[string]`-konvertering av dem tappar
`Z`-suffixet → värdet läses som lokal tid och åldern blir fel med hela
UTC-offseten (en 3 min gammal PR mätte 125 min):

```powershell
$sha = gh pr view <n> --json headRefOid --jq .headRefOid
$created = gh pr view <n> --json createdAt --jq .createdAt
$pushed = gh api "repos/Jakeminator123/sajtmaskin/commits/$sha/check-runs?per_page=100" --jq '[.check_runs[].started_at] | map(select(. != null)) | sort | first'
$styles = [Globalization.DateTimeStyles]::AdjustToUniversal -bor [Globalization.DateTimeStyles]::AssumeUniversal
# Inga check-runs (eller gh-fel) -> klockan gar inte att belagga -> INTE mogen.
if ($LASTEXITCODE -ne 0 -or -not $pushed -or $pushed -eq "null") { "obelagd-klocka" } else {
  $ages = @($pushed, $created) | ForEach-Object {
    [int]((Get-Date).ToUniversalTime() - [datetime]::Parse($_, [Globalization.CultureInfo]::InvariantCulture, $styles)).TotalMinutes
  }
  ($ages | Measure-Object -Minimum).Minimum
}
```

Gissa aldrig en mognad du inte kan belägga. Noll ("nyss pushat") låser PR:en
under tröskeln för alltid; bevakarens egen observationstid kan ligga **före**
botarnas — är CI fördröjd startar Codex och Vercel också sent, och då hade
larmet gått innan granskarna kunde se koden. Saknas serverside-tidsstämpel:
behandla som inte mogen och ta reda på varför check-runs uteblir.

Under 15 → merga inte. Går en av tiderna inte att läsa: behandla som **inte
mogen**, aldrig som "då gäller den andra" — en gate faller stängd.

Detta är **strängare** än CI-checken `review-window`, och gäller även vid `--admin`,
som överstyr checken helt. Checkens 7-min-golv räknas från `created_at` och
förlängs inte av nya commits — men själva fönstret **startar om** vid varje push
(`on: synchronize` + `cancel-in-progress`), så nya head-SHA:t får ett eget
settle-golv på 3 min plus kravet att botarna för det SHA:t hunnit bli klara. Läs
aldrig av checken som "7 min sedan PR:en skapades, alltså klart".

## Steg 3 — bedöm

### Hårda stopp — läs dessa först

De kostar inget: labels, författare och `mergeStateStatus` är redan hämtade i
Steg 1–2. Faller någon rad är PR:en färdigbehandlad för det här svepet — lägg
inga tokens på fynd-svep eller mognadsräkning.

| Signal                       | Läge                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `isDraft: true`              | Rör aldrig                                                                       |
| Label `do-not-merge`         | Stopp. Kräver medvetet ägarbeslut — gäller **även** om `merge:ready` sitter kvar |
| Label `agent:needs-human`    | Stopp. Rapportera, merga inte                                                    |
| Label `risk:4` / `risk:5`    | Stopp. Eskalera till ägaren                                                      |
| `mergeStateStatus: DIRTY`    | Konflikt — författaren måste lösa. Se konfliktordningen i Steg 4                 |
| `mergeStateStatus: BLOCKED`  | Ett gate-krav saknas. Ta reda på **vilket** innan du ens överväger `--admin`     |
| Författare `dependabot[bot]` | Egen rutt, se nedan                                                              |

En label som säger stopp väger alltid tyngre än en som säger klart. `merge:ready`
betyder "författaren är färdig", inte "det här får merge:as".

### Dependabot-PR:er — egen rutt

De har ingen författaragent som kan skriva sign-off, och `package.json` /
`package-lock.json` är protected path där övertagande av författarrollen är
förbjudet. Utan en egen rutt fastnar de för alltid.

Merge-agenten mergar dem därför **inte** på eget initiativ — rapportera dem som
egen rad i svepet (`#N dependabot — väntar på ägarbeslut`). Har ägaren uttryckligen
bett dig ta dem: kör `bugbot`-subagenten på diffen och kontrollera att `quality` är
grön (den fångar baseline-pinnade paket). Signera sedan som vanligt enligt Steg 4 —
**hela** `merge:ready`-raden som PR-kommentar först, labeln sedan — med
`bugkoll: bugbot (dependabot, ingen författaragent — ägaren delegerade)`. Ett löst
`bugkoll:`-fragment är ingen sign-off och skulle rivas av freshness-grinden.

Labeln `dependabot-patch-safe` betyder bara att workflowen klassat uppdateringen
som patch + icke-core. Den är metadata, inte ett godkännande.

### Merga när allt stämmer

Passerar PR:en de hårda stoppen, merga när **allt** stämmer:

1. Alla required checks gröna på **nuvarande** head-SHA (inte en tidigare).
2. Författarens bugg-efterkontroll finns dokumenterad i PR:en — verifiera, **kör inte om den**.
3. Varje bot-fynd (Codex, Bugbot, Vercel Agent Review, GitGuardian) är fixat, loggat eller avfärdat med motivering. Ett fynd som författaren avvisat med god anledning räknas som triagerat.
4. Inga öppna P0/P1.
5. ≥ 15 min **granskningsbar** enligt båda klockorna i Steg 2 — minsta av head-synligheten (pushen, via check-runarnas `started_at`) och PR-åldern. Aldrig `commit.committer.date`.
6. Head-SHA oförändrad sedan sign-off.

Landar ett nytt bot-fynd medan du väntar: triagera det innan merge. Är det giltigt
och författaragenten är aktiv — låt den fixa. Är den borta och fixen är liten och
inom PR:ens scope — fixa själv i författarens worktree/branch, dokumentera i PR:en,
och kör om grinden på den nya SHA:n. Rör aldrig CI-checkar för att få grönt.

### Lova aldrig att merga på ett mekaniskt villkor

Skriv inte "säg till när den är grön, så mergar jag" eller "jag mergar när klockan
gått". Grönt CI och en passerad klocka säger att _det som är pushat_ håller — inte
att författaren är färdig med att pusha. Det kan bara författaren säga, och ett
sådant löfte har redan kapat en pågående fix
([`references/incidenter.md`](references/incidenter.md)).

Rätt formulering: _"ping mig när du är klar, så tar jag grinden."_

### Delegering ger mandat att signera, inte kunskap om att någon är klar

Har ägaren delegerat sign-off-beslutet för omgången får du sätta labeln — men
delegeringen ersätter inte författarens besked. Pushar författaren fortfarande,
svarar på fynd eller har commits de senaste minuterna: **vänta ändå**. Mandatet
gäller vem som får skriva under, inte vem som vet när arbetet är slut.

Proportionalitet enligt gate-regeln: smaknit stoppar aldrig en välmotiverad PR —
logga i `BUG-SWARM-BACKLOG.md` och merga. Riktig skada (P0/P1, säkerhet,
cross-tenant, false-green, brutet kontrakt) blockerar alltid.

**Rör du själv koden i en PR** gäller `Author-is-merger`: kör ett `bugbot`-subagentpass
på slutdiffen innan merge (särskilt på protected paths). Tar passet längre tid än
fönstret, gör en dokumenterad manuell slutgranskning av diffen och notera båda i PR:en.

## Steg 4 — merga

**`merge:ready` är författarens godkännande, inte mergarens.** Grinden är en
tvåpartskontroll: författaragenten skriver sign-off-raden och sätter sedan labeln
när dess bugg-efterkontroll är klar, och mergaren _verifierar_ dem. Sätter mergaren själv
labeln kollapsar kontrollen till en part — samma blindfläck som `Author-is-merger`
finns till för att stoppa.

Verifiera först:

Sign-off får ligga i **PR-body eller en kommentar** — leta i båda, annars
behandlas en giltigt godkänd PR felaktigt som osignerad:

Fråga inte "vilken sign-off är senast" — ordningen ljuger (body kommer alltid
först, kommentarer i kronologisk ordning, så en gammal kommentar kan vinna över
en uppdaterad body). Fråga i stället det grinden faktiskt kräver: **finns en
sign-off som avser nuvarande head?**

**Sign-offen ska bära hela 40-teckens-SHA:t.** Då är verifieringen exakt likhet
och inget behöver tolkas. Kortform tvingar fram prefixmatchning, och en kort SHA
ur en gammal sign-off kan då räknas som giltig för ett nytt head som råkar dela
prefixet — osannolikt, men det är ett format­problem och löses billigast i
formatet i stället för i jämförelsen.

```powershell
gh pr view <n> --json headRefOid,labels --jq '{sha:.headRefOid,labels:[.labels[].name]}'
gh pr view <n> --json headRefOid,body,comments --jq '.headRefOid as $head | [.body, (.comments[].body)] | map(select(. != null and test("merge:ready — sha:")) | (capture("sha:\\s*(?<sha>[0-9a-f]{7,40})") // {sha:""}).sha) | {signoffs: ., avser_head: (any(.[]; . == $head))}'
```

Träffar ingen sign-off exakt men en kortform ser rätt ut: behandla som
**overifierad** och be författaren skriva om raden med full SHA. Gissa inte.

**Att labeln finns bevisar ingenting om vilken SHA den avser.** Labeln ska tas bort
vid ny commit, men det är disciplin och inte tvingat, så en kvarglömd label kan
peka bakåt. Bevakarens `label:merge:ready` betyder just labelns existens — inte att
sign-offen gäller. En tidigare variant av uttrycket ovan svarade dessutom alltid
sant ([`references/incidenter.md`](references/incidenter.md)), så kör alltid
kontrollen mot en PR med känt inaktuell sign-off innan du litar på den.

Labeln finns **och** sign-off-radens SHA matchar nuvarande head → merga.

**Försök alltid utan `--admin` först.**

```powershell
gh pr merge <n> --squash
gh pr view <n> --json state,mergeCommit --jq '{state,sha:.mergeCommit.oid}'
```

`--admin` överstyr **allt**: alla required checks (`quality`, `backoffice-tests`,
`schema-drift`, `review-window`, `build`), code-owner-review och 7-min-fönstret.
Kör du det direkt vilar hela grinden på att du själv kollade rätt — plain merge
låter i stället GitHub falla stängd åt dig. Samma skäl som `--admin`-förbudet i
[`auto-merge-automation.mdc`](../../rules/auto-merge-automation.mdc).

Faller den: läs felet innan du eskalerar.

| Felet säger                                                   | Betyder                                                  | Gör                                           |
| ------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------- |
| Required checks röda/pending                                  | Grinden gör sitt jobb                                    | Merga inte. `--admin` hade tyst kringgått det |
| Approving review saknas på **ägarens egen** PR                | Kan inte självgodkännas — enda legitima `--admin`-fallet | `gh pr merge <n> --squash --admin`            |
| Code-owner-review saknas på **extern** PR (t.ex. `chgenberg`) | Precis vad rulesetet finns till för                      | Merga inte — ägaren godkänner själv           |

| Läge                                                          | Gör                                                                                                                                                                                                                        |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Label + sign-off finns, SHA matchar                           | Merga                                                                                                                                                                                                                      |
| Sign-off avser en äldre SHA                                   | Behandla som osignerad — en commit landade efter godkännandet                                                                                                                                                              |
| **Label saknas**                                              | **Merga inte.** Grönt CI är inte ett godkännande — se nedan                                                                                                                                                                |
| Label saknas och författaragenten svarar inte inom rimlig tid | Först då får du ta över **författarrollen**: kör bugbot-passet själv, triagera, och skriv sign-off-raden med `bugkoll: <väg> (merge-agenten agerade författare — ingen oberoende andra part)`. Aldrig på en protected path |

**Övertagandet är ett undantag, inte ett arbetssätt.** Det kräver antingen att
författaren är oåtkomlig, eller att ägaren uttryckligen delegerat sign-off-beslutet
för den omgången. Delegeringen gäller den gången den gavs — den blir inte stående,
och nästa pass börjar med att författarna signerar själva igen.

Två skäl att hålla på det. Signalen betyder "jag är klar med att pusha", och den
kan bara författaren veta (2026-07-25: #607 mergades på grönt CI medan dess
författare hade en commit på väg). Och tar mergaren över rollen försvinner den
oberoende andra parten — bugbot-subagenten är då enda kvarvarande skydd, vilket
är varför övertagandet aldrig gäller protected paths. Skriv alltid ut i
sign-offen vilken av de två grunderna som gällde.

### Avsaknad av `merge:ready` betyder "författaren är inte klar"

Grönt CI säger att _det som är pushat_ håller. Det säger ingenting om huruvida
författaren är **färdig med att pusha**. Bara labeln säger det. Att sätta den åt
författaren gör inte PR:en redo — det raderar bara signalen som hade sagt att den
inte var det.

Innan du behandlar en författare som frånvarande, väg in tecknen på motsatsen:

| Tecken på att författaren fortfarande jobbar      | Var det syns                                     |
| ------------------------------------------------- | ------------------------------------------------ |
| Head:et pushades nyligen                          | tidigaste `started_at` bland head:ets check-runs |
| PR:en öppnades nyss                               | `createdAt`                                      |
| Färska kommentarer eller commits från författaren | `gh pr view <n> --json comments,commits`         |
| PR:en är draft                                    | `isDraft` — rör den aldrig                       |

Utgångsläget är att **författaren är aktiv**. Är du osäker: fråga i PR:en och gå
vidare till nästa PR i kön i stället för att vänta.

Sign-off-raden:

```
merge:ready — sha: <hela 40-teckens head-SHA>, at: <ISO8601 UTC>, bugkoll: <bugbot|codex|manual>, triage: <n fixat / n loggat / n avfärdat>, P0/P1: 0
```

Efter merge: `git pull --ff-only` i huvudcheckouten så lokal master följer origin.
Felar den på ocommitterat arbete: låt det ligga, rapportera, och gå vidare.

### Merge-ordning när flera PR:er delar en högfrekvent fil

`BUG-SWARM-BACKLOG.md` och den genererade canvasen rörs av nästan varje PR. Varje
merge som skriver i dem ger konflikt åt alla andra öppna PR:er som också gör det.

**Ta den som redan står i konflikt först.** Annars får författaren lösa samma
konflikt om och om igen medan du mergar andra — det hände #610 tre gånger på en
timme, utan att något var fel med deras lösning. Är två PR:er lika långt komna,
merga den som rör backloggen före den som inte gör det.

Konfliktlösning i backloggen ska kontrolleras **semantiskt**, inte textuellt — en
textuell lösning kan tappa masters nya rader utan att det syns i diffen.

Jämför **radidentiteter, inte antal**. En PR kan både stänga gamla rader och logga
nya fynd, så antalet ändras med `stängda − tillagda`. En ren antalskontroll
underkänner då en korrekt lösning, eller värre: får någon att stryka det nyloggade
fyndet för att få siffran att stämma.

```powershell
$key = { param($f) (git show "${f}:BUG-SWARM-BACKLOG.md") -split "`n" | Where-Object { $_ -match "^\| (SW-\d{3}[A-Z]?) \|" } | ForEach-Object { $matches[1] } }
$m = & $key "origin/master"; $b = & $key "<head>"
"borta ur branchen:"; Compare-Object $m $b | Where-Object SideIndicator -eq "<=" | ForEach-Object { $_.InputObject }
"nya i branchen:";    Compare-Object $m $b | Where-Object SideIndicator -eq "=>" | ForEach-Object { $_.InputObject }
```

Varje ID under "borta" ska återfinnas med **samma ID** i den senaste daterade
arkivfilen. Varje ID under "nya" ska vara ett fynd PR:en medvetet loggar. Är
någondera oväntad: konflikten är felaktigt löst. Jämför dessutom texten för ID:n
som finns på båda sidor när konflikten rörde samma rad; identiteten fångar bortfall,
inte en semantiskt felaktig omskrivning.

Canvasen handmergas aldrig — ta vilken sida som helst och kör om
`node scripts/canvas/build-llm-flow-canvas.mjs`.

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

| Gör                                                                                         | Inte                                                                          |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `--jq` på varje `gh`-anrop, hämta bara fälten du behöver                                    | `gh pr view --json` utan filter (hela body + reviews i kontexten)             |
| Läs diffen bara när ett fynd kräver det, och då riktat                                      | `gh pr diff` på hela PR:en rutinmässigt                                       |
| **En** bakgrundsshell som sover och sedan dumpar `gh pr checks`                             | Upprepad polling i förgrunden                                                 |
| Avsluta turen under väntan — notisen tar dig tillbaka                                       | Blockera på `AwaitShell` i 15 min                                             |
| Verifiera författarens bugbot-pass                                                          | Köra om ett pass som redan är dokumenterat                                    |
| `bugbot`-subagent bara när du själv rört koden, eller på protected path utan oberoende pass | En egen agentsvärm ovanpå bugbot-passet (togs bort med `/granska` 2026-08-02) |

Väntemönster — låt **exit-koden** avgöra (`0` = alla gröna, `8` = pending). Att
läsa stdout och tolka "inget 'pending'" som klart gör ett gh-fel, ett auth-utgånget
token eller en rate-limit till ett falskt "allt grönt":

```powershell
foreach ($i in 1..20) { Start-Sleep -Seconds 50; $out = gh pr checks <n> 2>&1 | Out-String; $code = $LASTEXITCODE; if ($code -eq 8) { continue }; if ($code -eq 0) { "ALL-SETTLED"; $out; break }; "CHECK-PROBLEM (exit $code)"; $out; break }
```

Starta den i bakgrunden, avsluta turen, triagera när notisen kommer. Föredra
[`scripts/watch-prs.ps1`](scripts/watch-prs.ps1) när flera PR:er ska bevakas — den
gör samma sak för hela kön, larmar även på nya PR:er och nya commits, och tystar
PR:er med blockerande label:

```powershell
pwsh -File .cursor/skills/merg-agent-bejbysit/scripts/watch-prs.ps1 -Cycles 40
```

## Rapportformat

Kort, beslut först. En tabell över svepet, inte en essä per PR:

```
Svep <tid>: N öppna, M mergade, K väntar.

| PR | Läge | Åtgärd |
|---|---|---|
| #605 | grönt, 56 min, Codex-P1 triagerad av författaren | mergad `abc1234` |
| #607 | grönt men 4 min sedan pushen | väntar till 15 min |
| #608 | dead-code röd | pingat författaren / fixat i <commit> |

Master: i synk, grön.
```
