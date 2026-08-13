# LLM-rollmatris

Formyta för **vilka LLM-steg som finns**. Modell-ID, profiler och phase-routing
ägs av [`model-build-profiles.md`](model-build-profiles.md) och
[`config/ai_models/manifest.json`](../../config/ai_models/manifest.json). Körflöde
ägs av [`../architecture/llm-pipeline.md`](../architecture/llm-pipeline.md).

## Canonical ownership

| Faktatyp | Ägare |
| --- | --- |
| Phase-routade roller (`planner`, `generator`, `fixer`, `verifier`, `deploy-assistant`) | `config/ai_models/manifest.json` + `src/lib/models/phase-routing.ts` |
| Klient-Deep Brief | `src/lib/hooks/useInitBrief.ts` → `POST /api/ai/brief` → `src/lib/builder/site-brief-generation.ts` |
| Server auto-brief | `tryGenerateServerAutoBrief` i `site-brief-generation.ts`, policy i `src/lib/builder/server-auto-brief-policy.ts` |
| Delta-brief vid clear-redesign | `runClearRedesignDeltaBriefPhase` i `src/lib/api/engine/chats/chat-message-stream/delta-brief-phase.ts` |
| SEO-copy vid publish | `improveSeoCopyWithLlm` (`src/lib/seo/llm-copy.ts`), workload `seo_publish_copy` |
| Assist-modell | Request-meta `promptAssistModel` — modell-hint till brief, inte en agent |

## Live pre-codegen-steg

Tre brief-steg körs före codegen. De är **samma structured brief-typ**, startade från olika ställen:

| Steg | När | Start | Output |
| --- | --- | --- | --- |
| Klient Deep Brief | Init när UI/default ber om det (`DEFAULT_PROMPT_ASSIST.deep`, `forceDeepBrief` på första create-chat) | `POST /api/ai/brief` | `meta.brief` |
| Server auto-brief | Create-chat när klienten **inte** skickat `meta.brief` (hoppas över follow-up, audit, technical-preserve, `SAJTMASKIN_DISABLE_SERVER_AUTO_BRIEF=1`) | `tryGenerateServerAutoBrief` från `create-chat-stream-post.ts` | samma brief-form; `serverAutoBriefGenerated` / `serverAutoBriefModel` i response-meta |
| Delta-brief | Follow-up med `followUpIntent === "clear-redesign"` | `runClearRedesignDeltaBriefPhase` | ny brief skriven tillbaka till `parsedMeta.brief` |

`formatPrompt()` i `prompt-assist/formatters.ts` är **ingen LLM**. Den wrappas
fortfarande i prompt-wizard och i `buildDynamicInstructionAddendumFromPrompt`
när brief hoppas över. Init-vägen `useCreateChat` skickar rå user-prompt.

## Phase-routade roller

Värden och thinking-policy ägs av manifestet; kopiera dem inte hit.

| Roll | Funktion | Kod |
| --- | --- | --- |
| Planner | Plan mode: plan-/JSON-artifact, inte sajtkod | `src/lib/own-engine/session/own-engine-plan-mode.ts` |
| Generator | Sajtkod / projektfiler | `src/lib/providers/own-engine/generation-stream.ts` |
| RepairGate (`fixer`) | LLM-repair efter att Normalize inte räcker. En produktions-callsite: `runLlmRepairGate` | `src/lib/gen/autofix/llm-repair-gate.ts` |
| Verifier | Hybrid: deterministiska guards + LLM-findings. Flöde: [`../architecture/quality-gate-flow.md`](../architecture/quality-gate-flow.md) | `src/lib/gen/verify/verifier-pass.ts` |
| Deploy assistant | Hjälpfas i phase routing, inte en separat produktagent | `src/lib/models/phase-routing.ts` |

## Övriga live LLM-steg utanför phase-routing

| Steg | Funktion | Inte |
| --- | --- | --- |
| SEO-copy vid publish | Skriver om `title` och `description` i metadata (`improveSeoCopyWithLlm`, workload `seo_publish_copy`) | Inte Polish, inte prompt-rewrite, rör inte JSX |

## Inte live

| Påstående | Sant idag |
| --- | --- |
| "Förbättra" / "Skriv om" via `POST /api/ai/chat` | Knappen borttagen 2026-04-21 (`usePromptRewrite`, `buildPolishSystemPrompt`, `buildRewriteSystemPrompt`). Routen `src/app/api/ai/chat/route.ts` finns kvar utan builder-callsite. |
| `promptAssistMode` `polish` / `rewrite` | Död kod: state, Zod och prompt-logg accepterar värdet; ingen UI sätter det till ett live steg. |
| "Assist Model" som agent | Modell-hint (`promptAssistModel`) till brief. |
| `specMode` / `briefToSpec` / `promptToSpec` / `/api/ai/spec` | Finns inte i koden. |
| Polish-lane som pre-codegen | Död. `DEFAULT_PROMPT_POLISH_MODEL` är leftover; använd inte som runtime-sanning. |

Thinking är en flagga (`phaseRouting.thinkingByTier`), inte en LLM-roll.
Se [`model-build-profiles.md`](model-build-profiles.md).
