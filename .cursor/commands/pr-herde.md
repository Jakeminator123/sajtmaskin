# PR-herde

Driver öppna PR:er från «PR:en finns» till «mergad» utan att en människa behöver
vara mellanhand. `/post-review` täcker granskning **före** commit; den här täcker
allt **efter** att PR:en är uppe.

Grinden ägs helt av [`pr-merge.mdc`](../rules/pr-merge.mdc) och upprepas inte här.
Det här kommandot äger **loopen** och de fällor som faktiskt kostat oss tid.

## När den ska köras

När en eller flera PR:er är öppna och ingen driver dem framåt — typiskt efter att
flera agenter parallellt skapat PR:er, eller när något står still med grönt CI.

Kör den inte på en enda PR du själv nyss skapat: då räcker författardelen nedan.

## Fem fällor som stoppat oss förut

| Fälla | Vad som faktiskt gäller |
|---|---|
| «`gh pr checks` var grönt, alltså inga fynd» | Checks visar bara grönt/rött. Repots PR AI-review lägger fynden som **inline review-kommentarer** på filer, och de syns bara via `pulls/<n>/comments` |
| «Bugbot sa usage limit, alltså inga fynd» | Det betyder att granskaren är **av**. Det är ingen buggkoll, och det är inget fynd att triagera |
| Labeln sattes före sign-off-kommentaren | Omvänd ordning river labeln automatiskt via `merge-ready-freshness.yml`. Sign-off-rad först, label sedan |
| Mergaren satte labeln för att komma vidare | `merge:ready` är författarens intygande. Mergaren sätter den aldrig åt någon |
| Två agenter skrev i samma delade fil | [`BUG-SWARM-BACKLOG.md`](../../BUG-SWARM-BACKLOG.md) är den vanligaste krocken. Rader kan dubbleras och `check:bug-backlog` fälls efter andra mergen |

## Rollerna är åtskilda

| Roll | Gör | Gör aldrig |
|---|---|---|
| **Författare** | Hämtar fynden, triagerar, signerar, sätter labeln | Mergar |
| **Herde/mergare** | Verifierar grinden, mergar, rapporterar krockar | Sätter labels, skriver på annans branch, rebasar åt någon |

## Arbetsordning för herden

1. **Svep billigt först.** `gh pr list --state open --limit 30 --json number,title,headRefName,isDraft,labels,createdAt,mergeable,author`.
   Läs labels innan något dyrt. Hoppa drafts. Blockerande labels väger tyngre än
   `merge:ready`: `do-not-merge`, `agent:needs-human`, `risk:4`, `risk:5`.
2. **Sortera ut det som inte får röras.** `EmaCodeHero` → aldrig till master, retargeta
   till `ema` ([`ema-pr-sparr.mdc`](../rules/ema-pr-sparr.mdc)). Dependabot → rapportera
   för ägarbeslut.
3. **Saknas `merge:ready`?** Rapportera exakt vad som fattas och gå vidare till nästa PR.
   Skicka författardelen nedan till den agent som äger PR:en.
4. **Hämta alla fynd** enligt `pr-merge.mdc` § *Hämta ALLA fynd* — flera anrop, inte ett.
   Glöm särskilt inte check-run-output och dess separata annotations-endpoint: Vercel Agent
   Review lägger fynd där även vid `neutral`/`success`. Svep hela fyndlistan mot nuvarande
   head, aldrig ett tidsfönster.
5. **Verifiera författarens påståenden mot koden.** En rapport som säger «inga fynd» är
   inte bevis. Det här steget är hela värdet av rollen.
6. **Kontrollera delade filer före första mergen.** För varje par av öppna PR:er:
   `git diff --name-only origin/master...origin/<branch>` och jämför. Överlapp i
   backloggen eller en planfil → säg åt respektive författare att städa i **sin** PR.
7. **Merga en i taget**, `git fetch` emellan. En merge gör alla andras head-SHA inaktuella.
8. **Rapportera** per PR: mergad/väntar/`NEEDS_HUMAN`, vilken buggkoll, fynd med utfall,
   och exakt vilket villkor som saknas.

## Väntan är inte en aktivitet

`quality` tar ~8 min, `review-window` minst 7. Blocka **aldrig** med `AwaitShell`-polling
eller `gh run watch`. Använd tiden till de övriga PR:erna: hämta deras fynd, verifiera
påståenden, hitta filkrockar. Behöver du bevaka en specifik PR: en bakgrundsshell som sover
till golvet och dumpar status, sedan avsluta turen.

Bevakaren larmar bara. Triage och merge är herdens beslut.

## Författardelen — skicka den till PR:ens ägare

```text
Din PR saknar sign-off och kan inte mergas.

1. Hämta ALLA fynd (gh pr checks visar dem INTE; "usage limit reached" betyder att
   granskaren är AV, inte att fynd saknas). Kanonisk lista i pr-merge.mdc; minimum:
     gh api repos/<owner>/<repo>/pulls/<n>/comments --jq '.[] | .user.login + " " + .path + ": " + .body'
     gh api repos/<owner>/<repo>/pulls/<n>/reviews  --jq '.[] | .user.login + " [" + .state + "] " + (.body // "")'
     gh api repos/<owner>/<repo>/issues/<n>/comments --jq '.[] | .user.login + ": " + .body'
     $sha = gh pr view <n> --json headRefOid -q .headRefOid
     gh api --method GET --paginate -F per_page=100 repos/<owner>/<repo>/commits/$sha/check-runs --jq '.check_runs[] | (.id|tostring) + " " + .name + ": " + (.output.title // "") + "\n" + (.output.summary // "") + (.output.text // "")'
   Vercel Agent Review lägger fynd i check-run-output även vid neutral/success, och
   annotations ligger på en EGEN endpoint per check-run-id (se pr-merge.mdc). --method GET
   krävs, annars blir -F en POST.
   Har PR AI-reviewen publicerat en full review för din head-SHA räknas den som fullgod
   buggkoll: bugkoll: pr-ai-review. Annars kör bugbot-subagenten (readonly, modell enligt
   subagent-models.mdc).
2. Triagera VARJE fynd: fixat / loggat i BUG-SWARM-BACKLOG.md med fil-ankare / avfärdat
   med ett skäl. False-green, brutet kontrakt, säkerhet och körtidsregression MÅSTE fixas.
   Smak och stil loggas och blockerar aldrig.
3. Sign-off som PR-kommentar FÖRST, labeln SEDAN:
     merge:ready — sha: <40-tecken head-SHA>, at: <ISO8601 UTC>, bugkoll: <bugbot|bugbot-local|pr-ai-review|manual|codex>, triage: <fixat/loggat/avfärdat>, P0/P1: 0
     gh pr edit <n> --add-label "merge:ready"
4. Ny commit → gör om steg 1-3 för den nya SHA:n. Merga inte själv.
```

## Stopplinjer

- Byt aldrig branch i huvudcheckouten. Behövs en PR-branch lokalt: eget worktree, städat
  med `npm run worktree:remove -- <path>` ([`agent-worktree.mdc`](../rules/agent-worktree.mdc)).
- Skriv aldrig kod på en annan agents branch. Behöver PR:en arbete: rapportera det.
- Faller ett enda villkor i grinden → `NEEDS_HUMAN`, ingen merge.
- `--admin` är tillåtet på ägarens uppmaning, men överstyr `review-window` — verifiera då
  PR-åldern manuellt med `gh pr view <n> --json createdAt`.
