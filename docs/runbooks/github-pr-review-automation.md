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
Dependabot-PR:er tas i stället upp av den kontobaserade fallbacken när de saknar
ett giltigt reviewkvitto för aktuell head.

Workflowens enda permissions är:

```yaml
contents: read
pull-requests: write
issues: write
checks: write
```

GitHub-access använder enbart `${{ github.token }}`. Inget personligt PAT krävs.

## Beständigt state och canonical owner

Den kanoniska exekverbara ägaren är `scripts/pr-review/core.mjs` tillsammans med
`scripts/pr-review/automation.mjs`. Varje PR får en kollapsad
`github-actions[bot]`-kommentar med ett versionsmärkt, base64url-kodat JSON-state.
Det innehåller minst:

- repository, PR-nummer och base branch,
- första fullt granskade head-SHA och senaste behandlade head-SHA,
- om minst en uttömmande review är klar,
- totalt antal automatiska head-platser (hårt tak 3),
- den senaste headens fulla fyndsnapshot,
- en kompakt resolution-ledger med ID, status och originalkommentar för alla
  historiska fynd,
- senaste uttömmande review-ID, uppföljningskommentar-ID:n, tidsstämplar och
  merge-status.

Varje uttömmande review och uppföljning bäddar dessutom in en separat
återställningsmarkör. Den uttömmande markören innehåller head-SHA, run-nummer och
resolution-ledgern.
Om state-kommentaren försvinner kan nästa event återskapa senaste state från de
publicerade GitHub-reviewerna. En avbruten körning får däremot bara läkas från en
publicerad review för **exakt samma head**; en äldre head är aldrig bevis för att
den nya granskningen blev klar.

## Granskningskontrakt

Varje ny head-SHA får en uttömmande automatisk review så länge PR:ens hårda
budget på tre distinkta head-platser inte är förbrukad. En normal
`synchronize` granskar alltså hela den aktuella GitHub-diffen igen, även om den
föregående headen var ren eller hade äldre fynd:

1. Hela GitHub-diffen skickas som ok betrodd data till den starka modellen.
2. Endast trovärdiga beteendefel, säkerhetsfel, dataförlust, brutna kontrakt och
   false-green-risker får rapporteras.
3. Varje fynd måste ange impact 1–10, bugsannolikhet 0–100 %, fil och rad.
4. Bara RIGHT-side-rader som verifierats mot GitHubs verkliga diff får
   publiceras inline. Hallucinerade/ogiltiga platser filtreras bort.
5. En ren diff får en kort COMMENTED-review som säger att inga nya trovärdiga
   buggar hittades. Äldre aktiva fynd ligger ändå kvar i resolution-ledgern;
   frånvaro i ett nytt modellresultat är inte en disposition.

Modellvalet ägs av workloaden `github_pr_reviewer` i
`config/ai_models/manifest.json`:

- uttömmande review: `defaultModel`, hög reasoning,
- fyndspecifik uppföljning: `followUpModel`, låg reasoning.

Workflow-YAML:en duplicerar inga modell-ID:n.

## Per-head-review, uppföljningar och kostnadstak

En ny head får aldrig kvitteras av en billig fyndspecifik uppföljning. Den kör
alltid den uttömmande modellen mot hela current-diffen. Den kvarvarande
uppföljningsvägen är endast för återtagning av äldre, redan påbörjat state och
är strikt begränsad till redan kända finding-ID:n och statusarna:

- `fixed`
- `still-present`
- `rejected-with-reason`
- `cannot-verify`

Det finns inget schemafält för nya fynd. Runtime validerar dessutom att varje
tidigare aktivt ID förekommer exakt en gång och att inget nytt ID har lagts till.
När ett fynd är fixat reagerar automationen med tumme upp på originalkommentaren
och publicerar en kort statuskommentar. Samma explicita status uppdaterar
resolution-ledgern. Bara `fixed` eller `rejected-with-reason` gör ett äldre fynd
terminalt; en ren senare snapshot får aldrig tappa ett öppet fynd.

Hårda stopp:

- högst tre distinkta head-SHA:n får en automatisk reviewplats per PR,
- ett misslyckat försök kan återtas på samma head utan en ny budgetplats; en
  annan head förbrukar en ny plats (återförsök på samma head kan därför ge fler än tre
  faktiska modellanrop),
- när tre platser är förbrukade får nästa head inget trusted success-kvitto och
  behöver ett annat kvalificerande reviewkvitto för att `review-window` ska bli
  grön,
- samma head-SHA behandlas aldrig två gånger efter en slutförd review,
- programmerings-, modellformat- och GitHub-fel sparas som `failed`, aldrig som
  en lyckad/grön review,
- saknad `OPENAI_API_KEY` eller verifierad billing-/kvotspärr lämnar över till
  kontofallbacken; vanliga rate limits och andra providerfel maskeras inte.

