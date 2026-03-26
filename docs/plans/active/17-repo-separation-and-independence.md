# Plan 17: Repo Separation and Independence

### Hur du ska läsa den här filen (viktigt)

Den här planen kommer från **STOR_MIGRATION**-analysen (2026-03-18) och har **mycket** som fortfarande är användbart: dependency map, levererade workstreams, deferred-kryss med **ägarbeslut** (t.ex. v0 separat, ENV låg prio).  
**Den är inte alltid den nyaste sanningen om prioritering eller implementation.** Nyare eller mer specifik styrning finns i:

- **[`MASTER-ALLT-KVAR.md`](./MASTER-ALLT-KVAR.md)** — operativ kö, K-018/K-019, fidelity § 0  
- **[`kritik-consolidated-open-items.md`](./kritik-consolidated-open-items.md)** — K-tabell med `[ ]` / `[x]`  
- **[`AGENT-HANDOFF-RESTERANDE.md`](./AGENT-HANDOFF-RESTERANDE.md)** — kort «vad är öppet»  
- **[`docs/architecture/engine-status.md`](../../architecture/engine-status.md)** — hur own engine / builder faktiskt fungerar **nu**  
- **[`.j_to_agent/fidelity.txt`](../../../.j_to_agent/fidelity.txt)** — produktintent som kan **override:a** äldre formuleringar här  

**Regel vid konflikt:** Om **nuvarande kod** eller **nyare plan-/kritik-dokument** säger något annat än denna fil — **följ kod + MASTER/kritik/fidelity** och uppdatera **medvetet** denna plan (eller markera punkter **N/A** med datum) så historiken inte luras.

---

**Status:** **Active** — kärnan **WS-1–WS-4** är levererad (2026-03-18/19). **WS-6** är **avklarad** med produktbeslut **2026-03-26:** behåll **D-ID** (`/avatar`), behåll **OpenClaw**, **Brave Search** och **Loopia** förblir **optional** (som idag). **Ägarbeslut samma dag (B–I):** **v0 SDK / `V0_API_KEY`** förblir **avsiktligt separerat** (ingen nära fas-ut); **`ENV.md` / `env-policy`** = **låg prio**, dokumentera nuvarande sanning före hård städ; **`research/`** = kort policy i § WS-5; **`docs/old/`** = innehåll **flyttat 2026-03-26** till [`avklarat/2026-03-docs-old-archive/`](../avklarat/2026-03-docs-old-archive/) (rotmappen `docs/old/` är pekare). Filen är **inte** arkiverad förrän WS-5/deferred är gjorda eller uttryckligen nedprioriterade i planen. När kryssen är bockade eller N/A: flytta till `docs/plans/avklarat/` enligt [documentation-lifecycle.md](../../architecture/documentation-lifecycle.md).

**Skilj från external-review 100%:** Plan 17 är ett **separat** arkitektur-/dependency-spår, inte samma sak som *remediation exit* i [`avklarat/external-review-execution/REMEDIATION-EXIT.md`](../avklarat/external-review-execution/REMEDIATION-EXIT.md).

**Öppet arbete (samlad ingång):** [`MASTER-ALLT-KVAR.md`](./MASTER-ALLT-KVAR.md) · detalj: [`queue/PLAN-REPO-SEPARATION-OPEN.md`](./queue/PLAN-REPO-SEPARATION-OPEN.md)

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
| **v0 Platform API** | 3/5 | Yes | Fallback borttagen (WS-2); **SDK + nyckel** kvar — **ägarbeslut 2026-03-26:** medvetet **separat** spår, ingen nära fas-ut |
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

**Ägarbeslut 2026-03-26 (F1):** v0-plattformen (**SDK + nyckel**) ska **medvetet ligga kvar** som separat spår — deferred-kryssen är **inte** “nästa automatiska fas-ut”; egen arkitekturplan före ändring.

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

**Ägarbeslut 2026-03-26 (G1b):** **`ENV.md` / `env-policy`** har **låg prio** — första steget är **dokumentera nuvarande sanning** (vilka routes/nycklar som faktiskt används), inte aggressiv schemarensning.

**Produkt-/prioriteringsbeslut 2026-03-26 (WS-4 + WS-5-rester):** [`queue/BESLUT-INNAN-VI-GAR-VIDARE.md`](./queue/BESLUT-INNAN-VI-GAR-VIDARE.md) §5 — hårdare ENV-bindning **efter** K-018/K-019-stabilitet; övrigt WS-5 enligt samma stycke.

### WS-5: Large file and research cleanup

- [ ] Verify large JSON files are in `.gitignore` (not just `.cursorignore`)
- [ ] Consider git-lfs or build-time generation for files > 1 MB
- [ ] Evaluate whether `research/` can be moved to a separate repo or submodule — **policy tills vidare (H1c, 2026-03-26):** `research/` är för **extern rådata**, mall-discovery-output och liknande som **inte** ska vara hårdkrav för `npm run dev`; håll det **separerat från `src/`** och dokumentera vad som är gitignored/byggs lokalt.
- [x] Clean up `docs/old/` — **H2c (2026-03-26):** innehåll flyttat till [`docs/plans/avklarat/2026-03-docs-old-archive/`](../avklarat/2026-03-docs-old-archive/) med inventering (`INVENTORY-2026-03-26.md`); `docs/old/` lämnad som pekare.

Audit note:
- `2026-03-19`: requested PowerShell scan of `src/**/*.json` over `1 MB` returned no matches, so this repo slice currently needs neither `.gitignore` additions nor `git rm --cached`.

### WS-6: Optional service scope decisions — **KLAR 2026-03-26**

Produktbeslut (ägare): **behåll** D-ID och OpenClaw; Brave Search och Loopia **behålls som optional** (oförändrad riktning).

- [x] **D-ID avatar** (`/avatar` route) — **behåll** (isolerad, coupling 5/5).
- [x] **OpenClaw** (agent feature) — **behåll** (isolerad, coupling 5/5).
- [x] **Brave Search** (wizard context) — **behåll som optional** (coupling 2/5).
- [x] **Loopia** (.se domains) — **behåll som optional** (coupling 3/5).

## Recommended execution order

1. WS-1 (dead code) — immediate, low risk, clears noise
2. WS-2 (v0 phase-out) — biggest complexity reduction
3. WS-4 (gateway replacement) — removes Vercel runtime dependency
4. WS-3 (blob abstraction) — enables future hosting flexibility
5. WS-5 (large files) — reduces git/indexing overhead
6. WS-6 (service decisions) — **klar 2026-03-26** (behåll D-ID, OpenClaw; Brave + Loopia optional)

## Success criteria

- Running `npm run dev` requires only: `OPENAI_API_KEY`, `POSTGRES_URL`,
  `JWT_SECRET` (and optionally `REDIS_URL`)
- **v0 SDK / Platform API:** inga *nya* okontrollerade beroenden; befintliga vägar **dokumenterade** (WS-2 deferred + **F1 2026-03-26:** medvetet separat tills vidare)
- Blob storage has a provider interface with at least 2 implementations
- No `gateway()` calls remain in API routes
- Dead code and unused dependencies are removed
- Large generated JSON files are either gitignored or in git-lfs
