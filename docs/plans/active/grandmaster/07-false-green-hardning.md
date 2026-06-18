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

## Nivå 3 (skapas när området startar)
8–10 aktiviteter, smal `owner_files` var. Ej skapade än.
