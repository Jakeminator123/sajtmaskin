---
id: master-post-cleanup-10
title: Plan 10 — kapa latens utan att sänka kvaliteten
status: proposed
created: 2026-04-23
priority: medium
blocked_by: [02, 03, 05, 06, 07, 08, 09]
estimated_effort: 4–7 h
mode: performance
---

# Mål

När flödet blivit sannare och renare: kapa tid genom att mäta och eliminera onödiga varv.

# Arbete

1. Mät tid per fas/steg i init och follow-up.
2. Sätt budgets för de värsta stegen.
3. Inför säkra skip-regler för no-op- eller lågnyttolägen.
4. Utnyttja scaffold/dossier/capability-kunskap för att korta vägen i vanliga runs.
5. Utvärdera om någon pass-reduktion är säker.

# Hårda regler

- inga speedups som offrar Fidelity 2
- inga dolda skip-regler utan loggbar orsak

# Acceptans

- du kan peka ut faktiska tidsvinnare
- vanliga runs tar mindre tid eller färre onödiga varv

# Handoff

Skriv `STATUS-10-latency-budgets.md`.
