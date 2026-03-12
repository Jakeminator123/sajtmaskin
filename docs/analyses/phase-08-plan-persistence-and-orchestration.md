# Phase 8: Plan Persistence And Orchestration Gap

> Resolved on 2026-03-12. Kept as implementation trace for why Plan 8 could be
> archived after the persistence/orchestration pass.

This note captures the last meaningful Phase 8 uncertainty after the March 2026
planning pass.

It is intentionally placed in `docs/analyses/` rather than `docs/schemas/`
because the runtime contract is not fully settled yet.

## Original gap

- Own-engine chats now support a real plan-mode pass for both new chats and
  follow-up turns.
- The planner emits richer `PlanArtifact` data with site type, pages,
  contracts, scaffold choice, and template recommendations.
- The builder renders that data through `BuildPlanCard` and supports blocker
  follow-up plus `Godkänn plan och bygg`.
- The approve path already has a canonical execution bridge:
  `buildApprovedPlanExecutionPrompt(plan)` -> regular build message.
- Engine chat storage still persisted only summary text for planner replies.
  The full plan card lived in message `uiParts`, which survived through client
  state and explicit project saves, not through the raw engine chat history
  itself.
- V0 fallback still bypasses plan mode entirely.

## Why this is the real remaining gap

The strongest remaining Phase 8 problem is not missing UI.

It is that planning is only partially first-class in persistence:

- `engine_messages` remains `content`-centric
- `BuildPlanCard` is carried by `uiParts`
- reloads of raw engine chats can recover the planner summary, but not the full
  structured plan card
- `usePlanExecution.ts` still reads like the orchestrator even though the
  approve/build flow now runs through the stream routes and prompt handoff

That mismatch makes the implementation look more complete than it actually is.

## Resolution implemented on 2026-03-12

The repo now implements the recommended path:

- `engine_messages` persists `ui_parts` in the own-engine storage path
- plan-mode stream routes persist the summary text and canonical plan part
- own-engine chat reload returns `uiParts` from the server path
- the restore hook can prefer richer server data over an older local snapshot
- `usePlanExecution.ts` was removed so approve -> build has one clear owner
- v0 fallback remains explicitly documented as out of scope for plan-mode parity

## Recommended completion path

### 1. Persist plan `uiParts` in engine chat storage

Add a `ui_parts` JSON column to the engine message storage path and mirror it in
the SQLite fallback.

Then update the repository layer so `Message` and `addMessage()` can round-trip
`uiParts` instead of truncating them down to plain text.

### 2. Persist planner replies as structured messages

When the plan pass completes in the stream routes, persist the assistant summary
and the plan `uiParts` together.

That makes the raw chat history capable of restoring the same review state the
builder saw during the original stream.

### 3. Make raw chat reload the canonical restore path

Keep `project_data.messages` as a convenience snapshot for saved projects, but
do not make it the canonical source of truth for planner state.

The planner belongs to the chat lifecycle, not only to saved project records.

### 4. Simplify orchestration ownership

Treat the prompt-based approve/build bridge as the canonical execution path.

After persistence lands, either:

- remove `usePlanExecution.ts`, or
- rewrite it so it orchestrates the same server-backed flow instead of implying
  a separate client-owned phase runner

### 5. Keep v0 fallback explicitly out of scope for now

Document that plan mode is currently an own-engine capability.

Do not force parity into the v0 fallback path unless product direction makes
that flow important again.

## Anti-goals

The following would add complexity without solving the root issue:

- making `project_data.messages` the main persistence layer for planner state
- building a larger multi-phase client runner before raw chat persistence is
  fixed
- forcing plan-mode parity into the v0 fallback path before the own-engine path
  is fully coherent

## Exit criteria

Phase 8 can be considered clear when all of the following are true:

1. assistant plan messages round-trip their `uiParts` through engine storage
2. a raw chat reload restores the same plan review state without relying on
   local-only storage
3. the repo has one obvious orchestration owner for approve -> build
4. the docs explicitly state that v0 fallback does not yet provide plan-mode
   parity

## Lifecycle note

This analysis is now historical context rather than an open blocker.

Plan 8 can be archived because the persistence/orchestration decision has been
implemented and reflected back into the canonical docs.
