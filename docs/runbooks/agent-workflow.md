# Från lokal agent till master

Det här är människoguiden. Maskinvärden finns i
[`config/agent-workflow.json`](../../config/agent-workflow.json) och verifieras
av `npm run workflow:contract`.

```mermaid
flowchart TD
  U["Jakob beskriver målet"] --> A["Agent jobbar i öppna checkouten"]
  A --> B["Ändra canonical owner + verkliga följdytor"]
  B --> C["verify:pr-plan + riktade lokala tester"]
  C --> W{"Ändras en CI-trust root?"}
  W -- "nej" --> D["Review + PR + parallell CI"]
  W -- "ja" --> X["Separat, ägargodkänd infrastruktur-bootstrap"]
  X --> D
  D --> E["Övriga required gröna + 7 min + review klar"]
  E --> F["Betrodd head+base-exakt merge:ready"]
  F --> G["Required review-window blir grön"]
  G --> H["Jakob ger uttryckligt mergeuppdrag"]
  H --> I["Trusted controller läser allt igen och squash-mergar"]
  I --> K["CI på nya master + omvärdera andra PR:ar"]
  K --> J["tidy visar FRI → säker städning"]
```

## Det enkla arbetssättet för Jakob

1. Öppna repo-roten (File → Open Folder) och beskriv vad du vill ändra.
2. Agenten är en vanlig repo-agent. Ingen Scout/Builder/Steward-roll om du inte
   nämner den. Ingen tvingad worktree. Branchnamn behöver inget `fix/`-prefix.
3. Agenten ändrar, testar och öppnar PR när du ber om det.
4. Agenten pausar vid dataförlust, security/cross-tenant eller oväntat stort
   scope.
5. När PR-head är grön: säg uttryckligen att den får mergas.

Skyddade ytor betyder alltså **extra bevis, inte förbjudet område**. Om en
produktändring påverkar ett strict schema, en policy, Sajtmaskins Backoffice
eller dokumentation ska de verkliga följdytorna ändras i samma PR. Om rapporten
visar `declared-only` eller en manuell validator ska agenten redovisa det öppet;
det får inte beskrivas som runtime-låst.

## Start och verifiering

```bash
npm run hooks:install       # en gång per clone; idempotent och worktree-delad
npm run verify:pr -- --plan  # visa vad diffen påverkar (även pre-push-hooken)
npm run sync:derived         # skriv om genererade projektioner vid behov
# kör relevanta riktade kontroller; GitHub väljer tung profil eller light-kvitto
```

`verify:pr` jämför med färsk `origin/master`. Det läser control-plane-registren
och Backoffice domain-map samt deduplicerar hårda validators. Okända filer får
fail-safe runtime- och fullprofil; runtimefiler utan en control-plane-owner
rapporteras som information men har redan runtimeprofilen. `preview-host/**`
får också paketets egna grindar. Protected paths är tillåtna men får den fulla
CI-profilen och ska följas genom owner → konsument/validator → schema/Backoffice
→ genererad projektion/docs. Lokalt körs relevanta riktade kontroller. Bare
`npm run verify:pr` är frivillig felsökning, eller ett uttryckligt krav när
själva CI-/verifieringsmotorn ändras. GitHub publicerar required checks på varje
PR-head. Ready runtime, högrisk och `master` kör tung profil; bevisat safe docs
och vanliga drafts får i stället ett explicit grönt light-kvitto. Underkommandon
kan uppdatera lokala gitignorerade cacheartefakter, exempelvis `.eslintcache`
och validatorcache; kontrollera därför tracked diff, inte en helt orörd
arbetsmapp.

## Flera agenter utan statuskonflikter

Kandidatbrancher ska i första hand ändra sin kod och sina lokala tester, inte
slåss om delade statusytor som `BUG-SWARM-BACKLOG.md`, canvas, planindex eller
genererade kontraktdokument. En utsedd integrationsagent gör en enda
reconciliation från senaste live `master`: porterar de verifierade ändringarna,
uppdaterar canonical owners och regenererar de delade projektionerna en gång.

Om två PR:er överlappar samma owner ska de mergas seriellt eller ersättas av en
ren integrations-PR. Efter varje merge hämtas live `master` igen och återstående
PR:ers faktiska diff, head-SHA, checks och reviewfynd omvärderas. En äldre
generated-/statusfil vinner aldrig en konflikt bara för att den redan låg i en
branch; källägaren på nya master vinner och projektionen regenereras.

