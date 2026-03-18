# Own Engine + Builder AI Stack Audit (2026-03-18)

Detta dokument sammanfattar nulaget for AI-arkitekturen i Sajtmaskin med fokus pa:

- `own-engine` (default runtime lane)
- v0 Platform API fallback
- Builder/UI-koppling
- `AI Gateway` + `AI SDK`
- tokenkostnad och modellval

---

## 1) Kort svar pa dina huvudfragor

### Ar `Builder`-mappen samma sak som UI:et?

Ja, i praktiken ar `src/app/builder/` startskalet for Builder-ytan, men den faktiska UI:n ar utspridd:

- Route/page shell: `src/app/builder/`
- Huvudkomponenter for Builder-UI: `src/components/builder/`
- Hookar/state/orkestrering: `src/lib/hooks/chat/`, `src/lib/builder/`, `src/app/builder/useBuilderPageController.ts`

Om du sager "UI:et" i detta projekt syftar det oftast pa hela denna yta, inte bara `src/app/builder/`.

### Ar AI Gateway bara en lista med modeller?

Nej. I projektet och i Vercel-dokumentationen ar AI Gateway en routing- och kontrollnivaa:

- provider-routing (`order`, `only`)
- model-fallbacks (`models`)
- auth via `AI_GATEWAY_API_KEY` eller Vercel OIDC
- metadata om routing/attempts/cost
- model discovery + pricing via API (`getAvailableModels`, `/v1/models/.../endpoints`)

---

## 2) Hur systemet fungerar idag (faktisk implementation)

## 2.1 Runtime generation path

Default path ar `own-engine`:

- Generation via `streamText()` i `src/lib/gen/engine.ts`
- Modellval via `src/lib/models/catalog.ts` + `src/lib/models/selection.ts`
- Build profiles i UI mappar till OpenAI-modeller i own-engine

v0 path ar fallback:

- Fallback-flagga: `V0_FALLBACK_BUILDER`
- Men fallback anvands inte slentrianmassigt i stream-routes, den kraver explicit signal/mappning (`shouldUseExplicitBuilderFallback(meta)`) i stream-flodet.

## 2.2 Builder-profiler och modellmappning

Canonical tiers:

- `fast` -> `gpt-4.1`
- `pro` -> `gpt-5.3-codex`
- `max` -> `gpt-5.4`
- `codex` -> `gpt-5.1-codex-max`

Filer:

- `src/lib/models/catalog.ts`
- `src/lib/builder/defaults.ts`
- `src/lib/models/selection.ts`

## 2.3 Prompt Assist / Brief / Spec (AI Gateway-lagret)

Prompt assist-routes:

- `src/app/api/ai/chat/route.ts`
- `src/app/api/ai/brief/route.ts`
- `src/app/api/ai/spec/route.ts`

Vad de gor:

- Forbehandlar prompt/brief/spec innan huvudgeneration
- Gateway-modeller med fallbacklista och provider-order
- Deep brief ar gateway-only (v0 assist tillats inte for deep brief)

## 2.4 AI SDK-anvandning

Projektet anvander `ai` SDK + providers:

- `ai` (`streamText`, `generateObject`, `gateway`)
- `@ai-sdk/openai`
- `@ai-sdk/anthropic`

I own-engine:

- OpenAI-modeller kor direkt via `OPENAI_API_KEY`
- Claude-modeller i own-engine routas via `gateway("anthropic/...")` i `src/lib/gen/models.ts`

---

## 3) Agenttyper / LLM-roller i arkitekturen

Foljande "agentiska" lager finns i praktiken:

1. Build/generator-agent (own-engine)
   - huvudgenerator med verktyg (`src/lib/gen/agent-tools.ts`)
2. Prompt assist-agent
   - polish/chat-forbattring (`/api/ai/chat`)
3. Deep brief/spec-agent
   - strukturerad spec/brief (`/api/ai/brief`, `/api/ai/spec`, `promptAssistContext.ts`)
4. Plan-mode agent
   - plan artefakter + blockers i stream-routes
5. Autofix/fixer steg
   - post-generation reparationssteg i `src/lib/gen/autofix/*`
6. v0 generation (fallback lane)
   - endast nar fallback lanes ar aktiverade/explicit valda

---

## 4) Tokenkostnader (live, via AI Gateway model endpoint)

Kalla: `https://ai-gateway.vercel.sh/v1/models/{creator}/{model}/endpoints`  
Insamlat: 2026-03-18

Beloppen nedan ar USD per token och omraknat per 1M tokens.

