---
id: master-post-cleanup-06
title: Plan 06 — gör Deep Brief smal och follow-up till en riktig delta-operation
status: proposed
created: 2026-04-23
priority: high
blocked_by: [00, 01, 03]
estimated_effort: 4–7 h
mode: phase1-clarity
---

# Mål

Få fas 1 att kännas begriplig igen: Deep Brief ska ha ett smalt jobb och follow-up ska inte glida tillbaka till "nästan init".

# Rekommenderad policy

Deep Brief får:
- strukturera intent
- fylla små, rimliga defaults
- föreslå scaffold, variant och capabilities
- logga sina antaganden

Deep Brief får inte:
- skriva om hela briefen i onödan
- bli en allmän promptbrodyrmaskin
- duplicera annan orkestreringslogik

# Arbete

1. Dokumentera Deep Brief-kontraktet i kod/doc där det faktiskt hjälper.
2. Tombstone-markera eller rensa eventuell AI-assist-skugga om den fortfarande finns.
3. Definiera follow-up som delta-operation:
   - återanvänd scaffold/variant som default
   - capability-refresh endast när ny signal är stark
   - ingen full reset om inte det uttryckligen är redesign
4. Gör antaganden synliga i logg.

# Hårda regler

- om AI-assist redan är borttagen: gör denna plan till kontrakt + tests, inte spökjakt
- håll ändringen mental och semantisk, inte storskalig omskrivning

# Acceptans

- du kan beskriva fas 1 kort och konsekvent
- follow-ups känns mindre slumpmässiga
- Deep Briefs roll är smalare och mer legitim

# Handoff

Skriv `STATUS-06-deep-brief-and-delta.md`.
