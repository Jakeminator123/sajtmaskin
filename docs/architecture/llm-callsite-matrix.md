# LLM-callsite-matris (kanonisk karta)

> **Syfte:** EN läsbar karta över **var** Sajtmaskin anropar en LLM/embedding, vilken fas/modell/API-stil, och var flödet är deterministiskt (ingen LLM). Svar på "vad byggs var?" för LLM-flödet.
> **Källa:** kod = source of truth. Kartlagd read-only mot HEAD `cccc843dd` av 5 parallella explore-agenter 2026-06-19 + orchestrator-verifiering av de två konsekvensrika Område 5-fynden. Komplement till (ej ersättning för): kanoniskt körflöde [`llm-pipeline.md`](llm-pipeline.md) · målbild [`llm-flow-target-worldclass.md`](llm-flow-target-worldclass.md) · signal-ägarflöde [`llm-signal-flow.md`](llm-signal-flow.md).
> **Underhåll:** uppdatera när en LLM-callsite tillkommer/tas bort eller byter modellkälla (samma synk-regel som [`llm-pipeline.md`](llm-pipeline.md) § Synk-checklista).

## Tre vägar (init / follow-up / clear-redesign)

```
USER PROMPT
   ├─ INIT (ny chat)                → Deep Brief LLM (generateObject) → orchestrate → codegen → finalize
   ├─ FOLLOW-UP (vanlig)            → snapshot-brief (DETERMINISTISK, 0 LLM) → orchestrate (fryst) → codegen → finalize
   └─ FOLLOW-UP (clear-redesign)    → delta-brief LLM* → orchestrate (scaffold/variant UPPLÅST) → codegen → finalize
```
\* **Verifierat glapp (2026-06-19):** delta-briefen når i praktiken inte system-prompten — se § Verifierade fynd F1.

Grenval: `src/lib/gen/follow-up-predicate.ts` (`deriveFollowUpStateFromInputs`) + intent-regex `src/lib/providers/own-engine/follow-up-clarification.ts:248-309`. Init-route `POST /api/engine/chats/stream`; follow-up-route `POST /api/engine/chats/[chatId]/stream`.

### Fast Edit Lane (deterministisk, 0 LLM)

```
EXAKT TOOL-EDIT (kodvy / filträd / inspector) → applyQuickEdits (DETERMINISTISK) → ny minor-version (quick_edit) → preview-host patch (ingen restart) → klar
```

Triviala, användarutpekade ändringar går helt utanför LLM-codegen/finalize. Ingen prompt-tolkning, ingen gissning — kräver exakt fil (och, vid textbyte, unik/utpekad sträng). Route `POST /api/engine/chats/[chatId]/quick-edit`; motor `src/lib/gen/quick-edit/{apply,service}.ts`; preview `POST /preview/session/patch` (preview-host). Flagga: `NEXT_PUBLIC_SAJTMASKIN_QUICK_EDIT` (klient) + `SAJTMASKIN_PREVIEW_PATCH_LANE` (hot patch). **LLM-anrop: 0.**

Samma lane driver även preview-panelens **+/- sidhantering** (route-tabs): `replace_content`/`replace_text` för edits, `delete_file` (+ `removedPaths`) för borttagning, med route-group-/Pages-Router-medveten fil↔route-mappning i `src/lib/builder/preview-page-ops.ts`. Känsliga filer (`.env*`, secrets, lockfiles) blockas av `isBlockedQuickEditPath`. Onåbara/orphan-routes visas (badge + ta-bort-knapp) i stället för att döljas. Patch-routen skickar `expectedBaseVersionId` för optimistisk concurrency (409 `base_mismatch` → full restart).

## Modell-routing i runtime (en väg)

