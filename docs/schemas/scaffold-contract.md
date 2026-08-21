# Runtime Scaffold Contract

## Scope

This document describes the current runtime scaffold contract.

Primary code sources:

- `src/lib/gen/scaffolds/types.ts`
- `src/lib/gen/scaffolds/scaffold-client-list.generated.ts`
- `src/lib/gen/scaffolds/registry.ts`
- `scripts/scaffolds/generate-client-list.ts`
- `src/lib/gen/scaffolds/scaffold-manifest-validation.ts`
- `src/lib/gen/scaffolds/serialize.ts`
- `src/lib/gen/build-spec/` (post-OMTAG-03 package; `builder.ts` orchestrator, `types.ts`, peer modules)
- `src/lib/gen/system-prompt/` (post-OMTAG-03 package; `compose.ts` orchestrator + `sections/` peers)

## Core rule

Runtime generation is scaffold-driven.

The runtime scaffold registry lives in `src/lib/gen/scaffolds/` and remains the
only scaffold source used directly by generation.

Do not confuse runtime scaffolds with:

- `src/lib/templates/` template-gallery items (v0-mallar in Blob)
- external Vercel templates (legacy pipeline removed 2026-07-09; archive in the
  sibling folder `gamla-skript-till-scaffolds/` outside the repo)

## What a scaffold actually contains

A runtime scaffold is **not** just a thin label file.

Each scaffold manifest contains:

- metadata (`id`, `label`, `description`, `tags` (embeddings-only; matcher uses `keyword-banks.ts`), `promptHints`)
- runtime traits (`structureProfile`, `contentProfile`, `siteKind`, `complexity`, `features`)
- actual starter files in `files[]`
- optional `qualityChecklist`
- optional `research` (`upgradeTargets`)

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
- `scaffold` — scaffold defaults that add real routes, derived from the
  manifest's `routeContract` (see [Route contract](#route-contract))

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
- `tags` (embeddings-only; not read by `matchScaffoldAuto`)
- `promptHints`
- `routeContract` (optional in the type for test fixtures; validation requires
  it on every registered scaffold — see [Route contract](#route-contract))
- optional `navSurface` — path or paths of the scaffold's nav surfaces (e.g.
  `components/site-header.tsx`, or
  `["components/site-header.tsx", "components/site-footer.tsx"]`).
  `syncNavItemsFromRoutePlan` rewrites ONLY these files to mirror the route
  plan on init; the manifest points the surfaces out so nav targets are never
  guessed from filenames (the SM-051 bug class). A string is the
  single-surface form; an array lists every surface (header + footer).
  Scaffolds without a shared nav component omit it (auth-pages, portfolio,
  base-nextjs, projekt-bas-app) and nav-sync is a no-op. Validation requires
  each path to match a scaffold file.
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

### Route contract

`ScaffoldManifest.routeContract` is the single owner of which routes a
scaffold's starter files assume. It replaced the former hardcoded
per-scaffold `switch` in `src/lib/gen/route-plan/planning-helpers.ts`
(2026-08-14): `getScaffoldDefaultRoutes()` now derives the scaffold's plan
contribution from the manifest, so the route truth lives in the same folder
as the files that depend on it. The manifests own the actual lists — do not
copy them into docs.

Four categories:

| Field                  | Meaning                                                                                        | Planned?             |
| ---------------------- | ---------------------------------------------------------------------------------------------- | -------------------- |
| `requiredRoutes`       | The plan must include the route; the scaffold's files may link to it unconditionally           | Yes, as `required`   |
| `optionalRoutes`       | May be planned; may be trimmed by the per-round page ceiling                                   | Yes, as non-required |
| `declaredRoutePaths`   | A page file exists in the scaffold but the plan does not need to include the route every round | Never                |
| `dynamicRoutePatterns` | Patterns like `/product/[id]` — links are matched against them, never planned as list entries  | Never                |

Two categories are not enough: ecommerce ships real files for
`/category/[slug]` and `/product/[id]` and links to example data such as
`/category/category-1`, none of which belongs in a planned-routes list.

`requiredRoutes`/`optionalRoutes` entries carry `path`, `name`, `planIntent`
(forwarded verbatim to the planned route) and two optional build-intent
scopes that preserve the old switch semantics exactly:

- `planOnlyForBuildIntents` — the route is contributed only for these
  intents (dashboard/app-shell defaults apply to `app` only).
- `requiredOnlyForBuildIntents` — required-routes only: planned as required
  for these intents and as optional for the rest (blog's `/blog` is required
  for `website`/`template` but optional for `app`).

**Route-plan file filter (SM-048, 2026-08-14).** On init,
`mergeGeneratedProjectFiles` (`src/lib/gen/stream/finalize-merge.ts`,
`resolveScaffoldRouteDelivery`) uses the contract to decide which of the
scaffold's ROUTE files are materialized: a contract route's starter files
are delivered when the route path is in the route plan, or when any member
of its `deliveryGroups` group is. Required routes are contributed to every
plan by contract, so they are effectively always delivered — except when the
plan explicitly excludes them (an explicit one-page cap), and then the plan
wins. Files that belong to no contract route (layout, globals, `app/api/**`,
`components/**`) are SHARED and never dropped. Fail-open: a missing/empty
contract or a missing/empty plan disables the filter. Drops are logged as
`scaffold-route-plan-filtered` dev-log events. Known limit: a narrower plan
in a FOLLOW-UP does not remove route files already present in
`previousFiles` — the follow-up merge branch never reaches the filter.

The optional `deliveryGroups` field (`string[][]`) couples contract paths
that must materialize together — if any member is planned, every member's
files are delivered. Used for interlinked page sets (auth-pages' `/login` ↔
`/signup` ↔ `/forgot-password`, all-or-nothing so a surviving page never
carries a dead auth link) and dynamic templates that ride on a planned list
route without being its path descendant (ecommerce's `/product/[id]` rides
on `/products`). Path descendants need no group: `app/blog/[slug]/page.tsx`
already follows `/blog` via `isUnderRoutePath`. Validation requires every
member to be a path that exists elsewhere in the contract.

**Link ↔ contract gate.** A deterministic, blocking test in
`src/lib/gen/scaffolds/scaffold-manifest-validation.test.ts` (runs in
`npm run scaffolds:validate` and therefore in the `quality` CI job) checks
both directions per scaffold:

1. every internal `href`/`Link` path extracted from `files/**` must resolve
   against the contract (`/` plus required/optional/declared, dynamic links
   matched against `dynamicRoutePatterns`), and
2. every contract route must be backed by reality: planned routes
   (required/optional) need at least one link or one starter page file,
   while non-planned routes (`declaredRoutePaths`, `dynamicRoutePatterns`)
   must ship their page file — a link alone never satisfies them, since
   nothing plans those routes and the link would be dead.

Known drift is pinned in the test's explicit exception list
(`KNOWN_ROUTE_CONTRACT_VIOLATIONS`). SM-042 was resolved 2026-08-14 together
with SM-048: the formerly drifting routes (`/pipeline`, `/tasks`,
`/forgot-password`, `/users`, `/categories`, `/om`) are declared in their
contracts, the route-plan file filter drops their files when the plan omits
them, and nav-sync rewrites each scaffold's `navSurface` (header, and for
ecommerce also the footer) to match. The only
remaining exception is SM-043's `/cart` (contract junk). The list is
compared with exact equality, so drift can neither grow nor disappear
silently — each exception is removed together with the owner's direction
decision.

