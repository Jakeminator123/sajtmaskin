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

- `model-build-profiles.md`
  Current build-profile, model-selection, legacy-alias, and engine-resolution
  rules.
- `builder-entry-contract.md`
  The canonical builder entry contract for `buildMethod`, `buildIntent`,
  `appProjectId`, prompt handoff, and the v0-driven template exception path.
- `scaffold-contract.md`
  The runtime scaffold manifest contract, scaffold family meaning, and what scaffold context actually reaches the model.
- `integrations-and-data.md`
  The most important data, validation, and template-library schema surfaces.
- `external-template-pipeline-contract.md`
  The canonical scrape/import/hydrate/build/embedding contract for external
  template research and scaffold curation data.
- `chat-message-ui-parts.md`
  The stable own-engine storage contract for structured builder message parts,
  including persisted plan-review cards.
- `preview-session-contract.md`
  The stable human-readable contract for preview/session identifiers, preview
  URLs, and the verify-lane boundary.
- `llm-role-matrix.md`
  Canonical human-readable matrix of LLM roles: prompt assist, Deep brief,
  planner, generator, fixer, verifier, and deploy-assistant.
- `orchestration-signal-contract.md`
  Canonical signal-layer contract: prompt formatting, scaffold match, route
  plan, capabilities, contracts, dynamic context, and post-check layers.
- `strict/README.md`
  Explains the machine-oriented strict layer.
- `strict/preview-session-contract.schema.json`
  The first strict contract artifact for preview/session and verify-lane
  surfaces.

Only stable, canonical schema docs belong in this folder. Exploratory schema
notes belong in `docs/plans/active/` until they are promoted here or
superseded; **historical** notes may exist in git under `docs/plans/avklarat/`
(see [`../plans/avklarat/README.md`](../plans/avklarat/README.md)).

## Related configuration (not schema definitions)

The **own-engine static system prompt** is not a “schema” doc in this folder; it
is configured as JSON + Markdown under the repo root: `config/codegen-static-prompt.json`
and `config/prompt-static/*.md`. Full pipeline context (loader, checks, debug
dumps, fallbacks) is summarized in [`docs/architecture/builder-generation.md`](../architecture/builder-generation.md) (prompt layering and STATIC_CORE live there; older prompt-tree narrative was removed with the archive — recover via `git log` on that path if needed).

For runtime scaffold input specifically, also read `scaffold-contract.md`.

For signal flow and how these layers interact in init/follow-up/repair, also
read `docs/architecture/llm-signal-flow.md`.

## Code sources of truth

Runtime truth: same core files as [`docs/README.md`](../README.md) § Source of truth (models, `chatSchemas`, `db/schema`, scaffolds, template-library). Schema-specific extras: `src/lib/gen/plan-schema.ts`, `data/external-template-pipeline/reference-library/schema.template-manifest.json`.

Strict schemas are still mirrors of code-backed contracts, not replacements for
the runtime source of truth.

## Archive note

Older overlapping schema notes may exist in git under `docs/plans/avklarat/`. Keep them
only for historical reference, not as the current source of truth.

