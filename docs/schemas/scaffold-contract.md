# Runtime Scaffold Contract

## Scope

This document describes the current runtime scaffold contract.

Primary code sources:

- `src/lib/gen/scaffolds/types.ts`
- `src/lib/gen/scaffolds/registry.ts`
- `src/lib/gen/scaffolds/scaffold-manifest-validation.ts`
- `src/lib/gen/scaffolds/serialize.ts`

## Core rule

Runtime generation is scaffold-driven.

The runtime scaffold registry lives in `src/lib/gen/scaffolds/` and remains the
only scaffold source used directly by generation.

Do not confuse runtime scaffolds with:

- `src/lib/templates/` template-gallery items
- external Vercel templates
- curated external references in `research/external-templates/reference-library/`

## Current manifest shape

`ScaffoldManifest` currently includes:

- `id`
- `family`
- `label`
- `description`
- `buildIntents`
- `tags`
- `promptHints`
- `files`
- optional `qualityChecklist`
- optional `research`

Supporting subtypes:

- `ScaffoldFile`
  - `path`
  - `content`
- `ScaffoldResearchMetadata`
  - `upgradeTargets`
  - `referenceTemplates`
- `ScaffoldReferenceTemplate`
  - `id`
  - `title`
  - `categorySlug`
  - `qualityScore`
  - `strengths`

## Current families

Current `ScaffoldFamily` values:

- `base-nextjs`
- `content-site`
- `app-shell`
- `landing-page`
- `saas-landing`
- `portfolio`
- `blog`
- `dashboard`
- `auth-pages`
- `ecommerce`

## Validation rules

`validateScaffoldManifest()` currently checks:

- duplicate file paths
- required `app/globals.css`
- presence of `@theme inline` tokens in `app/globals.css` as a warning
- required `app/layout.tsx`
- recommended `app/page.tsx`
- `research.referenceTemplates[*].qualityScore` must stay within `0..100`

## Research enrichment

Scaffolds may be enriched with curated reference data through:

- `src/lib/gen/scaffolds/scaffold-research.generated.json`
- `src/lib/gen/scaffolds/scaffold-research.ts`

This metadata may improve search, matching, and upgrade decisions, but it does
not create a second runtime scaffold registry.

## Serialization rule

When a scaffold is selected:

- the scaffold is serialized into generation context
- the model may replace, extend, or refine scaffold files
- the finalized version may merge scaffold base files with generated output

## Quality boundary

External references may inform a scaffold, but runtime scaffolds should remain:

- small
- intentional
- stack-aligned
- safe to modify
- free from unnecessary external infrastructure assumptions

## Archived docs

Older scaffold schema notes were archived under `docs/old/schemas/`.
