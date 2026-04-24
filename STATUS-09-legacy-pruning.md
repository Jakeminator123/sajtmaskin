# STATUS-09 legacy pruning

**Datum:** 2026-04-24  
**Branch:** `plan-09-legacy-pruning`  
**Scope:** legacy-ripout + config-pruning + backoffice-drift

## Tier A — utfall

| Kandidat | Utfall | Notering |
|---|---|---|
| `src/app/api/v0/integrations/vercel/projects/route.ts` | **Raderad** | Ingen intern klienttrafik hittad. |
| `src/app/api/v0/projects/[projectId]/env-vars/route.ts` | **Behållen** | Aktivt använd av `ProjectEnvVarsPanel` (`/api/v0/projects/.../env-vars`). |
| `scaffold-import-checker.ts` | **Behållen (tombstone justerad)** | Aktivt importerad i `finalize-merge`. |
| `finalize-version/partial-file.ts` | **Behållen (tombstone justerad)** | Aktiv i partial-file-repair-fasen. |
| `finalize-version/verifier-phase.ts` | **Behållen (tombstone justerad)** | Aktiv verifier-fas med rerun/fixer-loop. |
| `autofix/repair-generated-files.ts` | **Behållen (tombstone justerad)** | Används brett i preflight/preview/export. |
| `stream/finalize-preflight.ts` legacy fallback | **Prunad** | `validateAndFix`-on-merge fallback gren borttagen (dead branch). |

## Tier B — deadlines satta

Alla nedan har fått kommentaren:  
`TODO(after-wave-5): drop after deadline 2026-Q3 if no inbound payloads.`

| Område | Fil(er) |
|---|---|
| `demoUrl` → `previewUrl` | `src/lib/hooks/chat/types.ts`, `src/lib/webhooks.ts`, `src/lib/project-client.ts` |
| `qualityGatePending` → `verifyPending` | `src/lib/hooks/chat/post-checks-results.ts` |
| `PlanPhaseLegacy`/`family` | `src/lib/gen/plan/schema.ts` |

### Uppföljnings-issues (wave 5+)

1. **Drop demoUrl dual-key** efter inbound-mätning t.o.m. 2026-Q3.
2. **Drop qualityGatePending alias** efter konsumentscan i post-check payloads.
3. **Drop PlanPhaseLegacy + scaffold.family** efter artifact/backfill-scan i lagrade planer.
4. **Revisit Tier A keeps** (`scaffold-import-checker`, `partial-file`, `verifier-phase`, `repair-generated-files`, `/api/v0/projects/*/env-vars`) i nästa cleanup-wave.

## Tier C — backoffice drift

| Page | Ändring |
|---|---|
| `backoffice/pages/fixer_registry.py` | Lane-färger (`mechanical/static_gate/llm_repair/stream_suspense/post_merge/server_repair`) + lane-badge per fixer + lane-kolumn i tabell. |
| `backoffice/pages/_ops_impl.py` (`Orchestration Map`) | Visar nu `PromptSource` (`user`/`auto_repair`) + `CapabilitySpecificityTier`. |
| `backoffice/pages/dossiers.py` | Ny tab för `CapabilitySpecificityTier`-översikt (plan 06-signaler). |
| `backoffice/pages/observability.py` | Verifierad aktuell; ingen kodändring behövdes. |

## Config-pruning

| Område | Ändring |
|---|---|
| `SAJTMASKIN_DOSSIER_PIPELINE` | Default justerad till **on i runtime** (`development/preview/production`), explicit opt-out via `false`/`0`; testmiljö hålls off för stabil testlatens. |
| `SAJTMASKIN_VISUAL_QA` | Fortfarande meningsfull (aktiv gate i `src/lib/gen/verify/visual-qa.ts` + coverage i `preview-quality-gate.test.ts`); kvar som remove-kandidat först efter latens-/träfftelemetri. |

## Regression-kontroll

| Kommando | Resultat |
|---|---|
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm run test:ci` | Pass |

Inga beteenderegressioner observerade i verifieringssviten.
