# Model And Build Profile Schema

**Terminology:** “Model lane”, “product lane”, “polish lane”, and “Thinking” are
defined in `.cursor/rules/terminology.mdc` under **Builder model lanes**. This
file maps those concepts to **profile IDs**, **env keys**, and **code entry
points**.

## Scope

This document describes the builder's active model surfaces and how they differ.

Primary code sources:

- **`config/ai_models/manifest.json`** — committed defaults for own-engine models per build profile, prompt-assist defaults, token budgets, timeouts, and workload metadata (loaded via `src/lib/ai-models/load-manifest.ts`; env vars override). Human-oriented notes: `config/ai_models/_READ_ME_FIRST.md` and `config/ai_models/*.md`.
- `src/lib/gen/defaults.ts` — runtime env + manifest fallbacks for generation and assist.
- `src/lib/models/catalog.ts`
- `src/lib/models/selection.ts`
- `src/lib/models/phase-routing.ts`
- `src/lib/validations/chatSchemas.ts`
- `src/lib/builder/defaults.ts`
- `src/lib/builder/promptAssist.ts`

## Three model lanes + one flag

The builder UI exposes multiple controls, but they belong to different lanes:

1. `Byggmodell` controls the **model lane** (build lane):
   selects one build profile: `fast`, `pro`, `max`, `codex`, or `anthropic`.
2. `Forbattra` controls the **product lane** (prompt-assist lane):
   selects provider/model strings used before generation.
3. `Skriv om` controls the **polish lane**:
   low-cost, fast, text-only prompt rewrite.
4. `Thinking` is a separate generation flag, not a lane.

Important rules:

- Do not mix model-lane build-profile IDs with product-lane model strings.
- Do not treat `Thinking` as a lane or as a fifth tier.
- `Anthropic` is a lane option, not an extra layer on top.

## Model lane build profiles

The builder's internal build profiles are:

- `fast`
- `pro`
- `max`
- `codex`
- `anthropic`

These are neutral internal profile IDs.

They are not the same thing as:

- v0 Platform API model IDs such as `v0-1.5-lg`
- prompt-assist model strings such as `openai/gpt-5.4`
- concrete provider model IDs such as `gpt-5.4` or `claude-sonnet-4.6`

## Default selection

- default selected build profile: `pro`
- default resolved own-engine build model: `gpt-5.3-codex`
- default prompt-assist model: `openai/gpt-5.4`
- default polish model: `openai/gpt-5.3-codex`

## Build profile mapping

| Profile | UI label | Env key | Default own-engine model | Default provider family | Legacy v0 fallback model |
|---------|----------|---------|--------------------------|-------------------------|--------------------------|
| `fast` | `Snabb` | `SAJTMASKIN_MODEL_FAST` | `gpt-4.1` | OpenAI | `v0-max-fast` |
| `pro` | `Lagom` | `SAJTMASKIN_MODEL_PRO` | `gpt-5.3-codex` | OpenAI | `v0-1.5-md` |
| `max` | `Tanker` | `SAJTMASKIN_MODEL_MAX` | `gpt-5.4` | OpenAI | `v0-1.5-lg` |
| `codex` | `Kod Max` | `SAJTMASKIN_MODEL_CODEX` | `gpt-5.3-codex-max` | OpenAI | `v0-gpt-5` |
| `anthropic` | `Anthropic` | `SAJTMASKIN_MODEL_ANTHROPIC` | `claude-sonnet-4.6` | Anthropic | `v0-1.5-lg` |

Important nuance:

- the UI labels are intentionally more semantic than vendor-marketing-heavy
- the actual own-engine model can drift if `SAJTMASKIN_MODEL_*` env vars are overridden
- that means a UI label like `Tanker` can still resolve to a different concrete model if env overrides point there

## Accepted incoming IDs

Incoming `modelId` values may be:

- canonical build-profile IDs
- legacy v0-flavored IDs still present in local storage, URLs, or older data

Accepted legacy aliases:

| Legacy ID | Canonical profile |
|-----------|-------------------|
| `v0-max-fast` | `fast` |
| `v0-1.5-sm` | `fast` |
| `v0-max` | `fast` |
| `v0-1.5-md` | `pro` |
| `v0-mini` | `pro` |
| `v0-pro` | `pro` |
| `v0-1.5-lg` | `max` |
| `v0-gpt-5` | `codex` |

Unknown IDs are rejected by the Zod request schema.

## Resolution flow

