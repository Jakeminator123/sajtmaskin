# Schema and Integration Update (2026-02-12)

This document describes the database and API/schema wiring that was added for:

- safer email verification defaults
- project-scoped v0 env var management
- marketplace integration ownership flow
- MCP integration prioritization

## 1) Database schema changes

### 1.1 `users.email_verified` default hardened

- File: `src/lib/db/schema.ts`
- File: `scripts/db-init.mjs`
- Change: `email_verified` default changed from `true` to `false`
- Reason: avoid accidental auto-verified email/password users in new code paths

Backfill behavior in `db-init` now keeps/sets:

- `provider='google'` users as verified
- `provider='email'` users with active verification token as unverified

### 1.2 New table: `user_integrations`

- File: `src/lib/db/schema.ts`
- File: `scripts/db-init.mjs`
- Purpose: persist integration ownership/billing/project linkage per user

Columns:

- `id` (PK)
- `user_id` (FK -> `users.id`)
- `project_id` (internal project id)
- `v0_project_id` (external v0 project id)
- `integration_type` (e.g. `neon`, `supabase`, `upstash`)
- `marketplace_slug`
- `ownership_model` (default: `user_managed_vercel`)
- `billing_owner` (default: `user`)
- `status` (default: `pending`)
- `env_vars` (JSONB metadata)
- `install_url`
- `installed_at`
- timestamps (`created_at`, `updated_at`)

Indexes:

- unique: `user_integrations_owner_project_type_idx` on `(user_id, project_id, integration_type)`
- `idx_user_integrations_user_id`
- `idx_user_integrations_project_id`

Trigger:

- `set_updated_at_user_integrations`

## 2) API wiring changes

### 2.1 Project env vars API (v0 SDK)

New route:

- `src/app/api/v0/projects/[projectId]/env-vars/route.ts`

Endpoints:

- `GET` list env vars
- `POST` create/update env vars (upsert)
- `DELETE` delete env vars by ids or keys

Security model:

- resolves project ownership through `getProjectByIdForRequest(...)` in `src/lib/tenant.ts`
- blocks synthetic project ids (`chat:*`, `registry:*`)

### 2.2 Marketplace strategy/start/records

New routes:

- `src/app/api/integrations/marketplace/strategy/route.ts`
- `src/app/api/integrations/marketplace/start/route.ts`
- `src/app/api/integrations/marketplace/records/route.ts`

Current implemented ownership model:

- strategy key: `user_managed_vercel`
- ownership: user has own Vercel account responsibility
- billing: user pays integrations in Marketplace

### 2.3 MCP priorities API

New route:

- `src/app/api/integrations/mcp/priorities/route.ts`

Provides phased rollout suggestions and readiness based on env availability.

## 3) Stream and UI integration wiring

### 3.1 Stream integration signal extraction

- `src/lib/v0Stream.ts` now extracts integration signals from stream payloads
- `src/lib/streaming.ts` now includes event type `integration`
- forwarded by:
  - `src/app/api/v0/chats/stream/route.ts`
  - `src/app/api/v0/chats/[chatId]/stream/route.ts`

### 3.2 Builder UI

- `src/components/builder/ProjectEnvVarsPanel.tsx` added and mounted in `src/app/builder/page.tsx`
- `src/components/builder/MessageList.tsx` now renders richer integration cards

## 4) Operational steps

1. Run:

```bash
npm run db:init
```

2. Confirm:

- table `user_integrations` exists
- `users.email_verified` default is `false`
- updated indexes/triggers exist

3. Validate API:

- `GET/POST/DELETE /api/v0/projects/{projectId}/env-vars`
- `GET /api/integrations/marketplace/strategy`
- `POST /api/integrations/marketplace/start`
- `GET /api/integrations/marketplace/records?projectId=...`
- `GET /api/integrations/mcp/priorities`

## 5) Known constraints

- synthetic v0 project ids cannot hold env vars
- marketplace install is intentionally user-managed, not platform-owned
- MCP route is a prioritized blueprint API (not full MCP execution proxy yet)

## 6) Env keys added/required by this rollout

### 6.1 Platform env (app runtime)

Added as placeholders in:

- `.env.local`
- `.env.production`

Keys:

- `LEGACY_EMAIL_AUTO_VERIFY_BEFORE` (safe cutoff timestamp for legacy email auto-verify logic)
- `NEXT_PUBLIC_POSTHOG_KEY` (MCP readiness phase 1)
- `SENTRY_DSN` (MCP readiness phase 1)
- `NOTION_TOKEN` (MCP readiness phase 2)
- `LINEAR_API_KEY` (MCP readiness phase 2)
- `SANITY_API_TOKEN` (MCP readiness phase 3)
- `NEXT_PUBLIC_SANITY_PROJECT_ID` (MCP readiness phase 3)
- `ZAPIER_WEBHOOK_SECRET` (MCP readiness phase 3)
- `NEXT_PUBLIC_SUPABASE_URL` (optional if app runtime uses Supabase SDK flow)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (optional if app runtime uses Supabase SDK flow)

### 6.2 Project env (user-owned v0 project vars)

Configured via:

- `ProjectEnvVarsPanel` in Builder UI
- `/api/v0/projects/[projectId]/env-vars`

Typical per-project keys:

- `POSTGRES_URL`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
