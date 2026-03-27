# Schemas

This folder is the canonical human-readable schema area for Sajtmaskin.

**Terminology:** Builder **model lanes** (Byggmodell / Förbättra / Skriv om / Thinking)
and **template vs scaffold** naming live in `.cursor/rules/terminology.mdc`. This
folder documents **contracts and field shapes** only — not the full product glossary.

## What lives here

- `model-build-profiles.md`
  Current build-profile, model-selection, legacy-alias, and engine-resolution
  rules.
- `builder-entry-contract.md`
  The canonical builder entry contract for `buildMethod`, `buildIntent`,
  `appProjectId`, prompt handoff, and the v0-driven template exception path.
- `scaffold-contract.md`
  The runtime scaffold manifest contract and validation expectations.
- `integrations-and-data.md`
  The most important data, validation, and template-library schema surfaces.
- `chat-message-ui-parts.md`
  The stable own-engine storage contract for structured builder message parts,
  including persisted plan-review cards.

Only stable, canonical schema docs belong in this folder. Exploratory schema notes
belong in `docs/plans/active/` until they are promoted here or superseded; **historical**
notes may exist in git under `docs/plans/avklarat/` (see [`../plans/avklarat/README.md`](../plans/avklarat/README.md)).

## Related configuration (not schema definitions)

The **own-engine static system prompt** is not a “schema” doc in this folder; it
is configured as JSON + Markdown under the repo root: `config/codegen-static-prompt.json`
and `config/prompt-static/*.md`. Full pipeline context (loader, checks, debug
dumps, fallbacks) is summarized in [`docs/architecture/builder-generation.md`](../architecture/builder-generation.md) (prompt layering and STATIC_CORE live there; older prompt-tree narrative was removed with the archive — recover via `git log` on that path if needed).

## Code sources of truth

Runtime truth: same core files as [`docs/README.md`](../README.md) § Source of truth (models, `chatSchemas`, `db/schema`, scaffolds, template-library). Schema-specific extras: `src/lib/gen/plan-schema.ts`, `research/external-templates/reference-library/schema.template-manifest.json`.

## Archive note

Older overlapping schema notes may exist in git under `docs/plans/avklarat/`. Keep them
only for historical reference, not as the current source of truth.

