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

Only stable, canonical schema docs belong in this folder. If a schema note is
still exploratory, partially true, or comparing alternatives, place it under
`docs/old/analyses/` (or a new `docs/analyses/` if you reintroduce that bucket)
or `docs/old/schemas/` when it becomes historical.

## Code sources of truth

Runtime truth: same core files as [`docs/README.md`](../README.md) § Source of truth (models, `chatSchemas`, `db/schema`, scaffolds, template-library). Schema-specific extras: `src/lib/gen/plan-schema.ts`, `research/external-templates/reference-library/schema.template-manifest.json`.

## Archive note

Older overlapping schema notes were moved to `docs/old/schemas/`. Keep them
only for historical reference or change-tracing, not as the current source of
truth.
