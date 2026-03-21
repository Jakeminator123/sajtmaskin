# Template library (reference ranking)

Curated **external template references** for the own-engine system prompt: semantic search picks entries, then optional code excerpts are injected as inspiration.

## Files

| File | What it is |
|------|------------|
| `template-library.generated.json` | Catalog of entries (`entries[]`). May be empty while you rebuild a smaller, intentional set. |
| `template-library-embeddings.json` | OpenAI vectors per entry; empty until you regenerate embeddings for non-empty entries. |
| `catalog.ts` | Loads entries from the generated JSON. |
| `search.ts` | `searchTemplateLibrary`, `selectTemplateReferenceFiles`. |
| `types.ts` | Entry / catalog types. |
| `embeddings-core.ts` | Helpers to produce embedding files (offline). |
| `index.ts` | Barrel export. |

## Runtime flow

1. `system-prompt.ts` ranks template references from the user prompt (and scaffold context).
2. When the catalog has matches, snippets can augment the prompt as “reference” material.

## Hygiene

```bash
npm run verify:generated-paths
npm run normalize:generated-paths
```

Do not commit machine-local absolute paths inside JSON.
