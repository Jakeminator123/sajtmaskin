# Plan 9: World-Class Builder Phase 3 - SMB Growth Stack

## Goal
Turn Sajtmaskin from a strong generator into a complete operating system for
company websites.

This phase focuses on what real companies need after the first good generation:
content editing, SEO, analytics, lead capture, integration packs, and safe
iteration over versions.

## Why this phase matters

`docs/analyses/sajtmaskin-matris.md` makes the product position clear:

- Next.js-based sites win on performance, SEO, integration depth, and future
  extensibility
- simpler builders still win when content editing and day-to-day operations are
  easier

Phase 3 closes that practical SMB gap.

## Workstreams

### 1. Editorial / CMS mode
Current issue:
- most meaningful content changes still depend on prompt-driven regeneration

Implementation direction:
- add structured editing for:
  - hero copy
  - services
  - testimonials
  - team
  - FAQ
  - contact details
  - metadata
  - blog/article collections
- support two content modes:
  - inline content editing for simple sites
  - structured collection editing for content-heavy sites

Primary code areas:
- `src/components/builder/`
- `src/app/builder/`
- file and version APIs under `src/app/api/v0/chats/[chatId]/files/route.ts`

### 2. SEO pack by default
Current issue:
- generated sites can look good without being consistently launch-ready for SEO

Implementation direction:
- generate and verify:
  - title templates
  - meta descriptions
  - canonical tags
  - Open Graph / Twitter cards
  - schema.org JSON-LD
  - sitemap and robots defaults
- add SEO review UI that flags:
  - missing titles/descriptions
  - duplicate page intent
  - broken heading hierarchy
  - missing OG image strategy

Primary code areas:
- `src/lib/gen/`
- `src/components/builder/PreviewPanel.tsx`
- post-check infrastructure in `src/lib/hooks/chat/post-checks.ts`

### 3. Analytics and conversion pack
Current issue:
- sites are not yet treated as measured business assets by default

Implementation direction:
- first-class setup for:
  - analytics provider
  - tag manager
  - conversion events
  - form submission goals
  - phone/email CTA tracking
- let the builder show which tracking stack is:
  - configured
  - suggested
  - missing

Primary code areas:
- `src/lib/gen/agent-tools.ts`
- `src/components/builder/ProjectEnvVarsPanel.tsx`
- deploy/publish surfaces in `src/app/builder/`

### 4. Forms, CRM, booking, and integration packs
Current issue:
- the system can detect integrations, but the user experience is still more
  low-level than "business ready"

Implementation direction:
- define opinionated packs for common SMB workflows:
  - lead form + email routing
  - CRM sync
  - booking/calendar
  - newsletter signup
  - quote request pipeline
- each pack should include:
  - required env vars
  - recommended components
  - post-publish verification checklist

Primary code areas:
- `src/lib/gen/agent-tools.ts`
- `src/lib/project-env-vars.ts`
- `src/app/api/v0/projects/[projectId]/env-vars/route.ts`
- builder setup UI

### 5. Version compare / restore / rollback
Current issue:
- iteration is possible, but business-safe editing is still too fragile

Implementation direction:
- add side-by-side compare for:
  - content differences
  - changed files
  - visual snapshot differences later
- allow restore of a previous promoted version
- allow safe rollback after a bad publish or bad follow-up

Primary code areas:
- `src/components/builder/VersionHistory.tsx`
- version routes under `src/app/api/v0/chats/[chatId]/versions/`
- version persistence helpers in `src/lib/db/chat-repository-pg.ts`

## Deliverables

- editorial mode for content updates without free-form regeneration
- SEO review and metadata pack
- analytics and conversion configuration flow
- SMB integration packs
- compare / restore / rollback flows

## Acceptance criteria

- routine content changes no longer require prompt-driven regeneration
- generated company sites ship with strong SEO defaults
- users can configure measurement and lead capture without dropping into ad-hoc
  code prompts
- teams can compare and safely restore versions

## Recommended build order

1. Editorial mode for core company-site sections.
2. SEO review and metadata pack.
3. Analytics/conversion configuration.
4. Forms/integration packs.
5. Version compare and rollback.
