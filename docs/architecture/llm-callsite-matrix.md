# LLM-callsite-matris (kanonisk karta)

> **Syfte:** EN läsbar karta över **var** Sajtmaskin anropar en LLM/embedding, vilken fas/modell/API-stil, och var flödet är deterministiskt (ingen LLM). Svar på "vad byggs var?" för LLM-flödet.
> **Källa:** kod = source of truth. Kartlagd read-only mot HEAD `cccc843dd` av 5 parallella explore-agenter 2026-06-19 + orchestrator-verifiering av de två konsekvensrika Område 5-fynden. Komplement till (ej ersättning för): praktiskt flöde [`llm-flow-end-to-end.md`](llm-flow-end-to-end.md) · ASCII-kedja [`../llm/llm-chain-flowchart.md`](../llm/llm-chain-flowchart.md) · målbild [`llm-flow-target-worldclass.md`](llm-flow-target-worldclass.md) · signal-ägarflöde [`llm-signal-flow.md`](llm-signal-flow.md).
> **Underhåll:** uppdatera när en LLM-callsite tillkommer/tas bort eller byter modellkälla (samma regel som [`../llm/README.md`](../llm/README.md) § När du ska uppdatera).

## Tre vägar (init / follow-up / clear-redesign)

```
USER PROMPT
   ├─ INIT (ny chat)                → Deep Brief LLM (generateObject) → orchestrate → codegen → finalize
   ├─ FOLLOW-UP (vanlig)            → snapshot-brief (DETERMINISTISK, 0 LLM) → orchestrate (fryst) → codegen → finalize
   └─ FOLLOW-UP (clear-redesign)    → delta-brief LLM* → orchestrate (scaffold/variant UPPLÅST) → codegen → finalize
```
\* **Verifierat glapp (2026-06-19):** delta-briefen når i praktiken inte system-prompten — se § Verifierade fynd F1.

Grenval: `src/lib/gen/follow-up-predicate.ts` (`deriveFollowUpStateFromInputs`) + intent-regex `src/lib/providers/own-engine/follow-up-clarification.ts:248-309`. Init-route `POST /api/engine/chats/stream`; follow-up-route `POST /api/engine/chats/[chatId]/stream`.

## Modell-routing i runtime (en väg)

```
config/ai_models/manifest.json
  → src/lib/ai-models/load-manifest.ts        (Zod-parse, cache; perTier* finns i JSON men EJ i schemat → ignoreras)
  → buildProfiles → src/lib/models/catalog.ts  (env SAJTMASKIN_MODEL_* vinner)
  → phaseRouting → src/lib/models/phase-routing.ts  (resolvePhaseModel(tier, phase); "selected_build_model" = tierns build-modell)
  → src/lib/models/selection.ts                (request → tier)
  → src/lib/gen/models.ts getOpenAIModel()     → streamText/generateObject
```
Build-profil-defaults (`manifest.json:50-57`): fast=`gpt-5.4-mini` · pro/codex=`gpt-5.3-codex` · max=`gpt-5.4` · anthropic=`claude-sonnet-4.6`.

## Callsite-matris — LLM-anrop

Kolumner: Fas · Syfte · Ägar-fil:rad · Route/trigger · Modellkälla · API-stil · Tools · Status-events.

### Brief (kluster A)
| Fas | Syfte | Ägar-fil:rad | Route/trigger | Modellkälla | API-stil | Tools | Events |
|---|---|---|---|---|---|---|---|
| init | Deep Brief | `site-brief-generation.ts:527,599` | `POST /api/ai/brief` + server-auto-brief `create-chat-stream-post.ts:247-266` | `briefing.requestModel` → `gpt-5.4`; Anthropic-fallback (full→simplified schema) | `generateObject` | nej | `assist.brief.*`, `orchestration.server_auto_brief` |
| clear-redesign | Delta-brief | `chat-message-stream-post.ts:468` → `site-brief-generation.ts:527` | follow-up-route, intent=clear-redesign | samma som brief + `priorDesignContext` | `generateObject` | nej | debugLog (**ej till orchestrate, se F1**) |
| follow-up (vanlig) | (snapshot-brief) | `orchestration-snapshot.ts:257-307` | follow-up-route | **ingen LLM** (deterministisk) | — | — | — |