| Model | Input/token | Output/token | Input / 1M | Output / 1M |
|---|---:|---:|---:|---:|
| openai/gpt-5.4 | 0.0000025 | 0.000015 | 2.50 | 15.00 |
| openai/gpt-5.3-codex | 0.00000175 | 0.000014 | 1.75 | 14.00 |
| openai/gpt-5.2 | 0.00000175 | 0.000014 | 1.75 | 14.00 |
| openai/gpt-4.1 | 0.000002 | 0.000008 | 2.00 | 8.00 |
| anthropic/claude-sonnet-4.6 | 0.000003 | 0.000015 | 3.00 | 15.00 |
| anthropic/claude-opus-4.6 | 0.000005 | 0.000025 | 5.00 | 25.00 |

Notera:

- Gateway visar ofta flera providers (openai/azure/bedrock/vertex osv) med samma eller snarlik pricing.
- Latency varierar kraftigt mellan providers, inte bara mellan modeller.

---

## 5) Viktiga observationspunkter for konsolidering

1. Builder-default tier ar `max` (`gpt-5.4`) i katalogen, men own-engine har ocksa en separat `DEFAULT_OWN_MODEL_ID` (`gpt-5.3-codex`).
   - Rekommendation: konsolidera till en tydlig "single source of truth" for default.

2. Prompt assist default ar satt till `openai/gpt-5.4` i UI-defaults.
   - For preprocess-steg ar detta ofta overkill i kostnad/latency.

3. Assist max output tokens ar relativt hogt default (16k).
   - Bra for edge cases, men dyrt utan guardrails.

4. Gateway fallbacklistor finns redan i routes (bra), men kan standardiseras via ett centralt policyobjekt.

---

## 6) Rekommenderad modellstrategi (premium utan token-sloser)

### A) Build (own-engine)

- Default interaktiv byggprofil: `pro` (`gpt-5.3-codex`)
- "Final polish / high-stakes" profil: `max` (`gpt-5.4`)
- Snabba iterationer/enkla edits: `fast` (`gpt-4.1`)
- Behall `codex` for tunga kodfall

Varfor:

- `gpt-5.3-codex` ligger mycket nara flaggskeppsniva for kod men ofta battre total tradeoff i vardagsloop.
- `gpt-5.4` bor vara med, men mer selektivt.

### B) Prompt Assist + Deep Brief

- Standard: `openai/gpt-5.2` eller `openai/gpt-5.3-codex`
- Fallbackkedja exempel:
  - primary: `openai/gpt-5.2`
  - fallback1: `openai/gpt-5.3-codex`
  - fallback2: `anthropic/claude-sonnet-4.6`

Varfor:

- Deep brief/spec behover hog kvalitet, men inte alltid dyraste modellen.
- Mycket bra plats att kapa latency/kostnad utan att forsaka slutkvalitet.

### C) Token guardrails

- Sank `SAJTMASKIN_ASSIST_MAX_OUTPUT_TOKENS` till 8k-12k for normal drift
- Behall hogre cap endast i "thorough mode"
- Logga alltid:
  - input tokens
  - output tokens
  - reasoning tokens (nar tillgangligt)
  - cost per turn

### D) Gateway policy centralisering

Skapa central config for:

- allowed assist models
- fallback order
- provider order
- environment-specific policy (dev/preview/prod)

Sa att samma policy anvands konsekvent i `chat`, `brief`, `spec`.

---

## 7) AI Gateway + AI SDK best-practice checklista

- Anvand `providerOptions.gateway.models` for model-fallbacks
- Anvand `providerOptions.gateway.order` for provider-prioritering
- Hamta levande modellista + pricing med `gateway.getAvailableModels()`
- Pinna modell-ID explicit i produktion
- Kor eval-suite + A/B innan modellbyte
- Definiera tydliga budgetprofiler: `fast`, `standard`, `thorough`

---

## 8) Svar pa "Own Engine vs v0 Platform API"

Praktiskt i projektet:

- Own engine ar den primara generationmotorn (egen runtime lane).
- v0 Platform API finns kvar som fallback/integration lane.
- Buildern abstraherar detta via samma UI-profiler, men route/meta avgor faktisk lane.

Detta ar en bra arkitektur for konsolidering:

- behall en enhetlig UI
- centralisera modellpolicy
- minimera specialfall i routes
- aktivera v0 lane endast nar det faktiskt behovs

---

## 9) Konkreta nasta steg (foreslagen implementation)

1. Konsolidera default-modellkalla (en enda canonical default)
2. Satt `pro` som default i Builder for daglig generation
3. Flytta assist-default till `gpt-5.2` eller `gpt-5.3-codex`
4. Centralisera Gateway policy (models/order/allowlist)
5. Satt tydliga tokenbudgetar per steg
6. Visa "forvantad kostnad per generation" i Builder (enkel estimator)
7. Kor eval-suite for att validera kvalitetsgolv efter varje andring

