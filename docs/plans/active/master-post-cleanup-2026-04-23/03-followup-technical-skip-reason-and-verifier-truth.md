---
id: master-post-cleanup-03
title: Plan 03 — fixa `followup_technical` skip-reason och verifieringssanning
status: proposed
created: 2026-04-23
priority: critical
blocked_by: [00, 01, 02]
estimated_effort: 2–5 h
mode: targeted-bug-fix
---

# Mål

Stäng den specifika mörka fläcken runt `followup_technical`: fel skip-reason, dålig signalering eller fel severity.

# Arbete

1. Spåra call path för `followup_technical` genom verify/gate/status.
2. Avgör om skipen är:
   - korrekt men dåligt beskriven,
   - felaktigt triggad,
   - eller klassad med fel severity.
3. Justera reason- och severity-modellen.
4. Lägg regressionstest för:
   - teknisk follow-up som ska verifieras
   - teknisk follow-up som legitimt får warning/skip
   - teknisk follow-up som inte ska bli röd error

# Hårda regler

- lös användarsymptomet här
- flytta inte in andra stora verifier-idéer i samma branch

# Acceptans

- `followup_technical` får sann reason i logg och UI
- färre falskt röda följdruns
- tydligt före/efter på minst ett konkret fall

# Handoff

Skriv `STATUS-03-followup-technical.md`.
