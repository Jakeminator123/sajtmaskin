# Du är plan-10-agenten — latency budgets + observatorie-routing-fixar

## Din roll och kontext

Du är en autonom kodagent i en isolerad git worktree på branchen `plan-10-latency-budgets`. Du arbetar **parallellt** med plan-11-agenten i wave 5. Era scopes är file-disjoint (se hårda begränsningar). När du är klar öppnar du PR mot `master`.

## Repo-state du ärver

- HEAD: `master @ <senaste hot-fix>` (efter plan 02–09 + investigation + ThinkingOverlay v3 + AJV-fix + HMR-pool-fix)
- Plan 02 (modal-truth) mergad — UI signalerar ärligt
- Plan 03 (auto-repair labeling) mergad — `PromptSource = 'user' | 'auto_repair'` finns
- Plan 04 (fixer-matrix) + Plan 05 (lane-tag) mergade
- Plan 06 (capability-classifier på follow-ups) mergad
- Plan 07 (3D capability-injection) mergad
- Plan 08 (core simplification) + Plan 09 (legacy-ripout) mergade
- **Läs `STATUS-10-CANDIDATES.md` FÖRST** — den är din primära input-spec.
- **Läs också `docs/architecture/open-questions.md` #4** (observatory routing) och #1 (Redis verified, brief-cache-hit ENOENT-bugg).

## Planens mål (3 konkreta fixes + mätning)

### 1. Observatorie-routing-läckage (HIGH prio — uppgraderad till Tier A)

**Bug:** Events med fungerande `chatId`/`runId` skrivs till `_unrouted/`-buckets istället för per-run-mapp. Bekräftat 2026-04-24:

- Run B (chat `b71dafb3`) hade hela 6,5-min-trace i `_unrouted/orchestration-styledirection/` (846 KB)
- `[generationslogg] writeGenerationLogEntry failed: ENOENT: ... \_unrouted\brief-cache-hit\timeline.ndjson`
- `[generationslogg] writeGenerationLogEntry failed: ENOENT: ... \_unrouted\chat-b71dafb3.../timeline.ndjson`

**Fix:**
- `src/lib/logging/generation-log-writer.ts` — routa events med `chatId` korrekt till per-run-mapp via `chat-to-run.json`-index. När runId saknas, skapa per-chat-bucket (mkdir-recursive) innan write.
- Bekräfta att `_unrouted/orchestration-styledirection/` inte längre växer för nya runs.
- Lägg till mkdir-recursive innan ALLA `writeGenerationLogEntry`-anrop som adresserar `_unrouted/<bucket>/`.

### 2. Quality-gate skip-rule för init (latency-fynd)

**Bug:** Quality-gate tog **91 sek** på init (Run 1 av plan 01). Skip-policyn `design_preview_skip_verify` triggar bara på follow-ups.

**Fix:**
- `src/lib/gen/verify/server-verify.ts` (eller motsvarande policy-fil) — utöka skip-policy: när `previewPolicy === "fidelity2"` OCH preflight har `errors: 0`, skippa quality-gate på init också
- Spara `verificationPolicy: "design_preview_skip_verify"` på versionen så plan 11/12 vet att F3-checken inte körts
- Tester: en test som verifierar att init med ren preflight skipper quality-gate, en counter-test att F3-target init kör quality-gate

### 3. Auto-repair exkluderas från follow-up-statistik

**Bug:** Plan 03 introducerade `PromptSource = "user" | "auto_repair"`. Per-chat history.ndjson räknar fortfarande auto-repair-pass som "follow-ups", vilket skevar latency-statistik.

**Fix:**
- `src/lib/logging/generation-log-writer.ts` (eller per-chat-aggregation) — när `promptSource === "auto_repair"`, exkludera från `followupCount` i `history.ndjson`. Spåra som separat `autoRepairCount`-fält.
- Backoffice `pipeline_health.py` (om den läser history.ndjson) — visa båda counts separat.

### 4. Latency-budget infrastruktur (lätt nivå)

**Mål:** Ge framtida planer ett dataset att jaga tider mot.

**Fix:**
- `src/lib/observability/metrics.ts` — lägg till `sajtmaskin_phase_duration_ms` histogram per fas (init/followup × {brief, codegen, autofix, syntax-validate, preflight, persist, preview-start, quality-gate})
- `src/lib/gen/stream/finalize-version/runner.ts` — wrap kritiska faser i `observePhase()` som emitterar metric
- INTE mål: bygga ett full latency-budget-system med alerts. Bara mätinfrastruktur.

## Hårda begränsningar

- Rör INTE plan-11-filer: `src/lib/gen/stream/finalize-merge.ts`, `src/lib/gen/stream/finalize-preflight.ts`, `src/lib/gen/stream/finalize-version/runner.ts` (du **får** wrappa fas-mätning men inte ändra logiken), `src/lib/gen/verify/repair-loop.ts`. Plan-11 äger scaffold-required-files-check + variant-lock-fix.
- Rör INTE plan-12-filer: `src/lib/gen/system-prompt/sections/**`, `src/lib/builder/promptOrchestration.ts` (utöver att läsa `PromptSource`).
- Rör INTE filer som plan 02–09 just landat i (utom att läsa).
- Maxbudget: ~12 filer rörda.

## Acceptans

- `_unrouted/orchestration-styledirection/`-bucket växer inte för nya runs (verifiera genom att starta dev + smoke-prompt)
- `[generationslogg] writeGenerationLogEntry failed: ENOENT` försvinner från dev-log
- Quality-gate skippas på rena init-runs (verifiera via test)
- Auto-repair-pass räknas separat i per-chat history
- 4+ regressionstester passerar
- `npm run typecheck && npm run lint && npm run test:ci` 0 errors

## Workflow

1. **Sätt en kort plan** (filer + ordning).
2. **Implementera routing-fix först** — det är mest impact.
3. **Quality-gate skip-rule.**
4. **Auto-repair-stat exclude.**
5. **Latency-metrics infrastruktur.**
6. **Skriv `STATUS-10-latency-budgets.md`** i `docs/plans/active/master-post-cleanup-2026-04-23/`.
7. **Push branchen + öppna PR** med titel `plan 10: latency budgets + observatory routing fixes`.

## Stoppregler

- Om en fix kräver att du rör plan 11/12-territorium: STOPPA och dokumentera.
- Om quality-gate-skip visar sig kräva F3-policy-redesign (>50 rader): STOPPA, lämna åt plan 11.

## Klart =

PR öppnad mot master, STATUS-10 committad, alla tester passerar.
