# Runtime Scaffold Contract

## Scope

This document describes the current runtime scaffold contract.

Primary code sources:

- `src/lib/gen/scaffolds/types.ts`
- `src/lib/gen/scaffolds/registry.ts`
- `src/lib/gen/scaffolds/scaffold-manifest-validation.ts`
- `src/lib/gen/scaffolds/serialize.ts`
- `src/lib/gen/build-spec/` (post-OMTAG-03 package; `builder.ts` orchestrator, `types.ts`, peer modules)
- `src/lib/gen/system-prompt/` (post-OMTAG-03 package; `compose.ts` orchestrator + `sections/` peers)

## Core rule

Runtime generation is scaffold-driven.

The runtime scaffold registry lives in `src/lib/gen/scaffolds/` and remains the
only scaffold source used directly by generation.

Do not confuse runtime scaffolds with:

- `src/lib/templates/` template-gallery items
- external Vercel templates
- curated external references in `data/external-template-pipeline/reference-library/`

## What a scaffold actually contains

A runtime scaffold is **not** just a thin label file.

Each scaffold manifest contains:

- metadata (`id`, `label`, `description`, `tags`, `promptHints`)
- runtime traits (`structureProfile`, `contentProfile`, `siteKind`, `complexity`, `features`)
- actual starter files in `files[]`
- optional `qualityChecklist`
- optional `research` (`upgradeTargets`, `referenceTemplates`)

Legacy stored plan payloads may still surface `scaffold.family` as a
backward-compatible alias of `scaffold.id`, but runtime `ScaffoldManifest`
does not contain a `family` field.

The LLM does not receive the entire repo. Instead, runtime serializes a
scaffold into:

- scaffold metadata
- scaffold file tree
- a small set of critical scaffold files
- optional scaffold research priorities

This is then combined with route plan, contracts, brief, design/theme context,
and other request-specific data.

Some scaffold files are protected utility defaults rather than LLM-owned
content. `SCAFFOLD_PROTECTED_PATHS` in `src/lib/gen/scaffolds/protected-paths.ts`
is injected into dynamic context and enforced in persist paths: if the LLM emits
those paths, its copies are dropped and the scaffold/previous-version files win.
Current protected defaults include `app/icon.svg` and
`app/api/placeholder/route.ts`.

`RoutePlan` is separate from the scaffold itself. It includes **`provenance`**:

- **`primarySource`** — `brief` if the brief pages drive structure; else `scaffold` if scaffold defaults added routes beyond prompt inference; else `prompt`.
- **`sources`** — ordered list of contributors (e.g. `["prompt","scaffold"]` when both applied).

Legacy stored payloads may still use a flat `source` field; parsers normalize that to `provenance`.

The plan may draw routes from:

- `brief` — explicit pages from the current brief/spec
- `prompt` — prompt-pattern inference in `src/lib/gen/route-plan/`
- `scaffold` — scaffold defaults that add real routes (for example blog/auth/commerce helpers)

After all sources contribute, `buildRoutePlan()` runs `dedupePlannedRoutesInPlaceByLocale()` (since 2026-04-21) to collapse locale-alternate route pairs (`/blog`↔`/blogg`, `/contact`↔`/kontakt`, `/about`↔`/om`, `/services`↔`/tjanster`) down to the variant matching the project's resolved locale (default `sv`). This means scaffolds that contribute `/blog` plus a brief that defines `/blogg` will reach the LLM as a single `/blogg` route — the LLM should never see both variants. Scaffold authors do not need to worry about locale-alternate collisions.

## Current manifest shape

`ScaffoldManifest` currently includes:

- `id`
- `label`
- `description`
- optional `structureProfile`
- optional `contentProfile`
- optional `siteKind`
- optional `complexity`
- optional `features`
- `allowedBuildIntents`
- `tags`
- `promptHints`
- `files`
- optional `qualityChecklist`
- optional `research`

Supporting subtypes:

