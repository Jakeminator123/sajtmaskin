# STATUS — Investigation: page.tsx loss in scaffold-merge

**Datum:** 2026-04-24  
**Investigator:** Codex 5.3 (Cursor CLI investigationsagent)  
**Mode:** READ-ONLY — no code changed

## Hypothesis prioritized list (after investigation)

1. **Scaffold-base-files dropped i merge** — **VERIFIED (for `app/page.tsx`)** — `mergeGeneratedProjectFiles()` svartlistar `app/page.tsx` via `LLM_ONLY_PATHS`, filtrerar bort den från scaffold-basen, och kräver LLM-emission (`src/lib/gen/stream/finalize-merge.ts`).
2. **`mergeGeneratedProjectFiles` filtrerar bort filer** — **VERIFIED (selective, not global)** — filtreringen gäller avsiktligt `app/page.tsx`/`src/app/page.tsx`; andra scaffold-filer behålls i init-merge (`src/lib/gen/stream/finalize-merge.ts`).
3. **LLM emitterar bara delta (6 filer)** — **NEEDS MORE DATA** — parsern (`parseCodeProject`) extraherar endast explicit emitterade code fences; reproducerat runmaterial pekar på 6 filer men rå `timeline.ndjson` saknas i denna worktree.
4. **`finalize-preflight.ts` post-`scaffold-import-checker` dropper filer** — **FALSIFIED (current code), historically relevant for 26 vs 6 drift** — nuvarande kod persisterar `completeProjectFiles`; historiskt fanns en bug där `preflightFileCount` räknades på 26 men `filesJson` returnerade tidigare, mindre set (fixat i commit `7a6a6d589`).
5. **Partial-file-repair / `repairGeneratedFiles` strippar filer** — **FALSIFIED** — `repairGeneratedFiles` muterar innehåll/importer men tar inte bort filer; ingen filpruning hittad där.

## Root cause

Den direkta orsaken till att `app/page.tsx` kan försvinna är merge-kontraktet i `src/lib/gen/stream/finalize-merge.ts`: `LLM_ONLY_PATHS` innehåller `app/page.tsx`/`src/app/page.tsx`, och init-merge exkluderar dessa från scaffold-basen innan merge. Det betyder att scaffoldens `app/page.tsx` **inte** får leva kvar som fallback om LLM inte emitterar den.

```87:90:src/lib/gen/stream/finalize-merge.ts
const LLM_ONLY_PATHS: ReadonlySet<string> = new Set([
  "app/page.tsx",
  "src/app/page.tsx",
]);
```

```197:204:src/lib/gen/stream/finalize-merge.ts
const scaffoldBase = resolvedScaffold.files
  .filter((file) => {
    if (isLlmOnlyPath(file.path)) {
      llmOnlyScaffoldPaths.push(file.path);
      return false;
    }
    return true;
  })
```

Den andra rotorsaken (som exakt förklarar 26-vs-6-symptomet) är en äldre persistensbugg i `runFinalizePreflight()`: `preflightFileCount` räknades på `completeProjectFiles`, men `filesJson` returnerade det äldre `nextFilesJson`-setet. Fixen i `7a6a6d589` la till `nextFilesJson = JSON.stringify(completeProjectFiles)`; före den fixen kunde preflight säga 26 medan disk/preview körde 6.

## Why scaffold's page.tsx never reaches disk

1. Stream avslutas och `parseFilesFromContent()` parsar endast LLM:s CodeProject-fences (`src/lib/gen/parser.ts` + `src/lib/gen/version-manager.ts`).
2. Init-merge kör `mergeGeneratedProjectFiles()` med scaffold, men `app/page.tsx` är explicit blockerad från scaffold-default (`LLM_ONLY_PATHS`), så pathen finns bara om LLM faktiskt emitterat den (`src/lib/gen/stream/finalize-merge.ts`).
3. `runFinalizePreflight()` körs och bygger `completeProjectFiles` för validering/filräkning (`src/lib/gen/stream/finalize-preflight.ts` + `src/lib/gen/export/project-scaffold.ts`).
4. Persist sker via `addAssistantMessageAndCreateDraftVersion(..., filesJson)` i `finalize-version`-runnern; preview bootstrap använder sedan `version.files_json` (via `/preview-session` och `startPreviewSession(..., skipProjectScaffold: true)`).
5. Om `app/page.tsx` inte finns i persisterat `files_json`, finns den inte på preview-disk heller.

