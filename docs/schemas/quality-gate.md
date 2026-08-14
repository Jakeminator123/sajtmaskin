# RenderGate och ReleaseGate — fält och ägare

Formyta: check-id:n, responsefält, repair-outcome och telemetrikolumner.
Körflöde: [`../architecture/quality-gate-flow.md`](../architecture/quality-gate-flow.md).
Invariants: [`../architecture/runtime-contracts.md`](../architecture/runtime-contracts.md).
Aktuella lane-checklistor: `config/ai_models/manifest.json#qualityGateTiers`
(projektion [`../generated/policies.generated.md`](../generated/policies.generated.md)).

Kodnamn: RenderGate = `designPreview`, ReleaseGate = `integrationsBuild`.

## Canonical ownership

| Faktatyp | Ägare |
| --- | --- |
| Check-id:n | `QUALITY_GATE_CHECK_VALUES` i `src/lib/gen/verify/quality-gate-checks.ts` |
| Lane-checklistor | `config/ai_models/manifest.json#qualityGateTiers` via `getQualityGateTiersFromManifest()` |
| F2 typecheck-only Advisory | `isTypecheckOnlyAdvisory()` i `quality-gate-checks.ts` |
| Verify-lane körning | `src/lib/gen/verify/preview-quality-gate.ts`, `preview-host/src/runtime.js` |
| Post-finalize verify-beslut | `resolvePostFinalizeServerVerifyDecision` i `src/lib/gen/stream/post-finalize-policies.ts` |
| Server-verify | `src/lib/gen/verify/server-verify.ts` |
| Verify-lease / promote | `src/lib/db/chat-repository-pg.ts` |
| Repair-loop | `src/lib/gen/verify/repair-loop.ts` |
| Repair-port | `runLlmRepairGate` i `src/lib/gen/autofix/llm-repair-gate.ts` |
| Repair-outcome | `resolveServerRepairOutcome` i `src/lib/gen/verify/server-verify-log-meta.ts` |
| Stream-signaler | `src/lib/gen/stream/builder-stream-contract.ts` |
| Promote-guard | `src/lib/db/promote-guard.ts` |
| Explicit gate-route | `src/app/api/engine/chats/[chatId]/quality-gate/route.ts` |
| Explicit repair-route | `src/app/api/engine/chats/[chatId]/repair/route.ts` |
| Accept-repair | `src/app/api/engine/chats/[chatId]/accept-repair/route.ts` |

## Checks

Tillåtna check-id:n: `typecheck`, `lint`, `build`. Kommandon och
install-signaler (`install-cache-share`, `install-peer-fallback`) ägs av
`quality-gate-checks.ts` / verify-lane. Kopiera inte aktuella lane-arrayer hit.

`runQualityGateChecks` kräver att varje **begärd** check finns i `results[]`.
Saknas någon i ett svar där inget failat → `unavailable`
(`QualityGateUnavailableError`). Install-fail före de kanoniska checkarna är
redan rött och behåller sitt failure-verdikt.

Lane-konstanter: `DESIGN_PREVIEW_QUALITY_GATE_CHECKS` (F2) och
`INTEGRATIONS_BUILD_QUALITY_GATE_CHECKS` (F3). Defaultvärden sanitizeras från
manifestet.

## F2 Advisory-svar

När `isTypecheckOnlyAdvisory()` är sann (bara F2, bara `typecheck`, bara
advisory-safe tsc-koder):

| Fält | Betydelse |
| --- | --- |
| `passed` | `true` (klientvägen promotar via `assertPromoteAllowed`) |
| `vmGatePassed` | `false` — inte solid-grön VM-gate |
| `designAdvisory` | `true` |
| `advisoryChecks` | t.ex. `["typecheck"]` |
| `promoteError` / `promoteGuardUnavailable` | transient promote-fel; `designAdvisory` följer med så klienten inte auto-reparerar |

Render-risk-koder (`RENDER_RISK_TS_CODES`) och oparsebar tsc-output failar
hårt. Listan ägs av koden, inte av den här filen.

## En repair-port

All LLM-repair går genom `runLlmRepairGate()`. `runLlmFixer` har exakt en
produktions-callsite (inuti gaten), vaktad av
`src/lib/gen/autofix/llm-fixer-callsite-guard.test.ts`.

`RepairLedger` dedupe:ar på
`scopeId:chatId:contentHash:diagnosticFingerprint:requiredFiles`.
`contentHash` i nyckeln gör att nytt innehåll aldrig blockeras. Flöde:
[`../architecture/quality-gate-flow.md`](../architecture/quality-gate-flow.md).

