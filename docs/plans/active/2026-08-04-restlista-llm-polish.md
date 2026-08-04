---
status: active
owner: unassigned
created: 2026-08-04
topic: Restlista — öppna LLM/polish-rader från upplöst Kvarvarande-uppgifter.md
source: docs/plans/archived/Kvarvarande-uppgifter.md upplöst i sanering våg 3 (git c1acadc9d)
---

# Restlista: LLM-polish och core-split

Frusen wave-logg upplöst 2026-08-04. Full historik:
`git show c1acadc9d:docs/plans/archived/Kvarvarande-uppgifter.md`.

| # | Område | Prio | Nästa steg |
|---|---|---|---|
| 1 | VersionHistory badge/overlay visuell verifiering (P25b-rest) | Låg | Visuell QA — [SAJ-23](https://linear.app/sajtmaskin/issue/SAJ-23) |
| 4 | Pre-existing test failures (4 på master vid 2026-05-01) | Medel | Egen PR — verifiera om fortfarande öppna |
| 5–6 | shadcn P20 nivå 2/3 (`registry:block`, `registry:font`) | Låg | Uppströms full format — inte blockerande |
| 8 | P26-rest PR3–9 (gate-probe, logging, copy, backoffice, dossier re-embed) | Låg–Medel | Individuella PR:er |
| 9 | `orchestrate.ts` core-split v2 (~965 rader) | Medel | Egen agentsession |
| 10 | `manifest.json` delning per phase-routing-grupp | Låg | Telemetri-data krävs |
| 11 | Event-bus UI-flip (G#32/35/60) + F2/F3 copy-konsolidering | Låg–Medel | `useVersionStatus` consumer cut-over; copy i glossary/UI |
| — | Deterministic variant→code font injection | Låg | Scaffold-contract planerad förbättring |
| T7–T10 | Telemetri-blockad: early-stop, verifier async, partial-file-repair, P50/brief A/B | — | Vänta counter-data (`sajtmaskin_*` metrics) |
| S11–S12 | Slå ihop verify+gate+accept-repair; WebContainers | Stor | Strategiskt — egen satsning |
| E13–E14 | ÅÄÖ pre-commit hook; skuld-spår-rester | — | Husky/lint-staged; mest klart 2026-04-20 |
