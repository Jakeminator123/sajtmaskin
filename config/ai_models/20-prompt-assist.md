# Prompt assist — provider-namngivning

## Modellsträngar

Prompt assist använder **`provider/model`**-format, t.ex.:

- `openai/gpt-5.6-sol` (default)
- `openai/gpt-5.6-terra`
- `openai/gpt-5.6-luna`
- `anthropic/claude-opus-4.8`
- `anthropic-direct/claude-opus-4-8` (direktlista med API-format i suffix)

Tillåtna värden kommer från **`manifest.json` → `promptAssist.allowed`** via `getPromptAssistAllowedFromManifest()` i [`src/lib/ai-models/load-manifest.ts`](../../src/lib/ai-models/load-manifest.ts) och konsumeras av [`src/lib/builder/prompt-assist/`](../../src/lib/builder/prompt-assist/). Paritet säkerställs av `manifest-parity.test.ts`.

## Provider-typ: `"openai" | "anthropic"`

`PromptAssistProvider` i `src/lib/builder/prompt-assist/` är `"openai" | "anthropic"`. Tidigare hette OpenAI-grenen `"gateway"` — den etiketten är borttagen ur typen och all runtime-kod sedan Fas 1 världsklass. HTTP-schemat i `/api/ai/brief` accepterar fortfarande `"gateway"` i request-body under en övergångsperiod och normaliserar det till `"openai"` server-side.

Anropet går till [`createDirectModel`](../../src/lib/builder/direct-model.ts), som använder **`OPENAI_API_KEY`** för `openai/*` och **`ANTHROPIC_API_KEY`** för `anthropic/*`. GPT-5.6 väljer AI SDK:s Responses-provider uttryckligen.

## Standard assist

Defaults och env-nycklar: `promptAssist.defaults` och `promptAssist.envKeys` i manifestet.  
Konsument: [`src/lib/gen/defaults.ts`](../../src/lib/gen/defaults.ts) (`ASSIST_MODEL`) och builder-defaults. Assist-modellen är en hint till brief-lanen, inte en egen rewrite-agent.

## Deep Brief och auto-brief

Klientens `/api/ai/brief` använder den globala `briefing.defaults.requestModel`.
Serverns auto-brief vid init och `clear-redesign` använder däremot
`perTierBriefing.<vald byggprofil>.briefingModel`. Prioritet:

1. explicit `promptAssistModel` i requesten,
2. vald providers `SAJTMASKIN_AUTO_BRIEF_MODEL_*`,
3. byggprofilens `perTierBriefing`,
4. global `briefing.defaults.serverAutoOpenAI` som compatibility-fallback.

## Tokenbudget

`SAJTMASKIN_ASSIST_MAX_OUTPUT_TOKENS` — se `tokenBudgets.assistMaxOutputTokens` i manifestet.