- `ScaffoldFile`
  - `path`
  - `content`
  - optional `role` — Scaffold Contract V2 prompt role (`root-layout` / `global-styles` / `config` / `route-page` / `shared-component` / `api-route` / `default`). When omitted, derived from `path` by `defaultRoleForPath()` in `serialize.ts`.
  - optional `serialization` — explicit policy override (`full` / `excerpt` / `signature`). Default comes from the resolved role: `full` for `root-layout`/`global-styles`/`config`, `signature` for `shared-component`/`api-route`, `excerpt` otherwise. Large `full` files fall back to FileContract to preserve the critical-files budget.
  - optional `maxPromptChars` — per-file ceiling for `representativeLines` when the resolved serialization is `excerpt`, or when a large `full` file falls back to FileContract. Lets manifests expose a few safe outline lines from a verbose file without sending partial executable TSX.
- `ScaffoldResearchMetadata`
  - `upgradeTargets`
  - `referenceTemplates`
- `ScaffoldReferenceTemplate`
  - `id`
  - `title`
  - `categorySlug`
  - `qualityScore`
  - `strengths`

### Scaffold Contract V2 — render policy

The system prompt does not need every scaffold file in full. `serialize.ts`
renders each selected critical file based on its resolved
`(role, serialization)`:

| Resolved policy | What reaches the LLM |
|-----------------|----------------------|
| `full` | Verbatim file content when the file is small enough for prompt context. Oversized `full` files are rendered as FileContract instead of truncated source. |
| `excerpt` | A `FileContract` block, not a source-code fence. It lists path, role, completeness, ownership, mustEmit, source size, imports, exports, detected structure, capped `representativeLines`, and rules. Used for `route-page` and other files where partial code would be misleading. |
| `signature` | A `FileContract` block with imports/exports/structure only — used for `components/*` and `app/.../route.ts` so the LLM sees the interface without re-reading bodies. |

`FileContract` blocks are explicitly **not executable source**. They must never
be copied into output. If the LLM emits a path described by a FileContract, it
must emit a complete valid file that follows the contract.

`## Critical Scaffold Files` is hard-capped to 6 000 characters including the
FileContract intro. This keeps request-specific scaffold context bounded even
when `BuildSpec.tokenBudgets.scaffoldChars` is generous.

Manifest authors override the defaults by setting the optional V2 fields on a
`ScaffoldFile`. Validation flags unknown roles, unknown serialization values,
and non-positive `maxPromptChars` so manifest drift fails loud.

## Current scaffold ids

Current `ScaffoldId` values:

- `base-nextjs`
- `app-shell`
- `landing-page`
- `saas-landing`
- `portfolio`
- `blog`
- `dashboard`
- `auth-pages`
- `ecommerce`

`id` is scaffoldens kanoniska runtime-identifierare and is used for registry
lookup, matching, embeddings, and telemetry. `ScaffoldFamily`/`family` is
legacy terminology kept only where older docs or stored plan artifacts still
need compatibility.

## Backoffice lifecycle

`Scaffold Lifecycle` i backoffice kan nu skapa och radera scaffold-shells som
en del av runtime-registret.

Create-flödet:

- klonar `files/` från en vald källscaffold
- skriver en ny `manifest.ts` (innehåller `qualityChecklist` och `upgradeTargets` som inline-defaults)
- patchar `ScaffoldId`, `SCAFFOLD_CLIENT_LIST`, `registry.ts` och
  `scaffold-embedding-locale.ts`
- kan skapa en neutral startvariant under `config/scaffold-variants/`

`scripts/template-library/build-template-library.ts` togs bort 2026-04-17 (commit
`4ba06d96e`); checklist/upgrade-defaults bor numera i scaffoldens egen
`manifest.ts` istället för att speglas in i ett centralt build-skript.

Delete-flödet gör motsvarande cleanup för samma lager, men lämnar fortfarande
manuell kurering åt människor för:

- `matcher.ts`
- `scaffold-aware-retry.ts`
- eventuell dossier-/template-library-kuration
- övriga manuella kodreferenser utanför lifecycle-flödets säkra patchområden

Det innebär att lifecycle-flödet gör en scaffold skapbar, registrerbar,
manuellt valbar, build-safe och borttagbar, men inte automatiskt fullt
handkuraterad för auto-matchning eller retry-heuristik.

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
- Scaffold Contract V2 file fields:
  - `role` must be one of the V2 roles when set (error)
  - `serialization` must be `full` / `excerpt` / `signature` when set (error)
  - `maxPromptChars` must be a positive number when set (error)

## Research enrichment

