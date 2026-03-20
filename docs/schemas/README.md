# Schemas

This folder is the canonical human-readable schema area for Sajtmaskin.

Agents should read this area when they need stable contracts rather than broad
architecture narrative.

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
still exploratory, partially true, or comparing alternatives, place it in
`docs/analyses/` while active or `docs/old/schemas/` when it becomes historical.

Keep schema docs compact:

- describe the active contract
- point to the runtime source of truth
- avoid turning schema docs into general architecture overviews

During a final sweep, relevant schema docs should be re-checked for small,
obvious contract drift even if they were not directly edited during the run.

## Quick map

```text
Need a stable contract?
|
+-- builder entry / URL state
|   -> builder-entry-contract.md
|
+-- model tiers / prompt-assist lanes / accepted model IDs
|   -> model-build-profiles.md
|
+-- runtime scaffold manifest and enrichment shape
|   -> scaffold-contract.md
|
+-- stored builder UI parts in chat persistence
|   -> chat-message-ui-parts.md
|
+-- DB / validation / template-library data surfaces
    -> integrations-and-data.md
```

## Code sources of truth

These docs summarize the system, but the runtime truth lives in:

- `src/lib/models/catalog.ts`
- `src/lib/models/selection.ts`
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
