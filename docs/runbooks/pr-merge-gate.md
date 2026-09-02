# PR-merge-grinden: bakgrund och incidenter

Den operativa regeln bor i
[`.cursor/rules/pr-merge.mdc`](../../.cursor/rules/pr-merge.mdc). Hela lokala
körordningen ägs av [PR-workflow-skillen](../../.agents/skills/pr-workflow/SKILL.md)
och [`config/agent-workflow.json`](../../config/agent-workflow.json). Den här
filen förklarar varför grinden finns; historik här får aldrig bli en parallell
policy.

## GitHub-verkligheten

GitHubs webbinställningar kan ändras utan repo-diff. CODEOWNERS visar ägare men
bevisar inte ensam vilka rulesets, bypasser eller required checks som gäller.
Kontrollera därför aktuell PR och GitHub-inställningen; luta dig aldrig mot ett
gammalt runbookpåstående.

Repoets avsedda required checknamn ägs av
[`config/agent-workflow.json`](../../config/agent-workflow.json):

| Check              | Roll                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `quality`          | aggregerad kod- och kontraktsgrind                                                                                |
| `backoffice-tests` | Python-/Backoffice-regression                                                                                     |
| `schema-drift`     | DB-schema                                                                                                         |
| `build`            | nyckelfri produktionsbuild                                                                                        |
| `review-window`    | trusted 7 min/review + live head/base; saknat kvitto gör checken `action_required`, inte orchestrator-jobbet rött |

Konsekvenser:

- Branch- och mergegrinden ska följas även om den aktuella identiteten kan
  bypassa den.
- `--admin` är inte normalvägen. Om GitHub kräver bypass trots helt grön grind
  krävs ägarens uttryckliga mandat för just den mergen; använd den aldrig för
  att passera rött, pending eller otriagerade fynd.
- `stability` och andra warn-only-signaler ska läsas men är inte samma sak som
  required checks.

## Varför sign-off-kommentaren måste komma före labeln

`merge-ready-freshness.yml` triggar direkt när en label sätts. Endast
`merge:ready` valideras; andra labels är no-op. Den betrodda workflowversionen
läser aktuell head samt base-refens **levande tip** via Git refs-API:t. PR-
objektets historiska `.base.sha` används uttryckligen inte. Senaste sign-off-
kommentaren måste innehålla båda som exakt 40 hextecken, och GitHubs compare/
merge-base måste bevisa att head innehåller den aktuella base-tipen. Saknas
beviset eller har head/base flyttats tas labeln bort direkt. Därmed kan en
gammal sign-off inte labelas in efter en synchronize- eller master-push-körning
som redan hann se PR:n utan label.

Grinden triggar dessutom på bot-`issue_comment`. Sekunder efter att en PR
öppnas postar Codex och Bugbot ofta en kommentar. Historiskt kunde en sådan
körning ta ~20 sekunder och läsa labels och kommentarer först när den kom fram.
Sattes labeln inuti det fönstret, innan sign-off-kommentaren fanns, såg den en
labelad PR utan sign-off och rev labeln trots grön grind.

**Skarpt fall #665, 2026-07-30:** bot-kommentarer 20:12:08–09 startade två körningar 20:12:12–13 som avslutades 20:12:31–33. Labeln sattes 20:12:24 och sign-offen 20:12:27, alltså båda mitt i fönstret → labeln revs 20:12:27. Mergaren såg "författaren är inte klar" på en PR som var helt färdig.

Skriv därför sign-offen först och labeln sedan, men först när **övriga**
required checks är klara. `review-window` ska då vara pending
eller `action_required` om quality/Vercel/säkerhet inte är klara; det är inte en
cirkel utan den sista betrodda kontrollpunkten. Orchestrator-jobbet i
`merge-ready-freshness.yml` är inte själva required checken — röd quality ska
publicera `review-window=action_required` och låta jobbet sluta grönt. Saknat
Cursor-/bugbot-kvitto noteras och får inte hålla checken röd. Controllern kör
default-branch-kod, publicerar required check på exakt PR-head och blir grön
när quality och övriga required checks är klara på live head.
`merge:ready` krävs för `merge:execute`, inte för att checken ska bli grön.
Har labeln rivits måste agenten läsa orsaken, uppdatera vid behov och posta
en ny sign-off.

Sign-off-raden är en **PR-kommentar**, inte PR-body, eftersom freshness-grinden
använder GitHubs `created_at` på kommentaren som tidpunkt och en body inte har
någon. Författaren måste vara en mänsklig PR-författare, repoägare, medlem eller
collaborator; botkvitton kan aldrig fungera som mänsklig sign-off. `at:`-fältet
är läsbarhet — ordningen avgörs av GitHubs serverside-tider.

