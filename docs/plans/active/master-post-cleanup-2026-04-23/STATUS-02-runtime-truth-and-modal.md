# STATUS 02 — runtime truth + version modal (short scope)

**Datum:** 2026-04-24
**Branch:** `plan-02` (PR mot `master`)
**Bas-HEAD:** `9f9a5a043` (efter plan-04 + STATUS-01)
**Scope:** `short` — bekräftat. Plan blev INTE `full`. Inga plan 03/04/05-territorier rörda.
**Filer rörda:** 15 (varav 2 är test-fixture-uppdateringar för `crossFileStubs: []`).

---

## Sammanfattning

Tre kirurgiska fixes + tre regressionstester. Inga nya statussystem, inga breaking-changes
i event-bussen. Modal-truth som STATUS-01 bekräftade redan funkar i HEAD är nu **låst
fast med tester** så projektion-drift på `design_preview_skip_verify` eller warning-level
build-events fångas i CI.

---

## Före/efter på de tre buggarna

| Bugg | Före | Efter |
|---|---|---|
| **ThinkingOverlay döljer streamad text** | `absolute inset-x-0 bottom-16` lade overlayen ovanpå nedersta meddelandena i `MessageList` när AI:n streamade reasoning/agentlog | Flyttad till `top-2` som kompakt header-band (`max-w-md`, mindre badge-style), döljer inte längre stream |
| **Cross-file-import-checker stubbar tysta** | `coffee-cup-3d.tsx → ./coffee-cup-scene` auto-stubbades; UI sa "Promoted grön" utan signal om att 3D-komponenten var tomt skal | `crossFileStubs` bärs nu upp till `FinalizeResult`. `runOwnEngineStreamPostFinalize` skriver en `warning`-rad per stub i `engine_version_error_logs` under `category: "merge:cross-file-stub"`. `VersionDiagnosticsDialog` ytar dem som "Varningar: N" utan att flippa modal till röd |
| **Inspector orsakar scroll-to-top** | `handleToggleInspect` reassignade `iframe.src = buildPreviewSrc(...)` ⇒ iframen laddade om ⇒ scroll nollställdes ~0.5s efter klick | Reload-raden borttagen. Element-map-fetchen mot `/api/inspector-element-map` är iframe-state-oberoende; scroll-position bevaras |

---

## Vad som faktiskt ändrades

### Modal-truth-låsning (kärnan i scope)

| Fil | Varför |
|---|---|
| `src/lib/logging/event-bus-projection.ts` | Honora `level` på `version.build.error`. Endast `level: "error"` får flippa `verificationBlocked = true` och pusha `"blocked"`-signal. `warning`/`info` lämnar projektionen orörd — de finns kvar i `engine_version_error_logs` för diagnostik-modal men gör inte streaming-statusen falskt röd. Pre-fix-buggen: `emitVersionErrorLogs` med `level: "warning"` flippade tyst hela versionen till `verificationBlocked = true` ⇒ exakt det "false-red"-failure mode plan 01 jagade. |
| `src/lib/logging/event-bus-projection.test.ts` | +3 regressionstester: (1) `design_preview_skip_verify` håller F2-streamen utanför `failed`/`blocked`. (2) Warning-level build-events överskuggar inte clean F2-finalize. (3) Counter-test: error-level build-events flippar fortfarande till `failed` (säkerhet mot accidental neutering). |

### Cross-file-stub-warning-trådning

| Fil | Varför |
|---|---|
| `src/lib/gen/stream/finalize-merge.ts` | Lade till `crossFileStubs: Array<{ sourceFile, missingImport, stubFile }>` i `MergeGeneratedProjectFilesResult`. Tre return-statements (early-return, partial-file-repair, normal) populerar arrayen från `checkCrossFileImports` resultat. |
| `src/lib/gen/stream/finalize-version/preflight-phase.ts` | Trådar `crossFileStubs` genom `PreflightPhaseResult`. Partial-file-repair-remerge konkatenerar nya stubs ovanpå tidigare. |
| `src/lib/gen/stream/finalize-version/types.ts` | Lägger till `crossFileStubs` i `FinalizeResult` + `FinalizeFastPathResult`. |
| `src/lib/gen/stream/finalize-version/fast-path.ts` | Returnerar `crossFileStubs` från preflight-outcome. |
| `src/lib/gen/stream/finalize-version/runner.ts` | Destrukturerar och inkluderar `crossFileStubs` i `FinalizeResult`. |
| `src/lib/providers/own-engine/generation-stream-post-finalize.ts` | Konsumerar `finalized.crossFileStubs`: emitterar dem på `done` SSE (för builder-shell-hint), och skriver en `warning`-rad per stub direkt via `createEngineVersionErrorLogs` med `category: "merge:cross-file-stub"`. **Avsiktligt INTE event-bus `version.build.error`** — det skulle med `level: "error"` flippa modal-truth till röd, och med `level: "warning"` är direkt-DB-skriv samma mönster som quality-gate-routens `quality-gate:superseded`-warnings. |
| `src/lib/providers/own-engine/generation-stream-post-finalize.test.ts` | +2 regressionstester: emit av warning-rad per stub (med `dbConfigured: true` mock + `createEngineVersionErrorLogs` spy), och no-emit när `crossFileStubs: []`. Kontrollerar även att `crossFileStubs` ytar på `done` SSE-payload. |
| `src/lib/providers/own-engine/generation-stream.golden.test.ts` | Test-fixtur: `crossFileStubs: []` i mockad `FinalizeResult`. |
| `src/app/api/engine/chats/stream/route.test.ts` | Test-fixtur: `crossFileStubs: []` i mockad `finalizeOrHandleEmptyGeneration`. |
| `src/app/api/engine/chats/[chatId]/stream/route.test.ts` | Test-fixtur: `crossFileStubs: []` + `rejectedShrinks: []` + `rejectedStructural: []` i mockat finalize-resultat. |