Branchnamn har inget obligatoriskt prefix. `*BRA*` och `rescue/*` är fortfarande
frysta backuper.

Git-hooken är ett lokalt räcke, inte den yttersta sanningen: den installeras
idempotent och stoppar push om `verify:pr --plan` är rött. Riktade kontroller
körs lokalt. CI publicerar required checks för den pushade committen och väljer
fail-closed tung profil eller ett explicit light-kvitto, så en saknad lokal hook
kan inte göra en ogiltig PR grön.

När `quality`, `backoffice-tests`, `schema-drift`, `build`,
`dossier-acceptance`, Vercel och alla reviewfynd är klara — medan
`review-window` fortfarande väntar — posta först
`merge:ready — head-sha: <40 hex>, base-sha: <40 hex>, at: <UTC>, bugkoll: <källa>, triage: <utfall>, P0/P1: 0`
som PR-kommentar och sätt sedan labeln `merge:ready`. Label-eventet läser
aktuell head och base-refens levande tip via GitHub. Båda måste matcha
kommentaren, compare/merge-base måste visa att head innehåller base-tipen och
kommentaren måste komma från PR-författaren eller en mänsklig repo-collaborator.
Först därefter kan `merge:execute` köras. Den head-bundna required checken
`review-window` blir grön när quality och övriga required checks är klara.
Ett Cursor-/Codex-/bugbot-kvitto noteras om det finns, men saknat, hoppat eller
404:at Cloud Agent-kvitto blockerar inte. Orchestrator-jobbet
`trusted-review-window` är inte required checken — en avbruten körning av det
jobbet ska inte läsas som röd grind. `bugkoll:` i `merge:ready` är den
mänskliga noteringen.

När den är grön postar en mänsklig `OWNER`, `MEMBER` eller `COLLABORATOR` den
slutliga kommandoraden (PR-författarskap ensamt ger inte merge-mandat):

`merge:execute — head-sha: <40 hex>, base-sha: <40 hex>, at: <UTC>, bugkoll: <källa>, triage: <utfall>, P0/P1: 0`

Detta är den enda kanoniska agentmergen. `issue_comment` kör kod från default
branch. Controllern hämtar kommentaren via dess GitHub-id, läser live head,
base, checks, reviews och båda kommentarstyperna flera gånger med ett kort
settle-fönster och kräver oförändrad evidensfingerprint. Sedan läser den live
base/compare igen och gör en squash-merge med GitHubs expected-head-SHA.
Review-event-workflows får inte användas för denna token: deras YAML kommer
från PR:ens obetrodda merge-ref.

Reviews läses paginerat via GitHubs GraphQL-data, eftersom REST-listan inte har
reviewens serverbundna `updatedAt`. Både inskicknings- och senaste ändringstid
ingår i ordningen och evidensfingerprinten. Om en bot editerar ett gammalt
reviewinlägg med ett nytt fynd efter sign-off eller mergekommando blir mandatet
alltså stale även om review-ID:t är oförändrat.

Final merge använder inte checknamnet eller dess självvalda `external_id` som
behörighetsbevis. Alla GitHub Actions-workflows delar appidentitet, så den
betrodda controllern räknar om core-checkar, botstatus, live sign-off och
sjuminutersgolvet från den senaste serverbundna körningen av exakt
`.github/workflows/ci.yml` på eventet `pull_request`. Varje required check knyts
till sitt exakta jobb via GitHubs job-/check-run-URL och måste ha
serverreturnerade Actions-steg; en steglös custom check räknas inte som ett
core-jobb. Ett custom reviewkvitto som delar en annan workflows suite blir inte
ett jobb bara av den anledningen: controllern kräver en exakt jobb-/check-ID-
bindning och använder annars live review-state + review-ID. Tiden kommer från
WorkflowRun-resursens `created_at`, inte från ett
återanvänt checknamn. För varje jobbnamn väljs senaste attempt där just jobbet
kördes; ett partial rerun behåller därmed andra serververifierade jobb utan att
återanvända ett ersatt resultat. Ett dubblerat skyddat jobbnamn i något attempt
stoppar. För fork-PR:ar där GitHub lämnar PR-associationen tom krävs exakt
matchning mot live head-repository och branch;
oklar eller flerdubbel identitet stoppar. Vanliga `pull_request`-workflows får
inga skrivrättigheter; skrivande Dependabot-klassificering kör enbart
default-branch-kod och kan aldrig merga.