```
config/ai_models/manifest.json
  → src/lib/ai-models/load-manifest.ts        (Zod-parse, cache; perTier* valideras men är declared-only)
  → buildProfiles → src/lib/models/catalog.ts  (env SAJTMASKIN_MODEL_* vinner)
  → phaseRouting → src/lib/models/phase-routing.ts  (resolvePhaseModel(tier, phase); "selected_build_model" = tierns build-modell)
  → src/lib/models/selection.ts                (request → tier)
  → src/lib/gen/models.ts getOpenAIModel()     → streamText/generateObject
```
Build-profil-defaults (`manifest.json:50-57`): fast=`gpt-5.4-mini` · pro/codex=`gpt-5.3-codex` · max=`gpt-5.5` · anthropic=`claude-opus-4.8` (Sonnet 4.6 pensionerad → aliasas till Opus).

## Callsite-matris — LLM-anrop

Kolumner: Fas · Syfte · Ägar-fil:rad · Route/trigger · Modellkälla · API-stil · Tools · Status-events.

### Brief (kluster A)
| Fas | Syfte | Ägar-fil:rad | Route/trigger | Modellkälla | API-stil | Tools | Events |
|---|---|---|---|---|---|---|---|
| init | Deep Brief | `site-brief-generation.ts:527,599` | `POST /api/ai/brief` + server-auto-brief `create-chat-stream-post.ts:247-266` | `briefing.requestModel` → `gpt-5.5`; Anthropic-fallback (full→simplified schema) | `generateObject` | nej | `assist.brief.*`, `orchestration.server_auto_brief` |
| clear-redesign | Delta-brief | `chat-message-stream-post.ts:468` → `site-brief-generation.ts:527` | follow-up-route, intent=clear-redesign | samma som brief + `priorDesignContext` | `generateObject` | nej | debugLog (**ej till orchestrate, se F1**) |
| follow-up (vanlig) | (snapshot-brief) | `orchestration-snapshot.ts:257-307` | follow-up-route | **ingen LLM** (deterministisk) | — | — | — |

### Codegen + orchestration (kluster B)
| Fas | Syfte | Ägar-fil:rad | Route/trigger | Modellkälla | API-stil | Tools | Events |
|---|---|---|---|---|---|---|---|
| alla | **Huvud-codegen** | `engine.ts:132` via `own-engine-pipeline-generation.ts:77-97` | båda stream-routes | `resolvePhaseModel(tier,"generator")` (MB-3: anthropic→Opus 4.8; `chat.model`=`resolveEngineModelId(tier)` för tier-round-trip) | `streamText` | **ja** (`suggestIntegration`/`requestEnvVar`; F2 mutad bort `generation-stream-tools.ts:44-57`) | `meta/progress/thinking/content/tool-call/done/error` |
| alla (plan-läge) | Planner | `engine.ts:132` via `own-engine-plan-mode.ts:94` | plan-gren | `resolvePhaseModel(tier,"planner")` | `streamText` | **ja** (`emitPlanArtifact`, `askClarifyingQuestion`) | plan-mode SSE |
| init / unlock | Scaffold embedding-query | `scaffold-search.ts:188` via `matcher.ts:643` | när ingen `persistedScaffoldId` / clear-redesign | `text-embedding-3-small` (env `OPENAI_API_KEY`); keyword-fallback | embeddings SDK | nej | – (brief-nominerings-`scaffold_drift`-loggen borttagen) |
| init / unlock | Variant embedding-query | `scaffold-variants/matcher.ts:319` | när `persistedVariantId` saknas/stale | variant-embeddings `_meta.model`; keyword-fallback | embeddings SDK | nej | – (brief-nominerings-`variant_drift`-loggen borttagen) |
| follow-up | QA short-circuit (ingen codegen) | `chat-message-stream-post.ts:117` | `classifyRequestKind`=qa-or-score | `DEFAULT_MODEL_ID` (pro) | `generateText` | nej | `content/done` |

