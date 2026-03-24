# AI-modeller — hur du konfigurerar Sajtmaskin

Det här biblioteket är tänkt att fungera ungefär som `config/prompt-static/` + `codegen-static-prompt.json`: **innehållet i repot styr beteendet**, så du kan ändra standardmodeller och tokenbudgetar utan att leta genom hela TypeScript-trädet.

## Var börjar jag?

1. **`manifest.json`** — maskinläsbar “single source of truth” för:
   - standard **own-engine**-modell per byggprofil (`fast` … `anthropic`);
   - standard **prompt assist** / **polish** (`openai/…`, `anthropic/…`);
   - **tokenbudgetar** och **route-timeout**-värden (med min/max som i koden);
   - listor över **tillåtna assist-modeller** (måste hålla jämna steg med `src/lib/builder/promptAssist.ts` tills listorna flyttas hit);
   - **`workloads`**: en post per huvudsakligt anropssteg (filvägar, auth-env, API-typ).
   - **`generatedSiteIntegrationPlaceholders`**: pekar på **`40-generated-site-integration-placeholders.env.txt`** — vanlig text i dotenv-stil (som `prompt-static`-fragment men för **genererade användarsajters** preview-byggen, inte Sajtmaskin-appens `.env`). Läs med `src/lib/ai-models/load-generated-site-placeholders.ts` (endast Node). Policy: `config/user_degraded_env.txt`.
2. **`00-overview.md`**, **`10-own-engine.md`**, **`20-prompt-assist.md`**, **`30-embeddings-and-misc.md`** — förklaringar och tabeller för människor.
3. **`manifest.schema.json`** — JSON Schema för validering (t.ex. i editor eller CI).

### Handoff till annan agent / refaktor

- **Nav:** håll `config/ai_models/manifest.json` som nav när **provider → env-nycklar** flyttas eller struktureras om ur `PROVIDER_RULES` i `src/lib/gen/pre-generation-contracts.ts`. Använd manifest + `generatedSiteIntegrationPlaceholders` (och vid behov en **generator** som läser `workloads` + den blocken) så ni inte får en **tredje osynkad lista** bredvid kod och JSON.
- **Idag:** `PROVIDER_RULES` är fortfarande källan för kontraktsfrågor i genereringen; manifestet beskriver workloads och pekar in placeholder-filen för överblick och framtida inkoppling.
- **OBS (medvetet):** Sajtmaskin **injicerar ännu inte automatiskt** dessa placeholder-värden i preview eller sandbox. Repot har ett stabilt kontrakt (`generatedSiteIntegrationPlaceholders` + `40-generated-site-integration-placeholders.env.txt`) och Node-API:t `readGeneratedSitePlaceholdersEnvText()` i `src/lib/ai-models/load-generated-site-placeholders.ts`. **Nästa steg** när ni vill: koppla t.ex. sandbox-start, MCP eller annat byggsteg till den läsaren så genererade Next-appar kan få `.env.local`-merge utan manuella kopior.

## Viktiga regler

- **Dokumentation om modeller och prompts:** Länkar under `manifest.docLinks` med `appliesTo: "direct_provider_api"` avser **direktanrop** till OpenAI respektive Anthropic (samma tänk som officiella SDK:er mot standard endpoint). De beskriver **inte** trafik som routas via **Vercel AI Gateway** — för det, se poster märkta `vercel_ai_gateway`. Läs även `documentationDirectApiNote` i `manifest.json` och [00-overview.md](00-overview.md).
- **Miljövariabler vinner alltid** över värden i `manifest.json`. Se `src/lib/gen/defaults.ts` och `src/lib/models/catalog.ts`.
- När du ändrar **tillåtna assist-modeller** i manifestet måste du uppdatera **`GATEWAY_ASSIST_MODELS`**, **`ANTHROPIC_ASSIST_MODELS`** och **`V0_ASSIST_MODELS`** i `promptAssist.ts` (eller refaktorera så listorna importeras från JSON). **`src/lib/ai-models/manifest-parity.test.ts`** varnar om de divergerar.
- Efter ändring: kör `pnpm test` (minst manifest-parity + befintliga modelltester).

## Anthropic-modell-ID:n (punkt vs bindestreck)

I UI och interna strängar används ofta formen `claude-sonnet-4.6`. Anthropic API förväntar sig i praktiken **`4-6`** i slutet av modellnamnet. Koden normaliserar med regex (`(\d+)\.(\d+)$` → `$1-$2`) i `src/lib/gen/models.ts` och `src/lib/builder/gateway-policy.ts`. Se `10-own-engine.md`.
