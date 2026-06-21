---
id: gm-omrade-04-prompter-init-och-followup
status: done
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

> **STATUS 2026-06-21 — redan uppfyllt, ingen separat PR.** Båda "Klart när"-kriterierna är täckta: init- vs follow-up-brief-semantiken är låst i [`terminology.mdc`](../../../../.cursor/rules/terminology.mdc) (Deep Brief vs Snapshot-Brief, aldrig ny Deep Brief vid follow-up) + CI-gatad av Område 5-kontraktet (5-7 #176); svensk follow-up-intent inkl. ÅÄÖ testas i `follow-up-clarification.test.ts` (`Ändra rubriken`/`Byt hero-bilden`, Unicode-`\b`) + S2 åäö-invariant (#151). Det enda okörda — en bred **init-prompt-overhaul** (omskrivning av Deep Brief/Core Rules) — är **oscope:ad** och ligger **inte** i "Klart när"; backlog endast om Jake explicit vill.

## Nivå 3 (ej skapad — området täckt utan egna aktiviteter)
8–10 aktiviteter var planerade men behövdes aldrig: follow-up-delen täcktes av Område 5, init-delen av befintliga tester + terminologi-lås.
