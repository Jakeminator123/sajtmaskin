# Template Library (cursorignored generated data)

Large JSON is cursorignored. Context: [`../README.md`](../README.md), [`../../../../docs/architecture/repository-and-platform.md`](../../../../docs/architecture/repository-and-platform.md) (Vercel mall / generated artifacts).

## Files

| File | Size | What it is |
|------|------|-----------|
| `template-library.generated.json` | several MB | Curated template entries with metadata, quality scores, strengths, runtime guidance, and `selectedFiles` excerpts. Built by `scripts/template-library/build-template-library.ts` from the external template pipeline. |
| `template-library-embeddings.json` | several MB | OpenAI `text-embedding-3-small` vectors for each curated template entry. Used by `search.ts` for semantic ranking. |
| `catalog.ts` | small | Loads and sanitizes entries from the generated catalog JSON. |
| `search.ts` | small | Hybrid search (`embedding`, `hybrid_keyword_blend`, `keyword_fallback`, `empty_catalog`) with diagnostics. |
| `types.ts` | small | TypeScript types for entries, runtime guidance, search results, and selected files. |
| `embeddings-core.ts` | small | Embedding generation utilities. |
| `index.ts` | small | Barrel export. |

## Runtime flow

1. `system-prompt.ts` calls `rankTemplateReferences(prompt, scaffold)` during `buildDynamicContext()`.
2. That calls `searchTemplateLibraryWithDiagnostics()` (or keyword-only search when embedding enrichment is disabled).
3. If the catalog is empty, runtime returns no prompt-driven template matches and does not load stale embeddings.
4. Top matches are injected as structured "Relevant Template References" in the dynamic system prompt, with rule-oriented guidance (`style rules`, `section inventory`, `avoid patterns`, `world-class rubric`) before any code excerpts.
5. A smaller subset can also inject `selectedFiles` as "Reference Code Snippets" when prompt budget allows.
6. Search diagnostics are persisted in stream/build metadata as `templateLibrarySearch`, which helps explain whether runtime used embeddings, keyword fallback, or a hybrid blend.

## Important relationships

- `scaffold-research.generated.json` can point at template IDs from this catalog via `referenceTemplates`.
- If those IDs are stale or missing from the catalog, validation/runtime should fail loudly rather than silently drift.
- Template-library guidance shapes the prompt only; it does not directly merge files into the saved version. File merging still happens later in `finalize-version.ts`.

## Regeneration

- Run `scripts/template-library/build-template-library.ts` to rebuild the curated catalog and scaffold research from imported discovery + repo cache.
- Run `scripts/embeddings/generate-template-library-embeddings.ts` (or `npm run template-library:embeddings`) after the catalog has `entries[]` again.