### Repair-accept-kuvert

`repaired_files_json` är `{ v, baseFilesHash, files }`. `baseFilesHash` är
SHA-256 av exakt det `files_json` repairen baserades på. Accept vägrar om
nuvarande hash ≠ `baseFilesHash` eller om payloaden är en legacy plain-array.

## Server-repair outcome-fält

Skrivs av `buildServerRepairOutcomeMeta` / `resolveServerRepairOutcome`.
Enumvärden ägs av `ServerRepairOutcome` och `ServerRepairEarlyStop` i
`server-verify-log-meta.ts` — kopiera inte unionen hit.

| Fält | Typägare | Betydelse |
| --- | --- | --- |
| `method` | `"deterministic" \| "llm"` | Vilken strategi som kördes |
| `llmPasses` | `number` | Antal RepairGate-anrop |
| `repaired` | `boolean` | True om gaten passerade efter repair (samma-signal) |
| `remainingErrors` | `number?` | Kvarvarande **esbuild-syntax**-fel, inte tsc/build |
| `remainingErrorsSource` | `"esbuild_syntax" \| "quality_gate"` | Vilken pass siffran kommer från |
| `syntaxCleanGateFailed` | `boolean` | esbuild = 0 men typecheck/build failar |
| `earlyStopReason` | `ServerRepairEarlyStop \| null` | Varför loopen bröts |
| `outcome` | `ServerRepairOutcome` | Kanonisk taxonomi; `control-stats.mjs` grupperar på `meta->>'outcome'` |

`verification_state = "superseded"` är ett eget terminalt neutralt tillstånd
(UI: amber "Ersatt"). Deploy-gate behandlar det som `pending`.

Historisk fritext → `outcome` (samma mappning som kommentaren i
`server-verify-log-meta.ts`): `Server repair succeeded` → `repaired`;
syntax clean but gate failing / `"0 errors remain"` med failad gate →
`syntax_clean_gate_failed`; N esbuild errors → `syntax_errors_remain`;
time budget → `time_budget_exceeded`; no-context-skip → `no_context`.

## Telemetri-fält (form)

Skrivs av `persist-telemetry.ts` och relaterade writers. Kolumner och `meta`-nycklar:

| Fält | Skrivs av | Läses av |
| --- | --- | --- |
| `meta.streamMs` | `persistTelemetryRecord` | `/logg`, latensanalys |
| `meta.postStreamSteps` | samma, från finalize `finalizeStepTelemetry` | `/logg`; Prometheus `sajtmaskin_phase_duration_ms` |
| `meta.selectedDossierIds` | `persistTelemetryRecord` när ≥1 dossier valdes | `control-stats` (`dossierUsage`) |
| `deploy_result` | `recordDeployResultForVersion` från `POST /api/v0/deployments` | `control-stats` (`deployOutcomes`) |
| `variant_id` | `persistTelemetryRecord`; ärvs av repair-raden | per-generation scaffold-variant |
| `preview_success` | se nedan | `control-stats`, scaffold-scoring, backoffice |

### `preview_success` (tri-state)

Ägare: `recordPreviewRuntimeOutcomeForVersion`. Monoton UPDATE: `true` kräver
`IS DISTINCT FROM true`; `false` kräver `IS NULL`.

| Värde | Betydelse |
| --- | --- |
| `true` | Preview-host `/status` rapporterade `running: true` för versionens session |
| `false` | Bekräftat ingen fungerande preview (preflight-block eller start-fel) |
| `null` | Pending/obekräftat |

Cutoff för legacy-semantik (preflight-`true` som ljög grönt):
`PREVIEW_SUCCESS_SEMANTIC_CUTOFF` i `scripts/db/control-stats.mjs`.

`generation_telemetry.quality_gate_result` är promote-guardens signal
(`verifier_failed` / `preflight_failed` / `preflight_passed`).
Bakom `SAJTMASKIN_CONTENT_REVISION_GATE` läser guarden senaste signal
för aktuell `files_revision`. Känd mismatch →
`{ allowed: false, indeterminate: true, staleRevision: true,
staleSignalBlocking }`. `/quality-gate` stämplar ett färskt
`preflight_passed` och gör ett guard-omtag bara när det överspelade
verdiktet inte var blockerande. `acceptRepair` skickar
`promotedFilesJson` så repair-passets verdikt inte räknas som stale.
Lageröversikt:
[`orchestration-signal-contract.md`](orchestration-signal-contract.md)
(lager Innehållsrevision).
