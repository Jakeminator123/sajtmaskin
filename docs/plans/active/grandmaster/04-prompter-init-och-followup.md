---
id: gm-omrade-04-prompter-init-och-followup
status: scope
created: 2026-06-18
linear: null
parent: gm-00-master-plan
supersedes: null
---

# Område 4 — Prompter (init + follow-up) (Nivå 2)

**Nivå 1:** [`00-master-plan.md`](00-master-plan.md) · **Wave 2** · **Beroende:** område 1

## Syfte
Tydlig och låst skillnad mellan **Deep Brief** (init) och **Snapshot-Brief** (follow-up),
Core Rules, och ev. ett prompt-format-kontrakt (schema-pelaren).

## Yta (owner-surface — verifieras mot HEAD)
- `config/prompt-core/` (Core Rules)
- `src/lib/gen/system-prompt/`
- brief-bygge: `site-brief-generation.ts` (init) + `buildFollowUpBriefFromSnapshot` (follow-up)

## Klart när
- Init- vs follow-up-semantik dokumenterad och låst (aldrig ny full Deep Brief vid follow-up).
- Stabilitetstest för svensk follow-up-intent (`ändra`/`byt`/`rubrik`, ÅÄÖ).

## Nivå 3 (skapas när området startar)
8–10 aktiviteter, smal `owner_files` var. Ej skapade än.
