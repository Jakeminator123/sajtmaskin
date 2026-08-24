# GitHub automation

| Fil                                                                          | Syfte                                                                                                                                                                             |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`workflows/ci.yml`](workflows/ci.yml)                                       | Push/PR mot `master`: build, typecheck, lint, tester, kontraktsvalidering, schema-drift, Backoffice och preview-host guards. Produktionsmigrationer körs bara på betrodda events. |
| [`workflows/db-blob-sync-check.yml`](workflows/db-blob-sync-check.yml)       | Read-only DB-/Blob-kontroll; PR-kod får inga produktionshemligheter.                                                                                                              |
| [`workflows/db-schema-parity.yml`](workflows/db-schema-parity.yml)           | Daglig read-only-jämförelse av LEVANDE dev↔prod-schema (`npm run db:schema-parity`); push-vägen täcks av `db-schema-parity`-jobbet i ci.yml.                                      |
| [`workflows/review-window.yml`](workflows/review-window.yml)                 | Tillfällig fas-1-bootstrap för befintligt required checknamn; tas bort i direkt rollout-PR.                                                                                       |
| [`workflows/merge-ready-freshness.yml`](workflows/merge-ready-freshness.yml) | Betrodd default-branch-controller: head-bunden `review-window`, live sign-off och stale-label/base-invalidering.                                                                  |
| [`workflows/pr-ai-review.yml`](workflows/pr-ai-review.yml)                   | Betrodd, read-only AI-review som publicerar fynd på PR:n.                                                                                                                         |
| [`dependabot.yml`](dependabot.yml)                                           | Veckovisa uppdateringar för npm och GitHub Actions.                                                                                                                               |

Workflow-filerna äger GitHub-körningen. Required checknamn och väntetider ägs av
`config/agent-workflow.json`; `npm run workflow:contract` stoppar drift mellan
policy, workflow, hook och router. Lokalt körs `npm run verify:pr` före push.
