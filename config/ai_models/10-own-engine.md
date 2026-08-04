# Own engine (byggprofiler)

## Profiler, etiketter och Premium (GPT-5.6 Sol)

- **Intern nyckel `premium`** heter **`Premium`** i buildern och kör
  **`gpt-5.6-sol` i alla faser**. Planner och generator kör
  `reasoningEffort: "high"`; båda använder Responses API och `reasoningMode: "pro"`.
  `gpt-5.6-terra` och `gpt-5.6-luna` är valbara per fas i backoffice.
- **Intern nyckel `max`** (i kod och `manifest.json`) är **inte** engelska «Max» i UI. I buildern heter den **`Tänker`** och mappar standard till **`gpt-5.5`** (`buildProfiles.defaults.max`).
- **`codex`** är en **egen** byggprofil (standardmodell `gpt-5.3-codex` enligt manifest — samma modell-id som `pro`, men med codex-tirets högre reasoning-effort i fasrouting). Inte samma som `max` (GPT-5.5). Vardagsläge för stark resonemangsmodell är `max` / GPT-5.5.
- **`thinking` i SSE:** [`src/lib/gen/engine.ts`](../../src/lib/gen/engine.ts) skickar fasens `reasoningEffort` och valfria `reasoningMode` när thinking är på. GPT-5.6 väljer uttryckligen AI SDK:s Responses-provider, eftersom `reasoningMode` inte är en Chat Completions-kontroll.

## Flöde

1. Användaren väljer **byggprofil** (`premium`, `pro`, `max`, `codex`, `anthropic`) i UI. Äldre `fast` normaliseras till `premium` vid inputgränsen.
2. `canonicalModelIdToOwnModelId` i [`src/lib/models/catalog.ts`](../../src/lib/models/catalog.ts) mappar profilen till en **konkret modellsträng** (t.ex. `gpt-5.5` eller `claude-opus-4.8`).
3. [`src/lib/gen/engine.ts`](../../src/lib/gen/engine.ts) anropar `streamText` med modellen från [`getOpenAIModel`](../../src/lib/gen/models.ts) (namnet är historiskt — även Anthropic går här).

## Standardmodeller och env

Standardvärden per profil kommer från **`manifest.json` → `buildProfiles.defaults`**.  
Env-nycklar finns i **`buildProfiles.envKeys`** (samma som tidigare `SAJTMASKIN_MODEL_*`).

## Anthropic: `x.y` i kod → `x-y` mot API

- Intern ID är `claude-opus-4.8` (Sonnet 4.6 pensionerad 2026-06-28 → aliasas till Opus via `aliasRetiredModelId` i `catalog.ts`).
- [`getOpenAIModel`](../../src/lib/gen/models.ts) och [`createDirectModel`](../../src/lib/builder/direct-model.ts) ersätter **sista** `x.y` med `x-y` innan anrop till Anthropic SDK.

För **officiella Claude API-modell-ID** (direkt API, inte gateway), se [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview) — t.ex. `claude-opus-4-8`, `claude-sonnet-4-6`. Själva anropet beskrivs i [Messages API](https://docs.anthropic.com/en/api/messages).

## Tokenbudget

`maxOutputTokens` för huvudgenerering styrs av `SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS` med default/min/max i **`manifest.json` → `tokenBudgets.engineMaxOutputTokens`**.

## Kvalitetsmappning

`qualityToOwnEngineModel` i manifestet speglas till `QUALITY_TO_OPENAI_MODEL` i `catalog.ts` (historiskt namn — gäller own engine, inte bara OpenAI).
