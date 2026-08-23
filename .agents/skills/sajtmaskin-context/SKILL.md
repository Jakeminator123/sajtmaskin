---
name: sajtmaskin-context
description: Route Sajtmaskin builder, preview, own-engine, scaffold, template, deploy and terminology tasks to the smallest canonical owner.
---

# Sajtmaskin context

## Börja selektivt

1. Läs uppgiftens filer och `repo-router.mdc`.
2. Vid okänd semantik: relevant del av `docs/concepts/mental-model.md`.
3. Vid okänd term: sök exakt rad i `docs/architecture/glossary.md`.
4. Läs kod/manifest/policy som faktiskt äger beteendet.

Läs inte glossary, docs-nav, planer och kodkarta i sin helhet som obligatorisk
startstack.

## Vanliga förväxlingar

- Template/import, runtime-Scaffold och Dossier är olika system.
- `/api/v0/` kan vara API-versionering, inte extern v0-provider.
- VM/`preview_host` är iteration; deploy/publicering är en annan nivå.
- Prompt-assist, Briefing/Deep Brief och Orkestrering är olika lager.
- Kod/runtime vinner när en handskriven doc beskriver beteendet fel.

Vid pipelineändring: kontrollera berörda schema-, generated-doc- och
backofficekonsumenter, inte hela dokumentträdet.
