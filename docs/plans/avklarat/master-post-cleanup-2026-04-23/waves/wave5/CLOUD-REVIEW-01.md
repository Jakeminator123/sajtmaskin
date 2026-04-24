# CLOUD-REVIEW-01 — Spec-coherence plan-10

**Du är cloud-review-agent #01.** READ-ONLY. Producera audit-rapport, ingen kodändring.

## Din uppgift

Verifiera att **plan-10:s leverans (PR #96) faktiskt uppfyller alla acceptance-kriterier** från `wave5/PROMPT-10.md`.

## Förläs

1. `docs/plans/active/master-post-cleanup-2026-04-23/wave5/PROMPT-10.md` — original spec
2. `docs/plans/active/master-post-cleanup-2026-04-23/wave5/STATUS-10-latency-budgets.md` — agentens self-report
3. `docs/plans/active/master-post-cleanup-2026-04-23/STATUS-10-CANDIDATES.md` — input som spec'en byggde på
4. `docs/plans/active/master-post-cleanup-2026-04-23/audit-reports/README.md` — output-konvention

## Spec-checklist (verifiera mot landad kod i master)

För varje punkt i PROMPT-10:s "Planens mål"-sektion:

### 1. Observatorie-routing-läckage (HIGH prio)
- [ ] Events med `chatId` routes via `chat-to-run.json`-index → per-run-mapp (verifiera `src/lib/logging/generation-log-writer.ts`)
- [ ] Bucket `_unrouted/orchestration-styledirection/` växer INTE för nya runs (svårt att verifiera utan smoke; kolla logiken)
- [ ] mkdir-recursive innan ALLA `writeGenerationLogEntry`-anrop som adresserar `_unrouted/<bucket>/` (sök efter `mkdirSync` + `recursive: true`)

### 2. Quality-gate skip-rule för init
- [ ] `previewPolicy === "fidelity2"` + `errorCount === 0` → skippar quality-gate även på init
- [ ] `verificationPolicy: "design_preview_skip_verify"` sparas på versionen
- [ ] 2 nya regression-tests finns

### 3. Auto-repair exkluderas från follow-up-stat
- [ ] `promptSource === "auto_repair"` exkluderas från `followupCount` i `history.ndjson`
- [ ] Separat `autoRepairCount` finns
- [ ] Backoffice `pipeline_health.py` läsning verifierad eller dokumenterad varför ingen ändring behövdes

### 4. Latency-budget infrastruktur
- [ ] `sajtmaskin_phase_duration_ms` histogram finns
- [ ] `kind`-label per phase (init/followup/unknown)
- [ ] `observePhase()` helper finns
- [ ] Runner emitterar `codegen`, `autofix`, `syntax-validate`, `preflight`, `persist`-faser

## Hårda begränsningar (verifiera)

PROMPT-10 sa "rör INTE plan-11-filer" och "rör INTE plan-12-filer". Bekräfta att plan-10 INTE rörde:
- `src/lib/gen/stream/finalize-merge.ts` (plan 11)
- `src/lib/gen/stream/finalize-preflight.ts` — utom om `observePhase` wrappar fas-mätning
- `src/lib/gen/stream/finalize-version/runner.ts` — utom fas-mätning
- `src/lib/gen/verify/repair-loop.ts`
- `src/lib/builder/promptOrchestration.ts`

## Output

Skriv `docs/plans/active/master-post-cleanup-2026-04-23/audit-reports/AUDIT-01-spec-plan10-<agent-id>.md` enligt formatet i `audit-reports/README.md`.

Innehåll:
- ✅/⚠️/❌ per punkt med exakt fil + rad-nummer
- Sammanfattning: GO / NO-GO / NEEDS-FIX för wave 5

## Klart =

Branch pushad, PR öppnad med audit-rapport som body.
