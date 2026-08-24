# GitHub automation

| Fil                                                                                | Syfte                                                                                                                                                                             |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`workflows/ci.yml`](workflows/ci.yml)                                             | Push/PR mot `master`: build, typecheck, lint, tester, kontraktsvalidering, schema-drift, Backoffice och preview-host guards. Produktionsmigrationer körs bara på betrodda events. |
| [`workflows/db-blob-sync-check.yml`](workflows/db-blob-sync-check.yml)             | Read-only DB-/Blob-kontroll; PR-kod får inga produktionshemligheter.                                                                                                              |
| [`workflows/db-schema-parity.yml`](workflows/db-schema-parity.yml)                 | Daglig read-only-jämförelse av LEVANDE dev↔prod-schema (`npm run db:schema-parity`); push-vägen täcks av `db-schema-parity`-jobbet i ci.yml.                                      |
| [`workflows/merge-ready-freshness.yml`](workflows/merge-ready-freshness.yml)       | Betrodd default-branch-controller: head-bunden `review-window`, live sign-off och stale-label/base-invalidering.                                                                  |
| [`workflows/pr-ai-review.yml`](workflows/pr-ai-review.yml)                         | Betrodd, read-only AI-review som publicerar fynd på PR:n.                                                                                                                         |
| [`workflows/dependabot-safe-classify.yml`](workflows/dependabot-safe-classify.yml) | Betrodd desired-state-synk av låg-risk-labeln: skapar/uppdaterar, lägger till eller tar bort; mergar aldrig och kör ingen PR-head-kod.                                            |
| [`dependabot.yml`](dependabot.yml)                                                 | Veckovisa uppdateringar för npm och GitHub Actions.                                                                                                                               |

Workflow-filerna äger GitHub-körningen. Required checknamn, deras canonical
workflowkälla (`.github/workflows/ci.yml` + `pull_request`) och väntetider ägs
av `config/agent-workflow.json`;
`npm run workflow:contract` stoppar drift mellan policy, workflow, hook och
router. Lokalt körs `npm run verify:pr` före push.

Controllern binder varje core-check till senaste canonical WorkflowRun och
senaste serververifierade försök för respektive jobbnamn via jobbets
check-run-URL samt serverreturnerade Actions-steg; namn eller gemensam
Actions-app räcker inte. Steglösa custom checks är aldrig core-proveniens, och
ett custom reviewkvitto i en annan workflows suite kräver exakt jobb-/check-ID-
bindning för att klassas som jobb. För en fork-run utan PR-association krävs
exakt live head-repository och branch.

En vanlig agentmerge får inte ändra `.github/workflows/**`. Controllern
kontrollerar både nuvarande och tidigare filnamn och kräver då en separat,
ägargodkänd infrastruktur-bootstrap efter full verifiering. PR-head-workflows
är explicit read-only; skrivande automation måste köra betrodd
default-branch-kod och får inte innehålla en parallell mergeväg.
