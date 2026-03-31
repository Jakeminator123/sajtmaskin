# Agent entry (Sajtmaskin)

Tunn pekare — canonical innehåll ligger under `docs/` och `.cursor/`.

- **Dokumentationsnav:** [`docs/README.md`](docs/README.md)
- **Snabb repokarta (rot, `data/` vs codegen-data):** [`docs/architecture/repo-tree.md`](docs/architecture/repo-tree.md)
- **Aktiv backlog:** [`docs/plans/active/PROJECT-STATE-AND-DIRECTION.md`](docs/plans/active/PROJECT-STATE-AND-DIRECTION.md)
- **Storstäd + agent-handoff:** [`docs/plans/active/STORDSTAD-repo-kod-databas.md`](docs/plans/active/STORDSTAD-repo-kod-databas.md) (pass-logg, skyddade sökvägar, kopieringsbar startrad). Nuvarande gemensam linje är `master` i huvudcheckouten; planen listar också förväntade edit-zoner framåt (`docs/plans/active/`, `AGENTS.md`, `.cursor/README.md`, `src/lib/hooks/chat/`, smala `src/lib/`-pass kring `env*`/`config.ts`) och vad som fortsatt ska undvikas utan separat scope.
- **Flera agenter / parallellt:** [`docs/contributing/agent-workflows.md`](docs/contributing/agent-workflows.md) § *Flera agenter* — spår A vs B, **konfliktzoner** (stäm av före spår A rör `gen`, `own-engine`, `hooks/chat`, `env.ts`, `config.ts`, vissa `docs/architecture/*` samtidigt som B).
- **Preview-term att hålla fast vid:** publika API/SSE-svar använder `previewUrl`; `demoUrl` är legacy/intern naming debt i vissa inbound-/DB-/typlager och ska inte återintroduceras som nytt publikt namn utan uttrycklig migreringsscope.
- **Cursor (regler, workspace, `@terminology`):** [`.cursor/README.md`](.cursor/README.md)
- **Env och integrationer:** utgå från `config/env-policy.json`, [`docs/ENV.md`](docs/ENV.md) och `sajtmaskin.integration-manifest.json` om den finns; hitta inte på nya provider- eller integrationsnamn.
- **«v0» — tre betydelser:** [`.cursor/rules/terminology.mdc`](.cursor/rules/terminology.mdc) — (1) API-versionering `/api/v0/`, (2) naming debt i symboler/fält, (3) template-källa. `v0-sdk` och `src/lib/v0/` är borttagna.
- **Own-engine äger genereringen:** Primär väg är stream → finalize (autofix, preflight) → `files_json` → sandbox (Fidelity 2). Se [`docs/architecture/preview-deploy.md`](docs/architecture/preview-deploy.md) (avsnitt *End-to-end*).
