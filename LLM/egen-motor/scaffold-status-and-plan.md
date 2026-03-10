# Scaffold Status And Plan

> Last updated: 2026-03-10 (after Fas 4-5 completion)

## What a scaffold means here

A scaffold is a small internal starter structure, shaped for one category of site or app. It gives the model a stronger starting state so it edits a good baseline instead of inventing everything from scratch.

## Current scaffold system state

The scaffold system is fully implemented with 9 scaffolds, intelligent matching, and post-generation validation.

### Infrastructure

- Scaffold types, registry, matcher (keyword-based, word-boundary regex, Swedish + English)
- Scaffold serialization into system prompt (not user message) as `## Scaffold` block
- Builder UI: off / auto / manual selection
- Scaffold info sent in SSE `meta` event (`scaffoldId`, `scaffoldFamily`)
- Post-merge scaffold import checker (verifies header/footer imports)
- Merge with size warnings (flags significant-shrink)
- Neutral oklch color palette in all scaffolds (model adapts to prompt)
- Generic placeholder names (`[Företagsnamn]`, `[Produktnamn]`, etc.)

### All 9 scaffolds

| # | ID | Family | Use case |
|---|----|----|---------|
| 1 | `base-nextjs` | base-nextjs | Minimal technical starter |
| 2 | `landing-page` | landing-page | Company/service landing pages |
| 3 | `saas-landing` | saas-landing | SaaS product marketing |
| 4 | `portfolio` | portfolio | Creatives, photographers, consultants |
| 5 | `blog` | blog | Editorial, articles, newsletters |
| 6 | `dashboard` | dashboard | Admin panels, analytics |
| 7 | `auth-pages` | auth-pages | Login, register, password reset |
| 8 | `ecommerce` | ecommerce | Online stores, product catalogs |
| 9 | `content-site` | content-site | Broad fallback for content sites |
| -- | `app-shell` | app-shell | Broad fallback for app prompts |

### Key code locations

- `src/lib/gen/scaffolds/types.ts` -- ScaffoldFamily union type
- `src/lib/gen/scaffolds/registry.ts` -- ALL_SCAFFOLDS array
- `src/lib/gen/scaffolds/matcher.ts` -- keyword matching (10 keyword arrays)
- `src/lib/gen/scaffolds/serialize.ts` -- prompt serialization with maxChars
- `src/lib/gen/stream/finalize-version.ts` -- shared autofix + merge + save pipeline
- `src/lib/gen/autofix/rules/scaffold-import-checker.ts` -- post-merge import verification
- `src/lib/gen/version-manager.ts` -- mergeVersionFiles with MergeWarning

### Matching order

1. Auth keywords -> `auth-pages`
2. Ecommerce keywords -> `ecommerce`
3. App intent + dashboard keywords -> `dashboard`
4. App intent -> `app-shell`
5. Dashboard/app keywords -> `dashboard` or `app-shell`
6. Best of: saas, portfolio, landing, blog -> winner
7. Content keywords -> `content-site`
8. Website/template intent -> `landing-page`
9. Default -> `base-nextjs`

## What is done

- All 9 scaffolds implemented and registered
- Matcher with Swedish + English keywords for all categories
- Scaffold context injected in system prompt (not user message)
- Brief data passed to system prompt for new chats
- Scaffold info visible in SSE meta event
- Import checker runs after merge
- Merge warnings for significant file shrinkage
- Serialize truncates oversized first files instead of exceeding maxChars
- `finalizeAndSaveVersion()` deduplicates 3 repeated version-save blocks

## Remaining improvements (future)

- Embedding-based KB search (planned, infra exists in template-search)
- Scaffold A/B testing (log scaffold choice vs user feedback)
- Multipage detection (analyze prompt for multi-page needs)
- Scaffold-aware retry (simplify scaffold on generation failure)
