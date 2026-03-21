# Integrations And Data Schema Surfaces

## Scope

This document collects the most important non-scaffold schema surfaces:
request validation, persisted data shape, and curated external-reference data.

Primary code sources:

- `src/lib/db/schema.ts`
- `Scripts/db-init.mjs`
- `src/lib/validations/chatSchemas.ts`
- `src/lib/gen/template-library/types.ts`

## Database

The main application database source of truth is:

- `src/lib/db/schema.ts`

Operational SQL/bootstrap behavior also exists in:

- `Scripts/db-init.mjs`

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
- `generation_telemetry` — build/refine telemetry, scaffold retry, preflight and deploy outcome data
- `version_comments` — per-version collaboration comments
- `version_approvals` — per-version approval state

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
- chat/message/version identifier validation helpers

## External reference schema

Curated external template reference data is typed in:

- `src/lib/gen/template-library/types.ts`

Important boundary:

- `TemplateLibraryEntry` is the TypeScript shape for rows in
  `template-library.generated.json`. The catalog may be empty while you rebuild
  a smaller intentional set.

Key concepts:

- `TemplateLibraryEntry`
- `TemplateLibraryCatalogFile`
- `TemplateLibraryRepoInfo`
- `TemplateLibrarySignals`

## Production boundary

Production should consume committed schema artifacts and code, not external
research helpers or raw local datasets.