### Scaffold Contract V2 — render policy

The system prompt does not need every scaffold file in full. `serialize.ts`
renders each selected critical file based on its resolved
`(role, serialization)`:

| Resolved policy | What reaches the LLM                                                                                                                                                                                                                                                               |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `full`          | Verbatim file content when the file is small enough for prompt context. Oversized `full` files are rendered as FileContract instead of truncated source.                                                                                                                           |
| `excerpt`       | A `FileContract` block, not a source-code fence. It lists path, role, completeness, ownership, mustEmit, source size, imports, exports, detected structure, capped `representativeLines`, and rules. Used for `route-page` and other files where partial code would be misleading. |
| `signature`     | A `FileContract` block with imports/exports/structure only — used for `components/*` and `app/.../route.ts` so the LLM sees the interface without re-reading bodies.                                                                                                               |

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
- `projekt-bas-app`

`id` is scaffoldens kanoniska runtime-identifierare and is used for registry
lookup, matching, embeddings, and telemetry. `ScaffoldFamily`/`family` is
legacy terminology kept only where older docs or stored plan artifacts still
need compatibility.

## Backoffice lifecycle

`Scaffolds & varianter: skapa, redigera, klona, ta bort` i backoffice (tidigare `Scaffold Lifecycle`) kan nu skapa och radera scaffold-shells som
en del av runtime-registret.

Create-flödet:

- klonar `files/` från en vald källscaffold
- skriver en ny `manifest.ts` (innehåller `qualityChecklist` och `upgradeTargets` som inline-defaults)
- patchar `ScaffoldId` i `types.ts`, `registry.ts` och
  `scaffold-embedding-locale.ts`, och regenererar därefter den browser-safe
  klientprojektionen `scaffold-client-list.generated.ts` via dess TypeScript-generator
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

