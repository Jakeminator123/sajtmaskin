# v0 Model Schema

> Source of truth in code: `src/lib/v0/models.ts`

## Canonical Model IDs

| API model ID | UI label | Description | Default |
|-------------|----------|-------------|:-------:|
| `v0-max-fast` | Max Fast | Max quality + 2.5x faster (Claude Opus 4.6 Fast) | Yes |
| `v0-1.5-lg` | Max | Advanced reasoning, 512K context | |
| `v0-1.5-md` | Pro | Best error-free rate, everyday tasks | |
| `v0-gpt-5` | GPT-5 | GPT-5 composite model (experimental) | |

## Legacy Aliases

Old IDs that may exist in localStorage, database rows, or URL params.
Automatically mapped to canonical IDs by `canonicalizeModelId()`.

| Legacy ID | Maps to |
|-----------|---------|
| `v0-mini` | `v0-1.5-md` |
| `v0-pro` | `v0-1.5-md` |
| `v0-max` | `v0-max-fast` |

## Removed IDs

- `v0-1.5-sm` (Mini/Small) — removed entirely, not accepted by allowlist.

## Strict Allowlist Policy

All model IDs are validated against a closed set (canonical + legacy).
Unknown IDs are rejected at the Zod schema level (`chatSchemas.ts`).
The `modelSelection` resolver silently falls back to `v0-max-fast` for
any ID that is not in the allowlist.

There is no custom/free-text model ID support.

## Quality Level Mapping

Used by `v0-generator.ts` and template/registry init routes to resolve
a `QualityLevel` string to a canonical model ID.

| Quality | Model ID |
|---------|----------|
| `light` | `v0-1.5-md` |
| `standard` | `v0-1.5-md` |
| `pro` | `v0-1.5-md` |
| `premium` | `v0-max-fast` |
| `max` | `v0-max-fast` |

## Pricing

Defined in `src/lib/credits/pricing.ts`. Imports `canonicalizeModelId`
from `models.ts` to resolve legacy IDs before cost lookup.

| Model | Create cost | Refine cost |
|-------|:-----------:|:-----------:|
| `v0-max-fast` | 10 | 6 |
| `v0-1.5-lg` | 10 | 6 |
| `v0-1.5-md` | 7 | 4 |
| `v0-gpt-5` | 10 | 6 |

## Architecture

```
User selects tier in BuilderHeader
        |
        v
selectedModelTier (useBuilderState)
        |
        v
useV0ChatMessaging sends modelId = selectedModelTier
        |
        v
API route (stream/route.ts, etc.)
  -> resolveModelSelection({ requestedModelId })
  -> canonicalizeModelId()
  -> v0.chats.create({ modelConfiguration: { modelId } })
        |
        v
v0 Platform API
```

## Key Files

| File | Role |
|------|------|
| `src/lib/v0/models.ts` | Single source of truth (IDs, labels, aliases, defaults) |
| `src/lib/validations/chatSchemas.ts` | Zod schemas with strict enum validation |
| `src/lib/v0/modelSelection.ts` | Request-time resolution (canonical + fallback) |
| `src/lib/builder/defaults.ts` | UI options, default tier, prompt assist config |
| `src/lib/credits/pricing.ts` | Cost tables and model tier resolution for billing |
| `src/lib/v0/v0-generator.ts` | Quality-to-model mapping for generate/refine/template |
| `src/lib/builder/chat-generation-settings.ts` | Per-chat localStorage persistence |

## Two Separate APIs

1. **Platform API** (`v0-sdk`, `v0.chats.create`) — builds sites, returns
   files + demoUrl. Uses `modelConfiguration.modelId` with canonical IDs.
2. **Model API** (`api.v0.dev/v1/chat/completions`) — text completion,
   OpenAI-compatible. Used for prompt assist only. Model IDs: `v0-1.5-md`,
   `v0-1.5-lg`.

These APIs are independent; the model schema above applies to the Platform API.