### Codegen + orchestration (kluster B)
| Fas | Syfte | Ägar-fil:rad | Route/trigger | Modellkälla | API-stil | Tools | Events |
|---|---|---|---|---|---|---|---|
| alla | **Huvud-codegen** | `engine.ts:132` via `own-engine-pipeline-generation.ts:77-97` | båda stream-routes | `resolveEngineModelId(tier)` | `streamText` | **ja** (`suggestIntegration`/`requestEnvVar`; F2 mutad bort `generation-stream-tools.ts:44-57`) | `meta/progress/thinking/content/tool-call/done/error` |
| alla (plan-läge) | Planner | `engine.ts:132` via `own-engine-plan-mode.ts:94` | plan-gren | `resolvePhaseModel(tier,"planner")` | `streamText` | **ja** (`emitPlanArtifact`, `askClarifyingQuestion`) | plan-mode SSE |
| init / unlock | Scaffold embedding-query | `scaffold-search.ts:188` via `matcher.ts:643` | när ingen `persistedScaffoldId` / clear-redesign | `text-embedding-3-small` (env `OPENAI_API_KEY`); keyword-fallback | embeddings SDK | nej | `scaffold_drift` log |
| init / unlock | Variant embedding-query | `scaffold-variants/matcher.ts:319` | när `persistedVariantId` saknas/stale | variant-embeddings `_meta.model`; keyword-fallback | embeddings SDK | nej | `variant_drift` log |
| follow-up | QA short-circuit (ingen codegen) | `chat-message-stream-post.ts:117` | `classifyRequestKind`=qa-or-score | `DEFAULT_MODEL_ID` (pro) | `generateText` | nej | `content/done` |

### Verify / repair / autofix (kluster C)
| Fas | Syfte | Ägar-fil:rad | Route/trigger | Modellkälla | API-stil | Tools | Events |
|---|---|---|---|---|---|---|---|
| finalize | Read-only verifier | `verifier-pass.ts:777` via `verifier-phase.ts:94` | efter codegen | `resolvePhaseModel(tier,"verifier")` | `generateObject` | nej | `version.verifier.done` (`server-verify.ts:162`) |
| finalize | Verifier-fixer (LLM) | `llm-fixer.ts:183` via `llm-repair-gate.ts:197` | blocking findings | `resolvePhaseModel(tier,"fixer")` | `streamText` | nej | `progress.verifier` |
| finalize | Syntax/tsc/eslint-fixer | `validate-and-fix.ts:773,231,416` | esbuild/tsc/eslint-loop | fixer-fas | `streamText` | nej | `progress.validate_syntax` |
| finalize | Partial-file repair | `partial-file.ts:102` | preflight | fixer-fas | `streamText` | nej | — |
| post-finalize | Server/manuell repair | `repair-loop.ts:521` → `llm-fixer.ts:183` | `server-verify.ts:576`, `repair/route.ts:332` | chat-tier → fixer-fas | `streamText` | nej | `version.build.error` |
| finalize | Mekanisk autofix (~30 regler, **0 LLM**) | `autofix/pipeline.ts:1208` | pre/post-LLM + repair | — | mekanisk | — | (ej emit — se F4) |
| finalize-merge | Cross-file import (**0 LLM**) | `rules/cross-file-import-checker.ts:529` | `finalize-merge.ts` | — | mekanisk AST | — | — |
| post-finalize | Preview-host quality-gate (tsc) | `preview-quality-gate.ts:100` | `quality-gate/route.ts`, `server-verify.ts:129` | preview-host HTTP | — | — | `version.verifier.done` |
| post-finalize | Playwright DOM-postcheck | `product-postcheck.ts:246` | `product-postcheck/route.ts`, `post-checks.ts:86` | — | Playwright | — | `version.degraded` |

