# Steg 4 — generera (codegen), finalisera och validera (post-stream)

**Senast uppdaterad:** 2026-04-10

Syfte: ge en **repo-rätt** karta över vad som händer **efter** att own-engine **codegen-streamen** levererat rå output, tills en **version** finns sparad och preflight/telemetri är skrivna.

## Kanoniska källfiler

| Roll | Fil |
|------|-----|
| Huvudpipeline | `src/lib/gen/stream/finalize-version.ts` — `finalizeAndSaveVersion()` |
| Fas-ID:n + ordning | `src/lib/gen/stream/finalize-pipeline-contract.ts` — `OWN_ENGINE_POST_STREAM_PIPELINE` |
| Syntax + LLM-fixer | `src/lib/gen/autofix/validate-and-fix.ts` |
| Deterministisk autofix före syntax | `src/lib/gen/autofix/pipeline.ts` — `runAutoFix()` |
| Verifier-pass (read-only LLM) | `src/lib/gen/verifier-pass.ts` |
| Parse / merge / preflight | `src/lib/gen/stream/finalize-preflight.ts`, `finalize-merge.ts` |
| Stream → finalize anrop | `src/lib/providers/own-engine/generation-stream.ts`, `src/lib/gen/stream/shared-own-engine-helpers.ts` |
| Efter finalize (done/preview/server-verify) | `src/lib/providers/own-engine/generation-stream-post-finalize.ts` |
| Asynk server-verify (ej i finalize) | `src/lib/gen/server-verify.ts` |

## Faktisk stegordning i `finalizeAndSaveVersion`

1. **`autofix`** — `runAutoFix()` på ackumulerat stream-innehåll (kan stängas av med `runAutofix: false`). Kör alla **mekaniska fixar** (imports, struktur, lucide, metadata, scroll-smooth, icon-value, basePath m.m.). Typer: `FixEntry` med `category: "mechanical"` från `autofix/types.ts`.
2. **`url_expand`** — `expandUrls()` med `urlMap` från orkestrering.
3. **`validate_syntax`** — `validateAndFix()`: syntaxvalidering + progressiv mekanisk→**LLM-fix**→mekanisk fix-loop. Loggar `autofix.mechanical-residual` (vilka fel som överlevde mekaniska fixar) före LLM-eskalering. Returnerar `mechanicalFixCount`, `llmFixCount`, `residualPatterns`.
4. **`materialize_images`** — **endast om «deep path»** (`runDeepPath === true` i `resolveFinalizePathPolicy`). Ersätter placeholder-bilder m.m. Vid fel: **non-fatal**, logg och fortsätt.
5. **`verifier`** — **endast om deep path** *och* `resolveVerifierPassPolicy` säger ja (BuildSpec, feature flag, inte repair-pass > 0). Read-only LLM; fel här är **non-fatal** (hoppar över).
6. **`parse_merge_preflight`** — parse JSON-filer från innehåll, `mergeGeneratedProjectFiles`, `runFinalizePreflight`, `injectIntegrationManifestIntoFilesJson`, scaffold-retry-förslag.
7. **Fail-fast strukturgrind** — om preflight/sanity hittar tecken på **partial-file-output** (t.ex. avhuggen filstart, överlappande importblock eller annan snippet-lik repair-output) kastas nu `PartialFileOutputError` och **ingen version sparas alls**.
8. **Persist** — `addAssistantMessageAndCreateDraftVersion` (transaktion: assistant + utkastversion med `files_json`).
9. **Efter persist (best-effort)** — preflight-loggar, generation telemetry, `logGeneration`, ev. `failVersionVerification` om **verification-blocking** preflight-fel.

SSE `progress.step` ska använda fas-**id** från `OwnEnginePostStreamPhaseId` (t.ex. `validate_syntax`), inte äldre alias.

## «Fast path» / «deep path» (finalize-path policy)

Telemetry använder etiketterna `fast+deep` respektive `fast-only` (se `devLogAppend` i `finalize-version.ts`):

| `finalizePath.runDeepPath` | Telemetry | `materialize_images` | `verifier` (utöver policy) |
|----------------------------|-----------|-------------------------|----------------------------|
| `true` | `fast+deep` | Körs (om inte fel) | Kan köras enligt `resolveVerifierPassPolicy` |
| `false` | `fast-only` | **Hoppas över** | **Hoppas över** (policy returnerar `reason` från finalize path) |

