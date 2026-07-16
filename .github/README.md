# GitHub automation

| Fil                                                                    | Syfte                                                                                                                                                                      |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`workflows/ci.yml`](workflows/ci.yml)                                 | Push/PR mot `master`: typecheck, lint, tester, kontraktsvalidering, schema-drift, backoffice och preview-host guards. Produktionsmigrationer körs bara på betrodda events. |
| [`workflows/db-blob-sync-check.yml`](workflows/db-blob-sync-check.yml) | Read-only DB-/Blob-kontroll; PR-kod får inga produktionshemligheter.                                                                                                       |
| [`workflows/review-window.yml`](workflows/review-window.yml)           | Minsta granskningsfönster och väntan på externa botar.                                                                                                                     |
| [`dependabot.yml`](dependabot.yml)                                     | Veckovisa uppdateringar för npm och GitHub Actions.                                                                                                                        |

`npm run build` körs av Vercel och lokalt, inte av huvudjobbet i GitHub Actions.
Workflow-filerna är canonical owners för det faktiska GitHub CI-beteendet.
