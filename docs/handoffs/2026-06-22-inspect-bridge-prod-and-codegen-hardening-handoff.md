---
date: 2026-06-22
title: Inspect-bridge live i prod + codegen-härdning (white-screen, false-green, visual-3d)
status: closed
supersedes: null
---

# Closing-handoff — inspect-bridge i prod + codegen-härdning

**TL;DR:** inspect-bridge ("Inspektera preview", Option B) är nu **live i prod**. Ett skarpt live-test (prompt "Western Premiere Interactive Cinema Site") avslöjade tre äkta buggar i codegen-pipelinen — alla fixade i en 5-fas-svärm. Repo-hygien + en SSRF-fix landade också. Master = `b4e949965` (+ denna handoff-commit).

## Vad som landade (denna session)

### Mergade PR:er
| PR | Vad |
|---|---|
| #140 | `pydatabastest.py` DB+Blob sync-gate (read-only CI) |
| #191 | stäng av canvas-auto-PR-workflow (PR-spam) |
| #194 | rensare agentregler + ny `dossier-rules.mdc` (canonical = `data/dossiers/{hard,soft}/`) |
| #190 | docs-omstruktur (arch→architecture, reports→operating/incidents, status-archive→archive/status) + grandmaster-arkiv + död-kod-bort |
| #196 | **SSRF-fix (G#40):** `safeFetch` DNS-resolvar + blockar privat-IP (initial + redirects) |
| #164 | flagg-gated inspect-bridge + chunked/Content-Length-fix i preview-host-proxyn |
| #198 | **Fas 4:** gate `visual-3d` bakom explicit 3D-begäran |
| #199 | **Fas 3:** visa äkta typecheck-fel i stället för "verifiering tog för lång tid" |
| #200 | **Fas 1 (P0):** lucide-import-fix i post-merge-repair (white-screen-fix) |
| #201 | **Fas 2:** deterministisk TS2304-known-import-fixer före LLM i repair-loopen |

### Direkt-commits till master
- `b731fe0f6` + `407e850f5`: tog bort `builder-coexistence`-regeln (Jake kör live-tester mot Vercel-prod nu) + städade referenser.
- `1fae2906f`: `npm run clean:orphans` + `workflow.mdc`-guardrail (gitignorerade leftovers som `__pycache__` överlever `git pull`).
- `eb5c4d4f3`: backlog-not om `v0ChatId` (se nedan).

## Inspect-bridge är live i prod

| Yta | Läge |
|---|---|
| preview-host `vm-fly-jakem` (Fly) | **v28 deployad** — ny `runtime.js` + secret `SAJTMASKIN_APP_ORIGIN=https://sajtmaskin.vercel.app` (Deployed, ej staged) |
| Vercel `NEXT_PUBLIC_SAJTMASKIN_INSPECT_BRIDGE` | **`1`** i prod/preview/dev (non-sensitive) |
| Vercel prod-build | ombyggd → `GET /api/inspect-bridge` = **200** (scriptet serveras) |

Rollback om behövs: `fly deploy` kan rullas till v27; Vercel-flaggan kan flippas 1→0.

## Live-test-fynden → 5-fas-fix

Prompt fick `requestedCapabilities:[payments, parallax-scroll, visual-3d, carousel]`, byggde 3 sidor (33 filer), men previewn blev **vit**. Rot + åtgärd:

| Fas | Bugg | Fix |
|---|---|---|
| 1 (P0) | `<Clapperboard/>` utan import → `ReferenceError` → vit sida (esbuild-grön/tsc-röd; post-merge-repair körde inte lucide-fixarna) | #200 — `runImportValidator` in i `repairGeneratedFiles()` |
| 2 | repair-loopen långsam (~77s) + missar non-JSX-användning av ikoner | #201 — diagnostik-driven `ts2304-known-import-fixer` (lucide + Next-defaults) **före** LLM i `repair-loop.ts` |
| 3 | quality-gate visade "verifiering tog för lång tid / försök igen" (5-min stale-watchdog i `readiness/route.ts`) i stället för det riktiga typecheck-felet | #199 — `gate-failure-summary.ts` ytliggör äkta felet, ankrat på senaste gate-försöket |
| 4 | `visual-3d` över-infererat från "cinematic/immersive" (brief-LLM) → WebGL Context-Lost + CSP-eval | #198 — `explicitlyRequests3D()`-guard + skärpt brief-prompt |
| 5 | `v0ChatId`-borttag | **EJ gjort** — fältet är load-bearing (live DB-kolumn + `useBuilderVmPreview` gatar VM-preview på det) → backloggad med migrationskrav |

**Inspect-bridge friades:** 502 = preview-VM nere under repair; 500/vit = kodkraschen. Injektionen var aldrig boven.

## Kvar / backlog (för nästa agent)

- **`v0ChatId`-migration** — kräver migrationsplan (byt internt symbolnamn, behåll DB/payload-kompat). Se `BUG-SWARM-BACKLOG.md` § "Naming-debt: v0ChatId".
- **Inspect-bridge-P2:or** (i `BUG-SWARM-BACKLOG.md` § "Inspect-bridge (#164)"): fallback när bridge ej kan injiceras · `config/env-policy.json`-rad för flaggan · bevara klick-punkt (ej element-center) · läck inte `?inspect=1` in i preview-appen.
- **warm-tsc-timing** — kör warm-tsc även när QG planerad (`fast-path.ts:skipWarmTsc`) + re-run tsc efter fix. Fas 2 hölls smalt och rörde inte detta.
- **CSP `unsafe-eval`** (report-only) — omvärdera efter att `visual-3d` minskat.

## Inte mina (lämnade orörda)
- Dependabot **#192** (19 dev-deps) + **#193** (53 prod-deps) — Jake valde "håll"; bulk-bumpar = eget testpass.
- **#175** chgenberg (collab) — exkluderad enligt instruktion.
- Worktree `feat/control-plane-registry` (`sajtmaskin-control-plane`) — annans spår, ej rört (agent-worktree-isolation).

## Verifiering
- Alla 10 PR:er: `quality` (typecheck+lint+test:ci) grön, `schema-drift` grön (ingen DB-schemaändring denna session).
- Prod (read-only): `db-blob-sync` grön på `b4e949965` + färsk dispatch (run `27935723894`) = success.
- Review-gaten (skärpt i #197... se nedan) fångade 2 äkta P2:or under granskning (#199 stale-lookup, #201 Image/Link-prioritet) — fixade före merge, ej mergade blint.

> Not: `pr-merge-review-gate.mdc` skärptes denna session (#197) — varje listat bot-fynd måste sluta i *fixat / loggat / avfärdat*, aldrig tyst tappat.

## Nästa steg (förslag)
Plocka ur backloggen i ny chat med thinking-modell. Mest värde: inspect-bridge-fallback-P2 (gör prod-läget robust) + warm-tsc-timing (snabbare/ärligare verify). `v0ChatId` kräver ett eget migrations-pass.
