# STATUS-AUDIT-WAVE5

Datum: 2026-04-24  
Scope: READ-ONLY coherence-audit av wave 5 (`plan 10` + `plan 11`) mot PROMPT-spec och relaterade statusdocs.

## 1) Spec-coherence per plan

### Plan 10 (`PROMPT-10.md`)

| Acceptanskriterium | Status | Evidens |
|---|---|---|
| `_unrouted/orchestration-styledirection/` växer inte för nya runs | ✅ | Routing via `chat-to-run` + `site.chatId` bind i `src/lib/logging/generation-log-writer.ts` (`readChatToRunIndex`, `recordChatToRun`, `resolveRunDir`) och regressionstest i `src/lib/logging/generation-log-writer.test.ts` |
| `writeGenerationLogEntry failed: ENOENT` försvinner | ✅ | Rekursiv mkdir före varje write i `src/lib/logging/generation-log-writer.ts` |
| Quality-gate skippas på rena init-runs | ✅ | Skip-regel i `src/lib/gen/stream/post-finalize-policies.ts` + tester i `src/lib/providers/own-engine/generation-stream-post-finalize.test.ts` |
| Auto-repair-pass räknas separat i per-chat history | ✅ | `followupCount`/`autoRepairCount` split i `src/lib/logging/generation-log-writer.ts` + test i `src/lib/logging/generation-log-writer.test.ts` |
| 4+ regressionstester passerar | ✅ | 6 nya tester i commit `b6da0b888` (2 + 2 + 2 i tre testfiler) |
| `npm run typecheck && npm run lint && npm run test:ci` = 0 errors | ✅ | Rapporterat i planstatus (`docs/plans/active/master-post-cleanup-2026-04-23/STATUS-10-latency-budgets.md`) |

### Plan 11 (`PROMPT-11.md`)

| Acceptanskriterium | Status | Evidens | Brist (fil + rad) vid ⚠️/❌ |
|---|---|---|---|
| Bug 1: scaffold-required-files-check fångar tom/saknad page.tsx och blockerar persist | ❌ | Preflight skapar blockerande fel för saknad/trivial home route | Persist sker innan preflight-gating: `src/lib/gen/stream/finalize-version/runner.ts:250-262` (DB write), medan preflight-gating kommer senare i `src/lib/gen/stream/finalize-version/runner.ts:318-324` och fail-markering först i `src/lib/gen/stream/finalize-version/runner.ts:460-467` |
| Bug 2: variant lockas mellan init och follow-up | ⚠️ | Follow-up använder snapshot `variantId` och fallback-default om prior saknas | Vid saknad prior-id väljs defaultvariant i `src/lib/gen/scaffold-variants/matcher.ts:76-89` i stället för "senast använda variant-id", vilket inte är strikt arv |
| Bug 3: capability-modify klassas korrekt och ingen re-injection | ⚠️ | `capability-modify` branch finns och dossier-suppression + modify-hint är inkopplad | `visual-3d` kräver explicit 3D/webgl-signal i `src/lib/builder/follow-up-capability-vocabulary.ts:38-42`; intent blir `capability-modify` först när capabilityIds finns i `src/lib/providers/own-engine/follow-up-clarification.ts:247-257` |
| 5+ regressionstester passerar | ✅ | 18 nya tester i commit `3f48c2840` (Bug1:3, Bug2:2, Bug3:13) | — |
| `npm run typecheck && npm run lint && npm run test:ci` = 0 errors | ✅ | Rapporterat i `docs/plans/active/master-post-cleanup-2026-04-23/STATUS-11-unified-repair.md` | — |

## 2) Spec-avvikelser

| Kontroll | Bedömning | Not |
|---|---|---|
| Ändringar utanför scope | Nej (0 bekräftade) | Filset i PR #96/#97 ligger inom respektive plans huvudytor |
| Brott mot hårda begränsningar i PROMPT | Delvis | Plan 11 uppfyller inte fullt "blockera persist" för Bug 1 eftersom DB-persist sker före preflight-gate |
| Oavsiktlig påverkan på plan 02–09-territorium | Ej belagt | Ingen tydlig regressionsyta hittad i diffarna |

## 3) Test-coverage