När master flyttas publicerar samma betrodda workflow först ett
`action_required`-kvitto på varje öppen PR:s exakta head och tar sedan bort
labeln. Därmed räcker inte en misslyckad labelskrivning för att lämna en gammal
grön required check. Ny base kräver ny head, omkörning och sign-off.

Beslutslogiken ligger i `scripts/ci/merge-ready-freshness.mjs` och är
enhetstestad. Den kör betrodd default-branch-kod och får inte filtrera bort
konkreta PR-AI-fynd bara för att de publiceras av `github-actions[bot]`.

## Varför final merge är ett betrott issue_comment-kommando

GitHub kör `pull_request_review` och `pull_request_review_comment` från PR:ens
merge-ref. Ett skrivande workflow på dessa event skulle därför låta PR-kod byta
workflowlogik och försöka stjäla dess token. Repoet har avsiktligt inga sådana
listeners. Sent reviewunderlag fångas i stället av finalkommandot:

`merge:execute — head-sha: <40 hex>, base-sha: <40 hex>, at: <UTC>, bugkoll: <källa>, triage: <utfall>, P0/P1: 0`

Bara en verifierad mänsklig `OWNER`, `MEMBER` eller `COLLABORATOR` får posta
kommandot. Den betrodda default-branch-controllern hämtar kommentaren live,
kräver att den är oredigerad, läser alla checks/reviews/kommentarer flera gånger
och jämför en innehållshashad fingerprint över evidensen. Kommandot måste vara
strikt senare än allt underlag. Efter settle görs ännu en live base/compare och
slutligen en squash-merge med exakt expected head-SHA.

PR-reviews hämtas paginerat med GraphQL och måste ha unik databasidentitet samt
både `submittedAt` och serverbunden `updatedAt`. Ordningen använder den senare
av tiderna, och `updatedAt` ingår i fingerprinten. En bot som editerar ett äldre
review med ett nytt fynd efter sign-off eller mergekommando gör därför mandatet
stale; REST-fältet `submitted_at` ensamt får aldrig användas för detta beslut.
Saknas en verifierbar `User`-/`Bot`-författare stoppar controllern i stället för
att gissa att ett möjligt botfynd skrevs av en människa. GraphQLs bare
bot-appslug (`github-actions`) normaliseras vid API-gränsen till samma identitet
som REST använder (`github-actions[bot]`).

`review-window`-namnet och dess `external_id` är native status/UX, inte
mergebehörighet: andra Actions-workflows delar samma GitHub App och custom
checks väljer själva dessa fält. Finalcontrollern räknar därför själv om
required checks, botar, live sign-off och sjuminutersgolvet från GitHubs
senaste serverbundna WorkflowRun för exakt `.github/workflows/ci.yml`, eventet
`pull_request`, aktuell head och aktuell PR. Varje core-check måste länka till
ett exakt jobb i den körningen och ha serverreturnerade Actions-steg. GitHub kan
visa en steglös custom check som ett jobb under samma run; den räknas aldrig som
core-proveniens. Även när ett custom reviewkvitto delar suite med en annan
workflow hämtas samtliga attempts och check-ID:t binds mot jobbens
`check_run_url`; utan sådan jobb-bindning är kvittot bara UX och live review-ID
är fortsatt auktoritet. Äldre försök av samma jobbnamn är stale; jobb som inte
kördes om i en partial rerun behåller sitt senaste serververifierade försök.
Dubbla skyddade jobbnamn i något försök eller flera lika nya runs är en
kollision och stoppar.
Sjuminutersgolvet börjar vid WorkflowRun-resursens `created_at`, inte vid ett
CheckRun-fält. Senaste verifierade jobbslut, review-state och publicerat
review-ID sätter dessutom ett senare freshness-golv när det behövs. Om GitHub
lämnar `pull_requests` tomt för en fork krävs exakt live head-repository och
head-branch. Vanliga `pull_request`-workflows är read-only och Dependabots
skrivande klassificering kör bara default-branch-kod utan mergekommando.

Controllern läser hela PR-fillistan för varje ny head, cachar den under
pollingen och hämtar den på nytt i slutkontrollen. Antal och unika filnamn måste
matcha GitHubs PR-metadata. En fil vars nuvarande eller tidigare namn träffar
`manualMergePathPrefixes` stoppas av standardmergen. Listan omfattar workflow,
default-branch-controller/reviewmoduler, scope-exekvering och centrala
klassificeringsinputs; de kräver en separat, uttryckligen ägargodkänd och
dokumenterad bootstrap-merge efter samma tester, review och väntetid. Det
undantaget får aldrig användas för att passera en röd eller ofullständig grind.
Efter exakt head/base-kontroll används expected-head-squash och post-merge-CI
körs på nya master.