1. The client sends `modelId` as the selected build profile, for example `max`.
2. `canonicalizeModelId()` resolves canonical or legacy inputs.
3. `resolveModelSelection()` normalizes the request to one canonical profile.
4. `resolveEngineModelId(..., false)` maps that profile to the own-engine model.
5. `src/lib/gen/models.ts` picks the concrete provider client:
   - `gpt-*` -> OpenAI via `@ai-sdk/openai`
   - `claude-*` -> Anthropic via `@ai-sdk/anthropic`

Important current nuance:

- the normal builder routes always call `resolveEngineModelId(..., false)`
- the active builder flow therefore uses the own engine, even though the routes still live under `/api/v0/...`

## Product lane (prompt assist)

Product lane is separate from model-lane build profile resolution.

| Surface | UI control | Default env | Route | API shape |
|---------|------------|-------------|-------|-----------|
| Shallow rewrite | `Forbattra` | `SAJTMASKIN_ASSIST_MODEL` | `/api/ai/chat` | `streamText()` |
| Deep brief | `Forbattra` + `Deep Brief Mode` | `SAJTMASKIN_ASSIST_MODEL` | `/api/ai/brief` | `generateObject()` |
| Spec chain | no normal builder control | none | `/api/ai/spec` | `processPromptWithSpec()` |

## Polish lane (low-cost rewrite)

Polish lane is deliberately separate from both model lane and product lane.

| Surface | UI control | Default env | Route | API shape |
|---------|------------|-------------|-------|-----------|
| Prompt polish | `Skriv om` | `SAJTMASKIN_POLISH_MODEL` | `/api/ai/chat` | `streamText()` |

Important current nuance:

- `Skriv om` normally uses the polish lane model, but follows the Anthropic product lane when the current assist lane is Anthropic
- deep brief is only used before the first message in a new chat
- builder `specMode` usually builds `sajtmaskin.spec.json` from `briefToSpec()` or `promptToSpec()` in the client flow; the dedicated `/api/ai/spec` route exists, but the normal builder path does not currently call it

## Prompt-assist provider strings

Prompt assist accepts provider-coded model strings such as:

- `openai/gpt-5.4`
- `openai/gpt-5.3-codex`
- `anthropic/claude-sonnet-4.6`
- `anthropic/claude-opus-4.6`
- `v0-1.5-md`

Current provider categories:

- OpenAI gateway-class strings, for example `openai/*`
- Anthropic prompt-assist strings, for example `anthropic/*` and `anthropic-direct/*`
- v0 Model API strings, for example `v0-1.5-md`

Important current nuance:

- the route names and labels still talk about `gateway`
- some code constants still keep historical "gateway" naming for allowlists
- the current prompt-assist implementation constructs direct OpenAI/Anthropic AI SDK clients in `src/lib/builder/gateway-policy.ts`
- in practice, "gateway-class" selection currently means a gateway-shaped model string plus direct provider client construction in the route implementation

## Thinking

`Thinking` is a separate boolean passed into generation metadata and the own-engine
pipeline.

- it is not part of `fast | pro | max | codex`
- it does not change the canonical build-profile ID
- it does not affect prompt-assist route selection

## Validation surface

`src/lib/validations/chatSchemas.ts` enforces:

- `modelId` must be one of the accepted canonical or legacy build-profile IDs
- create-chat requests default to `pro`
- send-message requests may omit `modelId`
- prompt metadata may include `promptAssistModel`, `promptAssistDeep`, and `promptAssistMode`

## Phase routing

`src/lib/models/phase-routing.ts` maps each `GenerationPhase` to an `OwnModelId`
using `phaseRouting.defaultByTier` in `config/ai_models/manifest.json`:

- **fast**: every phase follows `selected_build_model` (the tier’s primary model,
  default `gpt-4.1`).
- **pro**, **max**, **codex**: **planner**, **generator**, and **fixer** use the
  profile’s primary model; **verifier** and **deploy-assistant** use **`gpt-4.1`**
  for efficiency.
- **anthropic**: **planner**, **generator**, **fixer**, and **verifier** follow the
  tier’s primary Claude model; **deploy-assistant** uses **`gpt-4.1`** (current
  manifest default).

Env overrides on the build profile still apply to the resolved **base** model for
phases that resolve via `selected_build_model`.

## Archived docs

Earlier model-schema notes and tier-history docs were archived under
git under `docs/plans/avklarat/` (see `docs/plans/avklarat/README.md`).

