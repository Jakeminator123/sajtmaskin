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

## Current usage

1. **Scaffold-anchored runtime guidance (opt-in):** When `SAJTMASKIN_RUNTIME_TEMPLATE_GUIDANCE=true`, the orchestration layer reads `referenceTemplates` from the resolved scaffold, looks up the corresponding entries in this catalog via `catalog.ts`, and injects compact `runtimeGuidance` (style rules, section inventory, avoid patterns, quality rubric) into the `## Scaffold Research Priorities` block of the system prompt. Only init generations are affected; follow-ups skip this.
2. **Variant structural files (opt-in):** When `SAJTMASKIN_VARIANT_STRUCTURAL_FILES=true`, the orchestration layer reads the active scaffold variant's `sourceTemplateIds`, looks up those entries in this catalog, selects budgeted `selectedFiles` excerpts for `layout.tsx`, `page.tsx`, and `middleware.ts`, and injects them into the `## Structural References (this variant)` block of the system prompt. Only init generations and `isFirstCodeGeneration` are affected; normal follow-ups skip this.
3. Global template-library search (`search.ts`) is **not** called from the active runtime prompt path. It remains available for local tests/tooling.
4. `template-library.generated.json` is used by validation/tooling such as scaffold-manifest checks, local template-pipeline inspection, and the runtime guidance lookup above.
5. `selectedFiles` and `runtimeGuidance` now matter both for runtime prompt shaping and when rebuilding or validating the catalog itself.

## What belongs here

- Put **generated artifacts only** in this folder.
- Do **not** drop raw repos, cloned templates, zip files, or handwritten dossiers here.
- New external source material belongs upstream in `data/external-template-pipeline/*`.
- If you want different output here, change the pipeline inputs or `build-template-library.ts`, then rebuild.

## Dossiers vs runtime

- `data/external-template-pipeline/reference-library/` contains the **full dossiers** built from external template research.
- Runtime does **not** read those dossier markdown/JSON files directly during generation.
- Instead, `scripts/template-library/build-template-library.ts` condenses useful dossier data into:
  - `template-library.generated.json`
  - `scaffold-research.generated.json`
- Runtime scaffold validation reads the generated catalog through `catalog.ts`, while scaffold manifests read `scaffold-research.generated.json` through `registry.ts`.
- In practice: dossier content is useful, but only **after** it has been curated and compiled into the generated artifacts. Runtime prompting can now consume generated `runtimeGuidance` plus selected structural file excerpts from the catalog, but never the raw dossier folders.

## Important relationships

- `scaffold-research.generated.json` can point at template IDs from this catalog via `referenceTemplates`.
- If those IDs are stale or missing from the catalog, strict runtime now fails loudly in `scaffolds/scaffold-research.ts` (in addition to script/test validation) rather than silently drifting.
- Template-library artifacts can now optionally shape the live own-engine prompt via scaffold-anchored `runtimeGuidance` when `SAJTMASKIN_RUNTIME_TEMPLATE_GUIDANCE` is enabled.
- Template-library artifacts can also optionally inject selected structural file excerpts via scaffold variants when `SAJTMASKIN_VARIANT_STRUCTURAL_FILES` is enabled.
- Raw dossiers are still not read at runtime; only the generated catalog artifacts are used.

## Regeneration

- Run `scripts/template-library/build-template-library.ts` to rebuild the curated catalog and scaffold research from imported discovery under `data/external-template-pipeline/` + repo cache.
- Run `scripts/embeddings/generate-template-library-embeddings.ts` (or `npm run template-library:embeddings`) after the catalog has `entries[]` again.
- Run `npm run template-library:validate-runtime` to catch stale ID drift across catalog, scaffold-research, and embeddings before runtime usage.
