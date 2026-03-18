# v0 Soft Deprecation — Stop/Go Gates

> Senast uppdaterad: 2026-03-18

This document defines measurable criteria for the phased removal of v0
Platform API dependencies. The goal is to retire v0-fallback safely while
preserving all Vercel platform integrations (deploy, blob, domains).

## Current state

- Own-engine is the default generation path.
- v0-fallback is opt-in via `V0_FALLBACK_BUILDER=y`.
- Many API routes under `src/app/api/v0/` still call the v0 Platform API
  for chat CRUD, version management, file operations, and registry init.
- Vercel integrations (deploy, blob, domains) are separate from v0 and must
  be preserved.

## Three-phase deprecation

### Phase 1: Soft deprecate (current)

**Status:** In progress

Actions completed:
- Own-engine is default, v0-fallback is behind flag
- `designSystemId` marked as deprecated in state (no UI)
- `V0_STREAMING_ENABLED` documented as v0-only, removal candidate
- Model override env vars added to Zod schema
- Prompt tree documented with clear own-engine vs v0-fallback divergence

Remaining actions:
- Add telemetry logging when v0-fallback is used (count of fallback invocations)
- Add telemetry logging when `init-registry` is called
- Ensure own-engine has full feature parity for remaining shared paths

### Phase 2: Measure and migrate shared dependencies

**Go criteria (all must be true before proceeding):**

| Criterion | How to measure | Target |
|-----------|---------------|--------|
| Fallback usage rate | Count `createV0FallbackStream` calls in runtime logs | < 5% of total generations |
| init-registry usage | Count `/api/v0/chats/init-registry` calls | Understand frequency and migration path |
| Version file resolution | `resolveVersionFiles` v0 branch usage | Own-engine branch handles all active chats |
| Template init route | `/api/template` v0-generator calls | Replace with own-engine template init |
| Download route | `/api/download` v0-generator calls | Replace with own-engine file serving |

**Migration work required:**

| Shared dependency | Migration path | Effort |
|-------------------|---------------|--------|
| `resolveVersionFiles` (v0 branch) | Already has own-engine branch; ensure all chats use it | Low |
| `v0-url-parser.ts` (registry parsing) | Keep — registry URLs are independent of v0 SDK | None |
| `shadcn-registry-*` files | Keep — they parse registry data, not v0 SDK | None |
| `/api/v0/deployments/route.ts` (v0 env vars) | Replace `fetchV0ProjectEnvVars` with own env management | Medium |
| `openclaw/resolve-file-context.ts` | Remove v0 branch when fallback is off | Low |
| `mcp/local-engine.ts` | Remove v0 branch when fallback is off | Low |

### Phase 3: Hard remove

**Go criteria (all must be true):**

| Criterion | How to measure | Target |
|-----------|---------------|--------|
| Zero fallback invocations for 30 days | Runtime logs | 0 calls |
| All shared dependencies migrated | Code audit | No `shouldUseV0Fallback()` remaining |
| init-registry replaced or removed | Feature decision | Documented decision |
| V0_API_KEY not required for core flow | Health check | Own-engine works without V0_API_KEY |

**Files to remove in Phase 3:**

v0-fallback-only (safe to remove):
- `src/lib/providers/v0-fallback/` (entire directory)
- `src/lib/v0-fallback.ts`
- v0-fallback branches in `src/app/api/v0/chats/stream/route.ts`
- v0-fallback branches in `src/app/api/v0/chats/[chatId]/stream/route.ts`
- `V0_STREAMING_ENABLED` from env schema and policy
- `DESIGN_SYSTEM_ID` from env schema and policy

Always-v0-dependent (requires replacement or removal decision):
- `src/app/api/v0/chats/init-registry/route.ts`
- `src/app/api/v0/chats/init/route.ts`
- `src/app/api/v0/chats/route.ts` (create/list via v0 SDK)
- `src/app/api/v0/chats/[chatId]/route.ts` (get via v0 SDK)
- `src/app/api/v0/chats/[chatId]/versions/route.ts`
- `src/app/api/v0/chats/[chatId]/validate-css/route.ts`
- `src/app/api/v0/chats/[chatId]/validate-images/route.ts`
- `src/app/api/v0/chats/[chatId]/normalize-text/route.ts`
- `src/app/api/v0/chats/[chatId]/files/route.ts`
- `src/app/api/v0/chats/[chatId]/messages/[messageId]/route.ts`
- `src/app/api/v0/projects/instructions/route.ts`
- `src/app/api/v0/projects/[projectId]/env-vars/route.ts`
- `src/app/api/v0/integrations/vercel/projects/route.ts`
- `src/app/api/template/route.ts`
- `src/app/api/download/route.ts`
- `src/app/api/github/export/route.ts`
- `src/app/api/webhooks/v0/route.ts`
- `src/lib/v0.ts`
- `src/lib/v0/` (entire directory)

## Do-not-remove list (Vercel integrations)

These files use the Vercel platform API directly and are NOT v0-dependent:

| File | Purpose | Keep |
|------|---------|------|
| `src/lib/vercel/vercelDeploy.ts` | Create Vercel deployments | Yes |
| `src/lib/vercel/vercel-client.ts` | Vercel projects, domains, env vars | Yes |
| `src/lib/vercel/blob-service.ts` | Vercel Blob storage | Yes |
| `src/app/api/v0/deployments/[deploymentId]/route.ts` | Vercel deployment status | Yes |
| `src/app/api/v0/deployments/[deploymentId]/events/route.ts` | Vercel deployment events | Yes |
| `src/app/api/domains/` | Domain management | Yes |
| `src/app/api/vercel/domains/` | Vercel domain operations | Yes |
| `src/app/api/webhooks/vercel/route.ts` | Vercel webhook handler | Yes |
| `src/app/api/media/upload/` | Vercel Blob media upload | Yes |
| `src/app/api/projects/[id]/upload/` | Vercel Blob project upload | Yes |

## Route namespace note

The `src/app/api/v0/` route namespace is a historical artifact — these routes
were originally proxied to v0. Many now serve own-engine data. During Phase 3,
consider renaming the namespace to `src/app/api/builder/` or `src/app/api/gen/`
to avoid confusion, but this is cosmetic and low priority.

## Env vars affected by full deprecation

| Variable | Phase | Action |
|----------|-------|--------|
| `V0_API_KEY` | Phase 3 | Make optional, then remove |
| `V0_FALLBACK_BUILDER` | Phase 3 | Remove |
| `V0_STREAMING_ENABLED` | Phase 3 | Remove |
| `DESIGN_SYSTEM_ID` | Phase 3 | Remove |
| `VERCEL_TOKEN` | Keep | Vercel integration, not v0 |
| `BLOB_READ_WRITE_TOKEN` | Keep | Vercel Blob, not v0 |
| `OPENAI_API_KEY` | Keep | Own-engine primary |
