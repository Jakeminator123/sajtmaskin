---
id: master-post-cleanup-12
title: Plan 12 — ett kanoniskt PromptKit när resten redan är städat
status: proposed
created: 2026-04-23
priority: medium
blocked_by: [06, 11]
estimated_effort: 3–5 dagar
mode: architecture-pass
---

# Mål

Avsluta serien med en gemensam promptkompositor för brief, codegen, verifiering och repair.

# Arbete

1. Skapa neutral modul för promptbyggande.
2. Mappa de stora LLM-anropsplatserna till samma mekanism.
3. Lägg in dumps/asserts där de faktiskt hjälper debug och jämförelse.
4. Se till att init och follow-up fortfarande får olika kontrakt trots gemensam grundmekanism.

# Hårda regler

- kör inte denna plan om tidigare planer fortfarande rör sig mycket
- PromptKit ska förenkla, inte gömma fler lager

# Acceptans

- färre olika sätt att bygga promptar
- lättare att förstå vad som är statisk kärna och vad som är dynamisk kontext

# Handoff

Skriv `STATUS-12-prompt-kit.md`.