Expected head stänger head-racet. GitHubs merge-endpoint tar däremot ingen
expected base-SHA. Native ruleset/branch protection måste därför kräva
up-to-date branch; den serialiserade controllern och sista compare-läsningen
minimerar men kan inte matematiskt ersätta base-CAS. Manuell webbmerge/bypass är
inte den kanoniska agentvägen. Live-auditen 2026-08-24 visade
`strict_required_status_checks_policy=false`. Desired-state och
driftkontrollen ägs av
[`.github/rulesets/protect-master.expected.json`](../../.github/rulesets/protect-master.expected.json)
plus `config/agent-workflow.json` `requiredChecks`. Live-ändringen är ett
separat manuellt steg — se avsnittet **C1: manuellt Protect master-steg** längst ner.

GitHubs native UI kan inte skilja två checkpublicerare som båda är GitHub
Actions-appen. Manuell webb-/API-merge och separat auto-merge är därför
icke-kanoniska även när UI:n ser grön ut. Likvärdig UI-säkerhet kräver en separat
GitHub App eller ett ruleset med required workflow; agentvägen är tills dess
endast det betrodda `merge:execute`-kommandot.

Den statiska namnreserveringen och jobb-/stegkontrollen är defense-in-depth, inte
ett påstående att native UI-residualen är stängd. En obetrodd PR-ref kan försöka
ändra både workflow och dess kontrakttest; canonical merge stoppar därför alla
policyägda CI-trust roots och inget UI-/API-bypass räknas som agentmerge.

En merge med Actions egen `GITHUB_TOKEN` startar normalt inte push-workflows.
Efter terminal merge gör controllern därför base-invalideringen själv och
anropar `workflow_dispatch` för både `ci.yml` och `db-blob-sync-check.yml` på
master. `workflow_dispatch` är recursion-undantaget. Misslyckas eftersteget blir
jobbet rött med `POST_MERGE_VERIFICATION_FAILED`; PR:n är redan mergad och
återhämtningen är manuell base-invalidering plus båda dispatcherna, inte en ny
merge.

## Varför fyndsvepet aldrig får vara ett tidsfönster

Frågan inför merge är "är varje fynd på PR:en åtgärdat på nuvarande head?", inte "har något nytt landat sedan jag sist tittade?". Ett tidsfilter felar åt båda hållen, och båda hände 2026-07-25:

| PR   | Fel                                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------ |
| #610 | Mergades förbi ett Vercel-fynd som låg åtta minuter före filtret. Författarens sista fix kapades och fick bli #619 |
| #613 | Blockerades på tre fynd som redan var åtgärdade på en tidigare commit                                              |

Därför: jämför varje fynds `original_commit_id` mot head och kontrollera i koden om det ligger bakåt.

## Varför sent arbete går i en ny PR

2026-07-25 landade en plan-commit i #607 samtidigt som den mergades, och fick brytas ut till #608 i efterhand. En mergare som ser grönt CI och en färdig-ut-seende PR har inget sätt att veta att en commit är på väg. Därför: öppna aldrig en icke-draft PR med arbete kvar att pusha.

## Varför dashboard-auto-mergaren är av

Beslut 2026-07-09. Cursor-dashboardens "PR-mergare" mergade allmänt och kringgick grinden via admin — **#468 mergades till master med en oåtgärdad P1 och 0 reviews**. Den kräver dessutom Cursor-billing för att ens starta.

Automationen bor inte i repot och lyder **inte** `.cursor/rules` — bara dashboard-inställningen stoppar den. Slår du på den igen: ge den samma grind och `merge:ready`-krav i dess dashboard-prompt, annars är den tillbaka i "dum"-läget.

Samma skäl ligger bakom rollspliten mellan billig bevakare och dyr beslutsfattare: en svag agent som mergar är en false-green-risk.

## Bot-granskarnas tillgänglighet över tid

