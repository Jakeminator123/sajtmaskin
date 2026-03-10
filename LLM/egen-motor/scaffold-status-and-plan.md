# Scaffold Status And Plan

> Last updated: 2026-03-10
> Purpose: Explain what the scaffold system is, where it is today, what should be added next, and why it matters for generation quality.

## What a scaffold means here

In `sajtmaskin`, a scaffold is not meant to be a full imported third-party project.

A scaffold is:

- a small internal starter structure
- shaped for one category of site or app
- safe for the model to edit
- stable enough to improve generation quality
- generic enough to reuse across many prompts

The point is not to clone external templates.
The point is to give the model a stronger starting state so it edits a good baseline instead of inventing everything from scratch.

## Why scaffolds matter

Without scaffolds, the model has to decide all of this at once:

- page shape
- section order
- baseline layout
- file structure
- naming
- shared components
- visual rhythm

That increases the chance of:

- flat white pages
- weak hero sections
- missing nav/footer
- repetitive layouts
- unnecessary code variation
- more broken imports and lower preview fidelity

With scaffolds, we instead front-load a good default for:

- layout skeleton
- file shape
- key sections
- starter components
- CSS/token structure
- expected interaction patterns

This gives better start quality even before prompt tuning or autofix kicks in.

## Current scaffold system state

The scaffold system itself is already implemented.

Current pieces that exist:

- scaffold types
- scaffold registry
- scaffold matcher
- scaffold serialization into prompt context
- builder UI support for:
  - off
  - auto
  - manual selection
- route-level integration
- merge of scaffold files with generated files

Key code locations:

- `src/lib/gen/scaffolds/types.ts`
- `src/lib/gen/scaffolds/registry.ts`
- `src/lib/gen/scaffolds/matcher.ts`
- `src/lib/gen/scaffolds/serialize.ts`
- `src/app/api/v0/chats/stream/route.ts`
- `src/lib/hooks/v0-chat/useCreateChat.ts`
- `src/app/builder/useBuilderState.ts`

## What is actually implemented today

There are only three real scaffolds today:

1. `base-nextjs`
2. `content-site`
3. `app-shell`

### What they currently cover

`base-nextjs`

- minimal technical starter
- useful when the prompt is broad or unclear
- good as a lowest-common-denominator base

`content-site`

- broad website starter
- used for many marketing/content-style prompts
- currently stands in for multiple more specific categories

`app-shell`

- broad app starter
- used for dashboard/admin/app-like prompts
- currently stands in for multiple more specific app categories

## Why the current scaffold set is not enough

The current problem is not the scaffold mechanism.
The current problem is the scaffold granularity.

Today:

- `content-site` is too broad
- `app-shell` is too broad
- matcher logic is still fairly simple

As a result:

- many sites start from similar shapes
- SaaS, portfolio, blog, and generic landing pages can feel too alike
- app prompts can collapse toward the same dashboard shell
- visual variety has to come too late from prompt interpretation alone

## Recommended target scaffold library

The first proper wave should be:

1. `base-nextjs`
2. `landing-page`
3. `saas-landing`
4. `portfolio`
5. `blog`
6. `dashboard`
7. `auth-pages`
8. `ecommerce`

## What each new scaffold should do

### `landing-page`

Use for:

- generic company sites
- service pages
- simple product marketing sites
- startup landing pages without heavy app framing

Should include:

- header / nav
- hero
- feature band
- trust / metrics / logo row
- CTA section
- footer

### `saas-landing`

Use for:

- software products
- B2B platforms
- pricing-oriented marketing pages
- prompts with terms like SaaS, software, subscription, pricing, platform

Should include:

- product hero
- problem / solution framing
- feature panels
- dashboard-style visual slot
- pricing section
- FAQ
- CTA footer

### `portfolio`

Use for:

- creatives
- photographers
- consultants
- agencies
- personal sites

Should include:

- personal/brand intro
- selected work grid
- project detail pattern
- about section
- testimonial or credibility block
- contact CTA

### `blog`

Use for:

- editorial sites
- founder blogs
- content brands
- article-heavy sites

Should include:

- home page post feed
- featured article slot
- category/tag pattern
- single post structure
- newsletter/signup block

### `dashboard`

Use for:

- internal tools
- admin views
- analytics products
- metrics/reporting prompts

Should include:

- shell layout
- sidebar or top nav
- stat cards
- chart/table slots
- filters/actions row
- empty/loading-friendly sections

### `auth-pages`

Use for:

- login/register/reset flows
- gated products
- app prompts where auth is central

Should include:

- login page
- register page
- forgot/reset pattern
- auth-aware layout shell

### `ecommerce`

Use for:

- stores
- product catalogs
- shopping/checkout prompts

Should include:

- storefront home
- product grid
- category/filter pattern
- product detail skeleton
- cart/CTA patterns

This should stay relatively light at first.
It should not begin as a full Shopify/Medusa clone.

## Mapping current broad scaffolds to the target library

Current to target mapping:

- `base-nextjs` -> stays as-is
- `content-site` -> should split into:
  - `landing-page`
  - `saas-landing`
  - `portfolio`
  - `blog`
- `app-shell` -> should split into:
  - `dashboard`
  - `auth-pages`
  - later, possibly more specialized app/admin starters

## Recommended implementation order

Build in this order:

1. `landing-page`
2. `saas-landing`
3. `portfolio`
4. `blog`
5. `dashboard`
6. `auth-pages`
7. `ecommerce`

Why this order:

- the first four improve the most common freeform website prompts
- they directly improve start quality for hero/layout/content structure
- `dashboard` and `auth-pages` then stabilize app prompts
- `ecommerce` should come after the matcher is stronger and the starter philosophy is proven

## How external template references should be used

External references should be treated in three ways only:

1. technical base
2. structure reference
3. engineering reference

They should not be pasted directly into the scaffold library.

Examples:

- `vercel/examples/nextjs`
  - use as technical base for `base-nextjs`

- `vercel/commerce`
  - use as structure reference for `ecommerce`

- `portfolio-starter-kit`
  - use as reference for `portfolio`

- `blog-starter` and `solutions/blog`
  - use as references for `blog`

- `next-enterprise`
  - use as engineering reference, not a direct site scaffold

- `vercel/platforms`
  - use as platform reference for `sajtmaskin`, not as end-user site scaffold

## Matcher strategy: what needs to improve

Current matcher behavior is still simple keyword scoring.

That is enough for a first pass, but not enough for stable high-quality selection.

Next matcher improvements should include:

- clearer scoring separation between:
  - generic website
  - SaaS marketing
  - portfolio
  - blog/editorial
  - dashboard/app
  - auth
  - ecommerce
- stronger weighting for build intent
- tie-break rules when prompts contain mixed vocabulary
- better multilingual support
- later: retrieval/embedding support for richer category matching

## Practical goal of scaffold work

The goal is not "more templates".

The real goal is:

- better first render
- stronger visual baseline
- fewer missing sections
- less same-looking output
- lower model burden
- fewer errors downstream in preview/download flows

## Done vs not done

Done:

- scaffold engine exists
- UI wiring exists
- route integration exists
- three broad scaffolds exist

Not done:

- first real category wave
- robust matcher logic
- deeper scaffold metadata maturity
- validation suite specifically for scaffold coverage

## Immediate next action

If continuing this work, the next practical move should be:

1. define final manifest shape expectations
2. implement `landing-page`
3. implement `saas-landing`
4. implement `portfolio`
5. upgrade matcher accordingly
6. validate with test prompts and `npx tsc --noEmit`
