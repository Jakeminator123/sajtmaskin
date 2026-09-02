# Own engine (byggprofiler)

## Profiler, etiketter och stegen Låg / Mellan / Hög

- **En axel, en byggmodell.** Intern nyckel `pro` = **Låg**, `max` = **Mellan**,
  `premium` = **Hög**. Alla tre kör **`gpt-5.6-sol`** som byggmodell
  (`buildProfiles.defaults`). Skillnaden är `phaseRouting.thinkingByTier`:
  generator-effort **medium → high → xhigh**, alltid `reasoningMode: "standard"`.
  `codex` är en **dold** kompatibilitetsprofil som speglar Mellan och syns inte
  i UI. `anthropic` är orörd (Opus 4.8 i alla faser).
- **Sidofaser på 5.6-syskon.** Låg: Terra fixer + deploy-assistant, Luna
  verifier. Mellan/Hög: Sol fixer, Terra verifier. Hög-fixern är
  `thinking: false` men `reasoningEffort: "high"`. Alla OpenAI-verifiers kör
  `thinking: false` / `low` — den tidigare Sol/high-verifierm passade 26 s p50
  med ~90 % reasoning för en ~200-token-dom.
- **`reasoningMode: "pro"` är inte längre default.** Prod `llm_usage`
  28 jul–1 sep 2026 visade att Premiums Responses `reasoning.mode: pro` blåste
  upp fakturerad input ~6× (142k vs 22k p50, ~40 % cache-träff). OpenAI:s
  reasoning-guide säger att pro-läge «aggregates the model work performed» och
  fakturerar allt. Läget finns kvar som val i backoffice, inte som
  `thinkingByTier`-default.
- **2026-08-19 medium-beslutet är ersatt.** Då sänktes bara Låg-generatorn till
  medium medan plannern stod kvar på high och Mellan/Hög körde andra modeller.
  Stegen 2026-09-02 är en enda effort-axel på Sol + billigare syskon på
  sidofaserna. Lagom(codex, medium) hade krympt till ~4–5k content-tokens.
- **`thinking` i SSE:** [`src/lib/gen/engine.ts`](../../src/lib/gen/engine.ts)
  skickar fasens `reasoningEffort`, `reasoningSummary: "detailed"` och valfria
  `reasoningMode` när thinking är på. **Alla** OpenAI-modeller går via
  Responses API — i `@ai-sdk/openai` v3 är default-anropet `openai(id)` samma
  sak som `openai.responses(id)`; den explicita `.responses()`-grenen för
  GPT-5.6 är hängslen för `reasoningMode`.
- **Synligt resonemang:** OpenAI exponerar aldrig rå chain-of-thought.
  `reasoningSummary: "detailed"` beställer modellens omfattande sammanfattning
  (AI SDK: `auto` = kort, `detailed` = rik; mappas 1:1 till Responses
  `reasoning.summary`), som streamas som `reasoning-delta` → SSE-eventet
  `thinking` → chattens Reasoning-ruta (`MessageList.tsx`), samma väg som
  Anthropics riktiga thinking-deltas. Summary-tokens ingår i output-priset.

## Flöde

1. Användaren väljer **byggprofil** i UI (Låg / Mellan / Hög / Anthropic;
   intern nyckel `pro` / `max` / `premium` / `anthropic`). `codex` finns bara
   som dolt kompatibilitetsval. Äldre `fast` normaliseras till `premium`.
2. `canonicalModelIdToOwnModelId` i [`src/lib/models/catalog.ts`](../../src/lib/models/catalog.ts)
   mappar profilen till en **konkret modellsträng** (`gpt-5.6-sol` eller
   `claude-opus-4.8`). Delad Sol-byggmodell reverse-mappar till `max` (Mellan).
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
