---
id: master-post-cleanup-05
title: Plan 05 — en fixer-entrypoint och tre tydliga lanes
status: proposed
created: 2026-04-23
priority: high
blocked_by: [04]
estimated_effort: 5–8 h
mode: consolidation
---

# Mål

Krymp flera fixer-lägen till en enda huvudingång som är lätt att följa och lätt att mäta.

# Rekommenderade lanes

- `mechanical` — imports, assets, enkla codemods
- `static_gate` — syntax, schema, typ av hårda pre-runtime-kontroller
- `llm_repair` — bara när de två första inte räcker

# Arbete

1. Skapa eller tydliggör en central fixer-entrypoint.
2. Mappa gamla triggerbanor till de tre lanes.
3. Inför gemensam `reason`/`budget`/`pass_id` om det saknas.
4. Flytta sidobanor till entrypointen eller tombstone-markera dem.

# Hårda regler

- inga nya specialspår
- håll beteendet så nära nuvarande som möjligt i första passet

# Acceptans

- en agent kan följa fixerflödet från en huvudingång
- färre överlappande triggerpunkter
- logg/telemetri ser enklare ut

# Handoff

Skriv `STATUS-05-fixer-entrypoint.md`.
