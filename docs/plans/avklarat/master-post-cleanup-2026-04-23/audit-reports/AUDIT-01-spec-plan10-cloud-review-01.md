# AUDIT-01 — Spec-coherence plan-10 (cloud-review-01)

**Datum:** 2026-04-24  
**Scope:** Verifiering av landad kod mot `wave5/PROMPT-10.md` (merge: `55e950300` = PR **#96**, implementation: `b6da0b888`).  
**Self-report:** `docs/plans/active/master-post-cleanup-2026-04-23/STATUS-10-latency-budgets.md` (finns under `docs/.../`, ej under `wave5/`).  
**Lokal körning:** `npx vitest run …` kördes ej — worktree saknar full `node_modules`/`vitest`-upplösning; bedömning bygger på kodgranskning + befintlig STATUS-10-testlista.

---

## 1. Observatorie-routing-läckage (HIGH)

| Krav | Status | Bevis |
|------|--------|--------|
| Events med `chatId` → per-run via `chat-to-run.json` | ✅ | Indexfil `logs/generationslogg/_index/chat-to-run.json` (`CHAT_TO_RUN_INDEX_FILE` L20), `readChatToRunIndex` L184–201, `recordChatToRun` L239–244; `resolveRunDirFromContext` L1786–1794 läser index innan slug-fallback; `site.chatId` L1835–1842 binder senaste run till chat. |
| `_unrouted/orchestration-styledirection/` växer inte för nya runs | ⚠️ | Logik + regressionstest (`generation-log-writer.test.ts` L300–353) visar att `orchestration.styleDirection` före `site.chatId` inte drar med `site.chatId`/`comm.request.create` in i styledirection-bucket. **Ingen** repo-inneboende smoke bevisar noll tillväxt på riktiga `_unrouted/`-filer efter merge. |
| `mkdirSync` rekursivt före skriv till `_unrouted/<bucket>/` | ✅ | `ensureUnroutedBucketDir` L222–236 (`fs.mkdirSync(..., { recursive: true })`); `writeGenerationLogEntry` L1944–1946 `fs.mkdirSync(runDir, { recursive: true })` efter `resolveRunDir` (som alltid skapar unrouted-bucket när sökvägen går dit). Enda andra call-site `devLog.ts` går via samma writer. |

---

## 2. Quality-gate skip-rule (init)

| Krav | Status | Bevis |
|------|--------|--------|
| `previewPolicy === "fidelity2"` + `errorCount === 0` (+ rimliga gates) → skip även **init** | ✅ | `resolvePostFinalizeServerVerifyDecision` L101–105: `isFidelity2Init` + `preflightErrorCount === 0` + `!verificationBlocked` → `{ run: false, reason: "design_preview_skip_verify" }`. |
| `verificationPolicy: "design_preview_skip_verify"` sparas så plan 11/12 ser att F3-check inte körts | ✅ (semantik) | DB-rad `engine_versions` har **ingen** `verification_policy`-kolumn (sök i `chat-repository-pg.ts`). Istället: `resolvedVerificationPolicy` L496–499 + `devLogAppend` `server-verify.policy` L516–524 med `verificationPolicy: resolvedVerificationPolicy` — versionskopplat via `versionId`. |
| 2 nya regressionstester | ✅ | `generation-stream-post-finalize.test.ts`: L708–751 (F2 init ren preflight + varningar → skip) och L754–791 (F3 init → `run: true`). Ytterligare L858–896 loggar `verificationPolicy: "design_preview_skip_verify"`. |

---

## 3. Auto-repair vs follow-up-stat

| Krav | Status | Bevis |
|------|--------|--------|
| `promptSource === "auto_repair"` exkluderas från `followupCount` | ✅ | `updateSiteObservability` L1553–1585: `nextIsFollowup = generationKind === "followup" && !nextIsAutoRepair`; legacy-loop L1566–1574. |
| Separat `autoRepairCount` | ✅ | Samma block L1577–1585 skriver `autoRepairCount`. |
| `pipeline_health.py` | ✅ | Filen (`backoffice/pages/pipeline_health.py`) handlar underhållsskript; **ingen** läsning av `history.ndjson` — STATUS-10 rad 25–26 korrekt: ingen ändring krävs. |

---

## 4. Latency-budget infrastruktur

| Krav | Status | Bevis |
|------|--------|--------|
| `sajtmaskin_phase_duration_ms` histogram | ✅ | `metrics.ts` L102–107. |
| `kind`-label per phase (`init` / `followup` / `unknown`) | ✅ | `recordPhaseDuration` L201–205; histogram `labelNames: ["phase", "kind"]` L105. |
| `observePhase()` helper | ✅ | `metrics.ts` L208–226. |
| Runner: `codegen`, `autofix`, `syntax-validate`, `preflight`, `persist` | ✅ | `runner.ts`: `recordPhaseDuration("codegen", …)` L154–158; `observePhase({ phase: "autofix", …})` L174–189; `syntax-validate` / `preflight` L235–240; `persist` L479–481. |

**⚠️ avvikelse mot PROMPT-10:s längre histogram-lista** (brief, preview-start, quality-gate m.fl. i målbildstexten): dessa emitteras **inte** från `runner.ts` i nuvarande leverans — endast checklistens fem faser ovan är täckta därifrån.

---

## Hårda begränsningar (plan 11/12-filer)

| Fil | Plan-10 (`b6da0b888` --name-only) |
|-----|-----------------------------------|
| `finalize-merge.ts` | Ej rörd |
| `finalize-preflight.ts` | Ej rörd |
| `finalize-version/runner.ts` | Rörd — **tillåtet** (fas-mätning enligt PROMPT-10) |
| `verify/repair-loop.ts` | Ej rörd |
| `promptOrchestration.ts` | Ej rörd |

*Efter merge av plan-11 (#97) kan `runner.ts` ha ytterligare diff; plan-10-leveransen i sig höll gränsen.*

---

## PROMPT-10 Acceptans (kort)

| Acceptansrad | Status |
|--------------|--------|
| `_unrouted/...styledirection` + ENOENT borta i dev | ⚠️ / ✅ | Logik + tester ✅; full “försvunnit från dev-log” ej reproducerad i denna clone. |
| Quality-gate skippas rena init-runs | ✅ | Policy + tester. |
| Auto-repair separat i per-chat history | ✅ | Se §3. |
| 4+ regressionstester | ✅ | STATUS-10: 37 tester i tre filer (överstiger 4). |
| `typecheck` / `lint` / `test:ci` | ⚠️ | Ej verifierat här (saknad dev-deps). |

---

## Sammanfattning wave 5

**GO** — PR #96 uppfyller checklisten i `CLOUD-REVIEW-01` i huvudsak; kvarstående **⚠️** är (a) ingen live-smoke för `_unrouted`-stillhet/ENOENT, (b) ingen lokal CI-körning i denna worktree, (c) histogram täcker inte alla faser i PROMPT-10:s utökade exempellista (utöver de fem explicit krävda i review-prompten).

**NO-GO** utlöses inte av kodgranskningen.
