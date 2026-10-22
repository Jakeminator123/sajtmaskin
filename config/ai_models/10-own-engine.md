# Own engine (byggprofiler)

## Profiler, etiketter och stegen Låg / Mellan / Hög / Extra hög

- **En axel, en byggmodell.** Intern nyckel `pro` = **Låg**, `max` = **Mellan**
  (standard), `premium` = **Hög**. Alla tre kör **`gpt-6.1-sol`** som byggmodell
  (`buildProfiles.defaults`). Skillnaden är `phaseRouting.thinkingByTier`:
  generator-effort **medium → high → xhigh**, alltid `reasoningMode: "standard"`.
  `ultra` = **Extra hög** bygger med **`gpt-6-astra`** på `high`; dess fixer,
  verifier och deploy-assistant kör Sol. `codex` är en **dold**
  kompatibilitetsprofil som speglar Mellan. `anthropic` (Opus 4.8 i alla faser)
  finns kvar i routningen men är dold i reglaget; sparade chattar på dolda
  nivåer öppnas på standardnivån.
- **Sidofaser (sedan 2026-10-17).** GPT-6.1 Sol tar fixer, deploy-assistant
  och verifiern på alla OpenAI-nivåer (Låg-verifiern gick från `gpt-6-luna`
  till Sol 2026-10-18). Det finns ingen
  GPT-6 Terra, och Sol har lägre outputpris än GPT-5.6 Terra. Hög-fixern är
  `thinking: false` men `reasoningEffort: "high"`. Alla OpenAI-verifiers kör
  `thinking: false` / `low` — den tidigare Sol/high-verifierm passade 26 s p50
  med ~90 % reasoning för en ~200-token-dom.
- **Effort per modell.** GPT-6.1 Sol (och Astra) saknar `none`; GPT-6 Luna och
  GPT-5.6 har det. [`openai-capabilities.ts`](../../src/lib/models/openai-capabilities.ts)
  klampar varje begärd effort till modellens intervall, och avstängt
  resonemang betyder modellens lägsta nivå (`low` på Sol, `none` på Luna) i
  stället för OpenAI:s tysta `medium`.
- **`reasoningMode: "pro"` är inte längre default.** Prod `llm_usage`
  28 jul–1 sep 2026 visade att Premiums Responses `reasoning.mode: pro` blåste
  upp fakturerad input ~6× (142k vs 22k p50, ~40 % cache-träff). OpenAI:s
  reasoning-guide säger att pro-läge «aggregates the model work performed» och
  fakturerar allt. Läget finns kvar som val i backoffice, inte som
  `thinkingByTier`-default.
- **2026-08-19 medium-beslutet är ersatt.** Då sänktes bara Låg-generatorn till
  medium medan plannern stod kvar på high och Mellan/Hög körde andra modeller.
  Stegen 2026-09-02 är en enda effort-axel på Sol; sidofaserna ändrades
  2026-10-17 (se ovan). Lagom(codex, medium) hade krympt till ~4–5k content-tokens.
- **`thinking` i SSE:** [`src/lib/gen/engine.ts`](../../src/lib/gen/engine.ts)
  skickar fasens `reasoningEffort`, `reasoningSummary: "detailed"` och valfria
  `reasoningMode` när thinking är på, och modellens lägsta effort när det är
  av. **Alla** OpenAI-modeller går via Responses API — i `@ai-sdk/openai` v3
  är default-anropet `openai(id)` samma sak som `openai.responses(id)`; den
  explicita `.responses()`-grenen för registrerade GPT-6/GPT-5.6-modeller
  låser det för verktygsanrop och `reasoningMode`.
- **Synligt resonemang:** OpenAI exponerar aldrig rå chain-of-thought.
  `reasoningSummary: "detailed"` beställer modellens omfattande sammanfattning
  (AI SDK: `auto` = kort, `detailed` = rik; mappas 1:1 till Responses
  `reasoning.summary`), som streamas som `reasoning-delta` → SSE-eventet
  `thinking` → chattens Reasoning-ruta (`MessageList.tsx`), samma väg som
  Anthropics riktiga thinking-deltas. Summary-tokens ingår i output-priset.

## Flöde

1. Användaren väljer **byggprofil** i UI (Låg / Mellan / Hög / Extra hög;
   intern nyckel `pro` / `max` / `premium` / `ultra`). `codex` och `anthropic`
   finns bara som dolda val. Äldre `fast` normaliseras till `premium`.
2. `canonicalModelIdToOwnModelId` i [`src/lib/models/catalog.ts`](../../src/lib/models/catalog.ts)
   mappar profilen till en **konkret modellsträng** (`gpt-6.1-sol` eller
   `claude-opus-4.8`). Delad Sol-byggmodell reverse-mappar till `max` (Mellan).
   Det gäller både `gpt-6.1-sol` och `gpt-5.6-sol` i äldre rader; OpenAI-deprecerade
   `gpt-5.3-codex` och `gpt-4.1` aliasas till `gpt-6.1-sol`.
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
