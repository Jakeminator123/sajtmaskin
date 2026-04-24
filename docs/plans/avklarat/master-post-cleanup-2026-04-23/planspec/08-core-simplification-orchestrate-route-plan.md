---
id: master-post-cleanup-08
title: Plan 08 — förenkla kärnan utan beteendeändring först
status: proposed
created: 2026-04-23
priority: medium
blocked_by: [02, 03, 05, 06, 07]
estimated_effort: 5–10 h
mode: no-behavior-change-first
---

# Mål

När de mest användarsynliga problemen lugnat sig: tunnas återstående tunga koordinatorer ut.

# Primära kandidater

- `orchestrate.ts`
- `route-plan.ts`
- stora lokala helpers nära dessa
- ev. manifest-relaterad tung logik om den fortfarande stör

# Arbete

1. Splitta mekaniskt först, utan policyändring.
2. Flytta helpers närmare sin ägare.
3. Ta bort lokalt överlapp som blivit onödigt efter tidigare planer.
4. Stoppa om en split gör diffen semantiskt riskabel.

# Hårda regler

- detta är ingen featureplan
- först mindre filer och tydligare ansvar, sedan eventuella policyjusteringar senare

# Acceptans

- kärnan känns mindre monolitisk
- lättare att följa init/follow-up-flödet i kod
- inga uppenbara beteenderegressioner

# Handoff

Skriv `STATUS-08-core-simplification.md`.
