# Briefing — Deep Brief och modellrutt

> **Namnkarta.** Den här filen handlar om **Briefing**-lagret före
> kodgeneratorn, i synnerhet **Deep Brief**: LLM-steget som expanderar fritext
> till `siteBriefSchema` före orkestrering (`/api/ai/brief`). Manifestnyckeln
> är `briefing`. `assist` och `requestModel` är två fält — inte dubbletter.
>
> Det här är **inte** knappen **Prompt-assist** bredvid Plan i chattinputen. Den
> rättar bara användarens utkast före sändning och har egen workload
> (`prompt_rewrite`) och egen env (`SAJTMASKIN_PROMPT_REWRITE_MODEL`).

## Modellsträngar

Deep Brief använder **`provider/model`**-format, t.ex.:

- `openai/gpt-5.6-sol` (default)
- `openai/gpt-5.6-terra`
- `openai/gpt-5.6-luna`
- `anthropic-direct/claude-opus-4-8` (direktlista med API-format i suffix)

Tillåtna värden kommer från **`manifest.json` → `briefing.allowed`** via `getPromptAssistAllowedFromManifest()` i [`src/lib/ai-models/load-manifest.ts`](../../src/lib/ai-models/load-manifest.ts) och konsumeras av [`src/lib/builder/prompt-assist/`](../../src/lib/builder/prompt-assist/). Funktionsnamnet är legacy. Paritet säkerställs av `manifest-parity.test.ts`.

## Provider-typ: `"openai" | "anthropic"`

`PromptAssistProvider` i `src/lib/builder/prompt-assist/` är `"openai" | "anthropic"`. Tidigare hette OpenAI-grenen `"gateway"` — den etiketten är borttagen ur typen och all runtime-kod sedan Fas 1 världsklass. HTTP-schemat i `/api/ai/brief` accepterar fortfarande `"gateway"` i request-body under en övergångsperiod och normaliserar det till `"openai"` server-side.

Anropet går till [`createDirectModel`](../../src/lib/builder/direct-model.ts), som använder **`OPENAI_API_KEY`** för `openai/*` och **`ANTHROPIC_API_KEY`** för `anthropic/*`. GPT-5.6 väljer AI SDK:s Responses-provider uttryckligen.

## Standard assist och requestModel

Defaults och env-nycklar: `briefing.defaults` och `briefing.envKeys` i manifestet.

- `assist` / `SAJTMASKIN_ASSIST_MODEL` — klientens valbara Deep Brief-modell (default för wire-fältet `promptAssistModel`).
- `requestModel` / `SAJTMASKIN_BRIEF_MODEL` — serverns default för `/api/ai/brief` när anroparen inte skickar någon.

De är inte dubbletter även när båda pekar på samma modell-id. Konsument: [`src/lib/gen/defaults.ts`](../../src/lib/gen/defaults.ts) (`ASSIST_MODEL`, `BRIEF_MODEL`) och builder-defaults.

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
