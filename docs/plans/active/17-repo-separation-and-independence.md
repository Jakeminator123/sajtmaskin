# Plan 17: Repo Separation and Independence

**Status:** Active — planning and prioritization phase.

## Goal

Reduce repo complexity and external coupling so that Sajtmaskin can evolve
independently. The repo today has 6 distinct Vercel dependencies, several
optional external services, dead code, and large research artifacts that make
navigation and maintenance harder than necessary.

This plan is derived from the analysis in `.cursor/migration-archive/STOR_MIGRATION/`
(the Vercel dependency and cleanup audit from 2026-03-18).

## Guiding principle

The user's stated goal: *get control over the project and be able to separate
different paths so the repo is not so large and hard to work with.*

This means:
- Remove what is dead or unused
- Isolate what is optional behind clean interfaces
- Make it possible to run the core builder without every external service
- Reduce indexing noise and git history bloat

## Dependency map (from STOR_MIGRATION analysis)

| Dependency | Coupling | Can run without? | Priority |
|---|---|---|---|
| **Vercel Deploy API** | 4/5 | No (for deploy) | Keep — good fit for Next.js |
| **Vercel Blob Storage** | 3/5 | No (for images) | Abstract behind StorageProvider |
| **Vercel AI SDK** | Open source | Yes (MIT) | Keep — no Vercel lock-in |
| **Vercel AI Gateway + OIDC** | 2/5 | Yes | Replace with direct OpenAI calls |
| **v0 Platform API** | 3/5 | Yes | Phase out — own engine is default |
| **Vercel Sandbox** | 1/5 | Yes | Low priority — niche use |

## Workstreams

### WS-1: Dead code removal (quick wins)

Remove verified dead code and unused dependencies:

- [x] `@types/google.maps` from `package.json`
- [x] `extractV0StatusCode` from `src/lib/v0/errors.ts`
- [x] `initTemplatePreview` from `src/lib/v0/v0-generator.ts`
- [x] `sanitizeCode` from `src/lib/v0/v0-generator.ts`
- [x] `vercel_templates_levels/` folder
- [x] `ModelSelector` — verified: defined + catalog-registered but never rendered. Keep for now (AI element demo). Remove with WS-2 if unneeded.

### WS-2: v0 fallback phase-out — COMPLETED

**Delivered 2026-03-18.** 42 files changed, -3689 lines.

- [x] Audit all code paths (37 files referenced v0 fallback)
- [x] Remove v0 fallback code paths from 25+ API routes
- [x] Remove `src/lib/providers/v0-fallback/` (stream-adapter.ts, 646 lines)
- [x] Remove `src/lib/v0-fallback.ts` feature flag
- [x] Remove `shouldUseV0Fallback` and `shouldUseExplicitBuilderFallback`
- [x] Simplify `src/lib/gen/fallback.ts` to own-engine only
- [ ] Remove v0 SDK client (`src/lib/v0.ts`) — deferred: still needed for legacy v0 projects, templates
- [ ] Remove `V0_API_KEY` from required env vars — deferred: still used by v0 project management routes

### WS-3: Vercel Blob abstraction

Create a `StorageProvider` interface so blob storage can be swapped:

- [ ] Define `StorageProvider` interface (put, get, delete, list)
- [ ] Implement `VercelBlobProvider` as current default
- [ ] Implement `LocalFsProvider` for local development
- [ ] Refactor `src/lib/vercel/blob-service.ts` consumers to use the interface
- [ ] Refactor `src/lib/imageAssets.ts` consumers
- [ ] Refactor `src/lib/templates/template-embeddings-storage.ts`

### WS-4: AI Gateway replacement

Replace `gateway("openai/...")` with direct `createOpenAI()` in all routes:

- [ ] Inventory all routes using `gateway()` (estimated ~15)
- [ ] Replace with direct OpenAI provider using `OPENAI_API_KEY`
- [ ] Remove `AI_GATEWAY_API_KEY` and `VERCEL_OIDC_TOKEN` dependencies
- [ ] Update `ENV.md` and `config/env-policy.json`

### WS-5: Large file and research cleanup

- [ ] Verify large JSON files are in `.gitignore` (not just `.cursorignore`)
- [ ] Consider git-lfs or build-time generation for files > 1 MB
- [ ] Evaluate whether `research/` can be moved to a separate repo or submodule
- [ ] Clean up `docs/old/` — remove anything with zero reference value

### WS-6: Optional service scope decisions

Decide keep/remove for low-coupling optional services:

- [ ] **D-ID avatar** (`/avatar` route) — coupling 5/5, isolated. Keep or remove?
- [ ] **OpenClaw** (agent feature) — coupling 5/5, isolated. Keep or remove?
- [ ] **Brave Search** (wizard context) — coupling 2/5. Keep as optional.
- [ ] **Loopia** (.se domains) — coupling 3/5. Keep as optional.

## Recommended execution order

1. WS-1 (dead code) — immediate, low risk, clears noise
2. WS-2 (v0 phase-out) — biggest complexity reduction
3. WS-4 (gateway replacement) — removes Vercel runtime dependency
4. WS-3 (blob abstraction) — enables future hosting flexibility
5. WS-5 (large files) — reduces git/indexing overhead
6. WS-6 (service decisions) — user decision, no rush

## Success criteria

- Running `npm run dev` requires only: `OPENAI_API_KEY`, `POSTGRES_URL`,
  `JWT_SECRET` (and optionally `REDIS_URL`)
- No code paths reference v0 SDK or v0 Platform API
- Blob storage has a provider interface with at least 2 implementations
- No `gateway()` calls remain in API routes
- Dead code and unused dependencies are removed
- Large generated JSON files are either gitignored or in git-lfs