## Maskinläsbart kvitto på aktuell head

Review-steget skriver ett versionsmärkt JSON-resultat till runnerns temporära
katalog. Resultatet blir `qualified` bara när körningen just har:

1. granskat hela diffen med `kind: exhaustive`, eller återläst exakt samma
   publicerade exhaustive-review som `kind: receipt-recovery`,
2. slutfört state för samma head-SHA, och
3. publicerat en GitHub-review med ett giltigt review-ID.

En receipt-recovery kvalificerar bara när den betrodda automationen på nytt har
verifierat reviewmarkör, review-ID och att markörens head-SHA är samma som
GitHub-reviewns `commit_id`. Det behövs om
reviewn publicerades men POST:en av check-run-kvittot tillfälligt misslyckades:
en omkörning återanvänder då reviewbeviset utan nytt modellanrop eller ny review.

Vanlig skip, finding-only follow-up, ofullständigt state och saknat
modellresultat kan aldrig bli kvalificerade. Ett separat steg utan
`OPENAI_API_KEY` läser resultatet,
hämtar PR:ens **live-head** på nytt och publicerar `trusted-pr-ai-review=success`
endast när granskad head och live-head är identiska. Om headen har flyttat eller
resultatet är okvalificerat publiceras `action_required`; om review-steget
misslyckas publiceras inget grönt kvitto alls. `review-window` fortsätter därmed
fail-closed på exakt aktuell SHA.

Vid den uttryckliga kontofallbacken blir `trusted-pr-ai-review` i stället
`neutral`, aldrig grön. Workflowen postar samtidigt en
`sajtmaskin-pr-review-fallback:v2`-begäran för exakt head-SHA. Därmed syns
överlämningen utan att tom API-kredit i sig gör providerchecken röd.

## Kontobaserad Codex-fallback

Den lokala Codex-automationen **PR fallback-bugggranskare** kör med det anslutna
GitHub-kontot och OpenAI-kontot i Codex-appen, inte med repository-secreten eller
OpenAI Platform API. Den söker högst en öppen, icke-draft PR per körning som
antingen har fallbackbegäran för aktuell head eller är en Dependabot-PR utan
aktuellt reviewkvitto.

Efter att hela diffen och relevant filkontext granskats publicerar automationen:

1. en `COMMENT`-review bunden till exakt `commit_id`, med markören
   `sajtmaskin-codex-account-review:v2`, och
2. en separat PR-kommentar med samma head-SHA och det serverreturnerade
   review-ID:t i `sajtmaskin-codex-account-review-receipt:v2`.

`review-window` räknar kvittot endast när båda resurserna kommer från en actor i
`config/agent-workflow.json.review.trustedAccountReviewActors`, har betrodd
repository-association, samma användare, samma review-ID och exakt live head.
En vanlig kommentar, fel konto, stale review eller saknad receipt kan därför
inte ge grönt. Automationens lokala exekvering kräver att Codex-appen och datorn
är igång; om den uteblir fortsätter mergegrinden att stoppa.

## Mergade PR:er

Merge-kontrollen är den första kontrollen efter den read-only PR-hämtningen.
Alla mergade PR:er hoppas över före state-läsning, modell och GitHub-skrivning.
Detta är striktare än minimikravet att aldrig granska en PR som varit mergad i
mer än en timme.

## Setup och felsökning

Repository-secreten `OPENAI_API_KEY` behövs för den primära eventstyrda reviewn.
Utan den lämnas varje vanlig PR-head över till kontofallbacken. Kontrollera bara
namnet, aldrig värdet:

```powershell
gh secret list --repo Jakeminator123/sajtmaskin --json name
```

Kontrollera körningar via Actions → **PR AI review** eller:

```powershell
gh run list --repo Jakeminator123/sajtmaskin --workflow "PR AI review"
```

Vanliga stopporsaker är en diff över det uttryckliga storlekstaket, modellformat-
eller GitHub API-fel. Saknad secret och billing-/kvotspärr är överlämningsorsaker
till kontofallbacken. En review får inte tolkas som grön bara för att andra
CI-checks är gröna.

## Manuell körning och avstängning

En framtida `/granska-pr`-kommandoväg eller `workflow_dispatch` får bara anropa
samma `scripts/pr-review/run.mjs` med ett PR-event/PR-nummer och samma
PR-scopade concurrency-grupp. Den får inte ha egen state, nollställa räknaren
eller kringgå per-head-/max-tre-kontraktet.

Stäng av automationen genom GitHub Actions-inställningen för workflowen eller
genom att inaktivera/radera `.github/workflows/pr-ai-review.yml` i en vanlig PR.
Radera inte state-kommentarer för att stänga av den; återställningsmarkörerna är
avsiktligt byggda för att motstå en sådan nollställning.
