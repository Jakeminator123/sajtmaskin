---
status: proposed (komplement till spår 02)
created: 2026-04-24
spår: 7 av 9 (komplement efter GPT-5-rapport 2026-04-24)
prio: P2.5 — gör DIREKT efter spår 02s Playwright-kärna är på plats
estimat: 2 dagar (eval-script + dashboard + CI), bygger på spår 02s primitiver
parent: README.md
---

# Spår 7 — F2 UX som mätbar SLO (komplement till 02)

## Förhållande till spår 02

Spår 02 (`02-product-postcheck.md`) bygger **headless-browser-runner** som
kontrollerar att enskilda saker fungerar (bilder laddar, CTA:er har handlers,
mobilmeny öppnar). Det är **per-version-kvalitetskontroll**.

Detta spår bygger ovanpå 02:s primitiver och svarar på en annan fråga:

> Är produkten användbar **i aggregat över N senaste runs**?

GPT-5-rapporten 2026-04-24 noterar att vi mäter strukturellt (är monoliter
splittrade?) men inte produktmässigt (kan användaren se sajten i iframen?).
Spår 02 löser per-run-mätning. Detta spår ger en **SLO-aggregation + dashboard
+ veckovis CI** som svarar produktivitetsfrågan.

## När detta spår körs

Efter spår 02s `runProductPostcheck` är wired in i pipeline. Använder samma
playwright-runner för en bredare eval-suite.

## Mål

**Definiera F2-UX som en SLO** med 6 mätbara fält som en eval-script kan
returnera PASS/FAIL på över 5 kanoniska prompter × 3 runs = 15 datapunkter.

| Mätare | Threshold | Källa |
|---|---|---|
| **Wall-clock create→iframe-loaded** | p50 ≤ 5 min, p95 ≤ 7 min | preview-host `/healthz` polling |
| **Iframe loaded utan console error** | 100 % av runs | playwright `page.on('console')`, fail om `error` |
| **Hero visible ovanför fold** | 100 % | playwright `page.locator('h1, [data-hero]').isVisible()` inom 5 s |
| **Inga 4xx/5xx i network** (same-origin + Unsplash) | 100 % | spår 02s `productPostcheck.imageResults` |
| **Variant stabil** mellan v1 och första followup | 100 % | jämför `orchestration.snapshot.persisted.variantId` |
| **`promote=true` för v1 efter init** | ≥ 90 % | DB `versions.lifecycle_status === 'promoted'` |

Threshold är medvetet realistiska för dagens 7:07-baseline. Minskas över
tid när spår 6+8 levererar latens-vinster.

## Implementation

### Steg 1 — Eval-script `scripts/eval/measure-f2-ux.mjs`

Återanvänder `runProductPostcheck` från spår 02 + lägger på wall-clock-mätning
+ aggregation. För varje prompt × 3 runs:

1. POST `/api/engine/chats` (samma path som UI).
2. SSE-streama till `done` eller timeout (8 min hard limit).
3. När `version-promoted` SSE: starta playwright + kalla
   `runProductPostcheck` direkt.
4. Lägg en rad i `data/eval/f2-ux-runs.ndjson`.
5. Aggregera till `data/eval/f2-ux-summary.json` (median, p95, pass-rate
   per SLO-fält).

Kanoniska prompter (samma som spår 02 + en till för 3D-capability):

1. `"bygg en hemsida för en yogalärare i Malmö"` (enkel)
2. `"bygg en hemsida för en kaffebar med menu och bokning"` (medel)
3. `"bygg en hemsida för en gymnastiklokal i Göteborg som heter Trampolin Studio"` (verifierad fungerande från Wave 5)
4. `"bygg en hemsida om Emilia & Jakobs bröllop med dato 12 juni"` (kreativ — 7:07-runnen)
5. `"bygg en hemsida för ett 3D-printbolag med interaktiv produktvy"` (3D-capability — pressar dossier-system)

15 totalt per körning. ~60 min wall-clock vid p50=5min/run.

### Steg 2 — Backoffice-page `f2_ux_slo.py`

Läs `data/eval/f2-ux-summary.json` + visa:

- 6 SLO-fält som färgade chips (grön ≥ threshold, gul borderline, röd under)
- Trendlinje över senaste 30 körningar
- Jämförelse mot förra körningen (delta per fält)

Detta blir den **enda** dashboard-vyn som svarar "är produkten användbar?".
Andra dashboards (autofix-stats, fixer-registry, observability,
`llm_flode_telemetry.py` från wave 8) blir support-vyer för debugging när
SLO bryter.

### Steg 3 — Veckovis CI-cron

GitHub Actions cron varje måndag 08:00 + checkar in resultat-NDJSON. Om
summary visar regression (> 10 % drop på någon SLO) — Linear-issue
automatiskt skapad med `priority: 2` och `labels: ["F2-UX-regression"]`.

## Avgränsningar

- **Inte F3** (integrations-build). F3 har egen problembild (env-vars,
  riktiga API-nycklar) och förtjänar egen SLO senare.
- **Inte design-kvalitet** ("ser sajten snygg ut?"). Det är en separat
  visual-QA-pipeline som kan trådas in senare.
- **Inte språk-kvalitet** av copy. Separat eval-spår.

## Acceptance-criteria

- [ ] Spår 02s `runProductPostcheck` är wired in i pipeline (förutsättning)
- [ ] `scripts/eval/measure-f2-ux.mjs` finns och kör 15 runs på ≤ 90 min
- [ ] `data/eval/f2-ux-runs.ndjson` schema dokumenterat i `docs/schemas/strict/`
- [ ] Backoffice-page `f2_ux_slo.py` visar SLO-chips för senaste run
- [ ] Första baseline-körning sparad
- [ ] CI-cron-job konfigurerad
- [ ] Linear-integration testad med en simulerad regression

## Estimerad insats

2 dagar **efter** spår 02 har levererat `runProductPostcheck`. Värt det
eftersom alla andra spår blir mätbara mot SLO och vi har ett tydligt
"färdigt"-bevis för Wave 5 + de nya spåren.

## Kopplingar

- **Spår 02:** Direkt förutsättning. Detta spår är aggregator + dashboard ovanpå.
- **Spår 1** (variant-bug): `variant stabil`-SLO triggar fail om variant-flip — wave 2 fixet ska visas grönt.
- **Spår 3** (bildminimum): `inga 4xx/5xx`-SLO fångar broken Unsplash — wave 3 fix ska visas grönt.
- **Spår 5** (autofix-gating): `wall-clock`-SLO fångar långa auto-repair-loops.
- **Spår 6** (latens): denna SLO är hur vi mäter spår 6s vinster.
- **Wave 8** `llm_flode_telemetry.py`: ortogonal — wave 8 visar telemetri per event-typ, detta spår visar produktupplevelse aggregerat.
