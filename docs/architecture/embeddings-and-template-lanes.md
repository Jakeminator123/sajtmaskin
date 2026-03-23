# Embedding lanes and template sources

The own engine relies on three separate embedding indexes. They look similar
(OpenAI embedding vectors stored as JSON), but they serve completely different
purposes at different stages of the build pipeline.

## 1. Runtime scaffold embeddings

| | |
|--|--|
| **Index** | `src/lib/gen/scaffolds/scaffold-embeddings.json` |
| **Search** | `scaffold-search.ts` → `matcher.ts` (`matchScaffoldWithEmbeddings`) |
| **Purpose** | Select the best internal scaffold (file structure + defaults) for a build. |
| **Rebuild** | `npm run scaffolds:build` |

The user's prompt is embedded at request time and compared against pre-computed
scaffold vectors. Candidates whose `buildIntents` do not match the resolved
`buildIntent` (app / website / template) are filtered out before scoring.

If no candidate scores above the similarity threshold, a deterministic fallback
picks the default scaffold for the intent (`app-shell` for app, `landing-page`
for website).

## 2. Reference / template-library embeddings

| | |
|--|--|
| **Index** | `src/lib/gen/template-library/template-library-embeddings.json` |
| **Search** | `template-library/search.ts` (`searchTemplateLibrary`) |
| **Purpose** | Inject curated code references into the system prompt as structural inspiration. |
| **Rebuild** | `npm run template-library:rebuild` |

These are **not** scaffold choices. They provide reference snippets that the
model can draw from when generating code. The top matches are ranked by a
combination of prompt similarity, scaffold family overlap, and quality score.

## 3. v0 gallery / template embeddings

| | |
|--|--|
| **Index** | `src/lib/templates/` (separate file, not under `gen/`) |
| **Search** | `src/lib/templates/template-search.ts` |
| **Purpose** | Power the product gallery, browse cards, and search on the template pages. |
| **Rebuild** | `npm run templates:embeddings` |

These embeddings drive the user-facing gallery and have **no role** in the
code-generation pipeline. Do not confuse them with runtime scaffolds or
reference-library entries.

## Dossiers (retired)

The `research/dossiers/` directory was an earlier research artifact. Dossier
manifests are **not** loaded by any runtime path. They may still appear in
older handoff documents and can be cleaned up as documentation debt.

## Do not mix

- A v0 gallery template being "embedded" does not mean it participates in
  scaffold selection or reference-library ranking.
- A scaffold embedding match does not inject code snippets — that is the
  reference-library's job.
- Rebuilding one index does not affect the others.
