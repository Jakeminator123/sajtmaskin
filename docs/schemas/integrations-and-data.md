# Integrations And Data Schema Surfaces

## Scope

This document collects the most important non-scaffold schema surfaces: request
validation, database shape, and curated external-reference data.

Primary code sources:

- `src/lib/db/schema.ts`
- `scripts/db-init.mjs`
- `src/lib/validations/chatSchemas.ts`
- `src/lib/gen/template-library/types.ts`
- `research/external-templates/reference-library/schema.template-manifest.json`

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

## External reference schema

Curated external template data is documented by:

- `src/lib/gen/template-library/types.ts`
- `research/external-templates/reference-library/schema.template-manifest.json`

Key concepts:

- `TemplateLibraryEntry`
- `TemplateLibraryCatalogFile`
- `TemplateLibraryRepoInfo`
- `TemplateLibrarySignals`
- per-dossier `manifest.json` files in
  `research/external-templates/reference-library/dossiers/*`

## Production boundary

Production should consume committed schema artifacts and code, not external
research helpers or raw local datasets.
