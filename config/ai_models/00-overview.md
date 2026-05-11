# Översikt: modellbanor i Sajtmaskin

Alla **standardvärden** som går att styra centralt ligger i [`manifest.json`](manifest.json). TypeScript läser filen via [`src/lib/ai-models/load-manifest.ts`](../../src/lib/ai-models/load-manifest.ts).

## Snabbreferens

| Bana | Vad | Typiskt API | Nycklar (se kod) |
|------|-----|-------------|-------------------|
| **Own engine** | Kodgenerering i buildern | AI SDK `streamText` + `@ai-sdk/openai` / `@ai-sdk/anthropic` | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` |
| **Prompt assist** | Förbättra prompt, chat | `streamText` + `createDirectModel` | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` |
| **Autofix** | Eftergenereringsfixar | `streamText` | `OPENAI_API_KEY` |
| **Verifier** | Read-only review efter syntax, returnerar blocking/quality-fynd | `generateObject` | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` |
| **Embeddings** | Semantisk sök i scaffold- och Mallar-index | `openai.embeddings.create` | `OPENAI_API_KEY` |
| **Vissa admin/wizard/inspektor** | Analys, JSON | OpenAI **Responses** API | `OPENAI_API_KEY` |
| **Projektanalys** | Gratis kodöversikt | OpenAI Responses API | `OPENAI_API_KEY` |

> **Plattformsberoende:** AI SDK (`ai` npm-paketet) är open-source (MIT) och provideragnostiskt — det är inte Vercel-låst.

Detaljer per fil och exakt `invocation`-fält finns under `workloads[]` i `manifest.json`.

## Genererade användarsajter — preview-placeholders (inte Sajtmaskin `.env`)

För att **genererade** Next-projekt ofta ska kunna byggas/köras utan riktiga Resend, Supabase, Stripe osv. ligger **två dotenv-liknande filer** i samma bibliotek (split sedan 2026-04):

- [`40-harmless-placeholders.env.txt`](40-harmless-placeholders.env.txt) — `KEY=value`-rader som är **säkra även i F3** (test/publishable-keys, AUTH_SECRET, GA-id, search-only API-keys, m.m.).
- [`41-tier3-stub-placeholders.env.txt`](41-tier3-stub-placeholders.env.txt) — F2-stubbar (Stripe-secret, Supabase-URL, Clerk-secret, Redis URL, OpenAI, …) som **strippas helt i F3-merge** och kräver riktiga värden via `validateTier3Readiness`.
- Per-key-klassificering: [`src/lib/integrations/placeholder-harmless.ts`](../../src/lib/integrations/placeholder-harmless.ts).
- [`manifest.json`](manifest.json) → fältet `generatedSiteIntegrationPlaceholders` pekar på båda filnamnen (`harmlessEnvFragmentFile`, `tier3StubEnvFragmentFile`) och länkar till policy i [`../user_degraded_env.txt`](../user_degraded_env.txt).
- TypeScript: [`src/lib/ai-models/load-generated-site-placeholders.ts`](../../src/lib/ai-models/load-generated-site-placeholders.ts) (endast Node — inte i klientbundles).

Detta är **parallellt med** `config/codegen-core-manifest.json` + `prompt-core/*.md`: manifest + vanlig text under `config/`, men här är nyttolasten env-placeholders för slutkundsprojekt, inte systemprompt.

**Tier-2 preview / VM:** Både `startPreviewSession` (builder) och `generateOwnEngineSiteFromPrompt` (MCP/own-engine) mergar nycklarna in i `.env.local` via `buildPreviewEnvLocalContents` i [`src/lib/gen/preview/env-local.ts`](../../src/lib/gen/preview/env-local.ts). Merge-ordning: `harmless → tier3-stub → project-preview → user → generated` (senare lager vinner). I F3 (`lifecycleStage: "integrations"`) hoppas tier-3-stub-laget över helt. Produktens primära live-preview är i dag `preview_host` / VM; ordet `sandbox` lever fortfarande kvar som legacy i vissa kontrakt och interna namn. **Tier-1 shim** använder inte samma merge. Översikt och lagerordning: [_READ_ME_FIRST.md](_READ_ME_FIRST.md).

## Direkt provider-API vs SDK (viktigt)

Fältet **`manifest.documentationDirectApiNote`** och varje post i **`manifest.docLinks[].appliesTo`** skiljer:

- **`direct_provider_api`** — officiell OpenAI- eller Anthropic-dokumentation för anrop mot leverantörens **egna** API:er (t.ex. `OPENAI_API_KEY` mot OpenAI, `ANTHROPIC_API_KEY` mot Claude API).
- **`sdk_or_tooling`** — AI SDK m.m. (open-source MIT-bibliotek ovanpå provider-API:er; publiceras av Vercel men är provideragnostiskt).

Primära direkt-API-länkar (canonical listan ligger i `manifest.json`):

- [OpenAI — Models](https://developers.openai.com/api/docs/models) (`direct_provider_api`)
- [OpenAI — Prompt guidance (GPT-5.4)](https://developers.openai.com/api/docs/guides/prompt-guidance) (`direct_provider_api`)
- [OpenAI — Responses API reference](https://platform.openai.com/docs/api-reference/responses) (`direct_provider_api`)
- [OpenAI — Embeddings](https://platform.openai.com/docs/api-reference/embeddings/create) (`direct_provider_api`)
- [Anthropic — Models overview (Claude API ID:n)](https://platform.claude.com/docs/en/about-claude/models/overview) (`direct_provider_api`)
- [Anthropic — Messages API](https://docs.anthropic.com/en/api/messages) (`direct_provider_api`)
- [AI SDK — streamText](https://sdk.vercel.ai/docs/reference/ai-sdk-core/stream-text) (`sdk_or_tooling`, open-source MIT)

## Mer läsning

- [10-own-engine.md](10-own-engine.md) — byggprofiler och `claude-*`-normalisering.
- [20-prompt-assist.md](20-prompt-assist.md) — provider-namngivning (`"openai" | "anthropic"`).
- [30-embeddings-and-misc.md](30-embeddings-and-misc.md) — embedding-modeller och övriga routes.
- [40-harmless-placeholders.env.txt](40-harmless-placeholders.env.txt) + [41-tier3-stub-placeholders.env.txt](41-tier3-stub-placeholders.env.txt) — preview-env för genererade sajter (se även [../user_degraded_env.txt](../user_degraded_env.txt)).
