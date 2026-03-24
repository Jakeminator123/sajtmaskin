# Embeddings och övriga AI-routes

## Runtime-embeddings (query → vektor)

Flera moduler anropar `openai.embeddings.create` med **`text-embedding-3-small`** (dimensions 1536 där det behövs) mot färdigberäknade JSON-index:

- Dokumentsnippet: [`src/lib/gen/context/semantic-search.ts`](../../src/lib/gen/context/semantic-search.ts) + [`docs-embeddings-core.ts`](../../src/lib/gen/data/docs-embeddings-core.ts)
- Mallar, scaffold, template library: se `embeddingModels` i [`manifest.json`](manifest.json)

**OBS:** Själva modellsträngen för index-bygge ligger fortfarande i respektive `*-embeddings-core.ts`. Om du byter embedding-modell måste du **bygga om** motsvarande JSON-index.

## OpenAI Responses API (strukturerad text / JSON)

Används bland annat i:

- [`src/app/api/audit/route.ts`](../../src/app/api/audit/route.ts) (primärt Responses med valfritt web search-verktyg)
- [`src/app/api/wizard/enrich/route.ts`](../../src/app/api/wizard/enrich/route.ts), [`competitors/route.ts`](../../src/app/api/wizard/competitors/route.ts)
- [`src/app/api/text/analyze/route.ts`](../../src/app/api/text/analyze/route.ts) (direkt eller via Gateway)

Se `workloads[]` med `invocation: "openai_responses_create"` i manifestet.

## Vercel AI Gateway (OpenAI-kompatibel bas-URL)

Routes som sätter `baseURL: "https://ai-gateway.vercel.sh/v1"` använder **gateway** som transport, ofta med modell-ID i formen `openai/<model>`. Exempel:

- [`src/app/api/projects/[id]/analyze/route.ts`](../../src/app/api/projects/[id]/analyze/route.ts)

Nycklar: `AI_GATEWAY_API_KEY` eller `VERCEL_OIDC_TOKEN` (se respektive route).

## Övrigt

- **Transcription:** [`src/app/api/transcribe/route.ts`](../../src/app/api/transcribe/route.ts)
- **Inspector:** [`src/app/api/inspector-ai-match/route.ts`](../../src/app/api/inspector-ai-match/route.ts) (Gateway eller direkt OpenAI)
- **Presentation:** [`src/app/api/analyze-presentation/route.ts`](../../src/app/api/analyze-presentation/route.ts) (flera modellanrop — se källkod)
