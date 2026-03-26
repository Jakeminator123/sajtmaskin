# PLAN 2 — Plan 17 (repo separation, öppna workstreams)

**Kanonisk plan:** [`17-repo-separation-and-independence.md`](../17-repo-separation-and-independence.md)

## WS-2 deferred (fortfarande `[ ]`)

- [ ] **v0 SDK** (`src/lib/v0.ts`) — *deferred:* behövs för legacy v0-projekt / mallar; stäng när ersatt eller dokumenterat att behållas permanent.
- [ ] **`V0_API_KEY` i required env** — *deferred:* används av v0 project management routes; stäng i linje med beslut om v0-livscykel.

**Ägarbeslut 2026-03-26 (F1):** v0-spåret är **avsiktligt separat** — inget krav på nära migrering; följ huvudplanen § WS-2.

## WS-4 deferred

- [ ] **`AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN`** bort från env-schema — *deferred:* refereras i health/admin; stäng när referenser rensats eller env dokumenterat.
- [ ] **`ENV.md` + `config/env-policy.json`** — “next cleanup pass”; synka med verkliga routes och policy.

**Ägarbeslut 2026-03-26 (G1b):** **låg prio** — dokumentera **nuvarande sanning** först.

## WS-5: Large file and research cleanup

- [ ] Stora JSON: verifiera `.gitignore` (inte bara `.cursorignore`) om nya genererade filer tillkommer.
- [ ] Överväg git-lfs eller build-time generation för filer > 1 MB om de börjar dyka upp i repo.
- [ ] Utvärdera `research/` — separat repo/submodule eller följ **policy i huvudplanen** § WS-5 (H1c).
- [ ] Städa `docs/old/` — **H2c:** aggressivt i **separata PR** med **inventering före radering**.

## WS-6: Optional services — **beslut 2026-03-26**

- [x] **D-ID** (`/avatar`) — **behåll** (produkt).
- [x] **OpenClaw** — **behåll** (produkt).
- [x] **Brave Search** — **behåll som optional**.
- [x] **Loopia** — **behåll som optional**.

Se [`17-repo-separation-and-independence.md`](../17-repo-separation-and-independence.md) § WS-6.

## Acceptans (för att arkivera hela plan 17)

När WS-5/WS-6/deferred är **gjorda eller medvetet nedprioriterade med motivering** i planfilen: flytta `17-repo-separation-and-independence.md` till `docs/plans/archived/` enligt [documentation-lifecycle.md](../../../architecture/documentation-lifecycle.md).
