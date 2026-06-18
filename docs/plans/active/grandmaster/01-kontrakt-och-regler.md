---
id: gm-omrade-01-kontrakt-och-regler
status: scope
created: 2026-06-18
linear: null
parent: gm-00-master-plan
supersedes: null
---

# Område 1 — Kontrakt & repo-regler (Nivå 2)

**Nivå 1:** [`00-master-plan.md`](00-master-plan.md) · **Wave 1** · **Beroende:** —

## Syfte
Samla kontraktslagret (4 pelare), flytta planeringskonventioner till en snärtig
Cursor-regel, och starta term-check light (warn-only) så namnskuggor fångas mekaniskt.

## Yta (owner-surface — verifieras mot HEAD innan nivå 3)
- `docs/contracts/` (README + policies/ + beslut/) — finns
- `.cursor/rules/plan-lifecycle.mdc` (3-nivå-modell) — uppdaterad
- `config/naming-dictionary.json` (ny) + `scripts/dev/check-term-coverage.mjs` (ny)
- `docs/architecture/terms-and-owners.md` (ny, från repo-tvätt PR0)

## Klart när
- 4 pelare indexerade; ADR-logg igång (0001 finns).
- `plan-file.schema.json` markerad för pensionering (utförs i område 8).
- `check-term-coverage` körbar warn-only (ej CI-blockerande än).

## Nivå 3 (första aktivitet i batch 1)
[`C1`](aktiviteter/C1-plan-file-schema-deprecate.md) — markera `plan-file.schema.json` deprecated
(rör ej fysiskt; radering i område 8). Övriga aktiviteter skapas när området är fullt på tur.
