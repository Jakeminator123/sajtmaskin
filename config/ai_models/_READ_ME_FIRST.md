# AI-modeller — hur du konfigurerar Sajtmaskin

Det här biblioteket är tänkt att fungera ungefär som `config/prompt-static/` + `codegen-static-prompt.json`: **innehållet i repot styr beteendet**, så du kan ändra standardmodeller och tokenbudgetar utan att leta genom hela TypeScript-trädet.

## Var börjar jag?

1. **`manifest.json`** — maskinläsbar “single source of truth” för:
   - standard **own-engine**-modell per byggprofil (`fast` … `anthropic`);
   - standard **prompt assist** / **polish** (`openai/…`, `anthropic/…`);
   - standard **briefing**-modeller för `/api/ai/brief`, server auto-brief och äldre spec-first-hjälpare;
   - **phase routing** för planner / generator / fixer / verifier / deploy-assistant;
   - **phase-specifik thinking / reasoning** via `phaseRouting.thinkingByTier`;
   - **repairPolicies** (deterministiska autofix-pass, maxpass i syntax-fix, manuell repair-route, server verify repair);
   - **promptOrchestration** (hard caps, soft targets och phase-trösklar för första prompten / follow-ups);
   - **postGenerationPasses** (verifier-budgetar och tidsgränser efter syntax);
   - **preGenerationContracts** (provider-regler och fallback-val för databas/auth/betalning/integrationer);
   - **tokenbudgetar** och **route-timeout**-värden (med min/max som i koden);
   - listor över **tillåtna assist-modeller**;
   - **`workloads`**: en post per huvudsakligt anropssteg (filvägar, auth-env, API-typ), inklusive planner/brief/repair där det är relevant.
  - **`generatedSiteIntegrationPlaceholders`**: pekar på **`40-generated-site-integration-placeholders.env.txt`** — vanlig text i dotenv-stil (som `prompt-static`-fragment men för **genererade användarsajters** preview-runtime, inte Sajtmaskin-appens `.env`). Läs med `src/lib/ai-models/load-generated-site-placeholders.ts` (endast Node). När tier-2 preview-session startas via **`startPreviewSession`** mergas innehållet in i `.env.local` av `src/lib/gen/preview/env-local.ts`. Policy: `config/user_degraded_env.txt`.
2. **`00-overview.md`**, **`10-own-engine.md`**, **`20-prompt-assist.md`**, **`30-embeddings-and-misc.md`** — förklaringar och tabeller för människor.
3. **`manifest.schema.json`** — JSON Schema för validering (t.ex. i editor eller CI).

### Handoff till annan agent / refaktor

- **Nav:** håll `config/ai_models/manifest.json` som nav när **provider → env-nycklar** flyttas eller struktureras om ur `PROVIDER_RULES` i `src/lib/gen/pre-generation-contracts.ts`. Använd manifest + `generatedSiteIntegrationPlaceholders` (och vid behov en **generator** som läser `workloads` + den blocken) så ni inte får en **tredje osynkad lista** bredvid kod och JSON.
- **Nu:** provider-regler och fallback-val för pre-generation contracts ligger i manifestet så dashboard + runtime kan läsa samma källa. Själva inferenslogiken (hur de används) ligger fortfarande i `pre-generation-contracts.ts`.
- **Tier-2 preview runtime:** Både `startPreviewSession` (builder) och `generateOwnEngineSiteFromPrompt` (MCP/own-engine) bygger **`.env.local`** med `buildPreviewEnvLocalContents` (`src/lib/gen/preview/env-local.ts`): globala placeholders från `40-…env.txt`, projekt-preview-token, lagrade projekt-env, sist innehåll från genererad `.env.local` om modellen skrev en — **senare lager vinner**. Loader: `readGeneratedSitePlaceholdersEnvText()` i `load-generated-site-placeholders.ts`.
- **Utanför den kedjan:** Tier-1 shim och script som bara läser filen manuellt — **ingen** automatisk merge från denna pipeline.

## Viktiga regler

- **Dokumentation om modeller och prompts:** Länkar under `manifest.docLinks` med `appliesTo: "direct_provider_api"` avser **direktanrop** till OpenAI respektive Anthropic (samma tänk som officiella SDK:er mot standard endpoint). Läs även `documentationDirectApiNote` i `manifest.json` och [00-overview.md](00-overview.md).
- **Miljövariabler vinner alltid** över värden i `manifest.json`. Se `src/lib/gen/defaults.ts` och `src/lib/models/catalog.ts`.
- När du ändrar **tillåtna assist-modeller** i manifestet ska runtime och UI läsa samma källa. `promptAssist.ts` och builder-defaults ska inte bära en separat osynkad allowlist.
- `phaseRouting.defaultByTier` använder sentinel-värdet **`selected_build_model`** för att följa vald byggprofil. Det gör att planner/generator/fixer kan fortsätta följa buildprofilen även om du byter `buildProfiles.defaults.*`.
- `phaseRouting.thinkingByTier` styr om varje fas **får** använda provider-reasoning och vilken `reasoningEffort` som skickas. Planner/generator kräver fortfarande att builderns vanliga thinking-toggle är på; fixer/verifier/server-repair använder fasinställningen direkt.
- `repairPolicies` styr hur aggressivt systemet försöker laga fel efter generering. Höj varsamt: fler pass ger dyrare och långsammare repair-kedjor.
- `promptOrchestration` styr **inte** modellen direkt utan när prompten skickas som-is, komprimeras eller går över till tydligare phase-plan-build-polish-läge.
- `postGenerationPasses` styr **inte** generatorn, utan read-only verifier efter syntaxvalidering.
- `preGenerationContracts.providerRules` beskriver vilka providers och env-nycklar systemet letar efter när det försöker förstå auth/databas/betalning/integrationer från prompten eller briefen.
- `routeTimeouts` ligger i manifestet, men Next.js route-filer kräver fortfarande literalvärden för `maxDuration`. Dashboard-vyn ska därför hålla manifest och route-filer i synk när du sparar timeout-värden därifrån.
- Efter ändring: kör `npm run test` eller `npm run test:ci` (minst manifest-parity + befintliga modelltester).

## Anthropic-modell-ID:n (punkt vs bindestreck)

I UI och interna strängar används ofta formen `claude-sonnet-4.6`. Anthropic API förväntar sig i praktiken **`4-6`** i slutet av modellnamnet. Koden normaliserar med regex (`(\d+)\.(\d+)$` → `$1-$2`) i `src/lib/gen/models.ts` och `src/lib/builder/gateway-policy.ts`. Se `10-own-engine.md`.
