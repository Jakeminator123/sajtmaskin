# Remaining Focus After 5-step

Detta ar den aktiva restlistan efter avslutat 5-stegsspar.

## Syfte

- samla kvarvarande arbete i en synlig plats under `docs/`
- undvika parallella rotdokument for samma status
- gora nasta pass smalare och verifierbara

## Kvarvarande fokusomraden

1. **Compat v0 och naming debt**
   - kartlagg kvarvarande usage av `/api/v0/chats/*`
   - hall wrappers smala tills usage ar nara noll
   - planera avveckling utan bred borttagning i ett steg

2. **Sandbox-naming debt**
   - kartlagg `sandbox*` i DB, API/SSE, UI-state, typer, tester och docs
   - dela upp migration i smala delsteg

3. **Follow-up-komplexitet**
   - harda previous-files/persisted-scaffold/wrapper-beteende
   - ~~lagg till regressionsfall for kvarvarande route-/sidinflation~~ (done: `hasExplicitAddRouteIntent` gate, brief-merge, path-inferens, booking/auth-split)

4. **Preview lifecycle beyond smalt Steg 5-pass**
   - heartbeat / hibernate / destroy / recover / version rollover
   - stang edge-cases dar status/recover kan driva ifran faktisk session

5. **Verify/repair-hardening**
   - forbattra hantering av aterkommande tsc/lint/import-export-fall
   - forstark deterministiska fixar och testtackning
   - ~~unresolved local imports som warning~~ (done: default error, env-flagga for gradvis rollout, telemetrisparing)
   - ~~saknad package.json utan hard error~~ (done: hard error i sanity)
   - ~~radix-ui monorepo-migration~~ (done: scaffold rensad fran individuella @radix-ui/react-*, dep-completer → "radix-ui": "^1", streaming-regel + autofix for gamla imports, Slot namespace-fix, detectMissingImports for saknade JSX-imports, LLM-prompt uppdaterad)
   - ~~lucide-react v1 i scaffold~~ (**reverted** i restore `1f4e86956`: tillbaka till ^0.563.0, brand-ikoner aterstallda, dep-completer → "^0.563")

6. **Tooling- och artifact-audit**
   - ~~terminologi-konsolidering~~ (done: kanonisk ordlista i `docs/architecture/glossary.md`, ~100 termer, namnskuggor losta)
   - ~~docs-stadning~~ (done: 68 → ~40 filer, borttagna avklarade planer/agentrapporter/handoffs/archive/contributing)
   - ~~component uplift P14-P17~~ (**reverted** i restore `1f4e86956`: capability-packs, enhancement-packs, LLM-classifier, docs-knowledge/form-workflow borttagna. Orsakade kvalitetsregression — generationer blev for lika, fler importfel, tunnare art direction. `buildCapabilityHints()` kvar direkt i `capability-inference.ts`.)
   - fortsatta stada scripts/rebuild/eval/loggning/prompt-dumps
   - skilj tydligt active runtime-inputs fran observability och historik

7. **Template-library / extern pipeline**
   - fortsatt tydlig separation mellan runtime, build/tooling och research
   - hall valideringar skarpa for att undvika tyst drift mellan artifacts

## Arbetsregel

- runtime-kod ar source of truth
- andringar verifieras med typecheck + riktade tester
- docs och dashboards ska spegla kod, inte tvartom