### Övriga LLM-ytor (kluster D) — utanför kärn-pipelinen
| Syfte | Ägar-fil:rad | Modell | API-stil | Manifest-styrd? |
|---|---|---|---|---|
| Prompt-assist ("Förbättra") | `app/api/ai/chat/route.ts:175` | route-default `gpt-5.3-codex` (manifest säger `gpt-5.4`) | `streamText` | delvis (avviker) |
| Webbplats-audit | `app/api/audit/route.ts:1258` | `gpt-5.2` + Anthropic-fallback | `responses.create`/`generateText` | ja (`audit_structured`) |
| Text→sajtförslag | `app/api/text/analyze/route.ts:125` | `gpt-5-nano` (**hårdkodat**) | `responses.create` | nej |
| Projektanalys | `app/api/projects/[id]/analyze/route.ts:182` | `gpt-5-mini` | `responses.create` | ja |
| Presentation | `app/api/analyze-presentation/route.ts:261` | text `gpt-5-mini`; **vision `gpt-4o` hårdkodat** | mixed | delvis |
| Analyze-website | `app/api/analyze-website/route.ts:124` | `gpt-5-mini` (**hårdkodat**) | `generateText` | nej |
| Wizard enrich/competitors/lookup | `app/api/wizard/*/route.ts` | `gpt-5-mini` (**hårdkodat**) | `responses.create`/`generateText` | nej |
| Domänförslag | `app/api/domain-suggestions/route.ts:62` | `gpt-5.2` (**hårdkodat**) | `generateText` | nej |
| Inspector AI-match | `app/api/inspector-ai-match/route.ts:144` | `gpt-5-mini` | `chat.completions` | ja |
| Transkribering | `app/api/transcribe/route.ts:126` | `whisper-1` (**hårdkodat**) | `audio.transcriptions` | nej |
| Embeddings (scaffold/mall/variant) | `scaffold-search.ts`, `template-search.ts`, `scaffold-variants/matcher.ts` | `text-embedding-3-small` | embeddings SDK | ja (`embeddingModels`) |

## Deterministiska steg i kedjan (ingen LLM — viktigt för mental modell)
`route-plan-builder.ts:24-72` (routes) · `capability-dossier-bridge.ts:26-37` (capability→dossier) · `dossiers/select.ts` (dossier-pick) · `build-dynamic-context.ts:118` + `compose.ts:38` (system-prompt) · `pre-generation-contract-gate.ts:37` (SSE only) · `follow-up-clarification.ts` intent-regex · `domain-inference.ts` + `prompt-heuristics.ts` (brief-signaler) · `error-log-retriever.ts` (TF-IDF rerank).

## Verifierade fynd (kod-kollade, kandidat-buggar — F3 åtgärdad i denna PR; F1/F2/F4/F5 öppna)