**När sätts `runDeepPath` till `false`?** Bland annat för **lätta follow-ups**: `generationMode === followUp` + `verificationPolicy === fast` + `contextPolicy === light` + `changeScope` i `copy` eller `local-layout` — så länge `FEATURES.useFinalizeDeepPath` är på och det inte är repair-pass (`repairPassIndex > 0` tvingar deep path).

**Naming debt:** ord som «fast» syftar på *smalare finalize*, inte att syntax eller persist hoppas över.

## Blocking vs kvalitet vs observability

| Typ | Exempel | Blockerar sparad version? |
|-----|---------|---------------------------|
| **Blocking (preflight / verification)** | Tom generation (`EmptyGenerationError`), **partial-file-output** (`PartialFileOutputError`) eller preflight-fel som senare markerar verification-blocking | Ja — finalize kan kasta direkt eller version kan markeras failed i eftersteget (se `failVersionVerification`) |
| **Kvalitetssignal** | Verifier-pass `blocking`/`quality`-fynd (loggas) | Nej — finalize fortsätter; fynd i telemetry |
| **Observability** | `createGenerationTelemetryRecord`, `devLogAppend`, preflight-loggar | Nej |
| **Non-fatal fel** | Bildmaterialisering misslyckas, verifier-pass kastar | Nej — logg/warn, fortsätt |

**`server-verify`:** körs **asynkront** efter finalize/handoff till preview (se `server-verify.ts` och `resolvePostFinalizeServerVerifyDecision()` i `post-finalize-policies.ts`); **blockerar inte** SSE `done`. Den hoppas över för t.ex. `verificationPolicy === "fast"`, icke-eligible versioner, `previewBlocked`, `verificationBlocked` eller låg-risk-standardflöden. Det är **Steg 4-nära** men **inte** samma synkrona pipeline som `finalizeAndSaveVersion`.

## Fault/fix-loggning och overhead-ytor

- `devLog.ts` skriver full ISO-tid till körloggarna; `generation-log-writer.ts` bygger därifrån `fault-fix-index.md`, `fault-fix-index.csv` och den globala `logs/llm-segmentts-and-index/error-log.csv`.
- `error-log.csv` är den sammanhållna fault/fix-loggen för mekaniska fixar, LLM-fixar och relevanta pipeline-/verify-signaler. `time` ska tolkas som full tidsstämpel, inte bara klockslag.
- `config/dashboard/app.py` och `sajtmaskin_backoffice.py` ska spegla samma runtime-sanning via `config/dashboard/shared_overhead.py`, inte genom att reimplementera eller importera varandras app-entrypoints.
- Versionskolumnen `files_json` förblir medvetet den \"slanka\" fil-listan efter merge/preflight. `package.json`, `tsconfig.json`, `next.config.ts` och annan baseline läggs i stället till via `buildCompleteProject(...)` för preview/export. Saknad `package.json` i DB betyder därför inte automatiskt att preview-projektet är ofullständigt.

## Steg 4 vs Steg 5 (gräns)

| Steg 4 | Steg 5 (grannlager) |
|--------|---------------------|
| `finalizeAndSaveVersion` — autofix, syntax, ev. verifier, preflight, **DB-version** | Tier-2 preview start, `preview-ready`, heartbeat, **VM** / `preview_host` |
| Verifier-pass i finalize | `triggerServerVerification` — typecheck/repair på export lane |
| `previewBlockingReason` från preflight (signal) | Faktisk preview-URL, sandbox/legacy fält |

Bygg **inte** mental modell där `previewUrl: null` i finalize-resultat betyder att Steg 4 «misslyckats» — own-engine sätter ofta `previewUrl: null` och för tier-2 **efter** `done` (se `builder-generation.md`). Undantag: om finalize kastar `EmptyGenerationError` eller `PartialFileOutputError` uteblir versionpersist helt och buildern får i stället `done` utan `versionId`.

## Synkchecklista när denna runtime ändras

Uppdatera i samma leverans:

- `docs/architecture/step4-post-generation.md` (denna fil)
- `.cursor/rules/terminology.mdc`
- `docs/architecture/glossary.md` (fas 3: repair, quality gate, finalize)
- `docs/architecture/builder-generation.md` (ingress till Steg 4)
- `.cursor/rules/llm-pipeline-docs-sync.mdc` (glob/mandatory-rader)
- Vid manifest-/overheadändringar: `config/dashboard/app.py`, `sajtmaskin_backoffice.py`, `config/dashboard/shared_overhead.py`, ev. `scripts/scripts_dashboard.py`, `config/dashboard/domain-map.json`

Se även: `docs/architecture/llm-input-blocks.md` (Steg 3), `docs/architecture/preview-deploy.md` (Steg 5).
