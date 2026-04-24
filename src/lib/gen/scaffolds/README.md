# Runtime Scaffolds (partially cursorignored)

Large generated JSON is cursorignored. Overview: [`../README.md`](../README.md) · Product terms: `.cursor/rules/terminology.mdc` (runtime **scaffold** vs builderns **Mallar** / `src/lib/templates` vs runtime **`template-library`** vs **Vercel-mall** research).

## What Lives Here

This directory holds the 9 runtime scaffolds:

`base-nextjs`, `landing-page`, `saas-landing`, `portfolio`, `blog`,
`dashboard`, `auth-pages`, `ecommerce`, `app-shell`.

> Historisk not: den tidigare marketing-scaffolden slogs ihop med
> `landing-page` 2026-04-23 (OMTAG fas 2·B / M1). `warm-editorial` och
> `minimalist-mag` lever nu som landing-page-varianter. Se
> `docs/architecture/glossary.md` för detaljer.

Each scaffold directory contains a `manifest.ts` plus template files. Those
manifests are imported only through `registry.ts`; callers should not wire
individual scaffold folders into generation flows directly.

**Example:** `auth-pages/manifest.ts` is imported by `registry.ts`, can be
selected by `matchScaffoldAuto()`, is serialized into prompt context via
`serializeScaffoldForPrompt()`, and then own-engine uses that scaffold context
when generating code.

## Cursorignored generated files

| File | Size | What it is |
|------|------|-----------|
| `scaffold-embeddings.json` | ~2 MB | OpenAI vectors for the 9 scaffolds. Used by `searchScaffolds()` when semantic fallback is needed. |
| `scaffold-research.generated.json` | ~1 MB | Generated per-scaffold `qualityChecklist` and `research` (`upgradeTargets`, `referenceTemplates`). Built from the external template-library pipeline. |

## Indexed files (readable by agents)

| File | What it does |
|------|-------------|
| `registry.ts` | Imports the 9 manifests (see `BASE_SCAFFOLDS`) and merges in generated research overrides. This is the single source of truth for runtime scaffold objects. |
| `types.ts` | `ScaffoldManifest`, `ScaffoldFile`, `ScaffoldResearchMetadata` types. `id` is scaffoldens kanoniska runtime-nyckel; äldre docs kan fortfarande nämna `family` som legacy-alias. |
| `matcher.ts` | Primary keyword-based scaffold matching. `matchScaffoldAuto()` uses keyword matching first and only uses embeddings when the keyword result is missing or too generic. |
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
3. In `auto`, `matchScaffoldAuto()` runs keyword matching first and only falls back to `searchScaffolds()` when the keyword result is missing or lands on a generic default such as `landing-page` or `base-nextjs`.
4. `serializeScaffoldForPrompt()` turns the resolved scaffold into prompt text.
5. `system-prompt.ts` combines scaffold context with route plan, contracts, brief/context signals, and visual direction.
6. `finalize-version.ts` can later call `scaffold-aware-retry.ts` if preflight suggests that the original scaffold was a poor fit.

## Regeneration Notes

- `scaffold-research.generated.json` is rebuilt by `scripts/template-library/build-template-library.ts`.
- `scaffold-embeddings.json` is rebuilt by `scripts/embeddings/generate-scaffold-embeddings.ts`.
- If scaffold research changes, regenerate embeddings too so semantic matching uses the same merged scaffold data as runtime.