| ID | Fynd | Bevis (fil:rad) | Konsekvens | Hör till |
|---|---|---|---|---|
| **F1** | **clear-redesign-delta-brief når aldrig orchestrate.** `metaBrief` sätts `chat-message-stream-post.ts:477` men `buildFollowUpOrchestrationInput` (`:867`) får `parsedMeta` (`:872`); orchestrate läser `parsedMeta.brief ?? buildFollowUpBriefFromSnapshot` (`follow-up-orchestration-input.ts:82-84`). `metaBrief` (init `null` `:268`) skrivs aldrig till `parsedMeta.brief` → läses bara i telemetri (`:1049,1133`). | verifierat 2026-06-19 | Bortkastat LLM-anrop; clear-redesign får snapshot-brief, inte sin färska delta → "bygg om designen" är svagare än avsett | Område 5 / bug-swarm |
| **F2** | **Stale `baseVersionId` saknar gate i follow-up-strömmen.** Explicit `engineBaseVersionId` accepteras tyst (`version-manager.ts:82-107`; test `stream/route.test.ts:785-815`). `finalize-design` (F3) returnerar däremot 409 (`finalize-design/route.ts:126-143`). | agent E + asymmetri-koll | Follow-up kan bygga på fel/stale version utan serverfel (bryter Område 5 "Klart när") | Område 5 (akt 5-2) |
| **F3** | **Åtgärdad i denna PR.** Död funktion `classifyFollowUpIntentWithLlmFallback` (`follow-up-clarification.ts`) borttagen — anropades aldrig i runtime; routes använder bara regex `classifyFollowUpIntent` (`chat-message-stream-post.ts`). Doc-drift som påstod LLM-fallback ≥80 ord rättad i `llm-chain-flowchart.md`. | agent A+B (grep: 0 runtime-callers) | Doc-drift + död kod (löst) | Z-städ / docs |
| **F4** | **Bus-events definierade men aldrig emit:ade** (`version.autofix.result`, `version.syntax.pass`, `version.saved`, `verifier_skipped_heavy_load`) — `event-bus-types.ts` har dem, ingen runtime-emit. | agent C | Observability-gap (event-bus ofullständig) | Område 6-svans / backlog |
| **F5** | **Manifest↔kod-drift:** `perTier*` (briefing/repair/timeouts) finns i `manifest.json:273-337` men EJ i Zod-schemat (`load-manifest.ts`) → backoffice visar tier-värden som inte styr runtime. `deploy-assistant`-fasen har ingen runtime-konsument. Flera routes hårdkodar modeller förbi manifestet (se kluster D). `embeddingModels.templateLibrary` pekar på borttagen katalog. | agent D | Falsk bild i backoffice + manifest "single source" delvis osann | Z-städ / backlog |

## Doc-drift mot befintliga kartor (rätta i Z-städ, inte autonomt nu)
| Påstående | Var | Kod-faktum |
|---|---|---|
| Brief-fallback `gpt-4.1` | `llm-chain-flowchart.md:128` | Fallback är Anthropic `claude-sonnet-4.6` (`site-brief-generation.ts:677-678`) |
| Brief innehåller `scaffoldNomination`/`mustHave`/`avoid` | `llm-flow-end-to-end.md:113-114` | Saknas i `siteBriefSchema` (`site-brief-generation.ts:128-198`) |
| `domain-inference.ts` under `src/lib/gen/` | terminology/router | Ligger i `src/lib/builder/domain-inference.ts` |
| Follow-up = "ingen LLM" generellt | `llm-flow-end-to-end.md:18` | Stämmer för vanlig follow-up; clear-redesign kör delta-brief-LLM (men F1) |

## Föreslagen modul-karta (MÅLBILD — flytta ingen kod i denna fas)
Aspirationell läsbar gruppering om/när koden konsolideras (små adapter/barrel-PR:er, aldrig stor flytt — jfr master-plan §8):
```
01-intake      follow-up-predicate, request-kind, parse-chat-request-meta, create/chat-message-stream-post
02-brief       site-brief-generation, orchestration-snapshot (snapshot-brief), domain-inference, prompt-heuristics
03-orchestrate orchestrate, scaffold/variant-matcher, route-plan-builder, capability-dossier-bridge, dossiers/select
04-routing     ai-models/load-manifest, models/{phase-routing,selection,catalog}
05-system-prompt system-prompt/{compose,build-dynamic-context}, config/prompt-core
06-codegen     engine, agent-tools, providers/own-engine/generation-stream
07-finalize    stream/finalize-version/*, autofix/{pipeline,validate-and-fix}, cross-file-import-checker
08-preview     preview/{session-store,preview-session}, finalize-design, preview-* routes
09-verify-repair verify/{verifier-pass,server-verify,preview-quality-gate,repair-loop}, autofix/llm-fixer, product-postcheck
10-observability logging/{event-bus,event-bus-projection,event-bus-types}
```
Källagenter (read-only, 2026-06-19): kluster A `f128b388` · B `9921fa31` · C `8d6c10d2` · D `e8818123` · E `9c504801`.