### Verify / repair / autofix (kluster C)
| Fas | Syfte | Ägar-fil:rad | Route/trigger | Modellkälla | API-stil | Tools | Events |
|---|---|---|---|---|---|---|---|
| finalize | Read-only verifier | `verifier-pass.ts:777` via `verifier-phase.ts:94` | efter codegen | `resolvePhaseModel(tier,"verifier")` | `generateObject` | nej | `version.verifier.done` (`server-verify.ts:162`) |
| finalize | Verifier-fixer (LLM) | `llm-fixer.ts:183` via `llm-repair-gate.ts:197` | blocking findings | `resolvePhaseModel(tier,"fixer")` | `streamText` | nej | `progress.verifier` |
| finalize | Syntax/tsc/eslint-fixer | `validate-and-fix.ts:773,231,416` | esbuild/tsc/eslint-loop | fixer-fas | `streamText` | nej | `progress.validate_syntax` |
| finalize | Partial-file repair | `partial-file.ts:102` | preflight | fixer-fas | `streamText` | nej | — |
| post-finalize | Server/manuell repair | `repair-loop.ts:521` → `llm-fixer.ts:183` | `server-verify.ts:576`, `repair/route.ts:332` | chat-tier → fixer-fas | `streamText` | nej | `version.build.error` |
| finalize | Mekanisk autofix (~30 regler, **0 LLM**) | `autofix/pipeline.ts:1208` via `finalize-version/pre-phases.ts` | pre/post-LLM + repair | — | mekanisk | — | `progress.autofix`, `version.autofix.result` |
| finalize-merge | Cross-file import (**0 LLM**) | `rules/cross-file-import-checker.ts:529` | `finalize-merge.ts` | — | mekanisk AST | — | — |
| post-finalize | Preview-host quality-gate (tsc) | `preview-quality-gate.ts:100` | `quality-gate/route.ts`, `server-verify.ts:129` | preview-host HTTP | — | — | `version.verifier.done` |
| post-finalize | Playwright DOM-postcheck | `product-postcheck.ts:246` | `product-postcheck/route.ts`, `post-checks.ts:86` | — | Playwright | — | `version.degraded` |

### Övriga LLM-ytor (kluster D) — utanför kärn-pipelinen
| Syfte | Ägar-fil:rad | Modell | API-stil | Manifest-styrd? |
|---|---|---|---|---|
| Prompt-assist ("Förbättra") | `app/api/ai/chat/route.ts:175` | route-default `gpt-5.3-codex` (manifest säger `gpt-5.5`) | `streamText` | delvis (avviker) |
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
`route-plan-builder.ts:24-72` (routes) · `capability-dossier-bridge.ts:26-37` (capability→dossier) · `dossiers/select.ts` (dossier-pick) · `build-dynamic-context.ts:118` + `compose.ts:38` (system-prompt) · `pre-generation-contract-gate.ts:37` (SSE only) · `follow-up-clarification.ts` intent-regex · `domain-inference.ts` + `prompt-heuristics.ts` (brief-signaler) · `error-log-retriever.ts` (TF-IDF rerank) · **`quick-edit/{apply,service}.ts` (Fast Edit Lane — hela vägen 0 LLM)**.

## Verifierade fynd (kod-kollade, kandidat-buggar — F1/F2/F3 åtgärdade; F4/F5 backlog)

