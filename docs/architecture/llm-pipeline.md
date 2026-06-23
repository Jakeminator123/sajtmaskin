# LLM-fasen — kanoniskt körflöde (FAS 1 → 2 → 3)

Ett dokument för hela LLM-/genereringsflödet: från användarprompt till sparad version, preview och deploy. Ersätter de tidigare separata `fas1/fas2/fas3`-filerna.

**Senast uppdaterad:** 2026-06-23. **Kod är source of truth.** Ordlista: [glossary.md](./glossary.md). Signalägare: [llm-signal-flow.md](./llm-signal-flow.md). Callsite-index: [llm-callsite-matrix.md](./llm-callsite-matrix.md). Målbild: [llm-flow-target-worldclass.md](./llm-flow-target-worldclass.md).

> Detta dokument beskriver hur flödet **faktiskt** ser ut idag. Monoliterna `build-spec.ts`, `system-prompt.ts` och `finalize-version.ts` finns inte längre — de är mappar med `index.ts`-barrels. `src/lib/own-engine/` är session/pipeline-hjälpare; produktgränsen mot stream/finalize ligger i `src/lib/providers/own-engine/`.

---

## Översikt

```
[FAS 1] prompt → orchestratePromptMessage → brief (client | server-auto | snapshot | delta)
                → OrchestrationInput
[FAS 2] resolveOrchestrationBase → (ev. pre-generation contract gate)
        → finalizeOrchestrationPrompts → createGenerationPipeline (streamText)
        → finalizeAndSaveVersion (url_expand → autofix → validate_syntax → verifier → merge → persist)
        → runOwnEngineStreamPostFinalize (done-SSE)
[FAS 3] startPreviewSession → preview-ready → (quality-gate) → (finalize-design F3) → deploy
```

### Fasgränser

| Fas | Start | Slut |
|-----|-------|------|
| **FAS 1** | Prompt in / assist / brief / intent | Före `resolveOrchestrationBase()` |
| **FAS 2** | `resolveOrchestrationBase()` | Version sparad i `engine_versions`; `done`-SSE |
| **FAS 3** | Efter `done` (preview/deploy) | Preview-host lifecycle + deploy/verify |

**Viktigt:** autofix, syntax-fix och verifier körs i `finalizeAndSaveVersion` **innan** `done` — alltså FAS 2, inte FAS 3. `done` betyder "version sparad", inte "preview redo".

---

## Build profiles och modellrouting

Defaults från `config/ai_models/manifest.json` (env-overrides via `SAJTMASKIN_MODEL_*` vinner alltid). UI-labels i `src/lib/models/catalog.ts`.

| Build profile | Default own-engine-modell | UI-label | Roll |
|---------------|---------------------------|----------|------|
| `fast` | `gpt-5.4-mini` | Snabb | Snabb codegen |
| `pro` | `gpt-5.3-codex` | Lagom | **Default** (`DEFAULT_MODEL_ID`) |
| `max` | `gpt-5.5` | Tänker | Hög reasoning |
| `codex` | `gpt-5.3-codex` | Kod Max | Kod-fokus (högre reasoning-effort) |
| `anthropic` | `claude-sonnet-4.6` | Anthropic | Anthropic-väg |

### Phase routing (`phaseRouting.defaultByTier` i manifestet)

`selected_build_model` = aktiv build-profils modell (`canonicalModelIdToOwnModelId(tier)`). Resolver: `src/lib/models/phase-routing.ts`.

| Tier | planner | generator | fixer | verifier | deploy-assistant |
|------|---------|-----------|-------|----------|------------------|
| `fast` | selected | selected | selected | selected | selected |
| `pro` | `gpt-5.3-codex` | `gpt-5.3-codex` | selected | `gpt-5.3-codex` | `gpt-5.3-codex` |
| `max` | selected | selected | `gpt-5.3-codex` | `gpt-5.3-codex` | `gpt-5.3-codex` |
| `codex` | selected | selected | selected | `gpt-5.3-codex` | `gpt-5.3-codex` |
| `anthropic` | `claude-opus-4.8` | `claude-opus-4.8` | selected | selected | selected |

