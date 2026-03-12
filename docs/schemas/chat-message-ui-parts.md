# Chat Message UI Parts

This document describes the canonical stored shape for structured builder
message parts that round-trip through own-engine chat storage.

## Purpose

Own-engine chat messages are primarily text, but some assistant turns also carry
structured UI state that the builder needs to restore after reload.

The current stable use case is the Phase 8 planning review card.

## Storage surfaces

| Surface | Field | Purpose |
|------|------|---------|
| `engine_messages` | `ui_parts` | Canonical own-engine chat persistence for structured assistant message parts |
| `project_data` | `messages` | Convenience snapshot for saved projects, not the primary planner source of truth |
| local storage | `sajtmaskin:messages:{chatId}` | Client cache used for fast restore between sessions |

Code sources of truth:

- `src/lib/db/schema.ts`
- `src/lib/db/chat-repository-pg.ts`
- `src/lib/db/chat-repository.ts`
- `src/app/api/v0/chats/[chatId]/route.ts`
- `src/lib/hooks/usePersistedChatMessages.ts`

## Message shape

Own-engine chat messages continue to use text content as the base payload.

Structured parts are stored in `ui_parts` as a JSON array of plain objects:

```ts
type StoredUiPart = {
  type?: string;
  [key: string]: unknown;
};
```

`ui_parts` may be `null` for older rows or text-only messages.

## Stable plan part contract

The currently stable persisted part is the plan-review card:

```ts
type StoredPlanUiPart = {
  type: "plan";
  plan: {
    title: string;
    description?: string;
    steps?: Array<
      | string
      | {
          title?: string;
          description?: string;
          status?: string;
        }
    >;
    blockers?: unknown[];
    assumptions?: unknown[];
    raw: Record<string, unknown>;
  };
};
```

Notes:

- `raw` contains the normalized `PlanArtifact` payload used by the builder
  review UI.
- `steps`, `blockers`, and `assumptions` are included so the planner card can
  restore without recomputing the entire display shape from text.
- This contract is stable enough for own-engine plan review, but not yet a
  general promise that every streamed tool part will be stored forever.

## Restore rule

For own-engine chats, server-provided `uiParts` should be treated as the
canonical planner restore path.

The client may still use local storage for speed, but if the server provides a
richer message set, the richer server version should win.

## Out of scope

This schema note does not imply:

- full v0 fallback parity for plan mode
- persistence of every transient streamed tool part
- a separate client-owned planner orchestrator
