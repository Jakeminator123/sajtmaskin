# Plan 09: Embedding-baserad docs-sökning

> Prioritet: HÖGST — förbättrar kodkvalitet direkt via smartare kontext
> Beroenden: Plan 05 (knowledge-base.ts, docs-snippets.ts)
> Insats: 2-3 dagar

## Problemet

`knowledge-base.ts` använder keyword-matchning. "Jag vill ha en överblick av mina kunder" hittar inte dashboard-snippets. v0 använder embedding-baserad sökning.

## Befintlig infrastruktur

Projektet har redan embedding-stöd för templates:
- `src/lib/templates/template-embeddings-core.ts` — `text-embedding-3-small`, 1536 dimensioner
- `src/lib/templates/template-search.ts` — cosine similarity, in-memory cache, OpenAI API
- `scripts/generate-template-embeddings.ts` — offline-generering av embeddings-JSON

## Nya filer

### `src/lib/gen/data/docs-embeddings.json`

Pre-beräknade embeddings för alla 50 docs-snippets. Genereras offline via script. Format:
```json
{
  "_meta": { "model": "text-embedding-3-small", "dimensions": 256, "generated": "...", "count": 50 },
  "embeddings": [{ "id": "shadcn-form", "embedding": [0.012, -0.034, ...] }, ...]
}
```

OBS: Använd 256 dimensioner (inte 1536) — räcker för 50 snippets, sparar minne.

### `scripts/generate-docs-embeddings.ts`

Offline-script som genererar embeddings för alla docs-snippets:
1. Ladda snippets från `docs-snippets.ts`
2. Bygg embedding-text per snippet: `"{title}\n{keywords}\n{content}"`
3. Anropa OpenAI Embeddings API i batch
4. Spara till `src/lib/gen/data/docs-embeddings.json`

### `src/lib/gen/context/embedding-search.ts`

Embedding-baserad sökning som ersätter keyword-matchning:
1. Ladda pre-beräknade embeddings från JSON (in-memory cache)
2. Vid sökning: embed queryn med OpenAI API (256 dim)
3. Cosine similarity mot alla snippets
4. Returnera top-N resultat

Fallback: Om OPENAI_API_KEY saknas eller embed-API:t misslyckas → falla tillbaka på keyword-sökning.

## Filer att modifiera

### `src/lib/gen/context/knowledge-base.ts`

Uppdatera `searchKnowledgeBase()` att försöka embedding-sökning först, sedan keyword som fallback.

## Acceptanskriterier

- [ ] Embeddings genereras för alla 50 snippets
- [ ] Cosine similarity-sökning fungerar
- [ ] Fallback till keyword-sökning om API saknas
- [ ] Inga nya lint-/TSC-fel