- `routeContract` present on every registered scaffold, with array-shaped
  collections and object-shaped planned entries (malformed shapes are
  reported as errors, never thrown), normalized paths, exactly one category
  per path, dynamic segments only in `dynamicRoutePatterns`, non-empty
  `name`/`planIntent` on planned entries, and valid build-intent scopes
  (all errors)
- `deliveryGroups` (when set): array-shaped, each group couples at least two
  contract paths, every member exists in the contract, no duplicate members
  (all errors)
- `navSurface` (when set): non-empty string, or non-empty array of unique
  non-empty strings, each matching a scaffold file path (error)
- duplicate file paths
- required `app/globals.css`
- presence of `@theme inline` tokens in `app/globals.css` as a warning
- required `app/layout.tsx`
- recommended `app/page.tsx`
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

The artifact contains only scaffold-owned quality guidance. Complete-project
inspiration is selected from the active variant's Blob ids; request-specific
component/block inspiration is selected independently through UI Recipes.

## Serialization rule

When a scaffold is selected:

- the scaffold is serialized into generation context
- scaffold research priorities include `qualityChecklist` and `upgradeTargets`
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

External reference material reaches runtime only through its explicit owner:
variant-template addenda, UI Recipes, dossiers or media references.

## Quality boundary

External references may inform a scaffold, but runtime scaffolds should remain:

- small — total file content under ~15k chars; serialization budgets are 12k–25k depending on context policy
- intentional — every file included should serve a clear purpose for the LLM
- stack-aligned
- safe to modify
- free from unnecessary external infrastructure assumptions
- equipped with `qualityChecklist` (>= 3 items) and `promptHints` (>= 2 items)

## Structural template inspiration

**Legacy-status:** Det gamla flödet med `selectVariantStructuralFiles()` + `selectCapabilityStructuralFiles()`, klonade externa repos, `template-library` och env-flaggorna avvecklades 2026-04-17 och är fortsatt borta.

**Ersättare:** Per-integration- och stilexempel hanteras nu av dossier-pipen v2 i `data/dossiers/{hard,soft}/<id>/`. `data/dossiers/_index/capability-map.json` är en genererad backoffice-view (inte runtime-källa) — runtime walkar `hard/` + `soft/` direkt och matchar via deterministisk capability-regel. Aktivt via `SAJTMASKIN_DOSSIER_PIPELINE` (default på; sätt `false`/`0` för opt-out). Se [`docs/llm/dossier-selection-flow.md`](../llm/dossier-selection-flow.md) för urvalsflödet och [`docs/contracts/dossier-system.md`](../contracts/dossier-system.md) för full spec.

**Nuvarande variantväg (2026-08-19):** `src/lib/gen/scaffold-variants/template-inspiration.ts` väljer högst en komplett sajt/app från variantens Blob-id:n. Stillbilden går till visionkanalen som style-only och dess URL får inte bli ett genererat asset. SHA-bundna `config/variant-template-addenda.json` äger de granskningsbara strukturutdragen. Ett `hit` ger högst tre frontendfiler och högst 9 000 utdragstecken; paketmanifest, lockfiler, backend och binära assets tas inte med. `disabled`, `missing`, `stale` och `invalid` ger inga utdrag och hämtar inte arkivet i användarflödet — en varning loggas så tystnaden går att räkna. ZIP-läsning hör till offline `templates:addenda` och till verbatim-import. `signaturePatterns` fortsätter bära variantens kuraterade layouts/motifs/antiPatterns i `## Scaffold Variant`, medan den valda mallen ligger separat i `## Variant Template Inspiration`.

Kandidaterna rangordnas mot prompt + Deep Brief med källordning som stabil
tie-breaker. Det finns inget numeriskt kontrakt för hur många komponentfiler en
scaffold får ha: varje fil måste vara använd, stackkompatibel och värd sin
serialization-/promptbudget. UI Recipe-gränsen är en separat promptbudget och
ska inte tolkas som ett tak för scaffoldens körbara komponenter.

## Font handling

Scaffold variants carry `fontPairings` (`{ heading: string, body: string }[]`) which are injected into the system prompt as suggested pairings. The central font registry in `src/lib/gen/data/google-font-registry.ts` maps display names (e.g. "JetBrains Mono") to `next/font/google` import names (`JetBrains_Mono`), CSS variables, and categories. The system prompt now includes the import name when it differs from the display name. The autofix `font-import-fixer` uses the same registry to recognize and fix missing font imports in layout files.

Font pairings remain prompt-level guidance; scaffold starter files default to Inter + `--font-sans`. Deterministic variant→code font injection is a possible future improvement — not scheduled anywhere.

## Archived docs

Older scaffold schema notes may exist in git under `docs/plans/avklarat/` (see `docs/plans/avklarat/README.md`).
