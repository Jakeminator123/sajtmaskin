# Schemas

`docs/schemas/` is the contract layer for Sajtmaskin. Code still wins; these
files explain or mirror code-backed surfaces.

## Two Layers

| Layer | Path | Role |
|---|---|---|
| Human contracts | `docs/schemas/*.md` | Stable explanations: fields, ownership, boundaries, intent. |
| Strict contracts | `docs/schemas/strict/*.schema.json` | Machine-readable mirrors for tooling, parity tests, dashboards and editor validation. |

Do not add a `human/` subfolder unless there is a clear migration reason and
all references move in the same change.

## Human Contract Docs

| File | Domain |
|------|--------|
| `model-build-profiles.md` | Build profiles, model selection, legacy aliases, phase routing, thinking config. |
| `builder-entry-contract.md` | Builder entry state: `buildMethod`, `buildIntent`, `appProjectId`, prompt handoff, template path. |
| `scaffold-contract.md` | Runtime scaffold manifests, `ScaffoldId`, scaffold variants, font pairings, structural references, what reaches the model. |
| `quality-gate.md` | Quality gate checks, verify-lane vs preview-lane, repair flow, standard profiles. |
| `preview-session-contract.md` | Preview/session identifiers, preview URLs, verify-lane boundary, sandbox wording policy. |
| `orchestration-signal-contract.md` | Signal layers: prompt formatting, scaffold match, route plan, capabilities, contracts, dynamic context, post-checks. |
| `llm-role-matrix.md` | LLM roles: prompt assist, deep brief, planner, generator, fixer, verifier, deploy-assistant. |
| `external-template-pipeline-contract.md` | Legacy external-template research contract; not the runtime scaffold or dossier path. |
| `integrations-and-data.md` | DB tables, request validation, integration/data schema surfaces. |
| `chat-message-ui-parts.md` | Structured builder message parts (plan-review cards) in own-engine chat storage. |
| `strict/` | Machine-oriented schemas. See [`strict/README.md`](strict/README.md) for the complete list. |

> **Pensionerat:** `plan-file.schema.json` är **borttaget** (grandmaster-område 8) —
> planering är en regel, inte ett schema. Se
> [`.cursor/rules/plan-lifecycle.mdc`](../../.cursor/rules/plan-lifecycle.mdc).

Only stable, canonical schema docs belong in this folder. Exploratory schema
notes belong in `docs/plans/active/` until they are promoted here or
superseded; **historical** notes may exist in git under `docs/plans/avklarat/`
(see [`../plans/avklarat/README.md`](../plans/avklarat/README.md)).

## Not Schema Definitions

The own-engine system prompt lives in Core Rules
(`config/codegen-core-manifest.json` + `config/prompt-core/*.md`), not here.
Pipeline behavior is documented in
[`docs/architecture/llm-pipeline.md`](../architecture/llm-pipeline.md) § FAS 2.

For runtime scaffold input specifically, also read `scaffold-contract.md`.

For signal flow and how these layers interact in init/follow-up/repair, also
read `docs/architecture/runtime-contracts.md`.

## Code Sources Of Truth

Runtime truth: same core files as [`docs/README.md`](../README.md) § Source
of truth. Schema-specific extras include `src/lib/gen/plan/schema.ts` and the
runtime validators that import strict schemas, e.g.
`src/lib/gen/dossiers/validate-manifest.ts`.

Strict schemas are still mirrors of code-backed contracts, not replacements for
the runtime source of truth.

## Archive note

Older overlapping schema notes may exist in git under `docs/plans/avklarat/`. Keep them
only for historical reference, not as the current source of truth.
