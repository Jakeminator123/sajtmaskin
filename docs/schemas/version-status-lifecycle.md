# Version Status Lifecycle

## Scope

This document defines the canonical display states for engine versions in the
builder, version history, and readiness checks.

Primary code source:
- `src/lib/db/engine-version-lifecycle.ts`

## States

| Internal state | Display label | Badge color | When it applies |
|---|---|---|---|
| `draft` | Draft | gray/secondary | Version just created, no verification run yet |
| `verifying` | Verifying | gray/secondary | Automatic verification in progress |
| `preview-ready` | Preview-klar | amber/yellow | Verification failed but a working preview URL exists. The version is usable for iteration but not ready for production publish. |
| `retrying` | Omtag | amber/yellow | Verification failed and a newer version already exists (autofix or manual retry) |
| `failed` | Fel | red/destructive | Verification failed, no preview URL, and no newer version exists |
| `promoted` | Promoted | green/default | Version passed verification and is promoted for publish |

## Rules

1. A version should only show red "Fel" when it has no usable preview and no
   recovery path. If a preview URL exists, show "Preview-klar" instead.

2. "Preview-klar" is the normal state for freshly generated versions in the
   builder's iteration loop. Most first-generation versions will land here
   because automatic verification is strict.

3. Publish/deploy readiness is a separate check from version display status.
   A version can be "Preview-klar" in the UI but still have publish blockers
   (missing env vars, SEO issues, etc.).

4. "Promoted" should only appear after explicit verification pass, not after
   a successful generation alone.

## Readiness vs display status

These are two different systems:

| System | Purpose | Shown where |
|---|---|---|
| Version display status | Visual label on each version card | Version history panel |
| Chat readiness | Publish/deploy gating with blockers and warnings | Launch readiness card, header badge |

A version can be `preview-ready` (display) while the chat is `blocked` (readiness)
because readiness checks env vars, SEO, and other cross-cutting concerns that are
independent of whether the preview renders.

## Badge color mapping

| Color | Tailwind class pattern | Meaning |
|---|---|---|
| Red/destructive | `border-red-*` or `variant="destructive"` | Hard failure, no recovery |
| Amber/yellow | `border-amber-500/40 bg-amber-500/10 text-amber-*` | Soft state, iteration expected |
| Gray/secondary | `variant="secondary"` | Neutral, in progress |
| Green/default | `variant="default"` or emerald classes | Success, ready |