| ID | Fynd | Bevis (fil:rad) | Konsekvens | Hör till |
|---|---|---|---|---|
| **F1** | **clear-redesign-delta-brief når aldrig orchestrate.** `metaBrief` sätts `chat-message-stream-post.ts:477` men `buildFollowUpOrchestrationInput` (`:867`) får `parsedMeta` (`:872`); orchestrate läser `parsedMeta.brief ?? buildFollowUpBriefFromSnapshot` (`follow-up-orchestration-input.ts:82-84`). `metaBrief` (init `null` `:268`) skrivs aldrig till `parsedMeta.brief` → läses bara i telemetri (`:1049,1133`). | verifierat 2026-06-19 | **Åtgärdad #169 (5-4):** `parsedMeta.brief = metaBrief` write-back → clear-redesign-deltan når orchestrate i st.f. snapshot-fallbacken | Område 5 (5-4) ✅ |
| **F2** | **Stale `baseVersionId` saknar gate i follow-up-strömmen.** Explicit `engineBaseVersionId` accepteras tyst (`version-manager.ts:82-107`; test `stream/route.test.ts:785-815`). `finalize-design` (F3) returnerar däremot 409 (`finalize-design/route.ts:126-143`). | agent E + asymmetri-koll | **Åtgärdad #166 (5-2):** stale-`baseVersionId` → 409 i follow-up-strömmen (speglar `finalize-design`); S1–S5 i CI | Område 5 (5-2) ✅ |
| **F3** | **Åtgärdad i denna PR.** Död funktion `classifyFollowUpIntentWithLlmFallback` (`follow-up-clarification.ts`) borttagen — anropades aldrig i runtime; routes använder bara regex `classifyFollowUpIntent` (`chat-message-stream-post.ts`). Doc-drift som påstod LLM-fallback ≥80 ord rättad i `llm-chain-flowchart.md`. | agent A+B (grep: 0 runtime-callers) | Doc-drift + död kod (löst) | Z-städ / docs |
| **F4** | **Åtgärdad i denna PR.** Finalize-runner emit:ar nu de tidigare dokumenterade bus-events: `version.autofix.result` (inkl. kompakt fixer-summary), `version.syntax.pass`, `version.saved` samt `version.degraded { kind: "verifier_skipped_heavy_load" }` när verifiern hoppades över p.g.a. tung mekanisk autofix. Live-fasen före persist visas fortsatt via SSE `progress.*`, eftersom `versionId` finns först när versionen sparats. | agent C | Observability-gap löst utan ny signalägare; builder-UI visar slutstegen i expanderbar Agentlogg/status | Område 6-svans ✅ |
| **F5** | **Manifest↔runtime-status (delvis kvar):** `perTierTimeouts` / `perTierRepairPolicies` / `perTierBriefing` finns i manifestet och valideras av `load-manifest.ts`, men är **declared-only** enligt control-plane och påverkar inte runtime ännu (global `routeTimeouts` / `repairPolicies` / `briefing` gäller). `deploy-assistant`-fasen har ingen runtime-konsument. Flera routes ligger fortfarande utanför phase-routing eller använder workload-defaults (se kluster D). `embeddingModels.templateIndex` pekar nu på aktiv `src/lib/templates/template-embeddings-core.ts`; den gamla `templateLibrary`-nyckeln/katalogen är borta. | agent D + docs-audit 2026-07-02 | Manifestet är validerat, men "single source" betyder inte att varje deklarerad fragment är runtime-wired | Z-städ / backlog |

## Doc-drift mot befintliga kartor — rättad i 5-Z (2026-06-21)
| Påstående (före) | Var | Kod-faktum | Status |
|---|---|---|---|
| Brief-fallback `gpt-4.1` | `llm-chain-flowchart.md:128` | Fallback = Anthropic `claude-opus-4.8` (`AUTO_BRIEF_MODEL_ANTHROPIC`, `site-brief-generation.ts:677-678`; Sonnet 4.6 pensionerad 2026-06-28) | ✅ rättad |
| Brief innehåller `scaffoldNomination`/`mustHave`/`avoid` | `llm-flow-end-to-end.md` + `llm-chain-flowchart.md` | Saknas i `siteBriefSchema` (`:128-198`); scaffold/variant = deterministisk pick, `*Nomination`-typfält vestigiala (alltid `null`, drift-logg fyrar aldrig) | ✅ rättad |
| `domain-inference.ts` under `src/lib/gen/` | (ingen kvarvarande doc-referens) | Ligger i `src/lib/builder/domain-inference.ts`; ingen aktuell doc hävdar gen-path | ✅ ej aktuell |
| Follow-up = "ingen LLM" generellt | `llm-flow-end-to-end.md:18` | Vanlig follow-up = ingen LLM; `clear-redesign` kör delta-brief-LLM (når orchestrate sedan #169) | ✅ rättad |

> **Kvarvarande kod-findings (backlog, ej docs):** F5-runtime-wiring (`perTier*` är validerade men declared-only, vissa routes/workloads ligger utanför phase-routing) + vestigial `scaffoldNomination`/`variantNomination`-typ & drift-kod i `orchestrate.ts`/`system-prompt/types.ts` (alltid `null` sedan schemat slutade emittera dem). Egna kod-pass; rör ej docs.

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
