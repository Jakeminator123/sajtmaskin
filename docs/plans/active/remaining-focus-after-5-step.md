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
   - lagg till regressionsfall for kvarvarande route-/sidinflation

4. **Preview lifecycle beyond smalt Steg 5-pass**
   - heartbeat / hibernate / destroy / recover / version rollover
   - stang edge-cases dar status/recover kan driva ifran faktisk session

5. **Verify/repair-hardening**
   - forbattra hantering av aterkommande tsc/lint/import-export-fall
   - forstark deterministiska fixar och testtackning

6. **Tooling- och artifact-audit**
   - fortsatta stada scripts/rebuild/eval/loggning/prompt-dumps
   - skilj tydligt active runtime-inputs fran observability och historik

7. **Template-library / extern pipeline**
   - fortsatt tydlig separation mellan runtime, build/tooling och research
   - hall valideringar skarpa for att undvika tyst drift mellan artifacts

## Arbetsregel

- runtime-kod ar source of truth
- andringar verifieras med typecheck + riktade tester
- docs och dashboards ska spegla kod, inte tvartom
