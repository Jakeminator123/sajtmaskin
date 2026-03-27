# Agent entry (Sajtmaskin)

Tunn pekare — canonical innehåll ligger under `docs/` och `.cursor/`.

- **Dokumentationsnav:** [`docs/README.md`](docs/README.md)
- **Snabb repokarta (rot, `data/` vs codegen-data):** [`docs/architecture/repo-tree.md`](docs/architecture/repo-tree.md)
- **Aktiv backlog:** [`docs/plans/active/PROJECT-STATE-AND-DIRECTION.md`](docs/plans/active/PROJECT-STATE-AND-DIRECTION.md)
- **Cursor (regler, workspace, `@terminology`):** [`.cursor/README.md`](.cursor/README.md)
- **Integrationspolicy (agenter):** [`.cursor/rules/integrations-policy.mdc`](.cursor/rules/integrations-policy.mdc) — kanon: `sajtmaskin.integration-manifest.json` och pre-generation contracts; sparsamma integrationsfrågor; standardval via `config/env-policy.json` och [`docs/ENV.md`](docs/ENV.md).
- **V0-mapp vs v0-SDK vs V0 Platform API:** [`.cursor/rules/terminology.mdc`](.cursor/rules/terminology.mdc) — `src/lib/v0/` är en katalog (kan innehålla egen logik); `v0-sdk` och V0 Platform API är **extern** leverantör; `/api/v0/` är ert HTTP-API versionsprefix.
