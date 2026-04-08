# Own-engine: vad som faktiskt når modellen (Steg 3)

**Senast uppdaterad:** 2026-04-08

Källkod: `src/lib/gen/system-prompt.ts`, `src/lib/gen/orchestrate.ts`, `src/lib/gen/tokens.ts`, generation pipeline (`createOwnEnginePipelineAndGenerationStream` m.fl.).

## Meddelanden till modellen

| Del | Innehåll | Var det byggs |
|-----|-----------|----------------|
| **System (statisk kärna)** | `config/codegen-static-prompt.json` + `config/prompt-static/*.md` via `getStaticCoreFromWorkspace()` | `static-core-loader.ts` |
| **System (dynamisk kontext)** | Request-specifik kontext: intent, BuildSpec/Generation Profile, scaffold + capability hints, route plan, kontrakt, brief, tema, m.m. | `buildDynamicContext()` |
| **Separator** | `SYSTEM_PROMPT_SEPARATOR` mellan statiskt och dynamiskt | `system-prompt.ts` |
| **Användarens senaste tur** | Nuvarande prompt (ev. URL-komprimerad) | API-lager → pipeline `prompt` |
| **Chatthistorik** | Tidigare user/assistant-meddelanden | Hämtas från chat-repo, skickas separat från system |

**Viktigt:** Den råa användartexten ska **inte** dupliceras i systemprompten som en extra "Original request"-sektion — samma innehåll skickas redan som **user**-meddelande.

## Budget och pruning (dynamisk kontext)

1. Dynamisk text byggs som `##`-sektioner och splits till **block** (`splitContextIntoBudgetBlocks`).
2. Varje block får **prioritet** via `CONTEXT_BLOCK_PRIORITY_RULES` i `system-prompt.ts` (högre siffra = behålls längre vid tight budget).
3. `buildBudgetedSystemPrompt()` (`tokens.ts`) fyller block i prioritetsordning upp till `BuildSpec.tokenBudgets.systemContextTokens` (heuristik `estimateTokens`, ~3.2 tecken/token).
4. **Obligatoriska** block (`required`) kan trunkeras till minimum i stället för att slängas helt.
5. Resultatet av pruning exponeras som `DynamicContextPruning` på `buildDynamicContext()` och i `GenerationInputPackage.dynamicContextPruning` (prompt-dump `meta.json` + `generation-input-package.json`).
6. Varje dynamiskt block exponeras också strukturerat i `GenerationInputPackage.dynamicContextBlocks` med titel, prioritet, required-flagga, tokenestimat och om blocket faktiskt behölls efter budgetering.

## Teckenfält vs tokenbudget i `BuildSpec`

- **`systemContextTokens` / `scaffoldTokens` / `refsTokens`** styr runtime-budgetar.
- **`systemContextChars` / `scaffoldChars` / `refsChars`** är kompat- och dokumentationsvärden som motsvarar ungefär samma utrymme via `estimateCharsForTokens()` där callsites fortfarande arbetar teckenbaserat (t.ex. scaffold-serialisering).

## Observability

- `data/prompt-dumps/orchestration-dynamic/` — dynamisk kontext + serialiserad `GenerationInputPackage` (inkl. pruning).
- `data/prompt-dumps/own-engine-codegen/` — full `system` som codegen får (statiskt + dynamiskt).

Dashboardar ska **spegla** dessa artefakter; runtimekoden är source of truth.
