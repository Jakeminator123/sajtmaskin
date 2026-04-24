---
id: master-post-cleanup-00
title: Plan 00 — lås HEAD efter cleanup-vågen och märk allt som full/short/skip
status: proposed
created: 2026-04-23
priority: critical
blocked_by: []
estimated_effort: 20–45 min
mode: reality-lock
---

# Mål

Bekräfta exakt vilken `master` du faktiskt kör på efter cleanup-vågen, och korta sedan ned resten av serien så att du slipper tredje varvet av dubbelarbete.

# Arbete

1. Verifiera exakt HEAD lokalt och mot origin.
2. Notera om preview-host-fixen är:
   - bara committad,
   - committad + deployad,
   - eller oklar.
3. Gå igenom plan 01–12 och märk varje plan som:
   - `full`
   - `short`
   - `skip`
4. Skriv en 1-rads motivering per plan.

# Hårda regler

- Ingen bred ny kodinventering.
- Inga featureändringar.
- Enda målet är att göra resten av serien exakt nog för att köras utan fluff.

# Acceptans

- exakt HEAD-SHA nedskriven
- tabell med `full/short/skip` för alla planer
- tydligt svar på om preview-host deploy måste göras innan kodspår fortsätter

# Handoff

Skriv `STATUS-00-head-lock-post-cleanup.md`.
