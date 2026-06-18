---
id: gm-omrade-07-false-green-hardning
status: scope
created: 2026-06-18
linear: null
parent: gm-00-master-plan
supersedes: null
---

# Område 7 — False-green-härdning (Nivå 2)

**Nivå 1:** [`00-master-plan.md`](00-master-plan.md) · **Wave 3** · **Beroende:** område 2, 5

## Syfte
Störst kvalitetsvinst per rad: systemet får misslyckas, men aldrig ljuga. Fail-closed/
degraded i stället för tyst success.

## Yta (owner-surface — verifieras mot HEAD innan nivå 3)
- autofix: `src/lib/gen/post-process/cross-file-import-checker.ts` (null-render/dossier-stubbar)
- F2 runtime/UI-postcheck (Product Postcheck default-off/fail-open)
- F3 readiness (`/finalize-design` säger inte `ready` om integrationkrav tappats)

## Klart när
- Autofix vägrar dossier-stubbar eller markerar blocker/degraded (P1 N#1).
- Placeholder = degraded, aldrig grön. F3 readiness sann.
- Stabilitetstester låser falskt-grönt-familjen.

## Nivå 3 (batch 1 skapad — startad ur sekvens, samordnat med #149)
Området är formellt steg 6 (beror på 2/5), men #149 (promote-guard) landade tidigt pga
prod-incident. Komplementär batch 1 — **icke-överlappande** mot #149:s filer:
- [`A7-1`](aktiviteter/A7-1-false-green-stability-test.md) — stabilitetstest: terminal `done` raderar inte degraderingar (test-only, låg risk).
- [`A7-2`](aktiviteter/A7-2-refuse-dossier-stubs-flag.md) — autofix vägrar dossier-stub, **flag-gated default-OFF** (N#1; medel risk, draft).

Fler aktiviteter (F2 runtime/UI-postcheck blocking-beslut, F3 readiness, S3-statusresolver-flip) skapas när område 5/6 landat.
