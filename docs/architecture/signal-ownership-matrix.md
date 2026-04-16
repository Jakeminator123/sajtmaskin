# Signal Ownership Matrix

Varje signal i init-pipelinen ska ha exakt **en canonical source**. Konsumenter läser därifrån — de uppfinner inte om samma svar.

## Ägarmatris

| Signal / fråga | Canonical source | Data/config | Konsumenter | Får dupliceras? |
|---|---|---|---|---|
| **Domän / site-type** | `domain-inference.ts` | `config/domain-rules.json` | `site-brief-generation.ts`, `promptAssist.ts` (fallback addendum) | Nej — alla ska importera `inferDomain` / `inferSiteTypeHintFromDomain` |
| **Structured-prompt heuristik** | `prompt-heuristics.ts` | `config/prompt-heuristic-tokens.json` | `promptOrchestration.ts` | Nej — alla ska importera delade tokens + `countTokenHits` |
| **Keyword-extraktion (formatering)** | `prompt-heuristics.ts` | `SECTION_KEYWORDS`, `STYLE_KEYWORDS` | `promptAssist.ts` (`formatPrompt`, addendum) | Nej — importera, inte duplicera |
| **Init-semantik (projektgrund)** | Deep Brief (`site-brief-generation.ts`) | `siteBriefSchema` | `create-chat-stream-post.ts`, `buildDynamicContext()` i `system-prompt.ts` | Nej — brief-objektet via `meta.brief` är enda kanonisk signal |
| **Globala designregler** | Core Rules (`config/prompt-core/`) + Directives (`config/prompt-directives/`, Level 4 defaults) | markdown-filer | `static-core-loader.ts` + `directive-loader.ts` → system prompt | Nej — `EXTENDED_CUSTOM_INSTRUCTIONS` borttagen |
| **Request-specifik designkontext** | `buildDynamicContext()` i `system-prompt.ts` | brief + scaffold + theme | codegen system prompt | Nej — brief-driven, inte omtolkad |
| **Build intent (codegen)** | `BUILD_INTENT_GUIDANCE` i `system-prompt.ts` | lokal konstant | `buildDynamicContext()` | Assist-copy i `promptAssist.ts` ok (annat syfte) |
| **Build intent (assist)** | `BUILD_INTENT_GUIDANCE` i `promptAssist.ts` | lokal konstant | rewrite/polish/addendum | Synka manuellt med codegen-versionen |
| **Capability-inferens** | `capability-inference.ts` | regexar + manifest | `buildDynamicContext()`, `BuildSpec`, `follow-up-clarification` | Nej |
| **Fallback-addendum (non-init)** | `promptAssist.ts` | `MOTION_GUIDANCE`, `VISUAL_IDENTITY_GUIDANCE`, `QUALITY_BAR_GUIDANCE` | `useInitBrief.ts` → `generateDynamicInstructions` vid brief-miss | Legacy-fallback, skippas vid init |
| **User-message formattering (fallback)** | `formatPrompt()` i `promptAssist.ts` | `SECTION_KEYWORDS`, `STYLE_KEYWORDS` | `useCreateChat.ts` (bara utan brief) | Fallback — init skickar rå text |
| **Prompt Rewrite hook** | `usePromptRewrite.ts` | `maybeEnhanceInitialPrompt` | `useBuilderPageController.ts` | Hook — konsumerar `promptAssist.ts` builders |
| **Init Brief hook** | `useInitBrief.ts` | `generateDynamicInstructions` | `useBuilderPageController.ts` | Hook — konsumerar `/api/ai/brief` + fallback addendum |

## Princip

```
Core Rules         = oföränderliga produktregler (config/prompt-core/, alltid med)
Directives         = adaptiva promptmoduler (config/prompt-directives/, Level 4 defaults)
dynamic context    = brief-driven runtime-kontext (per request, Level 1-3 via Directive Cascade)
assist/fallback    = degraderad reservväg (brief-miss / non-init)
config/*.json      = editerbar data (domain rules, ai models, env policy)
```

## Skydd

- Vid ändring av `config/domain-rules.json`: kör `server-auto-brief-policy.test.ts`.
- Vid ändring av brief-schema: kontrollera att `buildDynamicContext` konsumerar nya fält.
- Vid ändring av static core: kontrollera att inga duplicerade regler skapas i dynamic context.