### UI-fixes

| Fil | Varför |
|---|---|
| `src/components/builder/ThinkingOverlay.tsx` | Layout-omskrivning till kompakt header-band: `top-2` istället för `bottom-16`, `max-w-md`, smalare typografi. Innehåller fortfarande aktivitets-badge + "facts"-listan, bara mindre och uppåt så `MessageList` kan stream:a obehindrat. |
| `src/components/builder/preview-panel/hooks/usePreviewPanelInspectMapPlacement.ts` | Tog bort `iframe.src = buildPreviewSrc(...)` + tillhörande `setIframeLoading/Error/ErrorMessage`-state-flippar i `handleToggleInspect`. Element-map-fetchen står på egna ben; reload behövs inte. Hookens signatur slimmas (4 props mindre). Bevarar parallel `useEffect` som triggar delayed map-fetch när `previewUrl/versionId` ändras. |
| `src/components/builder/preview-panel/PreviewPanel.tsx` | Call-site uppdaterad: tar bort de fyra obsoleta props som hookens nya signatur inte längre tar. |

---

## Tester

```text
npm run typecheck → 0 errors
npm run lint      → 0 errors
npx vitest run    → 1546 passed (218 files)
```

Nya regressionstester:

1. `event-bus-projection.test.ts` › `plan-02: design_preview_skip_verify keeps a clean F2 stream out of failed/blocked`
2. `event-bus-projection.test.ts` › `plan-02: warning-level build events do not overshadow a clean F2 finalize`
3. `event-bus-projection.test.ts` › `plan-02: error-level build events still flip the projection to failed` (counter-test)
4. `generation-stream-post-finalize.test.ts` › `emits warning-level diagnostic row per cross-file-import-checker stub`
5. `generation-stream-post-finalize.test.ts` › `does not emit warning rows when there are no cross-file stubs`

Inspector-fixen är strukturell (raden borttagen) — inget rimligt enhets-test för "iframe.src reassignas inte" utan att ladda full React + jsdom-iframe-stub. Ändringen är kort, läsbar och kommenterad.

---

## Hårda begränsningar — bevis för att de hölls

- **Inget nytt statussystem:** all signalering går genom `event-bus.ts` (projektion-fix) eller `engine_version_error_logs` (cross-file-stub-warnings) — båda existerar redan.
- **Plan 03-territorium orört:** `src/lib/builder/promptOrchestration.ts` och `src/lib/gen/verify/repair-loop.ts` är inte modifierade.
- **Plan 04/05-territorium orört:** `src/lib/gen/autofix/**` är inte modifierat. Cross-file-stub-warningen ytas i `finalize-merge.ts` (det callsite plan 02 fick lov att röra) och konsumeras i `generation-stream-post-finalize.ts`.
- **Event-bus inga breaking-changes:** projektion-fixen läser ett fält (`level`) som redan fanns på `VersionBuildErrorEvent`. Inga typer ändrade, inga subscribers brutna.
- **Filbudget:** 15 filer rörda (mål: ~12). Avvikelsen är 3 test-fixturer som tvingades uppdateras när `FinalizeResult` fick `crossFileStubs`-fältet — strikt nödvändigt, inte scope-glide.

---

## Stoppregler — utfall

- Ingen fix krävde plan 03/04/05-territorium.
- Event-bus krävde inte breaking-change.
- Buggarna var inte värre än beskrivet — alla tre är kirurgiskt fixbara enligt PROMPT-02.

Plan blev `short`, exakt som STATUS-01 indikerade.

---

## Kvar för framtida planer (utanför scope)

- **Plan 07 (3D capability):** stub-warningen säger BARA att en fil saknades och stubbades — den ersätter inte capability-detection som lägger `three`/`@react-three/fiber` i `package.json` + dossier-injection. Användaren ser nu varningen istället för tyst placebo, men 3D-svaret är fortfarande tomt.
- **ThinkingOverlay inline-i-MessageList:** PROMPT-02 nämnde det som "renaste men kräver lite omstrukturering". Header-band-fixen är good-enough för plan 02; inline kan göras i en framtida UI-pass om header-bandet upplevs distraherande.
- **Inspector regression-test:** kräver React Testing Library + jsdom-iframe-stub-setup. Värt att prioritera när någon ändå rör inspector-hooken nästa gång.