| Fixområde | Nya tester | Täckningsbedömning |
|---|---:|---|
| Plan 10: observatorie-routing + auto-repair-count | 2 | Tillräcklig för logiknivå |
| Plan 10: init quality-gate skip + policylogg | 2 (+1 policy-log assert) | Tillräcklig för policybeslut |
| Plan 10: latency-metrics infra | 2 | Delvis (infra verifierad, ej full E2E för alla faser) |
| Plan 11 Bug 1: page.tsx-loss | 3 | Delvis: preflight-fel täcks, men inte att DB-persist stoppas före write |
| Plan 11 Bug 2: variant-lock | 2 | Delvis: fallback-path täcks, ej full E2E "prior variant bevaras genom snapshotkedjan" |
| Plan 11 Bug 3: capability-modify | 13 | Hög på regex/klassificering/promptblock; edge-case kvar utan explicit capability-token |

Bedömning mot "minst 1 test per acceptanskriterium": **uppfyllt kvantitativt**, men med 3 regressionsluckor:

1. Inget test som bevisar att Bug 1 stoppar **DB-persist före insert/update** i runnern.  
2. Inget E2E-test för Bug 2 där exakt tidigare variant-id (`corporate-grid`) följer med genom follow-up #N.  
3. Inget test för Bug 3 med promptformen utan explicit `3d`-token (exakt användarformulering i open question).

## 4) Code-quality red flags

| Kontroll | Resultat |
|---|---|
| `TODO/FIXME/XXX/HACK` introducerade i plan 10/11 | Inga träffar i commit-diffarna |
| `console.log`/`console.warn` introducerade i plan 10/11 | Inga nya träffar i commit-diffarna |
| `any` eller `as unknown as X` introducerat | Inga träffar i commit-diffarna |
| Magic numbers | `HOME_PAGE_MIN_RENDERED_CHARS = 200` introducerad men motiverad i kodkommentar (inte blind magic) |

## 5) Bug-hypoteser mot `open-questions.md`

