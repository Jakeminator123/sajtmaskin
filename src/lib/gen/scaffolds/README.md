# Runtime Scaffolds (partially cursorignored)

Large generated JSON is cursorignored. Overview: [`../README.md`](../README.md) · Product terms: `.cursor/rules/terminology.mdc` (runtime **scaffold** vs builderns **Mallar** / `src/lib/templates` vs runtime **`template-library`** vs **Vercel-mall** research).

## What Lives Here

This directory holds the 10 runtime scaffold families:

`base-nextjs`, `landing-page`, `saas-landing`, `portfolio`, `blog`,
`dashboard`, `auth-pages`, `ecommerce`, `content-site`, `app-shell`.

Each family directory contains a `manifest.ts` plus template files. Those
manifests are imported only through `registry.ts`; callers should not wire
individual scaffold folders into generation flows directly.

## Cursorignored generated files

| File | Size | What it is |
|------|------|-----------|
| `scaffold-embeddings.json` | ~2 MB | OpenAI vectors for the 10 scaffolds. Used by `searchScaffolds()` when semantic fallback is needed. |
| `scaffold-research.generated.json` | ~1 MB | Generated per-scaffold `qualityChecklist` and `research` (`upgradeTargets`, `referenceTemplates`). Built from the external template-library pipeline. |

## Indexed files (readable by agents)

| File | What it does |
|------|-------------|
| `registry.ts` | Imports the 10 manifests and merges in generated research overrides. This is the single source of truth for runtime scaffold objects. |
| `types.ts` | `ScaffoldManifest`, `ScaffoldFile`, `ScaffoldResearchMetadata` types. |
| `matcher.ts` | Primary keyword-based scaffold matching. `matchScaffoldWithEmbeddings()` calls this first and only uses embeddings when the keyword result is missing or too generic. |
| `serialize.ts` | `serializeScaffoldForPrompt()` — turns the resolved scaffold into prompt context. |
| `scaffold-search.ts` | Embedding-based `searchScaffolds()`; expands SV<->EN query hints before cosine ranking. |
| `scaffold-embedding-locale.ts` | Swedish mirrors (label, description, keywords) paired with English manifest text in embedding documents. |
| `scaffold-embeddings-core.ts` | Builds bilingual text -> OpenAI embeddings. Run `npx tsx scripts/embeddings/generate-scaffold-embeddings.ts` after manifest or scaffold research changes. |
| `scaffold-scoring.ts` | Telemetry-based boost/penalize for generic scaffolds. |
| `scaffold-aware-retry.ts` | Suggests an alternative scaffold after finalize/preflight failures. This is reactive retry logic, separate from initial scaffold selection. |
| `scaffold-research.ts` | Loads `scaffold-research.generated.json` overrides. During full refresh/bootstrap it falls back to empty overrides so the generated file can be rebuilt from scratch. |

## Runtime flow

1. `registry.ts` imports all manifest folders and overlays `scaffold-research.generated.json`.
2. `orchestrate.ts` resolves scaffold mode (`auto` / `manual` / `off`).
3. In `auto`, `matchScaffold()` is the primary path. `matchScaffoldWithEmbeddings()` only falls back to `searchScaffolds()` when the keyword result is missing or lands on a generic default such as `landing-page` or `base-nextjs`.
4. `serializeScaffoldForPrompt()` turns the resolved scaffold into prompt text.
5. `system-prompt.ts` combines scaffold context with route plan, contracts, KB, and template-library guidance.
6. `finalize-version.ts` can later call `scaffold-aware-retry.ts` if preflight suggests that the original scaffold was a poor fit.

## Regeneration Notes

- `scaffold-research.generated.json` is rebuilt by `scripts/template-library/build-template-library.ts`.
- `scaffold-embeddings.json` is rebuilt by `scripts/embeddings/generate-scaffold-embeddings.ts`.
- If scaffold research changes, regenerate embeddings too so semantic matching uses the same merged scaffold data as runtime.
