# Sajtmaskin — bedömning av läget 2026-04-23

## Bas för bedömningen

Denna bedömning bygger på:
- `aktiva_planer.zip` (särskilt `README.md`, `Kvarvarande-uppgifter.md`, `P26-followup-orchestration-glitch.md`, `dossier-brief-sync.md`, `E-easy-medium-layer.md`, `M-medium-hard-layer.md`, `P34-blocking-lint-in-validate-and-fix.md`)
- `trött_agent_summering.txt`

Den är därför en **arkitektur- och tillståndsbedömning**, inte en verifierad git-diff av varje commit.

## Kort dom

Repo:t ser **bättre ut än för 36 timmar sedan**, framför allt i:
- observability
- guardrails
- sync mellan brief/dossier/F3
- follow-up-härdning
- statiska safety nets (regex, lint, import-fix, stub-beteende)

Men repo:t är **inte enklare**. Kärnförvirringen finns fortfarande i att samma beslut görs i flera lager:
- follow-up/init-semantik
- scaffold/variant-pick
- dossier/fidelity-3/integration readiness
- phase 3 / repair / fixer-kedjan
- promptbyggande i flera callsites

## Objektiv status per område

### 1) LLM-flöde
**Trend:** uppåt på korrekthet, nästan platt på begriplighet.

Bra:
- rå-signalpaket och snapshot-rehydrering verkar ha förbättrats
- Unicode-regex och follow-up-klassning blev robustare
- model-fallback i fixer-callsites är tätare

Kvar:
- flera follow-up-predikat
- duplicerad follow-up-prosa
- request taxonomy bara delvis inkopplad
- prompt assembly splittrad över flera callsites

### 2) Scaffold / scaffold variants
**Trend:** förbättrad matchning, men modellen är fortfarande mer komplex än nödvändigt.

Bra:
- P26-paketet verkar ha landat till stor del
- variant-lock och raw-message-spåret verkar ha härdats

Kvar:
- residual P26-bugg: `build_intent_promoted` på follow-ups
- `content-site` överlappar sannolikt för mycket med `landing-page`
- `corporate-grid` som default ser misstänkt ut mot eval-resultat

### 3) Dossiers / F3
**Trend:** klart bättre.

Bra:
- brief-vokabulär synkas nu från disk
- F3 kräver inte längre orimliga env-vars utan dossier-backing
- capability-map autogenereras

Kvar:
- planeringsytan är driftig: en fil talar om 3 dossiers, en annan om 11
- schema/runtime/backoffice behöver en enda validator
- fyll inte på poolen aggressivt innan kontraktet är stenhårt

### 4) Phase 3 / repair / autofix
**Trend:** bättre kvalitet, fortfarande för mycket mekanik.

Bra:
- blocking eslint är på väg in på rätt plats
- null-stubs är bättre än visuella trasiga placeholders
- metrics finns för att börja mäta verklig kostnad

Kvar:
- 4 separata LLM repair-calls är fortfarande för mycket
- flera import-fixers och react-fixers överlappar
- phase 3 är funktionellt starkare än tidigare men fortfarande inte kognitivt enkel

### 5) “Gamla saker kommer tillbaka”
**Trend:** delvis verkligt problem, delvis UX/transparensproblem.

Bra:
- preview-url invalidation och ingress-telemetri är redan levererade

Kvar:
- UI-transparensen om vilken basversion en follow-up använder saknas fortfarande
- det kan få repo:t att kännas mer regressivt än det faktiskt är

## Rekommenderad 4-agent-plan

## Agent A — Follow-up integrity & basversion
**Mål:** gör follow-ups semantiskt pålitliga.

Ta:
- P26 kvarvarande uppföljare
- E2 enhetlig follow-up-predicate
- P19 steg 3 basversions-transparens i UI/logg

Undvik:
- full P32
- stora promptrefaktorer

## Agent B — Scaffold/variant cleanup
**Mål:** minska förvirringen runt scaffold-val.

Ta:
- M1 `content-site` → `landing-page`
- E7 variant-default-utredning + ev. justering

Undvik:
- nya scaffolds
- full L3 dossier-variants

## Agent C — Autofix/import-härdning
**Mål:** minska heavy-load och onödiga fixvarv.

Ta:
- E4 required imports checklist
- E5 react-import-fixer v2
- M4 `syntaxFixPasses: 1` bakom eval-validering
- E6 strict assert i CI

Undvik:
- full L1 unified repair-call
- M3 om telemetri saknas

## Agent D — Dossier contract hardening
**Mål:** gör dossier-lagret till en trovärdig source of truth.

Ta:
- Cloudagent Paket B (AJV-validator)
- därefter Cloudagent Paket A om tid finns

Undvik:
- M2 stora dossier-expansionen innan validatorn sitter
- P33 ekosystembreddning nu

## Saker jag inte skulle ge agenter i natt
- L1 `runUnifiedRepair()`
- L2 full PromptKit över alla callsites
- L3 dossier-variants
- M2 “lägg till 5–10 dossiers” innan kontraktet härdats
- P32 större pipeline-förgreningar

## Merge-ordning i morgon
1. Agent A
2. Agent C
3. Agent B
4. Agent D

## Slutdom

Ja, repo:t ser ut att ha blivit bättre under senaste 36 timmarna.
Men förbättringen är främst:
- mindre falska krav
- färre uppenbara driftproblem
- bättre guardrails
- bättre observerbarhet

Det har **inte ännu blivit tillräckligt sammanhållet** i kärnan.
Om du vill nå “svinbra i morgon” bör fokus vara på:
1. follow-up-integritet
2. scaffold/variant-förenkling
3. import/repair-förenkling
4. dossier-kontrakt

Inte på fler features.
