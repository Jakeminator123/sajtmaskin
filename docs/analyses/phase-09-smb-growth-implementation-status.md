# Phase 9: SMB Growth Implementation Status

> Re-verified on 2026-03-16. This note tracks the practical implementation state
> of the current builder/Kodvy/SMB Growth work, not the full long-range moat
> roadmap from Phase 10.

## Scope

This status note covers the active Phase 9 path described in
`docs/plans/active/09-world-class-builder-phase-3-smb-growth.md`, especially:

- version-backed content editing in Kodvy
- SEO / analytics / business workflow post-check surfaces
- initial version compare / restore behavior
- waiting-input builder UX and QA around those flows

It does not claim that the larger Phase 10 learning / telemetry / feedback moat
 is complete.

## What Is Now Concretely Implemented

### 1. Structured Kodvy editing

The builder now supports direct version-backed editing in `PreviewPanel` for a
substantial set of recurring scaffold/content patterns:

- metadata
- raw file editing
- contact details
- hero copy
- services
- FAQ
- testimonials
- stat cards
- process steps
- featured products
- pricing cards
- pricing feature lists
- category names
- navigation labels
- CTA button labels
- blog post title/excerpt metadata
- footer link groups

These editors write through the version file PATCH path instead of requiring a
fresh prompt-driven regeneration for each routine content tweak.

### 2. Post-check guidance layers

The post-check system now surfaces structured follow-up guidance for:

- editorial/content packs
- business workflow packs
- SEO issues and quick actions
- analytics/tracking issues and quick actions

This means builder follow-up no longer depends only on free-form assistant text;
the UI can now propose targeted next steps from runtime signals.

### 3. First practical SMB setup slices

The Phase 9 runtime path now includes first practical slices for:

- analytics/conversion setup and visibility
- business workflow packs (lead capture / booking / CRM-oriented follow-up)
- initial compare / restore / rollback behavior for versions

These slices are not the final end-state, but the product is past the
"placeholder plan" stage and now contains real implementation in the builder
flow.

### 4. Awaiting-input UX hardening

The builder now handles "Svar krävs för att fortsätta" more coherently:

- clarifying questions survive the sync/fallback path better
- non-approval follow-up questions are less likely to render as fake
  "Godkänn förslag" flows
- the visible message dialog is covered by UI tests
- the preview empty state can now show the actual pending question and options

### 5. QA coverage improvements

QA is no longer limited to helper-only tests. The current branch history adds:

- helper tests for many structured editors
- `PreviewPanel` smoke tests for representative editor surfaces
- `PreviewPanel` save-flow tests covering real PATCH behavior
- `MessageList` tests for the visible awaiting-input dialog
- targeted regression coverage for nav/footer false-positive matching

## Workstream Status

### Editorial / CMS mode

Status: largely implemented for the current builder/Kodvy target.

Implemented:

- direct structured editing for many company-site sections
- version-backed save flow in the existing builder file/version model

Still missing or shallow:

- no dedicated team editor
- no deeper article-body / collection-management UI yet
- no broader non-technical "CMS mode" shell beyond the current code-view-driven
  experience

### SEO pack by default

Status: substantial progress, but not fully complete.

Implemented:

- SEO review signals
- SEO quick actions
- metadata editing support

Still missing or shallow:

- stronger "by default" generation guarantees for all SEO surfaces
- fuller publish/readiness enforcement around SEO quality

### Analytics and conversion pack

Status: first practical slices implemented.

Implemented:

- baseline analytics plumbing already existed
- builder/runtime follow-up and configuration slices now exist
- analytics quick actions now exist

Still missing or shallow:

- richer provider-specific setup flows
- stronger production verification for tag managers / conversion events

### Forms / CRM / booking / integration packs

Status: first practical slices implemented.

Implemented:

- business workflow pack detection
- quick actions and integration-oriented follow-up prompts

Still missing or shallow:

- deeper guided setup and richer verification checklists in the builder UI

### Version compare / restore / rollback

Status: first practical slice implemented.

Implemented:

- initial compare / restore / rollback behavior

Still missing or shallow:

- richer diffs
- more explicit rollback safety / publish-recovery UX
- future visual diffing

## What Still Needs To Happen Before This Phase Feels Done

To call the current Phase 9 builder/Kodvy work "practically complete", the
highest-value remaining work is:

1. Manual end-to-end QA in real builder sessions.
2. Small bug fixes found during those QA runs.
3. Decide whether any final high-signal editor gap still matters enough to add
   now (for example team or richer blog/content collection editing).
4. Tighten the user-facing polish so the experience feels cohesive, not like a
   stack of independent editor widgets.

## Honest Remaining Gaps Outside This Scope

Even if the builder/Kodvy/SMB editing loop is nearly done, the larger
"world-class" vision still has major unfinished areas, especially under Phase
10:

- unified generation telemetry
- scaffold learning/feedback loops
- collaboration / approval primitives
- phase-aware model routing
- eval suite as a stronger product guardrail

Those are real roadmap items, but they are not blockers for calling the current
Phase 9 builder editing push "mostly complete."

## Bottom Line

**Phase 9 is now COMPLETE.** Orchestrator run `2026-03-18-plan9-10-completion`
closed all remaining gaps:

- Team Kodvy editor (name/role/bio)
- Server-side SEO preflight with critical SEO as publish blockers
- Integration setup wizard with categorized guided flows
- Content-level version diffs with line-by-line hunks
- Rollback confirmation dialog

The plan file has been moved to `docs/plans/archived/`.
