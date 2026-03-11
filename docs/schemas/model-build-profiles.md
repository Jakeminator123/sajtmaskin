# Model And Build Profile Schema

## Scope

This document describes the builder's current model/build-profile schema.

Primary code sources:

- `src/lib/v0/models.ts`
- `src/lib/v0/modelSelection.ts`
- `src/lib/validations/chatSchemas.ts`
- `package.json`

## Core rule

The builder now uses neutral internal build-profile IDs:

- `fast`
- `pro`
- `max`
- `codex`

These are internal profile IDs used by both the own engine and the explicit v0
fallback path.

They are not the same thing as:

- v0 Platform API model IDs such as `v0-max-fast`
- prompt-assist provider model IDs
- raw OpenAI model IDs such as `gpt-5.4`

## Default profile

- default profile: `max`
- default own-engine code model: `gpt-5.3-codex`

Important nuance:

- the selected build profile defaults to `max`
- the broader own-engine code stack still contains `gpt-5.3-codex` as the
  default own-model constant for some lower-level flows

## Canonical build profiles

| Profile | UI label | Own-engine model | v0 fallback model |
|---------|----------|------------------|-------------------|
| `fast` | `GPT-4.1` | `gpt-4.1` | `v0-max-fast` |
| `pro` | `GPT-5.3 Codex` | `gpt-5.3-codex` | `v0-1.5-md` |
| `max` | `GPT-5.4` | `gpt-5.4` | `v0-1.5-lg` |
| `codex` | `GPT-5.1 Codex Max` | `gpt-5.1-codex-max` | `v0-gpt-5` |

## Accepted incoming IDs

Incoming model IDs may be:

- canonical profile IDs
- legacy v0-flavored IDs still present in local storage, URLs, or older DB data

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

Unknown model IDs are not accepted by the Zod request schema.

## Resolution flow

1. Requests may send `modelId` or `modelTier`.
2. `canonicalizeModelId()` resolves canonical or legacy values to the current
   internal profile.
3. `resolveModelSelection()` falls back to the default profile if needed.
4. `resolveEngineModelId()` maps the resolved profile to:
   - an OpenAI model when the own engine is active
   - a v0 Platform API model ID when fallback is active

## Validation surface

`src/lib/validations/chatSchemas.ts` enforces:

- `modelId` must be one of the accepted canonical or legacy IDs
- create-chat requests default to `max`
- send-message requests may omit `modelId`

## Quality mappings

The lower-level quality mapping in `src/lib/v0/models.ts` currently resolves:

| Quality level | Canonical profile |
|---------------|-------------------|
| `light` | `pro` |
| `standard` | `pro` |
| `pro` | `pro` |
| `premium` | `fast` |
| `max` | `fast` |

Treat this as implementation detail unless you are actively changing generation
quality behavior.

## Prompt assist is separate

Prompt assist and builder code generation are different concerns.

- build profiles above steer code generation
- prompt assist uses separate provider/model choices
- do not mix prompt-assist model IDs into the build-profile schema

## Archived docs

Earlier model-schema notes and tier-history docs were archived under
`docs/old/schemas/`.
