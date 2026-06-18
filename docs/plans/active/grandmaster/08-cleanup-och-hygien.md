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
| Kandidat | Typ |
|---|---|
| `.cursorignore`: aktivera `logs/**`, spegla secret-ignore, ta bort stale `templates_v0/`-block | hygien |
| Radera tracked scratch: `blandat/`, `egna_kommandon.txt`, `generering.txt` | radering (kräver ja) |
| Pensionera/flytta `docs/schemas/strict/plan-file.schema.json` | schema-städ |
| Arkivera källdokumenten (`deep-research-report.md`, cleanup-handoff, "Controlled Aggression") | plan-städ |
| Eval-namnskugga: `scripts/eval/` vs `scripts/evals/` vs `src/lib/gen/eval/cli.ts` | namn |
| Synka `repo-tree.md` + `README.md` (görs i område 3, verkställs ev. här) | karta |
| `next`-patch-bump (säkerhet) som egen PR | deps |

## Klart när
Varje kandidat antingen utförd tillsammans eller medvetet parkerad. Inget autonomt.

## Nivå 3 (skapas när området startar)
Skapas vid behov — städning är ofta små styckvisa beslut snarare än 8–10 aktiviteter.
