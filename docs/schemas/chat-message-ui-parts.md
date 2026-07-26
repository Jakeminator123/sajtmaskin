# Chat Message UI Parts

This document describes the canonical stored shape for structured builder
message parts that round-trip through own-engine chat storage.

## Purpose

Own-engine chat messages are primarily text, but some assistant turns also carry
structured UI state that the builder needs to restore after reload.

Two part types are stable: the Phase 8 planning review card and the
prompt-source marker that tells a machine-written prompt apart from something the
user typed.

## Storage surfaces


| Surface           | Field                          | Purpose                                                                          |
| ----------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| `engine_messages` | `ui_parts`                     | Canonical own-engine chat persistence for structured assistant message parts     |
| `engine_messages` | `thinking`                     | Concatenated reasoning/chain-of-thought captured for assistant messages whose generator emitted `reasoning-delta` parts. Nullable. Read back by `GET /api/engine/chats/[chatId]` as `messages[].thinking` so the builder can re-render the collapsed thinking panel after F5. |
| `project_data`    | `messages`                     | Convenience snapshot for saved projects, not the primary planner source of truth |
| local storage     | `sajtmaskin:messages:{chatId}` | Client cache used for fast restore between sessions                              |


Code sources of truth:

- `src/lib/db/schema.ts`
- `src/lib/db/chat-repository-pg.ts`
- `src/lib/gen/plan/schema.ts`
- `src/app/api/engine/chats/stream/route.ts` (kanonisk create-stream route)
- `src/lib/api/engine/chats/chat-message-stream/handler.ts` (kanonisk follow-up stream-handler; fasad: `chat-message-stream-post.ts`)
- `src/app/api/engine/chats/[chatId]/stream/route.ts` (kanonisk follow-up route)
- `src/app/api/engine/chats/[chatId]/route.ts`
- `src/lib/hooks/usePersistedChatMessages.ts`

> Tidigare `/api/v0/chats/**`-aliases borttagna 2026-04-20 (P29 Fas 1B).

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

- `raw` contains the enriched planner payload that is persisted alongside the
normalized review shape. It may be the normalized `PlanArtifact`, but it can
also be the richer pre-normalized `planData` object when that is available.
- `steps`, `blockers`, and `assumptions` are included so the planner card can
restore without recomputing the entire display shape from text.
- This contract is stable enough for own-engine plan review, but not yet a
general promise that every streamed tool part will be stored forever.

## Stable prompt-source part contract

A user row whose prompt was written by the builder rather than by the person
carries a provenance marker:

```ts
type StoredPromptSourceUiPart = {
  type: "prompt-source";
  sourceKind: "autofix";
};
```

Owner: `PROMPT_SOURCE_UI_PART_TYPE` and `isAutoRepairPromptMessage()` in
`src/lib/builder/types.ts`. Written by both the optimistic client row
(`useSendMessage.ts`) and the persisted server row (`chat-message-stream/handler.ts`),
so a reload cannot change how the turn reads.

The marker exists because the auto-repair prompt is a technical instruction to the
model, and rendering it in the user's own bubble made the builder look like it was
speaking as the user. `MessageList.tsx` renders a marked row as a collapsed system
row instead. Rows persisted before the marker existed are recognised by their
`AUTO-FIX REQUEST` content prefix; that fallback is the only reason the prefix is
still referenced anywhere.

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

