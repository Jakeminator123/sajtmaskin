# Du är plan-09-agenten — legacy-ripout + config-pruning + backoffice-drift

## Din roll och kontext

Du är en autonom kodagent i en isolerad git worktree på branchen `plan-09-legacy-pruning` i Sajtmaskin-repot. Du arbetar **parallellt** med plan-08-agenten i wave 4. Ni rör inte varandras filer (se hårda begränsningar nedan). När du är klar pushar du branchen — orkestratorn mergar direkt utan PR efter granskning.

## Repo-state du ärver

- HEAD: `master @ <senaste wave-3-merge>`
- Plan 02–07 mergade. Mycket nytt har landat sedan ursprungsplanen skrevs.
- Plan 04 + plan 05 har redan tombstone-markerat 5 filer (`TODO(plan-09)`) i deras commits.
- **Läs FÖRST dessa orkestrator-pre-scans:**
  - [`STATUS-04-AUDIT.md`](../STATUS-04-AUDIT.md) — fixer-yta + missade rader (suspense + security)
  - [`STATUS-09-CANDIDATES.md`](../STATUS-09-CANDIDATES.md) — deprecated/legacy-tier A–E
  - [`STATUS-DOSSIER-CONFUSION-AUDIT.md`](../STATUS-DOSSIER-CONFUSION-AUDIT.md) — dossier-doc-arkivering är klar
  - [`STATUS-BACKOFFICE-DRIFT.md`](../STATUS-BACKOFFICE-DRIFT.md) — backoffice-pages som behöver uppdatering efter wave 1–3

## Planens mål

Minska repo:ts mentala vikt genom att ta bort döda rester, gamla flaggor och dubbla namn som fortfarande skapar tvekan.

### Tre nivåer av aggressivitet (välj i denna ordning)

1. **TIER A — Säkra deletes** (gör först)
   - V0 Platform-stubs (`src/app/api/v0/...`) — verifiera ingen client pingar dem, radera filer/mappar
   - Cursor-tombstone-markerade filer från plan 04 (`scaffold-import-checker.ts`, `partial-file.ts`, `verifier-phase.ts`-legacy-fallback, `repair-generated-files.ts` wrappern, `finalize-preflight.ts` validateAndFix-on-merge fallback)
     - **OBSERVERA:** Vissa kan ha fått ny mening i plan 05/08. Verifiera att de fortfarande är döda. Om TIER A-fil refereras från någon ny plan → flytta till TIER B.

2. **TIER B — Deadline-drift** (säkra men kräver telemetri)
   - `demoUrl` → `previewUrl` migration (3 callsites, se STATUS-09)
   - `qualityGatePending` → `verifyPending` rename (1 fält, se STATUS-09)
   - `PlanPhaseLegacy`/`family` legacy aliases (2 fält i `src/lib/gen/plan/schema.ts`)
   - För dessa: lägg `// TODO(after-wave-5): drop after deadline 2026-Q3 if no inbound payloads`-kommentarer + öppna en uppföljnings-issue i STATUS

3. **TIER C — Backoffice-drift** (uppdatera, inte radera)
   - `backoffice/pages/fixer_registry.py` `CATEGORY_COLORS` saknar nya lane-tags från plan 05 (`mechanical/static_gate/llm_repair/stream_suspense/post_merge/server_repair`). Lägg till färger.
   - `backoffice/pages/observability.py` `OBSERVED_PHASES` är aktuell; verifiera och dokumentera.
   - `backoffice/pages/dossiers.py` kan visa `tier`-information från plan 06; om enkelt — lägg till.
   - `backoffice/pages/orchestration.py` kan visa `PromptSource = "user" | "auto_repair"` (plan 03); om enkelt — lägg till.

4. **CONFIG-pruning**
   - `SAJTMASKIN_DOSSIER_PIPELINE` koddefault skiljer från deploy-state (per `STATUS-DOSSIER-CONFUSION-AUDIT.md`). Justera default till `true` överallt.
   - `SAJTMASKIN_VISUAL_QA` flagga — verifiera att den fortfarande är meningsfull eller flagga som remove-kandidat.

## Hårda begränsningar

- Rör INTE plan-08-filer (orchestrate.ts, route-plan.ts, deras nya splittade moduler). Vänta tills plan 08 mergat innan du rör dem; om plan 08 inte mergat när du startar — skippa Tier A-rader som hör dit.
- Rör INTE plan 02–07-filer som de just landat i.
- **Inga LLM-anrops-omarrangeringar** (plan 11).
- **Inga PromptKit-arkitekturändringar** (plan 12).
- **Inga preview-host-fungerande filer** rörs bara för att de "ser stökiga ut" — varje borttagning ska ha en enkel motivering.
- Maxbudget: ~25 filer rörda (radering + backoffice + tombstone-edit).

## Acceptans

- Tier A-filer raderade (eller tombstone-justerade om de visat sig leva)
- Tier B-deadlines satta som kommentarer
- Tier C-backoffice-pages uppdaterade med wave 1–3-signaler
- Config-defaults matchar deploy-state
- Inga beteenderegressioner — `npm run test:ci` passerar
- `npm run typecheck` + `npm run lint` 0 errors

## Workflow

1. **Sätt en kort plan** (vilka filer per Tier).
2. **Tier A först** — verifiera grep att ingen importerar dem, radera, kör tests.
3. **Tier C parallellt** — backoffice-änringar är fristående.
4. **Tier B sist** — det är bara kommentarer + dokumentation.
5. **Skriv `STATUS-09-legacy-pruning.md`** med:
   - lista av raderade filer
   - lista av Tier B-deadlines satta
   - lista av backoffice-pages uppdaterade
   - bekräftelse att inga beteenderegressioner introducerats
6. **Commit i logiska steg** med prefix `plan-09:`.
7. **Push branchen.** **Ingen PR** — orkestratorn granskar och mergar direkt.

## Stoppregler

- Om en Tier A-fil visar sig användas av plan 08:s nya splittade kod: flytta till "kvar tills nästa cleanup"-listan och dokumentera.
- Om backoffice-page visar sig vara mer komplex (t.ex. läser från en data-källa som inte finns) — dokumentera istället för att fixa.
- Om config-default-ändring kräver schema-uppdatering — STOPPA och beskriv.

## Klart =

`STATUS-09-legacy-pruning.md` finns, branchen är pushad, alla tester passerar.
