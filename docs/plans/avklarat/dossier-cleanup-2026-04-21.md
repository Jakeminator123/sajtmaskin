---
id: dossier-cleanup-2026-04-21
title: Dossier v2 — driftfix och schemahärdning
status: avklarad
created: 2026-04-21
closed: 2026-04-21
priority: medium
---

# Dossier v2 — driftfix och schemahärdning

Status: avklarad. Detta är beslutshistorik, inte runtime-vägledning.

## Resultat

- Runtime läser dossiers från `data/dossiers/{hard,soft}/`.
- `src/lib/gen/dossiers/registry.ts` validerar varje manifest genom
  `validateDossierManifest`.
- Validatorn kompilerar `docs/schemas/strict/dossier.schema.json` med AJV.
- Runtime och curation använder strict AJV-validering. Backoffice har lokala
  UX-kontroller och strict-schema-gates i promotionsflöden; runtime-validatorn
  är fortsatt auktoritet.
- Legacy external-pipeline-dokumentation och tillfälliga cloudagent-handoffer är
  borttagna.

## Canonical ersättare

- Runtime registry: `src/lib/gen/dossiers/registry.ts`
- Manifestvalidator: `src/lib/gen/dossiers/validate-manifest.ts`
- Strict schema: `docs/schemas/strict/dossier.schema.json`
- Mänskligt kontrakt: `docs/contracts/dossier-system.md`
- Curation: `scripts/dossiers/`

Den ursprungliga arbetsplanen, detaljtabellerna och agentprompterna finns i
git-historiken för denna fil.
