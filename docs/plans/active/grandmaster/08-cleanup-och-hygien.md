---
id: gm-omrade-08-cleanup-och-hygien
status: scope
created: 2026-06-18
linear: null
parent: gm-00-master-plan
supersedes: null
---

# Område 8 — Cleanup & hygien (Nivå 2)

**Nivå 1:** [`00-master-plan.md`](00-master-plan.md) · **Löpande/gemensam** · **Beroende:** gemensam

## Syfte
Minska index-/token-brus och röj död yta. **Körs tillsammans, när det är dags** —
inte autonomt av en agent. Beslut tas per styck.

## Kandidater (besluta per rad)
| Kandidat | Typ | Status |
|---|---|---|
| `.cursorignore`: aktivera `logs/**`, spegla secret-ignore, ta bort stale `templates_v0/`-block | hygien | öppen (bred `.gitignore`/`.cursorignore`-prune = eget pass) |
| Radera tracked scratch: `blandat/` | radering | **klar** (#157) — `egna_kommandon.txt`/`generering.txt` fanns ej; `test_förslag_templates_blob/` är load-bearing, behålls |
| Pensionera/flytta `docs/schemas/strict/plan-file.schema.json` | schema-städ | **klar** (#158, raderad — 0 runtime-konsumenter) |
| Arkivera källdokumenten (`deep-research-report.md`, cleanup-handoff, "Controlled Aggression") | plan-städ | **klar 2026-06-21** — `2026-06-17`-handoffen `git mv` → `_parkering/`; `deep-research-report.md` redan där; "Controlled Aggression" = ingen separat fil |
| Eval-namnskugga: `scripts/eval/` vs `scripts/evals/` vs `src/lib/gen/eval/cli.ts` | namn | **löst 2026-06-21** — `scripts/evals/` + `evals/` (OMTAG-02 baseline-spår, ej wired, stale) borttagna; kvar `scripts/eval/` (`npm run eval`) + `src/lib/gen/eval/` (`eval:suite`/CI) |
| `config/dashboard/` legacy-wrappers (`app.py`/`run.ps1`/`shared_overhead.py`/`requirements.txt`) | radering | **klar** (#158; `domain-map.json` behållen, load-bearing) |
| Synka `repo-tree.md` + `README.md` (görs i område 3, verkställs ev. här) | karta | klar (D2 + #157/#158) |
| `next`-patch-bump (säkerhet) som egen PR | deps | **stängd 2026-06-21** — `^16.2.9` = senaste stabila (16.3.0 endast preview); inaktuell, noll kod |

## Klart när
Varje kandidat antingen utförd tillsammans eller medvetet parkerad. Inget autonomt.

## Nivå 3 (skapas när området startar)
Skapas vid behov — städning är ofta små styckvisa beslut snarare än 8–10 aktiviteter.