| Datum      | Händelse                                                                                                                                                                                                                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-02 | Codex av (credits slut)                                                                                                                                                                                                                                                                                                             |
| 2026-07-08 | Codex tillbaka                                                                                                                                                                                                                                                                                                                      |
| 2026-08-01 | GitHub-Bugbot **och** Codex slog i taket samtidigt — #703/#704 stod utan externa ögon                                                                                                                                                                                                                                               |
| 2026-08-20 | Samma sak hela kvällen under en åttafiligs våg (#1069–#1077): GitHub-Bugbot, Codex **och** «Find critical bugs» alla usage-limitade. `pr-ai-review` var enda externa granskaren — och räckte: den postade uttömmande review per head-SHA och fann verkliga fynd i #1073, #1076 och #1077. Den lokala `bugbot`-subagenten bar resten |

Den GitHub-integrerade Bugbot:en delar teamets budget och postar `Bugbot couldn't run - usage limit reached` när den tar slut. Lokal Sol/bugbot är då innehållsfallback. Den required `review-window` blir grön när quality och minst ett qualifying externt kvitto (till exempel Cursor Bugbot) är klara. `trusted-pr-ai-review` kan vara `success` efter en uttömmande Platform-review av exakt live-head, eller `neutral` vid saknad nyckel/kvot — då postas ingen Codex-överlämning. Skip, fyndspecifik uppföljning, stale resultat och en vanlig kontokommentar räknas inte som pass. Är alla kvalificerande kvitton borta/röda stoppas merge i stället för att timeout bli falskt grön.

En ren review på en senare head stänger inte automatiskt äldre fynd. PR AI-state
bär dem i sin resolution-ledger tills en explicit `fixed` eller
`rejected-with-reason` finns; merge-triagen ska därför fortfarande gå igenom
hela PR:ens reviewtrådar.

En Codex-kommentar som **bara** är "usage limit" är inget fynd och blockerar inte om ett annat reviewkvitto lyckas; den räknas inte själv som ett pass.

## Två fällor som kostade tid 2026-08-20

**«Docs-only» skyddar inte mot kontraktstester.** Flera tester läser `docs/`,
registries och agentregler. Bara en exklusiv, bevisat safe docs-diff får den
explicita light-profilen; docs som också har runtime-, Backoffice-, authority-
eller extra validatorpåverkan kör tungt. `npm run verify:pr -- --plan` visar
docs-, control-plane-, agent- och Backofficepåverkan. Riktade kontroller ger
lokal återkoppling; required GitHub-checks publicerar fullprofil eller ett
explicit light-kvitto för aktuell head-SHA.

**`cancelled` är inte `failure`.** CI:s concurrency-grupp avbryter en pågående
körning när en ny commit landar på samma ref. En `quality: cancelled` på en
äldre commit betyder alltså «ersatt», inte «trasig» — läs alltid checken på
**nuvarande** head innan du drar slutsatsen att master är röd.

## Meta vs produkt (håll planen isär)

| Plan        | Vad                                                                             | Format                                     |
| ----------- | ------------------------------------------------------------------------------- | ------------------------------------------ |
| **Meta**    | Modeller/verktyg som bygger Sajtmaskin: Cursor, Codex-review, `Task`-subagenter | slug, t.ex. `claude-opus-4-8-thinking-max` |
| **Produkt** | Modeller i `config/ai_models/manifest.json` som betjänar användarsajter         | id, t.ex. `gpt-5.5`, `openai/gpt-5.5`      |

Ange alltid vilket plan ett fynd hör till så de inte blandas ihop.

## C1: manuellt Protect master-steg

Live-rulesetet **Protect master** (`17926309`)
ändras **inte** av en PR. Versionerad desired-state:
[`.github/rulesets/protect-master.expected.json`](../../.github/rulesets/protect-master.expected.json).
App-ägda required checks läses från
[`config/agent-workflow.json`](../../config/agent-workflow.json) `requiredChecks`
vid utvärdering (ingen kopia i specen). GitGuardian är enda extra externa
checken. Driftjobbet `master-ruleset-drift` jämför live mot det tillståndet och
är medvetet **inte** en PR-required check — det körs på `push` till `master`,
nattligt schema och `workflow_dispatch`.

Gör live-ändringen **efter** att C2 och C3 är mergade (C3 publicerar
`dossier-acceptance`; C2 gör deterministiska stability-kontrakt blockerande i
`quality`) **och** C1:s desired-state finns på `master`. Lägg inte till
`dossier-acceptance` i rulesetet innan C3 publicerar checken — GitHub blockerar
då alla PR:er som saknar den.

Ordning i GitHub UI / API för ruleset `17926309`:

1. `pull_request.required_review_thread_resolution` = `true`
2. `required_status_checks.strict_required_status_checks_policy` = `true`
3. Required checks, exakt mängd:
   - från `requiredChecks` efter C3: `quality`, `backoffice-tests`,
     `schema-drift`, `build`, `review-window`, `dossier-acceptance`
   - plus `GitGuardian Security Checks` (`integration_id` `46505`)
4. Bekräfta att reglerna `deletion` och `non_fast_forward` finns (blockera
   radering och force-push av `master`)
5. Bekräfta att `pull_request.allowed_merge_methods` innehåller `squash`
6. Lämna `pull_request.required_approving_review_count` = `0` (ensam repoägare;
   GitHub räknar inte self-approval)

Verifiering: kör Actions-workflow `master-ruleset-drift` via `workflow_dispatch`
på `master`. Grön = live matchar desired-state. Röd = avvikelse; läs
annoteringarna, rätta live eller specen, kör om. Jobbet skriver aldrig
GitHub-konfiguration.
