# Plan 16: Provider Adapter Architecture

**Status: COMPLETED (2026-03-17)**

## Goal
Reduce the architectural friction between the own-engine and v0 code paths
by introducing a clean provider adapter layer.

This is not a rewrite. The goal is to make the existing dual-backend system
easier to reason about, test, and extend, without changing user-facing
behavior.

## Source

Structural recommendation from `docs/old/analyses/2026-03-deep-research-buggar-overlapp.md`.
The audit identified that own-engine and v0-mirroring are interlaced in the
same API routes with extensive branch code, and that model/tier logic sits in
`src/lib/v0/models.ts` but is used by own-engine too.

## Delivered state

- Model catalog and selection live in `src/lib/models/` (neutral home).
  Historical `src/lib/v0/models.ts` and `src/lib/v0/modelSelection.ts` shims
  have been deleted.
- Plan-mode is isolated in `src/lib/providers/own-engine/plan-mode-response.ts`.
- Follow-up clarification is isolated in
  `src/lib/providers/own-engine/follow-up-clarification.ts`.
- Own-engine generation stream loop is shared via
  `src/lib/providers/own-engine/generation-stream.ts`.
- `BuilderStreamEventMap` is the typed contract in
  `src/lib/gen/stream/builder-stream-contract.ts`, used directly by own-engine
  and referenced by v0-fallback routes.
- Stream routes are materially thinner dispatchers (create ~1380, follow-up
  ~1380 lines, down from ~1840/1935).

## Workstreams

### 1. Extract model selection to neutral location
Current issue:
- `src/lib/v0/models.ts` is conceptually "v0" but operationally shared

Implementation direction:
- Move canonical tier definitions and `resolveModelSelection` to
  `src/lib/models/` or `src/lib/gen/models/`
- Let `src/lib/v0/models.ts` re-export or slim down to v0-specific ID
  mappings only
- Update all imports

Primary code:
- `src/lib/v0/models.ts`
- `src/lib/v0/modelSelection.ts`
- All consumers in `src/lib/gen/` and stream routes

### 2. Define internal stream contract
Current issue:
- own-engine emits SSE via `stream-format.ts`; v0 fallback parses via
  `v0Stream.ts`; both produce builder-consumable events but through
  different code

Implementation direction:
- Define a typed `BuilderStreamEvent` union in `src/lib/gen/stream/`
- Have own-engine emit `BuilderStreamEvent` directly
- Have v0 adapter translate v0 stream events into the same type
- Routes consume `BuilderStreamEvent` uniformly

Primary code:
- `src/lib/gen/stream-format.ts`
- `src/lib/gen/route-helpers.ts`
- `src/lib/v0Stream.ts`

### 3. Isolate plan-mode into its own handler
Current issue:
- Plan-mode is a separate concern but shares the same route handler with
  full generation, making the route files very large

Implementation direction:
- Extract plan-mode handling from both stream routes into a shared
  `handlePlanMode()` function
- Keep the route files as thin dispatchers: detect mode, call handler
- This also makes the credit-commit fix (Plan 14) easier to verify

Primary code:
- `src/app/api/v0/chats/stream/route.ts`
- `src/app/api/v0/chats/[chatId]/stream/route.ts`

## Scope boundary

This plan does NOT:
- Rename or move the `/api/v0/` route prefix (that is a separate compat
  decision)
- Remove v0-fallback capability
- Change the builder SSE contract

## Acceptance criteria

- Model/tier logic has a neutral home that does not confuse "v0 layer" with
  "own engine"
- A single typed stream event contract exists and is used by both providers
- Plan-mode is a clearly isolated handler, not interleaved branch code
- All existing tests and stream behavior remain unchanged

## Recommended build order

1. Extract model selection (safe rename + re-export)
2. Isolate plan-mode handler (reduces route complexity first)
3. Define BuilderStreamEvent contract (largest, depends on 1+2 being stable)
