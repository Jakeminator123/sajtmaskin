# Prompt assist — provider-namngivning

## Modellsträngar

Prompt assist använder **`provider/model`**-format, t.ex.:

- `openai/gpt-5.5`
- `anthropic/claude-sonnet-4.6`
- `anthropic-direct/claude-opus-4-8` (direktlista med API-format i suffix)

Tillåtna värden kommer från **`manifest.json` → `promptAssist.allowed`** via `getPromptAssistAllowedFromManifest()` i [`src/lib/ai-models/load-manifest.ts`](../../src/lib/ai-models/load-manifest.ts) och konsumeras av [`src/lib/builder/prompt-assist/`](../../src/lib/builder/prompt-assist/). Paritet säkerställs av `manifest-parity.test.ts`.

## Provider-typ: `"openai" | "anthropic"`

`PromptAssistProvider` i `src/lib/builder/prompt-assist/` är `"openai" | "anthropic"`. Tidigare hette OpenAI-grenen `"gateway"` — den etiketten är borttagen ur typen och all runtime-kod sedan Fas 1 världsklass. HTTP-scheman i `/api/ai/brief` och `/api/ai/chat` accepterar fortfarande `"gateway"` i request-body under en övergångsperiod och normaliserar det till `"openai"` server-side.

Anropet går till [`createDirectModel`](../../src/lib/builder/direct-model.ts), som använder **`OPENAI_API_KEY`** för `openai/*` och **`ANTHROPIC_API_KEY`** för `anthropic/*`.

## Standard assist / polish

Defaults och env-nycklar: `promptAssist.defaults` och `promptAssist.envKeys` i manifestet.  
Konsument: [`src/lib/gen/defaults.ts`](../../src/lib/gen/defaults.ts) (`ASSIST_MODEL`, `POLISH_MODEL`) och builder-defaults.

## Tokenbudget

`SAJTMASKIN_ASSIST_MAX_OUTPUT_TOKENS` — se `tokenBudgets.assistMaxOutputTokens` i manifestet.
