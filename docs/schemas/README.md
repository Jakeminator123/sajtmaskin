# Schemas

This folder is the canonical schema area for Sajtmaskin.

**Terminology:** Builder **model lanes** (Byggmodell / Förbättra / Skriv om / Thinking)
and **template vs scaffold** naming live in `.cursor/rules/terminology.mdc`. This
folder documents **contracts and field shapes** only — not the full product glossary.

## Two layers

This area now has two explicit schema layers:

- **Human-readable schema docs**: the stable Markdown files directly under
  `docs/schemas/`. These explain contracts, field meaning, and boundaries for
  humans.
- **Strict schemas**: machine-oriented, diff-friendly files under
  `docs/schemas/strict/`. These are intended for tooling, parity checks, and
  dashboards that need a cleaner contract surface.

Conservative rollout rule:

- existing stable Markdown docs stay at the top level for now
- new machine-readable contract artifacts go under `strict/`
- do **not** bulk-move the human docs into a `human/` subfolder unless the path
  churn is justified and references are updated in one sweep

## What lives here

| File | Domain |
|------|--------|
| `model-build-profiles.md` | Build profiles, model selection, legacy aliases, phase routing, thinking config. |
| `builder-entry-contract.md` | Builder entry state: `buildMethod`, `buildIntent`, `appProjectId`, prompt handoff, template path. |
| `scaffold-contract.md` | Runtime scaffold manifests, `ScaffoldId`, scaffold variants, font pairings, structural references, what reaches the model. |
| `quality-gate.md` | Quality gate checks, verify-lane vs preview-lane, repair flow, standard profiles. |
| `preview-session-contract.md` | Preview/session identifiers, preview URLs, verify-lane boundary, sandbox wording policy. |
| `orchestration-signal-contract.md` | Signal layers: prompt formatting, scaffold match, route plan, capabilities, contracts, dynamic context, post-checks. |
| `llm-role-matrix.md` | LLM roles: prompt assist, deep brief, planner, generator, fixer, verifier, deploy-assistant. |
| `external-template-pipeline-contract.md` | Scrape/import/hydrate/build/embedding pipeline for external template research. |
| `integrations-and-data.md` | DB tables, request validation, template-library schema surfaces. |
| `chat-message-ui-parts.md` | Structured builder message parts (plan-review cards) in own-engine chat storage. |
| `strict/` | Machine-oriented JSON schemas: `preview-session-contract.schema.json`, `scaffold-variant.schema.json`, `structural-references.schema.json`. |

Only stable, canonical schema docs belong in this folder. Exploratory schema
notes belong in `docs/plans/active/` until they are promoted here or
superseded; **historical** notes may exist in git under `docs/plans/avklarat/`
(see [`../plans/avklarat/README.md`](../plans/avklarat/README.md)).

## Related configuration (not schema definitions)

The **own-engine system prompt** is not a "schema" doc in this folder; it is
configured as Core Rules (`config/codegen-core-manifest.json` +
`config/prompt-core/*.md`) and Directives (`config/codegen-directives-manifest.json` +
`config/prompt-directives/*.md`). Legacy fallback: `config/codegen-static-prompt.json` +
`config/prompt-static/*.md`. Full pipeline context (loader, checks, debug
dumps, fallbacks) is summarized in [`docs/architecture/builder-generation.md`](../architecture/builder-generation.md).

For runtime scaffold input specifically, also read `scaffold-contract.md`.

For signal flow and how these layers interact in init/follow-up/repair, also
read `docs/architecture/llm-signal-flow.md`.

## Code sources of truth

Runtime truth: same core files as [`docs/README.md`](../README.md) § Source of truth (models, `chatSchemas`, `db/schema`, scaffolds, template-library). Schema-specific extras: `src/lib/gen/plan/schema.ts`, `data/external-template-pipeline/reference-library/schema.template-manifest.json`.

Strict schemas are still mirrors of code-backed contracts, not replacements for
the runtime source of truth.

## Archive note

Older overlapping schema notes may exist in git under `docs/plans/avklarat/`. Keep them
only for historical reference, not as the current source of truth.
