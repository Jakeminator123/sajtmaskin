# Integration contracts: slim database surface (2026-03-24)

## User intent

Remove MongoDB and DynamoDB from **pre-generation contract inference**, **clarification quick options**, and **`detect-integrations` KNOWN_INTEGRATIONS** — not because they are “wrong” technically, but to keep the builder’s contract gate focused on fewer, high-signal paths and avoid extra runtime/env churn from auto-detected integrations.

## Code changes

- `src/lib/gen/pre-generation-contracts.ts` — dropped Mongo/Dynamo `PROVIDER_RULES` entries and `applyDatabaseAnswer` branches for those names.
- `src/lib/gen/contract-clarification.ts` — database question options back to mock / Supabase / Postgres / Annat.
- `src/lib/gen/detect-integrations.ts` — removed Mongo and Dynamo pattern rows from the known-integration list.
- `docs/architecture/builder-ux-contracts-and-preview.md` — added subsection documenting this product choice.

## What was *not* required

Nothing in the own-engine stream or preview **required** Mongo/Dynamo as contract providers; they had been added from an earlier backlog note. Essential flows remain: auth, payment, database (narrow set), integration mock vs real, env when keys are missing.

## Git

Committed and pushed with message describing revert of Mongo/Dynamo contract surface.
