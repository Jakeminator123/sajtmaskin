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

### Own-engine tables (Postgres/Supabase)

These tables are used by the own-engine build path and are fully integrated:

- `engine_chats` — chat sessions, scaffold choice, model
- `engine_messages` — message history
- `engine_versions` — generated code (`files_json`), release state
- `engine_generation_logs` — token usage, duration, errors
- `engine_version_error_logs` — per-version error diagnostics

### Project data (shared)

- `project_data` — project metadata, `demo_url`, `files`, `messages`, `meta`
- `meta.projectEnvVars` — project-specific env vars (encrypted when sensitive)
- Used by both own-engine (after save) and v0-fallback

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

Important boundary:

- `TemplateLibraryEntry` is the full runtime/generated TypeScript shape.
- `schema.template-manifest.json` documents the per-dossier manifest and minimal
  schema surface used in the curated reference library. It should not be treated
  as a complete JSON schema for every field on `TemplateLibraryEntry`.

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
