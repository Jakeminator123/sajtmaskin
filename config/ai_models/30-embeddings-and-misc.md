# Embeddings och övriga AI-routes

## Runtime-embeddings (query → vektor)

Flera moduler anropar `openai.embeddings.create` med **`text-embedding-3-small`** (dimensions 1536 där det behövs) mot färdigberäknade JSON-index:

- Builderns Mallar-katalog: [`src/lib/templates/template-search.ts`](../../src/lib/templates/template-search.ts)
- Runtime-scaffolds: [`src/lib/gen/scaffolds/scaffold-search.ts`](../../src/lib/gen/scaffolds/scaffold-search.ts)

**OBS:** Själva modellsträngen för index-bygge ligger fortfarande i respektive `*-embeddings-core.ts`. Om du byter embedding-modell måste du **bygga om** motsvarande JSON-index.

## OpenAI Responses API (strukturerad text / JSON)

Används bland annat i:

- [`src/app/api/audit/route.ts`](../../src/app/api/audit/route.ts) (primärt Responses med valfritt web search-verktyg)
- [`src/app/api/wizard/enrich/route.ts`](../../src/app/api/wizard/enrich/route.ts), [`competitors/route.ts`](../../src/app/api/wizard/competitors/route.ts)
- [`src/app/api/text/analyze/route.ts`](../../src/app/api/text/analyze/route.ts)

Se `workloads[]` med `invocation: "openai_responses_create"` i manifestet.

## Övrigt

- **Transcription:** [`src/app/api/transcribe/route.ts`](../../src/app/api/transcribe/route.ts)
- **Inspector:** [`src/app/api/inspector-ai-match/route.ts`](../../src/app/api/inspector-ai-match/route.ts) (direkt OpenAI)
- **Presentation:** [`src/app/api/analyze-presentation/route.ts`](../../src/app/api/analyze-presentation/route.ts) (flera modellanrop — se källkod)