Numrering följer källdokumentet (saknar #6).

| Open Q | Wave 5-status | Bedömning |
|---:|---|---|
| 1 | ✅ | ENOENT/routing-svans adresserad i plan 10 |
| 2 | ⏸ | Opåverkad (post-wave-5-spår) |
| 3 | ⏸ | Redan löst före wave 5 |
| 4 | ✅ | Observatorie-routing fixad med chat→run-index + tester |
| 5 | ⚠️ | Nästan adresserad: preflight-fel finns, men persist-gate före DB-write saknas |
| 7 | ⏸ | Opåverkad |
| 8 | ⚠️ | Delvis: lock-fallback finns, men exakt prior-variant är inte garanterad när snapshot saknar id |
| 9 | ⏸ | Opåverkad |
| 10 | ⏸ | Redan verifierad tidigare; wave 5 ändrar ej detta |
| 11 | ⏸ | Opåverkad |
| 12 | ⚠️ | Delvis: modify-branch finns, men kräver capability-signal i prompten |
| 13 | ⏸ | Opåverkad |
| 14 | ⏸ | Opåverkad |
| 15 | ⏸ | Opåverkad (plan 12/post-wave-5) |
| 16 | ⏸ | Opåverkad |
| 17 | ⏸ | Opåverkad |

## 6) Specifika scenarion

### Scenario A — page.tsx-loss-buggen

Kod-path till `severity: "error"`:

1. `runPreflightPhase()` anropar `runFinalizePreflight()` i `src/lib/gen/stream/finalize-version/preflight-phase.ts:153-163`.  
2. `runFinalizePreflight()` bygger `completeProjectFiles` och kör `buildMissingHomeRouteIssue(...)` i `src/lib/gen/stream/finalize-preflight.ts:632-652`.  
3. `buildMissingHomeRouteIssue()` emitterar `createIssue(..., "error", ..., "code_structure_failure")` vid saknad/trivial home route i `src/lib/gen/stream/finalize-preflight.ts:169-184`.  

Utfall i runner:

- `finalizeAndSaveVersion` persisterar version (`addAssistantMessageAndCreateDraftVersion` / update-existing) i `src/lib/gen/stream/finalize-version/runner.ts:250-262` **innan** preflight errors används för gating.  
- Preflight-blockers leder först senare till `maybeFailVersionVerification(...)` i `src/lib/gen/stream/finalize-version/runner.ts:460-467`, dvs statusmarkering efter persist.

**Bedömning:** Bug 1 är **inte fullt löst** enligt strikt "blockera persist"-tolkning.

### Scenario B — variant-lock

- `snapshot.variantId` läses i `src/lib/api/engine/chats/chat-message-stream-post.ts:836-839` och skickas som `persistedVariantId` i `src/lib/api/engine/chats/chat-message-stream-post.ts:897`.  
- `resolveOrchestrationBase()` sätter `scaffoldVariantId` från `input.persistedVariantId` i `src/lib/gen/orchestrate.ts:762`.  
- Follow-up lock använder `priorVariantId: input.persistedVariantId` i `src/lib/gen/orchestrate.ts:795-803`.  
- Om prior saknas, fallback till scaffold-default sker i `src/lib/gen/scaffold-variants/matcher.ts:76-89`.

**Bedömning:** Fungerar när snapshot har variant-id. Vid `null` blir det default-lås (stabilitet), inte strikt arv av tidigare variant.

### Scenario C — capability-modify

- `MODIFY_REFERENCE_MARKERS` matchas i `src/lib/builder/follow-up-capability-detection.ts:163-176`.  
- `classifyFollowUpIntent()` returnerar `capability-modify` när både capability-detektion och `referencesExistingCapability` är sant i `src/lib/providers/own-engine/follow-up-clarification.ts:247-257`.  
- Re-injection suppressas i `src/lib/api/engine/chats/chat-message-stream-post.ts:921-941`; modify-hint renderas via `renderCapabilityModifyHintBlock()` i `src/lib/gen/system-prompt/sections/dossiers.ts:194-229` och injiceras i `src/lib/gen/system-prompt/build-dynamic-context.ts:193-199`.

**Edge-case:** Exakt prompten "gör pricken till en kaffekopp..." utan explicit `3d`/`webgl` matchar inte `visual-3d`-vokabulären i `src/lib/builder/follow-up-capability-vocabulary.ts:38-42`, så intent kan falla utanför `capability-modify`.

### Scenario D — observatorie-routing

- `chat-to-run` index läses/skrivs i `src/lib/logging/generation-log-writer.ts:184-245`.  
- `site.chatId` binder chat till senaste run i `src/lib/logging/generation-log-writer.ts:1833-1841`; route recovery via chat-index sker i `src/lib/logging/generation-log-writer.ts:1786-1795` och `src/lib/logging/generation-log-writer.ts:1875-1889`.  
- Regressionstest "binds site.chatId to the latest run..." verifierar att `site.chatId`/`comm.request.create` hamnar i run-timeline i `src/lib/logging/generation-log-writer.test.ts:291-353`.

**Bedömning:** För init + 2 follow-ups i samma chat ska events hamna i samma per-chat/run-kedja. Kvarstående risk är samtidiga runs runt `site.chatId`-bind (latest-run heuristik).

## 7) Backoffice/Streamlit-konsekvenser

- `backoffice/pages/pipeline_health.py` hanterar underhållsskript/state och läser inte `history.ndjson`.  
- Inga träffar i backoffice på `history.ndjson`, `followupCount`, `autoRepairCount`.

**Bedömning:** Ingen omedelbar backoffice-uppdatering krävs för plan 10-fälten.

## 8) Schema-konsekvenser

- `docs/schemas/strict/*.json` innehåller inga kontrakt för `history.ndjson`/site-observability-fälten.  
- `scaffoldVariantId` i plan 11 lever i orchestration-input/snapshot-flöde, inte i strict schemafilerna.

**Bedömning:** Ingen strikt-schema-uppdatering är blockerande för wave 5-leveransen.

## 9) Sammanfattning

- Bekräftade buggar: **1**  
  - Bug 1 "blockera persist" är inte fullt uppfylld före DB-write.
- Misstänkta buggar / edge-cases: **2**  
  - Variant-lock vid saknad prior-id låser till default i stället för exakt tidigare variant.  
  - Capability-modify för prompt utan explicit capability-token (`3d`) kan falla igenom.
- Scope-avvikelser: **0** (filscope i PR96/97 följer planerna)
- Rekommendation för plan 12: **NO-GO** tills Bug 1 stängs med verklig pre-persist gate (eller atomisk rollback-strategi som garanterar att invalid files aldrig lämnar finalize som persisterad version).

