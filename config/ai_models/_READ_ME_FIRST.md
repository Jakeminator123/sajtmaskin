# AI-modeller — hur du konfigurerar Sajtmaskin

Det här biblioteket är tänkt att fungera ungefär som `config/prompt-static/` + `codegen-static-prompt.json`: **innehållet i repot styr beteendet**, så du kan ändra standardmodeller och tokenbudgetar utan att leta genom hela TypeScript-trädet.

## Var börjar jag?

1. **`manifest.json`** — maskinläsbar “single source of truth” för:
   - standard **own-engine**-modell per byggprofil (`fast` … `anthropic`);
   - standard **prompt assist** / **polish** (`openai/…`, `anthropic/…`);
   - **tokenbudgetar** och **route-timeout**-värden (med min/max som i koden);
   - listor över **tillåtna assist-modeller** (måste hålla jämna steg med `src/lib/builder/promptAssist.ts` tills listorna flyttas hit);
   - **`workloads`**: en post per huvudsakligt anropssteg (filvägar, auth-env, API-typ).
2. **`00-overview.md`**, **`10-own-engine.md`**, **`20-prompt-assist.md`**, **`30-embeddings-and-misc.md`** — förklaringar och tabeller för människor.
3. **`manifest.schema.json`** — JSON Schema för validering (t.ex. i editor eller CI).

## Viktiga regler

- **Dokumentation om modeller och prompts:** Länkar under `manifest.docLinks` med `appliesTo: "direct_provider_api"` avser **direktanrop** till OpenAI respektive Anthropic (samma tänk som officiella SDK:er mot standard endpoint). De beskriver **inte** trafik som routas via **Vercel AI Gateway** — för det, se poster märkta `vercel_ai_gateway`. Läs även `documentationDirectApiNote` i `manifest.json` och [00-overview.md](00-overview.md).
- **Miljövariabler vinner alltid** över värden i `manifest.json`. Se `src/lib/gen/defaults.ts` och `src/lib/models/catalog.ts`.
- När du ändrar **tillåtna assist-modeller** i manifestet måste du uppdatera **`GATEWAY_ASSIST_MODELS`**, **`ANTHROPIC_ASSIST_MODELS`** och **`V0_ASSIST_MODELS`** i `promptAssist.ts` (eller refaktorera så listorna importeras från JSON). **`src/lib/ai-models/manifest-parity.test.ts`** varnar om de divergerar.
- Efter ändring: kör `pnpm test` (minst manifest-parity + befintliga modelltester).

## Anthropic-modell-ID:n (punkt vs bindestreck)

I UI och interna strängar används ofta formen `claude-sonnet-4.6`. Anthropic API förväntar sig i praktiken **`4-6`** i slutet av modellnamnet. Koden normaliserar med regex (`(\d+)\.(\d+)$` → `$1-$2`) i `src/lib/gen/models.ts` och `src/lib/builder/gateway-policy.ts`. Se `10-own-engine.md`.
