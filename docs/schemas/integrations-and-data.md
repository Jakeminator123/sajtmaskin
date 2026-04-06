# Integrations And Data Schema Surfaces

**Terminology:** Integration *types* in the builder UI are described in product
docs and `.cursor/rules/terminology.mdc` where they overlap naming; this file
focuses on **DB tables**, **validation**, and **template-library** shapes.

## Scope

This document collects the most important non-scaffold schema surfaces: request
validation, database shape, and curated external-reference data.

Primary code sources:

- `src/lib/db/schema.ts`
- `scripts/db/db-init.mjs`
- `src/lib/validations/chatSchemas.ts`
- `src/lib/gen/template-library/types.ts`
- `data/external-template-pipeline/reference-library/schema.template-manifest.json`

## Database

The main application database source of truth is:

- `src/lib/db/schema.ts`

Operational SQL/bootstrap behavior also exists in:

- `scripts/db/db-init.mjs`
- `scripts/db/check-dev-db.mjs` (lokal anslutningskoll via `npm run db:check`)

Important rule:

- human docs may describe DB shape
- actual runtime and migration behavior must be verified against code

### Own-engine tables (Postgres/Supabase)

These tables are used by the own-engine build path and are fully integrated:

- `engine_chats` — chat sessions, scaffold choice, model
- `engine_messages` — message history
- `engine_versions` — generated code (`files_json`), release state, optional **`sandbox_url`** (kanonisk live-preview för own-engine när sandbox lyckats; tom tills dess). HTTP-API för own-engine annonserar inte shim som primär `demoUrl`; shim finns som **`legacyShimPreviewUrl`** vid behov (2026-03-30) — se [preview-deploy.md](../architecture/preview-deploy.md).
- `engine_generation_logs` — token usage, duration, errors
- `engine_version_error_logs` — per-version error diagnostics

### Project data (shared)

- `project_data` — project metadata, `demo_url`, `files`, `messages`, `meta`
- `meta.projectEnvVars` — project-specific env vars (encrypted when sensitive)
- Used by both own-engine (after save) and v0-fallback

**Lagringsmodell (användarprojekt):** Kanonisk kod per version ligger i **`engine_versions.files_json`** (versionerad, lämplig för historik och rebuild). `project_data` speglar ofta samma sajt i ett app-projekt-format (t.ex. MCP-flöden). Stora monorepon eller binärt innehåll lagras inte som git i databasen — `files_json`-storlek och Postgres-kostnad är avvägningar; för tung media använd blob/CDN. Se även [ENV.md](../ENV.md) för Supabase/infra.

### Preview vs persisted URL

- **Shim / legacy:** ingen egen DB-kolumn för shim; `/api/preview-render` används via **`legacyShimPreviewUrl`** i API när det behövs. `project_data.demo_url` kan fortfarande bära äldre värden i vissa flöden.
- **Sandbox (Fidelity 2):** `engine_versions.sandbox_url` när servern sparat lyckad sandbox-start — [preview-deploy.md](../architecture/preview-deploy.md).

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
- `data/external-template-pipeline/reference-library/schema.template-manifest.json`

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
  `data/external-template-pipeline/reference-library/dossiers/*`

## Production boundary

Production should consume committed schema artifacts and code, not external
research helpers or raw local datasets.
