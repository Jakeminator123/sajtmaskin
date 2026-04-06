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
- curated external references in `data/external-template-pipeline/reference-library/`

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
- total `files` content should stay under ~15 000 chars (warning). Larger scaffolds waste prompt budget since serialization truncates anyway.
- `qualityChecklist` should have at least 3 entries (warning)
- `promptHints` should have at least 2 entries (warning)

## Research enrichment

Scaffolds may be enriched with curated reference data through:

- `src/lib/gen/scaffolds/scaffold-research.generated.json`
- `src/lib/gen/scaffolds/scaffold-research.ts`

This metadata may improve search, matching, and upgrade decisions, but it does
not create a second runtime scaffold registry.

When present, `research.referenceTemplates` is now also consumed by prompt
assembly (`system-prompt.ts`) as budgeted "Reference inspirations" alongside
`qualityChecklist` and `upgradeTargets`.

## Serialization rule

When a scaffold is selected:

- the scaffold is serialized into generation context
- scaffold research priorities may include a curated reference-template summary
  (bounded primärt av `BuildSpec.tokenBudgets.refsTokens`, med `refsChars` som kompat-fallback)
- the model may replace, extend, or refine scaffold files
- the finalized version may merge scaffold base files with generated output

## Quality boundary

External references may inform a scaffold, but runtime scaffolds should remain:

- small — total file content under ~15k chars; serialization budgets are 12k–25k depending on context policy
- intentional — every file included should serve a clear purpose for the LLM
- stack-aligned
- safe to modify
- free from unnecessary external infrastructure assumptions
- equipped with `qualityChecklist` (>= 3 items) and `promptHints` (>= 2 items)

## Archived docs

Older scaffold schema notes may exist in git under `docs/plans/avklarat/` (see `docs/plans/avklarat/README.md`).

