---
paths:
  - "src/lib/api/engine/chats/**"
  - "src/lib/providers/own-engine/**"
  - "src/lib/gen/preview/**"
  - "src/lib/gen/detect-integrations.ts"
  - "src/lib/gen/agent-tools.ts"
  - "src/lib/gen/dossiers/f2-mute.ts"
  - "src/lib/gen/system-prompt/sections/session-contracts.ts"
  - "src/app/api/engine/chats/*/readiness/**"
  - "src/app/api/engine/chats/*/finalize-design/**"
  - "src/app/api/v0/projects/*/env-vars/**"
  - "src/app/builder/BuilderShellContent.tsx"
  - "src/components/builder/readiness/F3RequirementsSurface.tsx"
  - "src/components/builder/preview-panel/**"
---

<!-- Genererad av npm run claude:sync från .cursor/rules/env-flow-f2-mute.mdc — redigera källan, inte den här filen. -->

# Design, integrationer och nycklar

Kod äger beteendet; [env-flödet](../../docs/contracts/env-flow.md) kartlägger
owners. F2/F3 i filnamn och kod är alias för `design`/`integrations`.

- Design bygger en demo. Mutade capabilities får varken integrationskod
  eller env-tool-events och uppskjutna funktioner ska visas som planerade.
- Integrationsbygge kräver ett explicit användarval; promptord får inte
  automatiskt byta lifecycle stage.
- Byggblock är enda env-editorn i båda lägena. Chatten frågar aldrig efter
  nycklar. API:t returnerar konfigurationsstatus, aldrig sparade secretvärden.
- Readiness och deploy använder samma lifecycle-bundna resolver:
  `buildBlockingKeys` i integrationsläge, `designDeployBlockingKeys` i design.
  Saknade feature-runtime-nycklar är advisory; demo ska förbli publicerbar.
- Vid finalize-design 412 äger `missingByIntegration` listan över saknade
  nycklar. `F3RequirementsSurface` öppnar rätt dossier i Byggblock och har
  ingen egen env-editor.
