# GitHub PR-granskning — eventstyrd automation

Den permanenta PR-granskaren körs av
`.github/workflows/pr-ai-review.yml`. Den använder PR-events, inte polling, så
ingen modell anropas när det inte finns en relevant PR-händelse.

## Triggers och parallellitet

Workflowen reagerar på `pull_request_target` för `master` vid:

- `opened`
- `reopened`
- `synchronize`
- `converted_to_draft`
- `ready_for_review`

Både draft-PR:er och vanliga öppna PR:er omfattas. Concurrency-gruppen innehåller
PR-numret och använder en kö: events för samma PR körs seriellt, medan olika PR:er
kan granskas parallellt.

## Säkerhetsmodell

`pull_request_target` behövs för att kunna kommentera även fork-PR:er med
Actions inbyggda `GITHUB_TOKEN`. Därför gäller en hård gräns:

- checkouten pekar alltid på den betrodda default-branchen (`master`),
- PR-head eller merge-ref checkas aldrig ut,
- inga dependencies, script, workflows eller andra filer från PR-head exekveras,
- diff och aktuella relevanta filer hämtas via GitHub API och behandlas enbart
  som ok betrodd granskningsdata,
- promptens fasta instruktioner säger uttryckligen att kod, kommentarer och annan
  PR-data aldrig får ändra regler, operationer eller outputkontrakt,
- `OPENAI_API_KEY` injiceras bara i review-steget och loggas aldrig.

Dependabot hoppas över innan checkout eftersom GitHub ger sådana
`pull_request_target`-körningar fork-liknande secret-/tokenbegränsningar.

Workflowens enda permissions är:

```yaml
contents: read
pull-requests: write
issues: write
checks: read
```

GitHub-access använder enbart `${{ github.token }}`. Inget personligt PAT krävs.

## Beständigt state och canonical owner

Den kanoniska exekverbara ägaren är `scripts/pr-review/core.mjs` tillsammans med
`scripts/pr-review/automation.mjs`. Varje PR får en kollapsad
`github-actions[bot]`-kommentar med ett versionsmärkt, base64url-kodat JSON-state.
Det innehåller minst:

- repository, PR-nummer och base branch,
- första fullt granskade head-SHA och senaste behandlade head-SHA,
- om den uttömmande reviewn är klar,
- totalt antal reviewkörningar (hårt tak 3),
- stabilt ID, plats, status och GitHub-kommentar-ID för varje fynd,
- review-/uppföljningskommentar-ID:n, tidsstämplar och merge-status.

Den uttömmande reviewn och varje uppföljning bäddar dessutom in en separat
återställningsmarkör. Om state-kommentaren försvinner eller en körning avbryts
efter publicering kan nästa event återskapa state från redan publicerade
GitHub-reviews/kommentarer i stället för att köra en ny full review.

## Granskningskontrakt

En PR får exakt ett uttömmande automatiskt reviewförsök, och därmed aldrig mer
än en publicerad uttömmande review:

1. Hela GitHub-diffen skickas som ok betrodd data till den starka modellen.
2. Endast trovärdiga beteendefel, säkerhetsfel, dataförlust, brutna kontrakt och
   false-green-risker får rapporteras.
3. Varje fynd måste ange impact 1–10, bugsannolikhet 0–100 %, fil och rad.
4. Bara RIGHT-side-rader som verifierats mot GitHubs verkliga diff får
   publiceras inline. Hallucinerade/ogiltiga platser filtreras bort.
5. En ren diff får en kort COMMENTED-review som säger att inga trovärdiga
   buggar hittades. Inga fynd konstrueras för att skapa aktivitet.

Modellvalet ägs av workloaden `github_pr_reviewer` i
`config/ai_models/manifest.json`:

- uttömmande review: `defaultModel`, hög reasoning,
- fyndspecifik uppföljning: `followUpModel`, låg reasoning.

Workflow-YAML:en duplicerar inga modell-ID:n.

## Uppföljningar och kostnadstak

Efter den fulla reviewn kan högst två nya head-SHA:n utlösa en billig
fyndspecifik uppföljning. Uppföljningsschemat innehåller bara redan kända
finding-ID:n och statusarna:

- `fixed`
- `still-present`
- `rejected-with-reason`
- `cannot-verify`

Det finns inget schemafält för nya fynd. Runtime validerar dessutom att varje
tidigare aktivt ID förekommer exakt en gång och att inget nytt ID har lagts till.
När ett fynd är fixat reagerar automationen med tumme upp på originalkommentaren
och publicerar en kort statuskommentar.

Hårda stopp:

- högst tre modellkörningstillfällen totalt per PR,
- ett misslyckat första full-reviewförsök gör inte en senare commit till en ny
  full review; felet förblir synligt och kräver manuell åtgärd,
- noll fynd efter full review innebär noll framtida modellkörningar,
- alla fynd terminalt `fixed`/`rejected-with-reason` innebär noll framtida
  modellkörningar,
- samma head-SHA behandlas aldrig två gånger,
- modell-/GitHub-fel sparas som `failed`, aldrig som en lyckad/grön review.

## Mergade PR:er

Merge-kontrollen är den första kontrollen efter den read-only PR-hämtningen.
Alla mergade PR:er hoppas över före state-läsning, modell och GitHub-skrivning.
Detta är striktare än minimikravet att aldrig granska en PR som varit mergad i
mer än en timme.

## Setup och felsökning

Repository-secreten `OPENAI_API_KEY` måste finnas. Kontrollera bara namnet, aldrig
värdet:

```powershell
gh secret list --repo Jakeminator123/sajtmaskin --json name
```

Kontrollera körningar via Actions → **PR AI review** eller:

```powershell
gh run list --repo Jakeminator123/sajtmaskin --workflow "PR AI review"
```

Vanliga stopporsaker är saknad secret, modellkvot, en diff över det uttryckliga
storlekstaket eller GitHub API-fel. State-kommentarens `lastRun.status` förblir då
`failed`; en review får inte tolkas som grön bara för att andra CI-checks är gröna.

## Manuell körning och avstängning

En framtida `/granska-pr`-kommandoväg eller `workflow_dispatch` får bara anropa
samma `scripts/pr-review/run.mjs` med ett PR-event/PR-nummer och samma
PR-scopade concurrency-grupp. Den får inte ha egen state, nollställa räknaren
eller kringgå exakt-en-/max-tre-kontraktet.

Stäng av automationen genom GitHub Actions-inställningen för workflowen eller
genom att inaktivera/radera `.github/workflows/pr-ai-review.yml` i en vanlig PR.
Radera inte state-kommentarer för att stänga av den; återställningsmarkörerna är
avsiktligt byggda för att motstå en sådan nollställning.
