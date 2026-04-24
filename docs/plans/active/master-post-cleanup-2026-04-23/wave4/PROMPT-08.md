# Du är plan-08-agenten — core simplification (orchestrate.ts + route-plan.ts)

## Din roll och kontext

Du är en autonom kodagent i en isolerad git worktree på branchen `plan-08-core-simplification` i Sajtmaskin-repot. Du arbetar **parallellt** med plan-09-agenten i wave 4. Ni rör inte varandras filer (se hårda begränsningar nedan). När du är klar öppnar du PR mot `master`.

**Viktigt:** Plan 08 är **`no-behavior-change-first`**. Du splittar mekaniskt, du ändrar INTE policy. Tester ska passera oförändrat efter splitten. Eventuella policyjusteringar kommer i framtida planer.

## Repo-state du ärver

- HEAD: `master @ <senaste wave-3-merge>` (plan 06 + 07 mergade)
- Plan 02 (modal-truth + cross-file-stub-warning) mergad
- Plan 03 (auto-repair labeling med `PromptSource = 'user' | 'auto_repair'`) mergad
- Plan 04 (fixer-matrix) mergad
- Plan 05 (lane-tag på FixEntry + `fixer-lanes.md` + `lanes.ts` + `llm-repair-gate.ts`) mergad
- Plan 06 (capability-classifier på follow-ups + tier-spectrum) mergad — `requestedCapabilityTiers` finns på `OrchestrationBase`
- Plan 07 (deterministisk three-deps + 3D-stub-warning) mergad

Den ackumulerade förändringen är **stor** — `orchestrate.ts` har troligen vuxit. Plan 08 ska nu trimma kärnan utan att ändra beteende.

## Planens mål

1. **Splitta mekaniskt** — `orchestrate.ts`, `route-plan.ts` och stora lokala helpers nära dem.
   - Bryt ut tematiska sektioner till egna filer (capability-resolution, scaffold-resolution, repair-policy, fixer-routing-glue, etc).
   - Re-exporter från ursprungsfilerna så consumers inte behöver ändras.

2. **Flytta helpers närmare sin ägare.** Om en helper bara används av ett område → flytta till det området, inte i toppnivå-utility.

3. **Ta bort lokalt överlapp.** Tidigare planer kan ha duplicerat logik som nu finns i nya moduler.

4. **Stoppa om en split gör diffen semantiskt riskabel.** Bättre att lämna kvar än att introducera regression.

## Hårda begränsningar

- **Inga policyändringar.** Beteende ska vara EXAKT identiskt efter splitten.
- Rör INTE plan-09-filer: `STATUS-09-CANDIDATES.md`-listans Tier A (V0 Platform-stubs) och Tier B (`demoUrl`-deprecation), `STATUS-04-AUDIT.md`-listans deletion-candidates, gamla `archive/`-mappar.
- Rör INTE filer som plan 02–07 just landat i — du **får** läsa men inte refactora deras kärnändringar.
- **Inga LLM-anrops-omarrangeringar.** Det är plan 11.
- **Inga PromptKit-arkitekturändringar.** Det är plan 12.
- Maxbudget: ~20 filer rörda (kärnan är stor; mer än normalt).

## Acceptans

- `orchestrate.ts` är **mindre** än innan (rad-count och responsibilities), men API:t är oförändrat.
- `route-plan.ts` är **mindre** eller åtminstone tydligare uppdelad.
- Inga nya beteenderegressioner. Hela test-suiten passerar oförändrat (`npm run test:ci`).
- Lint och typecheck passerar (0 errors).
- En läsare kan följa init- och follow-up-flödet i kod utan att hoppa mellan 5+ filer.

## Var du börjar leta

- `src/lib/gen/orchestrate.ts` (huvudkandidaten)
- `src/lib/gen/route-plan.ts` (eller motsvarande — sök på `routePlan`/`buildRoutePlan`)
- `src/lib/gen/build-spec/` — speciellt om någon helper därifrån är "bara använd av orchestrate"
- `src/lib/gen/scaffolds/` — scaffold-resolution callsites
- `src/lib/gen/dossiers/` — dossier-selection callsites
- `src/lib/builder/` — Plan 06 lade till `follow-up-capability-detection.ts`; orchestrate konsumerar den
- `docs/architecture/orchestration-contract.md` — uppdatera om strukturen ändras

## Workflow

1. **Sätt en kort plan** (vilka split-kandidater + estimerad rad-count före/efter per fil).
2. **Mät baseline.** `wc -l src/lib/gen/orchestrate.ts src/lib/gen/route-plan.ts` (eller motsvarande).
3. **Splitta i SMÅ commits** (en split per commit). Lättare att rolla tillbaka om något breakar.
4. **Kör `npm run test:ci`** efter varje split, inte bara på slutet.
5. **Kör `npm run lint && npm run typecheck`** lokalt.
6. **Skriv `STATUS-08-core-simplification.md`** i `docs/plans/active/master-post-cleanup-2026-04-23/` med:
   - före/efter rad-count för splittade filer
   - lista av nya moduler + deras ansvar
   - bekräftelse att inga beteenderegressioner introducerats (test-count före/efter)
   - bekräftelse att planen blev `full`
7. **Push branchen** och **öppna PR mot master** med `gh pr create`. PR-titel: `plan 08: core simplification (no behavior change)`.

## Stoppregler

- Om en split bryter > 5 tester på sätt som inte är mekanisk shape-justering: ROLLA TILLBAKA den specifika ändringen och dokumentera.
- Om split kräver att du ändrar plan 02–07-territoriets API:er: STOPPA, dokumentera, hoppa över.
- Om du upptäcker att en hel fil "borde dö" snarare än splittas: lägg den i Tier A i STATUS-09-CANDIDATES (du kan bara skriva-till-doc, inte radera kod) och lämna åt plan 09.

## Klart =

PR är öppnad mot master, STATUS-08 är committad, branchen är pushad, alla tester passerar.