### Övriga LLM-workloads

| Workload | Default-modell | Env-nyckel |
|----------|----------------|------------|
| Prompt assist (Förbättra) | `openai/gpt-5.5` | `SAJTMASKIN_ASSIST_MODEL` |
| Polish | `openai/gpt-5.3-codex` | `SAJTMASKIN_POLISH_MODEL` |
| Deep Brief (`/api/ai/brief`) | `openai/gpt-5.5` | `SAJTMASKIN_BRIEF_MODEL` |
| Server auto-brief (OpenAI) | `openai/gpt-5.5` | `SAJTMASKIN_AUTO_BRIEF_MODEL_OPENAI` |
| Server auto-brief (Anthropic) | `anthropic/claude-sonnet-4.6` | `SAJTMASKIN_AUTO_BRIEF_MODEL_ANTHROPIC` |
| Scaffold/variant-embeddings | `text-embedding-3-small` | — |

Codegen och brief går **direkt** mot provider (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`), inte via gateway. Manifest-loader: `src/lib/ai-models/load-manifest.ts`.

---

## FAS 1 — Intent (prompt → OrchestrationInput)

### Init (`POST /api/engine/chats/stream`)

1. **Landning → builder:** `startBuild()` i `src/components/landing-v2/use-landing-controller.ts` → `createProject()` (`appProjectId`), `POST /api/prompts` (`promptId`), `router.push("/builder?...")`.
2. **Builder läser URL-handoff:** `deriveBuilderEntryState()` i `src/app/builder/builder-entry.ts` (`template` > `audit` > `prompt-handoff` > `project-restore` > `blank`). Ingen chatt skapas ännu.
3. **Klicka "Skapa":** `useCreateChat.requestCreateChat()` skickar `initialMessage` **rått** (MÅL/TILLGÄNGLIGHET-wrappern är borttagen från init sedan 2026-04-28; Core Rules + brief bär kraven). Bygger `meta` och öppnar SSE mot servern.
4. **Server-entry:** `handleCreateChatStreamPost()` i `src/lib/api/engine/chats/create-chat-stream-post.ts`:
   - `resolveModelSelection()` → kanonisk tier + `engineModel` (`src/lib/models/selection.ts`)
   - `orchestratePromptMessage()` → `strategyMeta` (`src/lib/builder/promptOrchestration.ts`)
   - Brief-resolution (se nedan)
   - `prepareGenerationContext()` (FAS 2)

### Brief-vägar

LLM-genererad strukturerad sajtbrief: `generateSiteBriefObject()` i `src/lib/builder/site-brief-generation.ts` (AI SDK `generateObject` + `siteBriefSchema`, ~24 fält). `briefQuality`: `"full" | "server-auto" | "none"`.

| Väg | Trigger | Källa |
|-----|---------|-------|
| **Klient Deep Brief** | Brief-verktyget på, init-only (`canUseDeepBrief = !chatId`) | `POST /api/ai/brief` → `meta.brief` |
| **Server auto-brief** | `shouldRunServerAutoBrief() === true` | `tryGenerateServerAutoBrief()` |
| **Snapshot-Brief** | Follow-up | `buildFollowUpBriefFromSnapshot()` (ingen LLM) |
| **Delta-brief** | Follow-up med `clear-redesign` | `tryGenerateServerAutoBrief({ priorDesignContext })` → färsk `parsedMeta.brief` |

Server auto-brief körs **inte** vid: `SAJTMASKIN_DISABLE_SERVER_AUTO_BRIEF=1`, redan skickad klient-brief, `promptSourceTechnical`/`preservePayload`, `audit`, eller vanlig follow-up. Policy: `src/lib/builder/server-auto-brief-policy.ts`.

### Scaffold, variant, capability, routes

| Steg | Funktion | Not |
|------|----------|-----|
| Variant pre-match (~1 ms) | `matchScaffold()` + `pickScaffoldVariant()` | Keyword-only, ger `variantHints` |
| Scaffold-val | `matchScaffoldAuto()` — `src/lib/gen/scaffolds/matcher.ts` | `off` / `manual` / `auto` / `persisted`. **9 scaffolds** |
| Auto-matchning | keyword (synk, tvåspråkig) + embedding (`scaffold-search.ts`, cosine) | Embedding override:ar keyword vid score ≥ 0.35 + safety guards |
| Capability-inferens | `inferCapabilities(prompt)` — `src/lib/gen/capability-inference.ts` | **Deterministisk regex**, ingen LLM |
| Route plan | `buildRoutePlan()` — `src/lib/gen/route-plan/` | Provenance: brief > scaffold > prompt |
| Simple-website-path | `classifySimpleWebsitePath()` | Snabb-lane som kan hoppa brief/dossiers/UI-recipes |

### Follow-up (`POST /api/engine/chats/[chatId]/stream`)

`handleMessageStreamRequest()` i `src/lib/api/engine/chats/chat-message-stream-post.ts`.

| Aspekt | Init | Follow-up |
|--------|------|-----------|
| `generationMode` | `"init"` | `"followUp"` när `hasFollowUpBase` |
| Follow-up-predikat | — | `deriveFollowUpStateFromInputs({ previousFilesCount })` — **kräver `previousFilesCount > 0`** (scaffold ensamt räcker inte) |
| Intent | Pre-generation contracts | `classifyFollowUpIntentWithStrategy()` → `neutral` / `clear-redesign` / `capability-add` / `capability-modify` / `qa-only` / … |
| Brief | Deep/Server-auto | Snapshot-Brief (delta-brief vid clear-redesign) |
| Scaffold/variant/routes | Fri planering | **Frysta** via FollowUpContract (se nedan) |
| Continuity | Ingen | `prependOrchestrationContinuityToFollowUp()` |

### Tools i streamText (`getAgentTools()`, `maxSteps: 4`)

| Tool | `execute` | Effekt |
|------|-----------|--------|
| `suggestIntegration` | Ja | Non-blocking |
| `requestEnvVar` | Ja | Non-blocking |
| `askClarifyingQuestion` | Nej | Blocking — frågar användaren |
| `emitPlanArtifact` | Nej | Plan mode |

---

## FAS 2 — Orkestrering, codegen, finalize, persist

`prepareGenerationContext()` i `src/lib/gen/orchestrate.ts` kör tre steg: `resolveOrchestrationBase()` → `finalizeOrchestrationPrompts()` → `buildGenerationInputPackage()`.

### 2a. resolveOrchestrationBase() — deterministiska beslut

| Signal | Källa | Deterministisk? |
|--------|-------|-----------------|
| Capabilities | `inferCapabilities()` (regex) | Ja |
| Generation mode | `generationMode ?? deriveFollowUpStateFromInputs()` | Ja |
| Scaffold + freeze | `matchScaffoldAuto()` / `getScaffoldById()` + `enforceFollowUpScaffoldFreeze()` | Delvis (embedding) |
| Route plan + freeze | `buildRoutePlan()` + `enforceFollowUpRouteFreeze()` + `collectExplicitRouteRemovals()` | Ja |
| Pre-generation contracts | `inferPreGenerationContracts()` — `contract/pre-generation-contracts.ts` | Ja |
| BuildSpec | `deriveBuildSpec()` — `build-spec/builder.ts` | Ja |
| Orchestration contract | `buildOrchestrationContract()` | Ja |
| Scaffold-serialisering | `serializeScaffoldForPrompt()` (`inspirational` / `structural`) | Ja |
| Dossiers | `enforceFollowUpCapabilityFloor()` + `selectDossiersForRequest()` (**19 dossiers**) | Ja |
| Variant + freeze | `resolveScaffoldVariant()` + `enforceFollowUpVariantFreeze()` (**28 variant-filer**) | Delvis |

**Pre-generation contract gate:** om `buildContractClarificationQuestion()` returnerar en fråga avbryts codegen tills användaren svarar (`pre-generation-contract-gate.ts`).

### 2b. BuildSpec (`build-spec/`)

| Parameter | Värden | Styr |
|-----------|--------|------|
| `changeScope` | `copy`, `local-layout`, `page-addition`, `redesign`, `integration` | Ändringens storlek |
| `qualityTarget` | `standard`, `premium`, `release-candidate` | `release-candidate` bara vid `previewPolicyOverride === "fidelity3"` |
| `contextPolicy` | `light`, `normal`, `heavy` | Token-budget |
| `previewPolicy` | `fidelity2`, `fidelity3` | F2 design-loop (default) / F3 integrationer |
| `verificationPolicy` | `fast`, `standard`, `strict` | Verifier-nivå |
| `routeRealization` | `null`, `primary-full-with-shells` | Uppskjutna routes |
| `forbiddenPatterns` | flaggor | T.ex. `unrequested_full_redesign` |

**Token-budgetar** (`BASE_TOKEN_BUDGETS` i `build-spec/token-budgets.ts`, 200k-fönster, skalas 0.6×–3.0× av `modelBudgetScale()`):

| Policy | scaffoldTokens | refsTokens | systemContextTokens |
|--------|----------------|------------|---------------------|
| `light` | 13 000 | 5 000 | 22 000 |
| `normal` | 22 000 | 12 000 | 60 000 |
| `heavy` | 32 000 | 16 000 | 80 000 |

### 2c. System prompt (`system-prompt/`)

```
┌── STATISK KÄRNA (prefix-cache) ──────────────┐
│  Core Rules: config/prompt-core/*.md          │
│  via config/codegen-core-manifest.json        │
│  → getStaticCoreFromWorkspace()               │
└───────────────────────────────────────────────┘
                SYSTEM_PROMPT_SEPARATOR
┌── DYNAMISK KONTEXT (per request) ────────────┐
│  buildDynamicContext() — ~16 ## block         │
│  prunas mot BuildSpec.tokenBudgets            │
└───────────────────────────────────────────────┘
```

`composeEngineSystemPrompt(dynamic.context)` i `system-prompt/compose.ts` = Core Rules + separator + dynamisk kontext. Pruning: `splitContextIntoBudgetBlocks()` → `CONTEXT_BLOCK_PRIORITY_RULES` → `buildBudgetedSystemPrompt()`. Follow-up i `light`-läge (ej redesign) renderar kompakta block. Follow-up-wrappers (`## Continuity`, `## Existing Project Files`, `## Follow-up Editing Mode`) ligger på user-turnen, inte i systemprompten.

### 2d. LLM-anropet (`engine.ts`)

`generateCode()` → AI SDK `streamText({ model, system, messages, tools, maxSteps: 4 })`. Thinking: Anthropic `thinking: { type: "adaptive" }` eller OpenAI `reasoningEffort` (nedgraderas av `resolvePhaseThinking()` om tier inte stödjer). URL:er komprimeras före (`compressUrls()`) och expanderas i finalize.

**SSE-events:** `meta`, `progress`, `thinking`, `content`, `tool-call`, `error`, `done`.

**Stream-sluttillstånd** (`generation-log-writer.resolveStatusDetails`):

| Tillstånd | Trigger | Repair-bar? |
|-----------|---------|-------------|
| `done` | finalize lyckas, version skapas | n/a |
| `failed` | verifier/persist fail men version finns i DB | Ja — `versionId` finns |
| `aborted (versionless)` | stream rivs före persist (provider-abort, klient-disconnect, stale > 30 min) | **Nej** — ingen `versionId` |

Versionless chat kan bara startas om (inte repairas); server blockar follow-up med HTTP 409 `versionless_chat_aborted`.

### 2e. Finalize-pipeline (`stream/finalize-version/runner.ts`)

Ordning enligt `OWN_ENGINE_POST_STREAM_PIPELINE` (`finalize-pipeline-contract.ts`):

| # | Steg | Vad | Typ |
|---|------|-----|-----|
| 1 | `url_expand` | `{{MEDIA_N}}` → riktiga URL:er (först, så autofix ser riktiga paths) | Deterministisk |
| 2 | `autofix` | `runAutoFix()` — ~24 mekaniska fixar (`autofix/pipeline.ts`) | Deterministisk |
| 3 | `validate_syntax` | esbuild → warm `tsc --noEmit` → ev. eslint → **LLM-fix via `runLlmRepairGate()`** | Hybrid |
| 4 | `materialize_images` | Placeholder → Unsplash (full path, non-fatal) | Nätverk |
| 5 | `verifier` | Read-only LLM-granskning; blocking-fynd matas in i fixer direkt efter | LLM |
| 6 | `parse_merge_preflight` | Parse → merge mot `previousFiles` → preflight → partial-file repair | Deterministisk |
| 7 | Persist | `addAssistantMessageAndCreateDraftVersion` (init) / `...UpdateExistingVersion` (follow-up) | Deterministisk |

**Repair-gate / ledger:** alla LLM-fix-ingångar (syntax, warm-tsc, verifier, preflight, partial-file) delar `RepairLedger` med dedupe-nyckel `scopeId + chatId + contentHash + diagnosticFingerprint + requiredFiles`. Samma innehåll + diagnostik kan inte trigga flera repair-försök. Skriv aldrig bara "autofix" — säg **mekanisk autofix** eller **LLM-fix**.

**Light vs full path:** `runDeepPath=false` (light) hoppar materialisering + verifier; gäller follow-up + `verificationPolicy: "fast"` + `contextPolicy: "light"` + scope `copy`/`local-layout`.

### 2f. done-SSE + övergång till preview

`runOwnEngineStreamPostFinalize()` i `src/lib/providers/own-engine/generation-stream-post-finalize.ts` emitterar `done` (`versionId`, `previewPending`, `previewBlocked`), dämpar integration-SSE i F2 (`previewPolicy !== "fidelity3"`), och triggar `startPreviewSession()` + ev. bakgrunds-`server-verify`.

---

## FAS 3 — Preview, quality gate, deploy

`done` = version sparad, **inte** preview redo. `preview-ready` är den robusta signalen för klar preview.

### Kanoniska API-ytor

| Route | Syfte |
|-------|-------|
| `POST .../preview-session` | Start/restart preview-session |
| `GET .../preview-status` | Status/resync/recover |
| `POST .../preview-heartbeat` / `-hibernate` / `-destroy` | Sessionslivscykel |
| `POST .../quality-gate` | Quality-gate lane |
| `GET .../version-status` | Server-projektion (`selectVersionStatus`), läses av `useVersionStatus` (poll 4s) |
| `POST .../repair` / `accept-repair` | Repair-flöde |
| `POST .../finalize-design` | F3-trigger ("Bygg integrationer") |
| `POST /api/v0/deployments` | Deploy till Vercel |

Alla `/api/v0/chats/...`-compat-routes är borttagna (P29); chat-ytan ligger under `/api/engine/chats/...`.

### Preview-typer

| Typ | Teknik | När |
|-----|--------|-----|
| **Live (primär)** | Separat Fly-host kör `npm install` + `npm run dev` med riktiga filer | `SAJTMASKIN_PREVIEW_HOST_BASE_URL` satt |
| **Shim (legacy)** | CDN React + transpilerad kod via `/api/preview-render` | Av som default (`SAJTMASKIN_SHIM_PREVIEW_DISABLED` defaultar true); `=0` opt-in |

### Preview-session (`src/lib/gen/preview/preview-session.ts`)

`startPreviewSession()`: **dedupe** (`chatId:versionId` delar in-flight promise) → **resume** → **update** → **kall start**.

#### VM-resume (cross-instance)

Sessioner lagras i in-memory Map + optional Redis (`session-store.ts`) så en annan serverless-instans kan återuppta samma session. Resume kollar `fetchPreviewHostStatus()`; matchande running-session → touch store, returnera `"resumed"`. TTL ~1h.

#### Preview `.env.local`

`buildPreviewEnvLocalContents()` i `src/lib/gen/preview/env-local.ts` bygger preview-VM:ens `.env.local` i lager: globala placeholders → projekt-env (`projectEnvVars`) → genererad env. I **F2** är tier-3-stublagret aktivt; i **F3** strippas stublagret helt och riktiga env-keys krävs.

### Post-checks och quality gate

Klienten kör `post-checks.ts` efter stream: diff, routes, SEO, `validateImages()`. Quality gate via `runTier2VerifyLane()` → `POST .../quality-gate` → preview-host verify lane.

**Check-profiler** (`config/ai_models/manifest.json` → `qualityGateTiers`):

| Profil | Checks | När |
|--------|--------|-----|
| `designPreview` (F2) | `["typecheck"]` | Efter finalize + bakgrunds-server-verify |
| `integrationsBuild` (F3) | `["typecheck", "build", "lint"]` | `/finalize-design`/promotion |

Preview-host kör **två separata lanes**: live-preview (iframe) och verify (typecheck/build/lint) — en version kan vara live men ändå få verify-fail.

### F2/F3-livscykel

| | F2 (`fidelity2`) | F3 (`fidelity3`) |
|---|------------------|------------------|
| Default | Ja | Nej — explicit trigger |
| Trigger | Init / vanlig follow-up | `POST .../finalize-design` |
| `lifecycle_stage` | `"design"` | `"integrations"` |
| Tier-3 SDK-imports | Strippas → placeholders (`tier3-sdk-guard-fixer`) | Behålls; kräver riktiga env-keys |
| Readiness | Ingen tier-3-check | `validateTier3Readiness` mot dossier-`enforcement: "build"` (412 + `missingByIntegration` vid blockerande keys) |

### Repair-accept

Server-repair (`runRepairLoop`) som passerar quality gate blir `repair_available` (filer i `repaired_files_json`) i stället för att skriva över. `POST .../accept-repair` (eller timeout-autoaccept) applicerar dem. `server-verify` och manuell `repair` delar samma `runRepairLoop`.

### Deploy (`src/app/api/v0/deployments/route.ts`)

Rate limit/bot-check/Zod → credits → ladda version → **pre-deploy fix-pipeline** (om ej `skipAutoFix`) → `buildDeployReadiness()` → saknade env-vars ger **409 `DEPLOY_MISSING_ENV`** → deploy (`createVercelDeployment()` → `syncEnvVarsToVercelProject()`). Endast `missingEnvKeys` blockerar; `placeholderCoveredKeys` går i warnings. Webhooks: `src/app/api/webhooks/vercel/route.ts`.

---

## FollowUpContract och frysning

`buildFollowUpContract()` (`orchestration-snapshot.ts`) byggs på follow-up och konsumeras av `buildFollowUpOrchestrationInput()`. Fält: `baseVersionId`, `snapshotBrief`, `scaffoldId`, `variantId`, `routePlan`, `capabilities`, `qualityTarget`, `previewSessionId`.

| Enforce-funktion (i `orchestrate.ts`) | Fryser |
|---------------------------------------|--------|
| `enforceFollowUpScaffoldFreeze()` | Scaffold-id |
| `enforceFollowUpVariantFreeze()` | Variant-id |
| `enforceFollowUpRouteFreeze()` | Routes + shell-routes (explicit removal tillåts) |
| `enforceFollowUpCapabilityFloor()` | Capabilities kan bara växa |

**Clear-redesign** (`shouldIgnorePersistedScaffoldForMatch()`) släpper scaffold-/variant-/route-frysningen och kör delta-brief.

---

## Fem single sources of truth (mål vs kod)

| # | Mål | Kodstatus idag |
|---|-----|----------------|
| 1 | Intent (Deep Brief) | Delvis — fyra brief-vägar möts i `OrchestrationInput.brief` |
| 2 | Prompt composition | ✅ `composeEngineSystemPrompt()` + `static-core-loader` |
| 3 | Runtime status | Delvis — `selectVersionStatus()` är kanonisk projektion; `done`-SSE + DB-flaggor lever parallellt |
| 4 | Ett repair-kontrakt | Delvis — `runLlmRepairGate()` + `RepairLedger` centraliserar; flera entry points kvar |
| 5 | F2 vs F3 | ✅ i kod (`previewPolicy`, `lifecycleStage`, env-lager); UI kan glida i begrepp |

Detaljerad gap-analys och målbild: [llm-flow-target-worldclass.md](./llm-flow-target-worldclass.md).

---

## Kanoniska källfiler

| Område | Path |
|--------|------|
| Init-stream entry | `src/lib/api/engine/chats/create-chat-stream-post.ts` |
| Follow-up-stream entry | `src/lib/api/engine/chats/chat-message-stream-post.ts` |
| Follow-up-input | `src/lib/api/engine/chats/follow-up-orchestration-input.ts` |
| Orkestrering | `src/lib/gen/orchestrate.ts` + `orchestrate/` |
| Snapshot + contract | `src/lib/gen/orchestration-snapshot.ts` |
| BuildSpec | `src/lib/gen/build-spec/` |
| System prompt | `src/lib/gen/system-prompt/` + `static-core-loader.ts` |
| Core Rules-data | `config/prompt-core/` + `config/codegen-core-manifest.json` |
| Engine / stream | `src/lib/gen/engine.ts`, `stream/stream-format.ts` |
| Provider-stream | `src/lib/providers/own-engine/generation-stream.ts`, `generation-stream-post-finalize.ts` |
| Pipeline-wiring | `src/lib/own-engine/session/own-engine-pipeline-generation.ts` |
| Finalize | `src/lib/gen/stream/finalize-version/runner.ts` + `finalize-pipeline-contract.ts` |
| Autofix / repair | `src/lib/gen/autofix/pipeline.ts`, `validate-and-fix.ts`, `llm-repair-gate.ts` |
| Verifier | `src/lib/gen/verify/verifier-pass.ts`, `server-verify.ts`, `repair-loop.ts` |
| Brief | `src/lib/builder/site-brief-generation.ts`, `server-auto-brief-policy.ts` |
| Modeller | `config/ai_models/manifest.json`, `src/lib/models/catalog.ts`, `phase-routing.ts` |
| Preview | `src/lib/gen/preview/preview-session.ts`, `env-local.ts`, `session-store.ts`, `preview-host/` |
| Deploy | `src/app/api/v0/deployments/route.ts`, `src/lib/deploy/deploy-readiness.ts` |
| Status-bus | `src/lib/logging/event-bus.ts`, `event-bus-projection.ts` |

---

## Relaterade dokument

- [llm-signal-flow.md](./llm-signal-flow.md) — signalägarmatris
- [llm-callsite-matrix.md](./llm-callsite-matrix.md) — fil:rad-index per LLM-anrop
- [llm-flow-target-worldclass.md](./llm-flow-target-worldclass.md) — målbild + gap
- [scaffold-system.md](./scaffold-system.md) — scaffolds, varianter, dossiers
- [preview-white-screen-runbook.md](./preview-white-screen-runbook.md) — felsökning vit preview
- [glossary.md](./glossary.md) · `docs/schemas/preview-session-contract.md` · `docs/ENV.md`

## Synk-checklista när LLM-runtime ändras

Ändras runtime-sanning, env-yta, schema, signal eller adminflöde: uppdatera detta dokument + relevanta `docs/schemas/` + backoffice i samma leverans. Rör du en signal: ändra canonical owner (se `llm-signal-flow.md`), inte fem konsumenter.
