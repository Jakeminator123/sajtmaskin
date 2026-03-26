# Plan 17: Repo Separation and Independence

**Status:** **Active** — kärnan **WS-1–WS-4** är levererad (2026-03-18/19). Filen är **inte** arkiverad därför att **WS-5** (stora filer / research-hygien), **WS-6** (valfria tjänster) och **deferred** städ (`AI_GATEWAY_*` / OIDC, `ENV.md` + `config/env-policy.json`) fortfarande har öppna kryss. När de är gjorda eller medvetet nedprioriterade: flytta till `docs/plans/archived/` enligt [documentation-lifecycle.md](../../architecture/documentation-lifecycle.md).

**Skilj från external-review 100%:** Plan 17 är ett **separat** arkitektur-/dependency-spår, inte samma sak som *remediation exit* i [`archived/external-review-execution/REMEDIATION-EXIT.md`](../archived/external-review-execution/REMEDIATION-EXIT.md).

**Öppet arbete (köbar plan):** [`queue/PLAN-REPO-SEPARATION-OPEN.md`](./queue/PLAN-REPO-SEPARATION-OPEN.md) · [`queue/KORFIL.md`](./queue/KORFIL.md)

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
- [x] `vercel_templates_levels/` folder _(legacy optional local; **canonical Playwright spec** now `e2e/vercel-templates/` — see `vercel-templates-discovery.md` + `vercel-templates-playwright-scaffold-integration.txt`)_
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

### WS-3: Vercel Blob abstraction — COMPLETED

**Delivered 2026-03-19.**

Create a `StorageProvider` interface so blob storage can be swapped:

- [x] Define `StorageProvider` interface (put, get, delete, list)
- [x] Implement `VercelBlobProvider` as current default
- [x] Implement `LocalFsProvider` for local development
- [x] Refactor `src/lib/vercel/blob-service.ts` consumers to use the interface
- [x] Refactor `src/lib/imageAssets.ts` consumers
- [x] Refactor `src/lib/templates/template-embeddings-storage.ts`

### WS-4: AI Gateway replacement — COMPLETED

**Delivered 2026-03-18.** 12 files changed.

- [x] Inventory all routes using `gateway()` (11 files, 12 calls)
- [x] Replace with `createDirectModel()` using OPENAI_API_KEY / ANTHROPIC_API_KEY
- [x] Rewrite `gateway-policy.ts` as direct-provider policy module
- [x] Update `gen/models.ts` Anthropic path to use direct `createAnthropic()`
- [ ] Remove `AI_GATEWAY_API_KEY` and `VERCEL_OIDC_TOKEN` from env schema — deferred: still referenced in health/admin routes
- [ ] Update `ENV.md` and `config/env-policy.json` — next cleanup pass

### WS-5: Large file and research cleanup

- [ ] Verify large JSON files are in `.gitignore` (not just `.cursorignore`)
- [ ] Consider git-lfs or build-time generation for files > 1 MB
- [ ] Evaluate whether `research/` can be moved to a separate repo or submodule
- [ ] Clean up `docs/old/` — remove anything with zero reference value

Audit note:
- `2026-03-19`: requested PowerShell scan of `src/**/*.json` over `1 MB` returned no matches, so this repo slice currently needs neither `.gitignore` additions nor `git rm --cached`.

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