## Särskilt spår för CI-trust roots

`manualMergePathPrefixes` i `config/agent-workflow.json` äger trust roots för
hela grinden: workflowfiler, default-branch-controller/reviewmoduler, själva
scope-exekverbara filerna och deras centrala JSON-inputs. Den vanliga
`review-window`- och `merge:execute`-controllern vägrar därför en PR där en fil
har nuvarande **eller tidigare** namn på någon sådan yta. Det är det enda
verkligt manuella mergeundantaget, och ska inte blandas med en produktändring.

En sådan ändring görs i en separat PR: ägaren godkänner uttryckligen
infrastruktur-bootstrapen, agenten kör samma lokala plan + riktade kontroller,
CI, oberoende review och sjuminutersfönster, och det exakta head/base-paret läses
om direkt före en dokumenterad expected-head-squash-merge. Efteråt körs CI på
nya master och övriga öppna PR:ar omvärderas. Själva införandet av denna spärr är
en engångs-bootstrap; när den finns på master får ingen agent dölja en
workflowändring bakom ett vanligt mergekommando. Det oberoende golvet i
`workflow:contract` hindrar en PR-head från att ta bort sin egen trust root ur
den redigerbara policyn.

Den egna `trusted-pr-ai-review`-checkens namn är inte heller reviewbevis. Både
den levande state-kommentaren och dess publicerade review-ID måste binda till
exakt repo, PR och head; en stale eller omdöpt Actions-check räknas inte.
Saknad nyckel eller Platform-kvot ger `neutral` utan Codex-överlämning.
Historiska konto-kvitton kan fortfarande läsas, men nya PR:er ska inte
lämnas över till Codex-kontot.

Expected-head är en riktig CAS för head, men GitHubs merge-API saknar motsvarande
base-SHA-parameter. Därför måste native branch protection/ruleset dessutom
kräva att branchen är uppdaterad före merge. Controllern serialiserar merges och
minimerar racet med en sista base/compare-läsning, men en manuell webbmerge eller
bypass utanför den vägen har kvar base-racet om den native inställningen saknas.
Live-auditen 2026-08-24 visade att `Protect master` ännu hade
`strict_required_status_checks_policy=false`; rolloutens GitHub-inställningssteg
måste slå på strict innan det kvarvarande base-racet kan betraktas som stängt.

Native GitHub visar fortfarande required checks som namn + GitHub Actions-app,
inte som en kryptografiskt unik workflow-publicerare. Därför är manuell
webbmerge, generell API-merge och separat auto-merge inte agentvägar. Om UI:n i
framtiden också ska vara lika stark krävs en separat GitHub App-identitet eller
ett ruleset med required workflow; tills dess används bara `merge:execute`.

Repo-kontraktet som reserverar `review-window`-namnet och jobb-/stegbindningen
är defense-in-depth. De gör inte native UI kryptografiskt säkert, eftersom en
PR-ref kan försöka ändra både workflow och kontrakt före merge. Det är just
varför workflowfiler stoppas av den kanoniska controllern och UI/API-merge inte
är en godkänd agentväg.

Efter lyckad merge kör controllern base-invalideringen direkt och dispatchar
`ci.yml` samt `db-blob-sync-check.yml` på master. Det behövs eftersom en merge
med `GITHUB_TOKEN` normalt inte triggar nya push-workflows. Om någon av dessa
post-merge-åtgärder fallerar blir jobbet rött med
`POST_MERGE_VERIFICATION_FAILED`, men PR:n är redan terminalt mergad: kör då
base-invalidering och båda workflow-dispatcherna manuellt; försök aldrig merga
samma PR igen.

## Vad agenten ska redovisa

- canonical owners och eventuella `declared-only`-kontrakt,
- träffade Backoffice-sidor eller uttryckligt ”ingen träff”,
- schemas/policies och deras validators,
- körda tester samt kvarvarande risk,
- exakt branch, base-SHA och head-SHA.

Detaljerad roll-, git- och mergepolicy finns i `.cursor/rules/`; denna guide
ersätter äldre manuella checklistor och ska inte kopieras till fler filer.
