# Från lokal agent till master

Det här är människoguiden. Maskinvärden finns i
[`config/agent-workflow.json`](../../config/agent-workflow.json) och verifieras
av `npm run workflow:contract`.

```mermaid
flowchart TD
  U["Jakob beskriver målet"] --> A["Agent: färsk master + egen worktree"]
  A --> B["Ändra canonical owner + verkliga följdytor"]
  B --> C["verify:pr visar impact och kör lokala tester"]
  C --> D["Oberoende review + draft-PR + parallell CI"]
  D --> E["Övriga required gröna + 7 min + review klar"]
  E --> F["Betrodd head+base-exakt merge:ready"]
  F --> G["Required review-window blir grön"]
  G --> H["Jakob ger uttryckligt mergeuppdrag"]
  H --> I["Trusted controller läser allt igen och squash-mergar"]
  I --> K["CI på nya master + omvärdera andra PR:ar"]
  K --> J["tidy visar FRI → säker städning"]
```

## Det enkla arbetssättet för Jakob

1. Beskriv vad du vill ändra. Du behöver inte välja branch, tester eller
   dokumentlista själv.
2. Agenten hämtar live `master`, kontrollerar överlappande PR:er, skapar en egen
   worktree/branch och visar vilka owners och följdytor som träffas.
3. Agenten ändrar, regenererar, testar, gör oberoende review och öppnar en
   draft-PR. Varje ny commit startar om reviewfönstret på sju minuter.
4. Agenten pausar bara när ett riktigt ägarbeslut behövs eller när ändringen kan
   innebära dataförlust, security/cross-tenant-risk eller ett väsentligt större
   scope. Vanliga test-, docs- och Backoffice-följder ska agenten hantera.
5. När exakt PR-head är grön och genomgången får du en kort riskrapport. Säg då
   uttryckligen att den får mergas; controllern gör en sista livekontroll och
   squash-mergar. Otydliga formuleringar räknas inte som mergeuppdrag.

Skyddade ytor betyder alltså **extra bevis, inte förbjudet område**. Om en
produktändring påverkar ett strict schema, en policy, Sajtmaskins Backoffice
eller dokumentation ska de verkliga följdytorna ändras i samma PR. Om rapporten
visar `declared-only` eller en manuell validator ska agenten redovisa det öppet;
det får inte beskrivas som runtime-låst.

## Start och verifiering

```bash
npm run hooks:install       # en gång per clone; idempotent och worktree-delad
npm run verify:pr -- --plan  # visa vad diffen påverkar
npm run sync:derived         # skriv om genererade projektioner vid behov
npm run verify:pr            # PR-ready-kontroll före push
```

`verify:pr` jämför med färsk `origin/master`. Det läser control-plane-registren
och Backoffice domain-map samt deduplicerar hårda validators. Okända eller
oägda filer får både runtime- och full verifiering; `preview-host/**` får också
paketets egna grindar. Protected paths är tillåtna men får den fulla lokala
profilen och ska följas genom owner → konsument/validator → schema/Backoffice →
genererad projektion/docs. Det ändrar inte tracked sourcefiler. Underkommandon kan däremot
uppdatera lokala gitignorerade cacheartefakter, exempelvis `.eslintcache` och
validatorcache; kontrollera därför tracked diff, inte en helt orörd arbetsmapp.

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

Branchprefixen (`fix/`, `feat/`, `docs/`, `chore/`) kontrolleras både lokalt och
i den blockerande CI-grinden. Endast aktörer som uttryckligen finns i policyn,
för närvarande Dependabot, undantas.

Git-hooken är ett lokalt räcke, inte den yttersta sanningen: den installeras
idempotent och stoppar push om `verify:pr` är rött. CI kör samma kontrakt igen på
den pushade committen, så en saknad lokal hook kan inte göra en ogiltig PR grön.

När `quality`, `backoffice-tests`, `schema-drift`, `build`, Vercel och alla
reviewfynd är klara — medan `review-window` fortfarande väntar — posta först
`merge:ready — head-sha: <40 hex>, base-sha: <40 hex>, at: <UTC>, bugkoll: <källa>, triage: <utfall>, P0/P1: 0`
som PR-kommentar och sätt sedan labeln `merge:ready`. Label-eventet läser
aktuell head och base-refens levande tip via GitHub. Båda måste matcha
kommentaren, compare/merge-base måste visa att head innehåller base-tipen och
kommentaren måste komma från PR-författaren eller en mänsklig repo-collaborator.
Först därefter blir den head-bundna required checken `review-window` grön.

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

Expected-head är en riktig CAS för head, men GitHubs merge-API saknar motsvarande
base-SHA-parameter. Därför måste native branch protection/ruleset dessutom
kräva att branchen är uppdaterad före merge. Controllern serialiserar merges och
minimerar racet med en sista base/compare-läsning, men en manuell webbmerge eller
bypass utanför den vägen har kvar base-racet om den native inställningen saknas.
Live-auditen 2026-08-24 visade att `Protect master` ännu hade
`strict_required_status_checks_policy=false`; rolloutens GitHub-inställningssteg
måste slå på strict innan det kvarvarande base-racet kan betraktas som stängt.

Efter lyckad merge kör controllern base-invalideringen direkt och dispatchar
`ci.yml` samt `db-blob-sync-check.yml` på master. Det behövs eftersom en merge
med `GITHUB_TOKEN` normalt inte triggar nya push-workflows. Om någon av dessa
post-merge-åtgärder fallerar blir jobbet rött med
`POST_MERGE_VERIFICATION_FAILED`, men PR:n är redan terminalt mergad: kör då
base-invalidering och båda workflow-dispatcherna manuellt; försök aldrig merga
samma PR igen.

## Tillfällig tvåfas-rollout

PR:n som först landar controllern behåller `review-window.yml` som en smal
bootstrap-check, eftersom `pull_request_target` alltid kör workflowkod från
nuvarande master. Direkt efter den mergen ska en separat rollout-PR från nya
master ta bort bootstrapfilen och den här notisen. Mergarens enda uppgift
mellan faserna är rollout-PR:n; annat featurearbete väntar. Slutläget har bara
den betrodda default-branch-controllern som publicerar `review-window` på exakt
PR-head.

Fas 2 är mekanisk: radera `.github/workflows/review-window.yml`, ta bort
bootstrapkraven/prosan ur `scripts/workflow/check-contract.mjs`, den här sidan,
`.github/README.md`, `docs/testing.md` och bootstrap-assertionerna i
`scripts/pr-review/workflow.test.ts`, men behåll kontraktet som kräver att
`trusted-review-window.mjs` publicerar det policyägda checknamnet. Kör
`workflow:contract`, workflow-testerna och freshness-testerna och merga fas 2
endast via den nya betrodda head-checken.

## Vad agenten ska redovisa

- canonical owners och eventuella `declared-only`-kontrakt,
- träffade Backoffice-sidor eller uttryckligt ”ingen träff”,
- schemas/policies och deras validators,
- körda tester samt kvarvarande risk,
- exakt branch, base-SHA och head-SHA.

Detaljerad roll-, git- och mergepolicy finns i `.cursor/rules/`; denna guide
ersätter äldre manuella checklistor och ska inte kopieras till fler filer.
