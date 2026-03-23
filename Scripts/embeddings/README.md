# Embedding generation (operator reference)

All embedding commands run from the **repo root** (`sajtmaskin/`).

## npm scripts

| Command | What it generates | Approximate cost |
|---------|-------------------|------------------|
| `npm run scaffolds:embeddings` | `src/lib/gen/scaffolds/scaffold-embeddings.json` — one vector per runtime scaffold | ~$0.001 |
| `npm run template-library:embeddings` | `src/lib/gen/template-library/template-library-embeddings.json` — one vector per template catalog entry | ~$0.01 |
| `npm run docs:embeddings` | `src/lib/gen/data/docs-embeddings.json` — one vector per docs/knowledge-base snippet | ~$0.01 |
| `npm run templates:embeddings` | v0 gallery embeddings (separate from template-library) | ~$0.02 |

## When to regenerate

- **Scaffolds:** after adding/removing/renaming scaffold families in `registry.ts`.
- **Template library:** after running `npm run template-library:build` from a fresh `research:normalize`.
- **Docs:** after editing `src/lib/gen/data/docs-snippets.ts`.

## Combined rebuild

```bash
npm run scaffolds:build          # research stubs + embeddings + validate
npm run template-library:rebuild # build + embeddings
npm run docs:embeddings
```

## Requirements

- `OPENAI_API_KEY` in `.env.local` (uses `text-embedding-3-small`).
