# Översikt: modellbanor i Sajtmaskin

Alla **standardvärden** som går att styra centralt ligger i [`manifest.json`](manifest.json). TypeScript läser filen via [`src/lib/ai-models/load-manifest.ts`](../../src/lib/ai-models/load-manifest.ts).

## Snabbreferens

| Bana | Vad | Typiskt API | Nycklar (se kod) |
|------|-----|-------------|-------------------|
| **Own engine** | Kodgenerering i buildern | AI SDK `streamText` + `@ai-sdk/openai` / `@ai-sdk/anthropic` | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` |
| **Prompt assist** | Förbättra prompt, chat | `streamText` + `createDirectModel` | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` |
| **Autofix** | Eftergenereringsfixar | `streamText` | `OPENAI_API_KEY` |
| **Verifier** | Read-only review efter syntax, styr polish-scope | `generateObject` | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` |
| **Post-generation polish** | Filpolish efter verifier | `generateText` | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` |
| **Embeddings** | Semantisk sök i index | `openai.embeddings.create` | `OPENAI_API_KEY` |
| **Vissa admin/wizard/inspektor** | Analys, JSON | OpenAI **Responses** API | `OPENAI_API_KEY` |
| **Projektanalys** | Gratis kodöversikt | OpenAI Responses API | `OPENAI_API_KEY` |

> **Plattformsberoende:** AI SDK (`ai` npm-paketet) är open-source (MIT) och provideragnostiskt — det är inte Vercel-låst.

Detaljer per fil och exakt `invocation`-fält finns under `workloads[]` i `manifest.json`.

## Genererade användarsajter — preview-placeholders (inte Sajtmaskin `.env`)

För att **genererade** Next-projekt ofta ska kunna byggas/köras utan riktiga Resend, Supabase, Stripe osv. ligger en **dotenv-liknande** fil i samma bibliotek:

- [`40-generated-site-integration-placeholders.env.txt`](40-generated-site-integration-placeholders.env.txt) — kanoniska `KEY=value`-rader (osanna värden).
- [`manifest.json`](manifest.json) → fältet `generatedSiteIntegrationPlaceholders` pekar på filnamnet och länkar till policy i [`../user_degraded_env.txt`](../user_degraded_env.txt).
- TypeScript: [`src/lib/ai-models/load-generated-site-placeholders.ts`](../../src/lib/ai-models/load-generated-site-placeholders.ts) (endast Node — inte i klientbundles).

Detta är **parallellt med** `config/codegen-static-prompt.json` + `prompt-static/*.md`: manifest + vanlig text under `config/`, men här är nyttolasten env-placeholders för slutkundsprojekt, inte systemprompt.

**Tier-2 preview / VM:** Både `startSandboxPreview` (builder) och `generateOwnEngineSiteFromPrompt` (MCP/own-engine) mergar nycklarna från denna fil in i `.env.local` via `buildSandboxEnvLocalContents` i [`src/lib/gen/sandbox-env-local.ts`](../../src/lib/gen/sandbox-env-local.ts). Produktens primära live-preview är i dag `preview_host` / VM; ordet `sandbox` lever kvar i delar av kontraktet och i vissa fallback-/verifieringsspår. **Tier-1 shim** använder inte samma merge. Översikt och lagerordning: [_READ_ME_FIRST.md](_READ_ME_FIRST.md).

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
- [20-prompt-assist.md](20-prompt-assist.md) — `gateway`-benämningen vs faktiska anrop.
- [30-embeddings-and-misc.md](30-embeddings-and-misc.md) — embedding-modeller och övriga routes.
- [40-generated-site-integration-placeholders.env.txt](40-generated-site-integration-placeholders.env.txt) — preview-env för genererade sajter (se även [../user_degraded_env.txt](../user_degraded_env.txt)).
