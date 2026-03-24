# Prompt assist och “gateway”-benämningen

## Modellsträngar

Prompt assist använder **`provider/model`**-format, t.ex.:

- `openai/gpt-5.4`
- `anthropic/claude-sonnet-4.6`
- `anthropic-direct/claude-opus-4-6` (direktlista med API-format i suffix)
- `v0-1.5-md` / `v0-1.5-lg` (v0 Model API, OpenAI-kompatibelt)

Tillåtna värden är hårdkodade i [`src/lib/builder/promptAssist.ts`](../../src/lib/builder/promptAssist.ts) **och** dupliceras i **`manifest.json` → `promptAssist.allowed`** för dokumentation och parity-test.

## Varför står det fortfarande “gateway” i koden?

I [`src/app/api/ai/chat/route.ts`](../../src/app/api/ai/chat/route.ts) heter en gren `provider === "gateway"` för **OpenAI-klassade** assist-modeller (`openai/gpt-5.4` etc.). Själva anropet går till [`createDirectModel`](../../src/lib/builder/gateway-policy.ts), som använder **`OPENAI_API_KEY`** för `openai/*` och **`ANTHROPIC_API_KEY`** för `anthropic/*`.

Det finns alltså en **namnmismatch**: grenen kan kräva `AI_GATEWAY_API_KEY` / OIDC i vissa lägen medan själva `createDirectModel`-vägen behöver provider-nycklar. När du felsöker lokalt: kontrollera **`OPENAI_API_KEY`** om du använder `openai/…`-modeller.

## Standard assist / polish

Defaults och env-nycklar: `promptAssist.defaults` och `promptAssist.envKeys` i manifestet.  
Konsument: [`src/lib/gen/defaults.ts`](../../src/lib/gen/defaults.ts) (`ASSIST_MODEL`, `POLISH_MODEL`) och builder-defaults.

## Tokenbudget

`SAJTMASKIN_ASSIST_MAX_OUTPUT_TOKENS` — se `tokenBudgets.assistMaxOutputTokens` i manifestet.
