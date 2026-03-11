# Model Tier Changes

## Current State

See `scheman/model-schema.md` for the canonical model schema.
Source of truth in code: `src/lib/v0/models.ts`.

### Available models (4)

| API model ID | UI label | Default |
|-------------|----------|:-------:|
| `v0-max-fast` | Max Fast | Yes |
| `v0-1.5-lg` | Max | |
| `v0-1.5-md` | Pro | |
| `v0-gpt-5` | GPT-5 | |

### Strict allowlist

Model IDs are validated by a Zod enum in `chatSchemas.ts`.
Unknown IDs are rejected at validation time. The resolver in
`modelSelection.ts` falls back to `v0-max-fast` for any invalid input.

Custom/free-text model IDs are no longer supported. The `customModelId`
state, persistence, and hook wiring have been removed.

### Legacy aliases

| Old ID | Maps to |
|--------|---------|
| `v0-mini` | `v0-1.5-md` |
| `v0-pro` | `v0-1.5-md` |
| `v0-max` | `v0-max-fast` |

## Change History

### 2026-02-28 (cleanup)

- Created `src/lib/v0/models.ts` as single source of truth for all model
  IDs, labels, aliases, quality mappings, and the default tier.
- Refactored `chatSchemas.ts` to use strict Zod enum validation.
- Rewrote `modelSelection.ts` — removed `usingCustomModelId` /
  `customModelIdIgnored` fields and the pass-through logic for unknown IDs.
- Removed `customModelId` from `useBuilderState`, `useBuilderPageController`,
  `useBuilderProjectActions`, `chat-generation-settings`, hook types,
  `useCreateChat`, `useSendMessage`, and `stream-handlers`.
- Updated `pricing.ts` and `v0-generator.ts` to import from `models.ts`.
- Updated `builder/types.ts` (`MODEL_TIER_TO_QUALITY`) to derive from
  `QUALITY_TO_MODEL`.
- Cleaned stale UI copy in `BuilderHeader.tsx` and error messages in
  `helpers.ts`.
- Created `scheman/model-schema.md` as the canonical schema document.
- Synced `LLM/schemas_overview.txt` and `LLM/AC-schema.txt`.

### 2026-02-28 (initial model tier work)

- Replaced forced `v0-max` with user-selectable model tiers.
- Added `v0-max-fast` (confirmed from v0.app network inspection).
- Removed `v0-1.5-sm`, experimental model ID system, and `FORCED_MODEL_TIER`.
- Simplified thinking logic (all remaining models support it).

## Own Engine Model Mapping

When the own engine is active (default), canonical tier IDs map to OpenAI models:

| Tier | Canonical ID | OpenAI model | Use case |
|------|-------------|-------------|----------|
| Fast | `v0-max-fast` | `gpt-4.1` | Quick edits, simple sites |
| Pro | `v0-1.5-md` | `gpt-5.3-codex` | Code-specialized, balanced (default) |
| Max | `v0-1.5-lg` | `gpt-5.4` | Flagship, best reasoning |
| Codex Max | `v0-gpt-5` | `gpt-5.1-codex-max` | Code + xhigh reasoning |

## AI Gateway Models (prompt assist, audit, wizard)

| Model | Use | Cost/M in+out |
|-------|-----|------|
| `openai/gpt-4.1-mini` | Polish mode (quick text cleanup) | ~$0.40 |
| `openai/gpt-5.3-codex` | Default prompt assist (rewrite) | $2.50/$15 |
| `openai/gpt-5.4` | Fallback #1 | $2.50/$15 |
| `anthropic/claude-opus-4.6` | Fallback #2, premium assist | $5/$25 |
| `anthropic/claude-sonnet-4.6` | Fallback #3, spec generation | $3/$15 |
| `openai/gpt-5.2` | Fallback #4, wizard/domain routes | ~$2/$10 |

## Verification

- `v0-max-fast` confirmed via v0.app Network tab (`modelId` in
  `SubmitNewUserMessage` payload).
- `v0-gpt-5` listed by v0 MCP server (mcp.v0.dev) but not confirmed
  in v0.app UI — kept as experimental option.
