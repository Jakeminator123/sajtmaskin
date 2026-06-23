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
- `src/lib/builder/prompt-assist/` (post-OMTAG-03 package)

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
| `fast` | `Snabb` | `SAJTMASKIN_MODEL_FAST` | `gpt-5.4-mini` | OpenAI | `v0-max-fast` |
| `pro` | `Lagom` | `SAJTMASKIN_MODEL_PRO` | `gpt-5.3-codex` | OpenAI | `v0-1.5-md` |
| `max` | `Tanker` | `SAJTMASKIN_MODEL_MAX` | `gpt-5.4` | OpenAI | `v0-1.5-lg` |
| `codex` | `Kod Max` | `SAJTMASKIN_MODEL_CODEX` | `gpt-5.3-codex` | OpenAI | `v0-gpt-5` |
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
4. `resolveEngineModelId()` maps that profile to the own-engine model.
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

## Polish lane (low-cost rewrite)

Polish lane is deliberately separate from both model lane and product lane.

| Surface | UI control | Default env | Route | API shape |
|---------|------------|-------------|-------|-----------|
| Prompt polish | `Skriv om` | `SAJTMASKIN_POLISH_MODEL` | `/api/ai/chat` | `streamText()` |

Important current nuance:

- `Skriv om` normally uses the polish lane model, but follows the Anthropic product lane when the current assist lane is Anthropic
- deep brief is only used before the first message in a new chat
- builder `specMode` is now `false` by default; spec-layer code remains but is not active in the freeform flow

## Prompt-assist provider strings

Prompt assist accepts provider-coded model strings such as:

- `openai/gpt-5.4`
- `openai/gpt-5.3-codex`
- `anthropic/claude-sonnet-4.6`
- `anthropic/claude-opus-4.6`
- `anthropic-direct/claude-sonnet-4-6`

Current provider categories:

- manifest `gatewayClassModels` (OpenAI-class models; the runtime type is now `"openai" | "anthropic"`)
- manifest `anthropicDirectModels`, which contains `anthropic-direct/*`

Important current nuance:

- prompt assist does **not** use the v0 Model API
- the `"gateway"` provider label has been replaced by `"openai"` in runtime code (HTTP schemas still accept `"gateway"` for backwards compat and normalize server-side)
- the prompt-assist implementation constructs direct OpenAI/Anthropic AI SDK clients in `src/lib/builder/direct-model.ts`
- in practice, "gateway-class" selection in the manifest currently means a manifest-approved
  model string plus direct provider client construction in the route implementation

## Thinking

`Thinking` is still **not** a lane, but it is now resolved through two layers:

1. the normal builder toggle / env default (`SAJTMASKIN_DEFAULT_THINKING`)
2. `phaseRouting.thinkingByTier` in `config/ai_models/manifest.json`

Important current behavior:

- it is not part of `fast | pro | max | codex`
- it does not change the canonical build-profile ID
- it does not affect prompt-assist route selection
- **planner** and **generator** only use provider reasoning when **both** layers are on
- **fixer**, **verifier**, manual repair, and server verify use the phase config directly
- `src/lib/models/phase-routing.ts` resolves this via `resolvePhaseThinking()`

## Validation surface

`src/lib/validations/chatSchemas.ts` enforces:

- `modelId` must be one of the accepted canonical or legacy build-profile IDs
- create-chat requests default to `pro`
- send-message requests may omit `modelId`
- prompt metadata may include `promptAssistModel`, `promptAssistDeep`, and `promptAssistMode`

## Phase routing

`src/lib/models/phase-routing.ts` resolves two things per `GenerationPhase`:

1. the concrete **model** via `phaseRouting.defaultByTier`
2. the phase-specific **thinking / reasoningEffort** via `phaseRouting.thinkingByTier`

Current default thinking profile:

- **fast** / **pro**: planner + generator default to `thinking=true`, `reasoningEffort=medium`
- **max** / **codex** / **anthropic**: planner + generator default to `thinking=true`, `reasoningEffort=high`
- **fixer**, **verifier**, and **deploy-assistant** default to `thinking=false` across tiers

Model routing still works like this:

- **fast**: every phase follows `selected_build_model` (the tier’s primary model,
  default `gpt-5.4-mini`).
- **pro**: **fixer** follows `selected_build_model`; **planner**, **generator**,
  **verifier**, and **deploy-assistant** are pinned to **`gpt-5.3-codex`** (same as
  the tier's primary model, so identical unless overridden).
- **max**: **planner** and **generator** follow `selected_build_model`;
  **fixer**, **verifier**, and **deploy-assistant** use **`gpt-5.3-codex`**.
- **codex**: **planner**, **generator**, and **fixer** follow
  `selected_build_model`; **verifier** and **deploy-assistant** use
  **`gpt-5.3-codex`**.
- **anthropic**: **planner** and **generator** use **`claude-opus-4.6`**; **fixer**
  and **verifier** follow `selected_build_model` (the tier’s primary Claude model,
  `claude-sonnet-4.6`); **deploy-assistant** uses **`claude-sonnet-4.6`**.

Env overrides on the build profile still apply to the resolved **base** model for
phases that resolve via `selected_build_model`. The `thinkingByTier` settings do
not change the resolved model ID; they only change whether that phase asks the
provider for reasoning and at what effort.

## Archived docs

Earlier model-schema notes and tier-history docs were archived under
git under `docs/plans/avklarat/` (see `docs/plans/avklarat/README.md`).

