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

- `scripts/db/db-init.mjs` — CREATE TABLE/INDEX runtime (körs via `npm run db:init` + `predev`-hook)
- `scripts/db/check-dev-db.mjs` — lokal anslutningskoll via `npm run db:check`
- `scripts/db/db-row-overview.mjs` — rad-uppskattning per tabell via `npm run db:rows`

### Observability scripts (read-only diagnostik + idempotent migrations)

Tre scripts som backofficens "Databashälsa"-sida och CI använder:

- `scripts/db/db-health-check.mjs` (`npm run db:health`) — read-only diagnos
  av tabeller, rader, index-status. Producerar JSON på stdout enligt
  [`docs/schemas/strict/db-health-check-report.schema.json`](./strict/db-health-check-report.schema.json).
  Exit-kod: 0 om allt OK, 1 om saknade tabeller / index / probe-fel.
- `scripts/db/add-performance-indexes.mjs` (`npm run db:perf-indexes`) —
  idempotent + dedupe-aware migration som skapar saknade FK-index. Audit-
  logg till `data/observability/db-perf-indexes-runs.ndjson` enligt
  [`docs/schemas/strict/db-perf-indexes-audit-line.schema.json`](./strict/db-perf-indexes-audit-line.schema.json).
  Auto-applicering på `npm run dev` via `predev`-hooken.
- `scripts/db/drop-legacy-index-aliases.mjs` (`npm run db:drop-legacy-aliases`) —
  opt-in cleanup av legacy-namngivna index. Default dry-run; `--apply` krävs.
  Audit-logg till `data/observability/db-drop-aliases-runs.ndjson`.

Drift-skydd: `src/lib/db/schema-drift.test.ts` validerar att Drizzle-schemat
matchar runtime-källorna (db-init.mjs, perf-indexes-script, SQL-migrations,
samt db-health-check-konstanterna). Körs i `npm run test:ci`.

### Redis observability

- `scripts/db/redis-health-check.mjs` (`npm run redis:health`) — read-only
  diagnos av Upstash Redis via HTTP/REST-klienten. Producerar JSON enligt
  [`docs/schemas/strict/redis-health-check-report.schema.json`](./strict/redis-health-check-report.schema.json).
  Testar BARA REST-vägen (rate-limit + diagnos). App-cache, sessioner och
  deploy-status pubsub går via ioredis (TCP) som inte valideras här —
  använd `/api/health` för TCP-statusen.

Important rule:

- human docs may describe DB shape
- actual runtime and migration behavior must be verified against code

### Own-engine tables (Postgres/Supabase)

These tables are used by the own-engine build path and are fully integrated:

- `engine_chats` — chat sessions, scaffold choice, model
- `engine_messages` — message history (assistant rows may carry `thinking` text, see [chat-message-ui-parts.md](./chat-message-ui-parts.md))
- `engine_versions` — generated code (`files_json`), release state, optional **`preview_url`** (kanonisk live-preview för own-engine när preview-session lyckats; tom tills dess). HTTP-API för own-engine annonserar inte shim som primär `demoUrl`; shim finns som **`legacyShimPreviewUrl`** vid behov (2026-03-30) — se [fas3-preview-and-deploy.md](../architecture/fas3-preview-and-deploy.md).
- `engine_generation_logs` — token usage, duration, errors
- `engine_version_error_logs` — per-version error diagnostics

### Project data (shared)

- `project_data` — project metadata, `demo_url`, `files`, `messages`, `meta`
- `meta.projectEnvVars` — project-specific env vars (encrypted when sensitive)
- Used by both own-engine (after save) and v0-fallback

**Lagringsmodell (användarprojekt):** Kanonisk kod per version ligger i **`engine_versions.files_json`** (versionerad, lämplig för historik och rebuild). `project_data` speglar ofta samma sajt i ett app-projekt-format (t.ex. MCP-flöden). Stora monorepon eller binärt innehåll lagras inte som git i databasen — `files_json`-storlek och Postgres-kostnad är avvägningar; för tung media använd blob/CDN. Se även [ENV.md](../ENV.md) för Supabase/infra.

### Preview vs persisted URL

- **Shim / legacy:** ingen egen DB-kolumn för shim; `/api/preview-render` används via **`legacyShimPreviewUrl`** i API när det behövs. `project_data.demo_url` kan fortfarande bära äldre värden i vissa flöden.
- **Tier-2 preview (Fidelity 2):** `engine_versions.preview_url` när servern sparat lyckad preview-start — [fas3-preview-and-deploy.md](../architecture/fas3-preview-and-deploy.md).

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