Scaffolds may be enriched with curated reference data through:

- `src/lib/gen/scaffolds/scaffold-research.generated.json`
- `src/lib/gen/scaffolds/scaffold-research.ts`

This metadata may improve search, matching, and upgrade decisions, but it does
not create a second runtime scaffold registry.

When present, `research.referenceTemplates` is consumed by prompt assembly
(`src/lib/gen/system-prompt/`) as budgeted "Reference inspirations" alongside
`qualityChecklist` and `upgradeTargets`.

## Serialization rule

When a scaffold is selected:

- the scaffold is serialized into generation context
- scaffold research priorities may include a curated reference-template summary
  (bounded primärt av `BuildSpec.tokenBudgets.refsTokens`, med `refsChars` som kompat-fallback)
- the model may replace, extend, or refine scaffold files
- the finalized version may merge scaffold base files with generated output

## What reaches the model

The active own-engine prompt path uses:

- selected scaffold metadata
- serialized scaffold context (file tree + critical files)
- route plan
- pre-generation contracts
- brief / spec signals when present
- BuildSpec policy and context budgets
- theme, design references, media aliases, and custom instructions

The active own-engine prompt path does **not** send:

- the full Sajtmaskin repo
- full external repos from `repo-cache`
- raw discovery catalogs
- full dossier directories

External reference material influences runtime indirectly through generated
artifacts such as `scaffold-research.generated.json`.

## Quality boundary

External references may inform a scaffold, but runtime scaffolds should remain:

- small — total file content under ~15k chars; serialization budgets are 12k–25k depending on context policy
- intentional — every file included should serve a clear purpose for the LLM
- stack-aligned
- safe to modify
- free from unnecessary external infrastructure assumptions
- equipped with `qualityChecklist` (>= 3 items) and `promptHints` (>= 2 items)

## ~~Structural References~~ (avvecklad 2026-04-17)

**Status:** Borttagen från runtime. Tidigare körde `selectVariantStructuralFiles()` + `selectCapabilityStructuralFiles()` när `SAJTMASKIN_VARIANT_STRUCTURAL_FILES=true` och injicerade kod-excerpter under `## Structural References (this variant)` i system-prompten. Hela template-library-pipen (inklusive `resolveTemplateGuidance` + env-flagga `SAJTMASKIN_RUNTIME_TEMPLATE_GUIDANCE`) avvecklades 2026-04-17.

**Ersättare:** Per-integration- och stilexempel hanteras nu av dossier-pipen v2 i `data/dossiers/{hard,soft}/<id>/`. `data/dossiers/_index/capability-map.json` är en genererad backoffice-view (inte runtime-källa) — runtime walkar `hard/` + `soft/` direkt och matchar via deterministisk capability-regel. Aktivt via `SAJTMASKIN_DOSSIER_PIPELINE` (default på; sätt `false`/`0` för opt-out). Se [`docs/llm/dossier-selection-flow.md`](../llm/dossier-selection-flow.md) för urvalsflödet och [`docs/architecture/dossier-system.md`](../architecture/dossier-system.md) för full spec.

**För scaffold-variants:** stilbeskrivning sker via `signaturePatterns` (layouts/motifs/antiPatterns) per variant i `config/scaffold-variants/<scaffold>/<variant>.json`. Renderas i `## Scaffold Variant`-blocket av `src/lib/gen/system-prompt/`. Se `../architecture/scaffold-system.md` för full inventarium.

## Font handling

Scaffold variants carry `fontPairings` (`{ heading: string, body: string }[]`) which are injected into the system prompt as suggested pairings. The central font registry in `src/lib/gen/data/google-font-registry.ts` maps display names (e.g. "JetBrains Mono") to `next/font/google` import names (`JetBrains_Mono`), CSS variables, and categories. The system prompt now includes the import name when it differs from the display name. The autofix `font-import-fixer` uses the same registry to recognize and fix missing font imports in layout files.

Font pairings remain prompt-level guidance; scaffold starter files default to Inter + `--font-sans`. Deterministic variant→code font injection is a planned improvement (see `docs/plans/archived/Kvarvarande-uppgifter.md`).

## Archived docs

Older scaffold schema notes may exist in git under `docs/plans/avklarat/` (see `docs/plans/avklarat/README.md`).

