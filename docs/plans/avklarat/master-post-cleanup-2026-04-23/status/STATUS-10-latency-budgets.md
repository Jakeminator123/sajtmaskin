# STATUS-10 latency budgets + observatory routing fixes

**Datum:** 2026-04-24  
**Branch:** `plan-10-latency-budgets`  
**Scope:** observatorie-routing, init skip-policy, auto-repair statistik, latency-matning (latt infrastruktur)

## Levererat

| Omrade | Resultat | Filer |
|---|---|---|
| Observatorie-routing | Chat-bundna events routes nu via chat->run-index fore slug-fallback. `site.chatId` binder init-chat till senaste run, och missing runId med chatId far `_unrouted/chat-<chatId>/`. | `src/lib/logging/generation-log-writer.ts`, `src/lib/logging/generation-log-writer.test.ts` |
| ENOENT-hardening | `writeGenerationLogEntry` skapar run-dir rekursivt innan alla skrivningar, inklusive `_unrouted/*` buckets. | `src/lib/logging/generation-log-writer.ts` |
| Auto-repair statistik | `history.ndjson` sparar nu `followupCount` (user-followups) och `autoRepairCount` separat. `promptSource=auto_repair` exkluderas fran followupCount. | `src/lib/logging/generation-log-writer.ts`, `src/lib/logging/generation-log-writer.test.ts` |
| Init quality-gate skip | F2 init med ren preflight (`errorCount=0`) skippar background verify med reason `design_preview_skip_verify`, aven om non-blocking warnings finns. | `src/lib/gen/stream/post-finalize-policies.ts`, `src/lib/providers/own-engine/generation-stream-post-finalize.ts`, `src/lib/providers/own-engine/generation-stream-post-finalize.test.ts` |
| Policypersistens i versionlogg | Vid skip reason `design_preview_skip_verify` sparas `verificationPolicy` med samma value i `server-verify.policy` devlogg-event per version. | `src/lib/providers/own-engine/generation-stream-post-finalize.ts`, `src/lib/providers/own-engine/generation-stream-post-finalize.test.ts` |
| Latency-infrastruktur | `sajtmaskin_phase_duration_ms` har nu `kind`-label (`init/followup/unknown`), nya budget-faser och `observePhase()` helper. Runnern emitterar `codegen`, `autofix`, `syntax-validate`, `preflight`, `persist`. | `src/lib/observability/metrics.ts`, `src/lib/observability/metrics.test.ts`, `src/lib/gen/stream/finalize-version/runner.ts` |

## Tester

- `npx vitest run src/lib/logging/generation-log-writer.test.ts src/lib/providers/own-engine/generation-stream-post-finalize.test.ts src/lib/observability/metrics.test.ts`
  - **Pass:** 3 testfiler, 37 tester

## Noteringar

- `backoffice/pages/pipeline_health.py` laser inte `history.ndjson` i nuvarande implementation, sa ingen separat UI-uppdelning behovdes dar i denna leverans.
