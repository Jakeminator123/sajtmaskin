---
id: master-post-cleanup-09
title: Plan 09 — riv ut legacy och trimma config-ytan
status: proposed
created: 2026-04-23
priority: medium
blocked_by: [04, 05, 06, 08]
estimated_effort: 4–8 h
mode: cleanup
---

# Mål

Minska repo:ts mentala vikt genom att ta bort döda rester, gamla flaggor och dubbla namn som fortfarande skapar tvekan.

# Arbete

1. Ta kandidatlistan från plan 04 och plan 06.
2. Ta bort eller tombstone-markera:
   - döda env-flaggor
   - gamla aliasnamn
   - oanvända configspår
   - docs som fortfarande beskriver bortplockad verklighet
3. Behåll historiskt material bara där det faktiskt behövs som arkiv.

# Hårda regler

- rör inte fungerande rollout- eller preview-host-kod bara för att den ser stökig ut
- varje borttagning ska ha en enkel motivering

# Acceptans

- färre saker att tvivla på i repo:t
- färre historiska namn som konkurrerar med nuvarande sanning
- docs och kod pekar oftare åt samma håll

# Handoff

Skriv `STATUS-09-legacy-pruning.md`.
