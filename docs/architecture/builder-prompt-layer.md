# Builder Prompt Layer

This document describes the builder-specific prompt layer introduced to keep
UI intent selection separate from technical prompt construction.

## Goals

- keep `OpenClaw` outside the builder prompt refactor
- centralize technical prompt generation for shadcn blocks, shadcn components,
  AI elements, and approved build plans
- share placement logic between registry-backed prompts and AI-element prompts
- keep `src/components/ai-elements/` as presentation primitives instead of
  carrying builder-specific tool and approval logic

## Main modules

### `src/lib/builder/prompt-builder.ts`

Canonical builder prompt entry point.

- accepts a typed prompt source:
  - `inline`
  - `shadcn-block`
  - `shadcn-component`
  - `ai-element`
  - `approved-plan`
- produces:
  - final user-facing message text
  - structured prompt metadata (`sourceKind`, `isTechnical`,
    `preservePayload`)

The builder UI should describe what the user wants to do and delegate the
technical prompt assembly to this module.

### `src/lib/builder/placement-utils.ts`

Shared placement contract for prompt sources.

- owns `PlacementOption`
- owns `getPlacementInstruction(...)`
- owns the generic human label fallback used by builder UI

Registry-specific files should not own generic placement behavior anymore.

### `src/components/builder/BuilderMessageTooling.tsx`

Builder-only renderer/helpers for message tool state.

- structured tool rendering
- compact actionable tool cards
- agent log summaries
- awaiting-input and env-var detection helpers

`MessageList.tsx` keeps the conversation layout and AI-element primitives, but
delegates builder-specific tool rendering here.

## Prompt metadata

Builder-generated technical prompts now send explicit metadata through the chat
hooks:

- `promptSourceKind`
- `promptSourceTechnical`
- `promptSourcePreservePayload`

This lets prompt orchestration preserve large technical payloads without relying
only on brittle string heuristics.

## Current boundaries

- `ChatInterface.tsx` selects intent and sources.
- `BuilderShellContent.tsx` resolves placement confirmation and approved-plan
  execution.
- `prompt-builder.ts` converts those intents into technical prompts.
- `shadcn-registry-utils.ts` remains responsible for registry-specific prompt
  content, file mapping, and import rewriting.
- `ai-elements-catalog.ts` remains responsible for AI-element catalog data and
  prompt hints, but no longer owns the overall builder prompt flow.

## Explicit non-goal

This pass does not change the `OpenClaw` integration path.
