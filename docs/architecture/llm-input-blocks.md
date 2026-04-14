# Own-engine: vad som faktiskt når modellen (Steg 3)

**Senast uppdaterad:** 2026-04-08

Källkod: `src/lib/gen/system-prompt.ts`, `src/lib/gen/orchestrate.ts`, `src/lib/gen/tokens.ts`, generation pipeline (`createOwnEnginePipelineAndGenerationStream` m.fl.).

## Meddelanden till modellen

| Del | Innehåll | Var det byggs |
|-----|-----------|----------------|
| **System (statisk kärna)** | `config/codegen-static-prompt.json` + `config/prompt-static/*.md` via `getStaticCoreFromWorkspace()` | `static-core-loader.ts` |
| **System (dynamisk kontext)** | Request-specifik kontext: intent, BuildSpec/Generation Profile, capability hints, scaffold, route plan, kontrakt, brief, tema, m.m. | `buildDynamicContext()` |
| **Separator** | `SYSTEM_PROMPT_SEPARATOR` mellan statiskt och dynamiskt | `system-prompt.ts` |
| **Användarens senaste tur** | Nuvarande prompt (ev. URL-komprimerad) | API-lager → pipeline `prompt` |
| **Chatthistorik** | Tidigare user/assistant-meddelanden | Hämtas från chat-repo, skickas separat från system |

**Viktigt:** Den råa användartexten ska **inte** dupliceras i systemprompten som en extra "Original request"-sektion — samma innehåll skickas redan som **user**-meddelande.

## Follow-up wrappers på user-turnen

Vid follow-ups skickar hosten inte bara användarens råa text rakt igenom. API-lagret kan först wrappa user-turnen med rubriker från `prompt-wrapper-contract.ts`, t.ex.:

- `## Continuity (from previous generation)`
- `## Existing Project Files (reference)`
- `## Follow-up Editing Mode`
- `## Requested Changes`
- `## Contract Clarification Answer`
- `## User Reply`

Syftet är att hålla edit-/follow-up-flödet deterministiskt utan att blanda in detta i systemprompten. `messageAdapter.ts` känner igen dessa wrappers och tar bort dem i UI-visningen så användaren inte får tillbaka hela transportomslaget som synlig chatttext.

## Budget och pruning (dynamisk kontext)

1. Dynamisk text byggs som `##`-sektioner och splits till **block** (`splitContextIntoBudgetBlocks`).
2. Varje block får **prioritet** via `CONTEXT_BLOCK_PRIORITY_RULES` i `system-prompt.ts` (högre siffra = behålls längre vid tight budget).
3. `buildBudgetedSystemPrompt()` (`tokens.ts`) fyller block i prioritetsordning upp till `BuildSpec.tokenBudgets.systemContextTokens` (heuristik `estimateTokens`, ~3.2 tecken/token).
4. **Obligatoriska** block (`required`) kan trunkeras till minimum i stället för att slängas helt.
5. Resultatet av pruning exponeras som `DynamicContextPruning` på `buildDynamicContext()` och i `GenerationInputPackage.dynamicContextPruning` (prompt-dump `meta.json` + `generation-input-package.json`).
6. Varje dynamiskt block exponeras också strukturerat i `GenerationInputPackage.dynamicContextBlocks` med titel, prioritet, required-flagga, tokenestimat och om blocket faktiskt behölls efter budgetering.

## Capability hints

Capability inference sker i `capability-inference.ts` före systempromptbygget. När prompten tydligt signalerar t.ex. 3D, karusell, motion eller premium visuals byggs ett eget `## Detected Capabilities`-block och injiceras i den dynamiska systemkontexten.

Det blocket är ett **hint-lager** för generatorn:

- det utökar inte användarens råa prompt
- det ersätter inte route plan / contracts / brief
- det ska hjälpa follow-ups att inte feltolkas som små lokala tweaks när den faktiska ändringen är capability-heavy

## Toolkit och shadcn-registry

`## Your Toolkit` i den dynamiska kontexten är inte längre en fristående handskriven shortlist. Blocket byggs i `system-prompt.ts` från den registry-synkade `SHADCN_COMPONENTS`-mappen, men filtreras mot vilka subpaths som faktiskt finns lokalt under `src/components/ui` / `components/ui`.

Det betyder:

- prompten ser en grupperad, budgetvänlig sammanfattning av den **säkra lokala** shadcn-ytan
- import-validator/autofix använder samma registry-map för att känna igen och reparera shadcn-importer
- `## Component References` förblir ett separat lager: 0-5 capability-matchade kodexempel från `data/shadcn-examples/`
- `## Structural References (this variant)` kan, när `SAJTMASKIN_VARIANT_STRUCTURAL_FILES=true`, lägga till budgeterade `layout.tsx`-/`page.tsx`-/`middleware.ts`-utdrag från variantens `sourceTemplateIds` i `template-library.generated.json`

## Teckenfält vs tokenbudget i `BuildSpec`

- **`systemContextTokens` / `scaffoldTokens` / `refsTokens`** styr runtime-budgetar.
- **`systemContextChars` / `scaffoldChars` / `refsChars`** är kompat- och dokumentationsvärden som motsvarar ungefär samma utrymme via `estimateCharsForTokens()` där callsites fortfarande arbetar teckenbaserat (t.ex. scaffold-serialisering).

## Observability

- `data/prompt-dumps/orchestration-dynamic/` — dynamisk kontext + serialiserad `GenerationInputPackage` (inkl. pruning).
- `data/prompt-dumps/own-engine-codegen/` — full `system` som codegen får (statiskt + dynamiskt).
- `prompt_logs` / admin log viewer — bästa effort-logg av originalprompt, formatterad prompt, trunkerad systemprompt och viss request-meta; separat från prompt-dumps.

Dashboardar ska **spegla** dessa artefakter; runtimekoden är source of truth.