## Why preflight.summary said 26 files

`preflight.summary.files` kommer från `preflightFileCount`, dvs längden på `completeProjectFiles` efter `buildCompleteProject(...)` (baseline-filer + genererade filer + UI-komponenter). Den siffran representerar **preflightens utvärderingsmängd**, inte nödvändigtvis det historiskt persisterade payload-setet.

```564:571:src/lib/gen/stream/finalize-preflight.ts
const completeProjectFiles = repairGeneratedFiles(
  buildCompleteProject(cleanedFiles, collectRequiredUiComponents(cleanedFiles)),
).files;
nextFilesJson = JSON.stringify(completeProjectFiles);
preflightFileCount = completeProjectFiles.length;
```

I äldre kod (före `7a6a6d589`) saknades raden `nextFilesJson = JSON.stringify(completeProjectFiles)`. Då kunde loggen rapportera 26 (räknat på complete set) medan preview/disk fick ett mindre set (ex. 6). Det är den exakta mekanismen bakom diskrepansen.

## Recommended fix (for plan 11, NOT implemented here)

1. **Hard gate for missing home route after full preflight assembly**  
   - Fil: `src/lib/gen/stream/finalize-preflight.ts`  
   - Lägg in explicit blockerande check efter `completeProjectFiles` byggts: kräv `app/page.tsx` eller `src/app/page.tsx` med icke-trivialt innehåll; annars `severity: "error"` + `code_structure_failure`.
2. **Consistency assertion between counted and persisted file set**  
   - Fil: `src/lib/gen/stream/finalize-preflight.ts` + `src/lib/gen/stream/finalize-version/preflight-phase.ts`  
   - Lägg en invariant/logg-guard: om `preflightFileCount !== JSON.parse(filesJson).length` efter preflightfasen, emit stark diagnostics + blockera persist i strict mode.
3. **Regression tests for this exact failure mode**  
   - Filer: `src/lib/gen/stream/finalize-preflight.test.ts`, `src/lib/gen/stream/finalize-version.test.ts`, `src/lib/providers/own-engine/generation-stream-post-finalize.test.ts`  
   - Testa: (a) LLM missar `app/page.tsx` i init, (b) preflight count vs persisted files parity, (c) preview bootstrap använder samma set som preflight validerade.
4. **Telemetry hardening**  
   - Fil: finalize-preflight summary payload + run logs  
   - Logga både `filesChecked` och `persistedFilesCount` i samma event för snabb root-cause nästa gång.

## Why no existing test caught this

- `finalize-merge.test.ts` täcker `LLM_ONLY_PATHS`-logiken men inte end-to-end till persisted `version.files_json` + preview-disk.
- `finalize-preflight.test.ts` mockar `buildCompleteProject`/repair och verifierar mest issue-kategorier; den saknar assert att returnerat `filesJson` faktiskt motsvarar counted set.
- `finalize-version.test.ts` har inte en integrerad scenario-assert för "preflight says N files, preview/session uses M files".

## Run-specific data

| Run | chatId | versionId | scaffoldVariant | files in CodeProject (LLM output) | files after merge | files on disk |
|---|---|---|---|---|---|---|
| A | `1fa58609-a2f5-4b13-8246-d82dd77ca9ba` | `d7f009c9-fc58-4dc1-8cc2-1f55f24cb866` | `editorial-lux` | **Likely 6** (indirekt evidens) | **Likely 6** | `6` (given) |
| B | `b71dafb3-8c1f-413c-85f9-6ea96c4c21d6` | `2e53374a-af46-4224-96ff-2b841779e776` | `corporate-grid` | **Likely 6** (indirekt evidens) | **Likely 6** | `6` (given) |

Not: explicit rå loggfil (`timeline.ndjson`) för dessa run IDs var inte tillgänglig i denna worktree, så LLM-output-count markeras som inferred från observerad disk/state.

## Open questions for plan 11

1. Var run A/B körda på runtime före eller efter fixen i `7a6a6d589` (preflight persist parity)?  
2. Finns rå `timeline.ndjson`/version-payload för att definitivt bekräfta om CodeProject faktiskt var 6 filer eller om tappet skedde senare?  
3. Ska `app/page.tsx` vara absolut required i alla init-scaffolds, eller per-scaffold-konfigurerad required-route-lista?  
4. Ska `missingEmittedEssentials` uppgraderas från preflight-error till explicit stop-before-persist för att undvika halvpersist helt?

