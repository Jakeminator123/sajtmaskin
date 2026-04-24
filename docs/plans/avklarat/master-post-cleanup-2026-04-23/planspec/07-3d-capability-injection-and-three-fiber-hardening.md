---
id: master-post-cleanup-07
title: Plan 07 — gör 3D-capability till förstaklassig path i init och follow-up
status: proposed
created: 2026-04-23
priority: high
blocked_by: [00, 01, 03, 06]
estimated_effort: 6–10 h
mode: scenario-driven
---

# Mål

Få 3D/rich-visual-scenarier att fungera igen på riktigt, särskilt i follow-up, utan att systemet tappar basversionen eller missar paket/injection.

# Konkreta scenario

"Jag vill att du skapar en 3D-figur på en pizza som svävar över förstasidan"

ska kunna ge:
- korrekt capability-detektion
- 3D-dossier eller motsvarande capability-pack
- dependency-plan för relevanta paket
- genererad scen-/komponentfil
- korrekt mount i sida/route
- preview som når minst Fidelity 2

# Arbete

1. Inför explicit capability-refresh för 3D i follow-up när signalen är stark.
2. Gör dossier/capability-injection synlig i logg.
3. Säkerställ dependency-path för three-fiber eller motsvarande.
4. Lägg smoke för canvas/webgl-mount.
5. Städa stub/fallback-beteenden som förstör riktig komponentkod.

# Hårda regler

- bygg inte ett specialsystem bara för pizza-fallet
- gör 3D till vanlig capability, inte hemlig sidomagi

# Acceptans

- minst ett 3D-scenario når Fidelity 2
- follow-up tappar inte basversionen
- dependency/import-problem fångas tidigt eller löses deterministiskt

# Handoff

Skriv `STATUS-07-3d-capability.md`.
