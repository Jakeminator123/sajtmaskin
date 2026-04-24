# CLOUD-REVIEW-06 — Scenario A: page.tsx-loss prevention end-to-end

**Du är cloud-review-agent #06.** READ-ONLY. Producera audit-rapport.

## Din uppgift

Code-walk genom hela `runFinalizePreflight()`-pathen och verifiera att om LLM:n emitterar en CodeProject UTAN `app/page.tsx`, så blockerar nya scaffold-required-files-checken persist till disk.

## Förläs

- `docs/plans/active/master-post-cleanup-2026-04-23/STATUS-INVESTIGATE-PAGETSX-LOSS.md` — root-cause + 4 spec'ade fixar
- `src/lib/gen/stream/finalize-preflight.ts` — där fixen ska bo (sök på `HOME_PAGE_REQUIRED_PATHS`)
- `src/lib/gen/stream/finalize-merge.ts` (`LLM_ONLY_PATHS` rad 87-90)
- `src/lib/gen/stream/finalize-version/preflight-phase.ts` — consistency-assertion
- `src/lib/gen/stream/finalize-version/runner.ts` — orchestrerar finalize

## Code-walk att producera

Steg-för-steg från LLM stream-end till disk-write:

1. **LLM stream slutar** → `parseCodeProject(content)` parsar fences
2. **Scaffold-merge** → `mergeGeneratedProjectFiles(scaffold, llmFiles)` — `app/page.tsx` filtreras bort från scaffold-base via `LLM_ONLY_PATHS`
3. **Preflight phase** → `runFinalizePreflight()`:
   a. Bygger `completeProjectFiles` via `buildCompleteProject(...)`
   b. **NY check (plan 11):** scannar `completeProjectFiles` för `HOME_PAGE_REQUIRED_PATHS`
   c. Om saknad → emit issue med `severity: "error"`, `previewBlocked: true`?
   d. Om hittar men content < 200 chars (eller motsvarande tröskel) → emit issue
4. **Persist phase** → om `errors > 0` → vägrar persist? eller persist anyway med error-flag?
5. **Preview-host bootstrap** → om persisted med error → preview visar 404 eller stuck loading?

## Specifika frågor att besvara

1. **Vad är "non-trivial content"-tröskeln?** Investigation föreslog >200 chars. Är det implementerat? Vad räknas — total file content, JSX-noder, eller rendered text?

2. **Blockerar `severity: "error"` faktiskt persist?** Eller persist går vidare och bara loggar warning?

3. **Vad händer för EXISTING versions utan page.tsx (regressions)?** Alla tidigare runs (chat `1fa58609` v1, chat `b71dafb3` v1) hade saknad page.tsx. När de loadas, triggar checken nu? Eller bara på nya versions?

4. **Kantfallet `src/app/page.tsx`:** Om scaffold är `landing-page` (använder `app/`) men LLM emitterar `src/app/page.tsx` (alternative path) — hanteras det?

5. **Investigation-spec:s 4:e punkt ("telemetry hardening"):** Loggas `filesChecked` + `persistedFilesCount` i samma `preflight.summary`-event? Bekräfta i `src/lib/logging/devLog.ts`-typen eller motsvarande.

## Test-verifikation

Plan-11 lade tests i `finalize-preflight.test.ts`. Hitta de specifika test-cases som triggar denna check:
- Vilken setup-input?
- Vilken expected output?
- Vilken assertion (toBe / toContain / toMatchObject)?

Om test mockar input för komplext (= mocking egentliga produktionspath) — flagga som svaghet.

## Output

Skriv `docs/plans/active/master-post-cleanup-2026-04-23/audit-reports/AUDIT-06-scenario-pagetsx-loss-<agent-id>.md`.

Innehåll:
- Code-walk som diagram eller numrerad lista
- Specifika svar på 5 frågor ovan
- Test-verifikation
- Sammanfattning: är page.tsx-loss-buggen ROBUST fixad eller har den kantfall kvar?

## Klart = PR öppnad.
