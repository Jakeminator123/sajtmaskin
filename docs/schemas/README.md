# Schemas

This folder is the canonical human-readable schema area for Sajtmaskin.

## What lives here

- `model-build-profiles.md`
  Current build-profile, model-selection, legacy-alias, and engine-resolution
  rules.
- `scaffold-contract.md`
  The runtime scaffold manifest contract and validation expectations.
- `integrations-and-data.md`
  The most important data, validation, and template-library schema surfaces.
- `chat-message-ui-parts.md`
  The stable own-engine storage contract for structured builder message parts,
  including persisted plan-review cards.

Only stable, canonical schema docs belong in this folder. If a schema note is
still exploratory, partially true, or comparing alternatives, place it in
`docs/analyses/` while active or `docs/old/schemas/` when it becomes historical.

## Code sources of truth

These docs summarize the system, but the runtime truth lives in:

- `src/lib/v0/models.ts`
- `src/lib/v0/modelSelection.ts`
- `src/lib/validations/chatSchemas.ts`
- `src/lib/db/schema.ts`
- `src/lib/gen/plan-schema.ts`
- `src/lib/gen/scaffolds/types.ts`
- `src/lib/gen/scaffolds/scaffold-manifest-validation.ts`
- `src/lib/gen/template-library/types.ts`
- `research/external-templates/reference-library/schema.template-manifest.json`

## Archive note

Older overlapping schema notes were moved to `docs/old/schemas/`. Keep them
only for historical reference or change-tracing, not as the current source of
truth.
