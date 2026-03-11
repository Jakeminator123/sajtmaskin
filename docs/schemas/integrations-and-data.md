# Integrations And Data Schema Surfaces

## Scope

This document collects the most important non-scaffold schema surfaces: request
validation, database shape, and curated template-library data.

Primary code sources:

- `src/lib/db/schema.ts`
- `scripts/db-init.mjs`
- `src/lib/validations/chatSchemas.ts`
- `src/lib/gen/template-library/types.ts`
- `v0_vercel_agents/template_library/schema.template-manifest.json`

## Database

The main application database source of truth is:

- `src/lib/db/schema.ts`

Operational SQL/bootstrap behavior also exists in:

- `scripts/db-init.mjs`

Important rule:

- human docs may describe DB shape
- actual runtime and migration behavior must be verified against code

## Request validation

Important request-validation schemas currently live in:

- `src/lib/validations/chatSchemas.ts`

This file defines:

- accepted build-profile IDs
- create-chat payload validation
- send-message payload validation
- deployment identifier payload validation
- attachment payload validation

## Template-library schema

Curated external template data is documented by:

- `src/lib/gen/template-library/types.ts`
- `v0_vercel_agents/template_library/schema.template-manifest.json`

Key concepts:

- `TemplateLibraryEntry`
- `TemplateLibraryCatalogFile`
- `TemplateLibraryRepoInfo`
- `TemplateLibrarySignals`
- per-dossier `manifest.json` files in
  `v0_vercel_agents/template_library/dossiers/*`

## Integration notes

The older integration rollout note from 2026-02-12 was archived because it is
useful historically but too specific to remain the main schema entry point.

See `docs/old/schemas/SCHEMA_INTEGRATION_UPDATE_2026-02-12.md` for the original
rollout detail.

## Production boundary

Production should consume committed schema artifacts and code, not external
research helpers or raw local datasets.
