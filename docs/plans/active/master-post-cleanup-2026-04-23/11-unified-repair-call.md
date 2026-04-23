---
id: master-post-cleanup-11
title: Plan 11 — samla kvarvarande LLM-repair i en tydlig väg
status: proposed
created: 2026-04-23
priority: medium
blocked_by: [05, 09, 10]
estimated_effort: 2–4 dagar
mode: architecture-pass
---

# Mål

När fixer-ytan och legacy-lagren redan krympt: slå ihop kvarvarande LLM-repair-anrop till ett tydligt callgraph.

# Arbete

1. Identifiera kvarvarande LLM-repair-calls.
2. Designa en gemensam problemstruktur.
3. Mappa gamla callsites i små pass.
4. Se till att telemetry och `reason` inte spricker igen.

# Hårda regler

- gör inte detta innan fixer-ytan är förstådd
- undvik stor bang-refactor om mindre migreringar räcker

# Acceptans

- färre olika repair-calls per run
- enklare att förstå när LLM-repair faktiskt triggas

# Handoff

Skriv `STATUS-11-unified-repair.md`.
