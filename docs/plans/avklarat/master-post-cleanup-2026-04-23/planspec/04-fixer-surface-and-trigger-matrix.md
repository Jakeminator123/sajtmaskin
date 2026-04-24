---
id: master-post-cleanup-04
title: Plan 04 — räkna fixer-ytan och gör trigger-matrisen exakt
status: proposed
created: 2026-04-23
priority: high
blocked_by: [00, 01]
estimated_effort: 3–6 h
mode: inventory-and-prune
---

# Mål

Gör din känsla av "40 fixer-pass och flera lägen" exakt nog för att kunna krympas utan chansningar.

# Arbete

1. Lista alla aktiva fixers/pass/regler.
2. Mappa varje fixer till:
   - triggerpunkt
   - fas
   - mekanisk eller LLM-driven
   - init, follow-up eller båda
   - påverkan på Fidelity 2
3. Markera varje rad som `keep`, `merge`, `remove`, `unknown`.
4. Notera vilka pass som bara finns pga äldre drift.

# Hårda regler

- denna plan får vara mest analys + små tombstones
- inga stora deletions innan matrisen finns

# Acceptans

- exakt fixer-count och trigger-count
- tydlig kandidatlista för vad som ska slås ihop i plan 05
- tydlig kandidatlista för vad som kan dö i plan 09

# Handoff

Skriv `STATUS-04-fixer-surface.md`.
