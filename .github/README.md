# GitHub automation

| Fil                                                                                | Syfte                                                                                                                                                                             |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`workflows/ci.yml`](workflows/ci.yml)                                             | Push/PR mot `preview` och `master`: build, typecheck, lint, tester, kontrakt, schema-drift och Backoffice. Live DB-jobb granskas separat; PR-kod får inga produktionshemligheter. |
| [`workflows/db-blob-sync-check.yml`](workflows/db-blob-sync-check.yml)             | Read-only DB-/Blob-kontroll; PR-kod får inga produktionshemligheter.                                                                                                              |
| [`workflows/db-schema-parity.yml`](workflows/db-schema-parity.yml)                 | Daglig read-only-jämförelse av LEVANDE dev↔prod-schema (`npm run db:schema-parity`); push-vägen täcks av `db-schema-parity`-jobbet i ci.yml.                                      |
| [PR-granskning](../docs/runbooks/github-pr-review-automation.md)                    | Oberoende lokal review och befintliga externa botytor. Den separata automatiska API-review-workflowen är pensionerad. |
| [`workflows/dependabot-automerge.yml`](workflows/dependabot-automerge.yml)         | Betrodd default-branch-controller som innehållsvaliderar allowlistade npm-patchar och aktiverar GitHubs native auto-merge; PR-head-kod körs aldrig med skrivtoken.                 |
| [`dependabot.yml`](dependabot.yml)                                                 | Veckovisa uppdateringar för npm och GitHub Actions.                                                                                                                               |

Workflow-filerna äger GitHub-körningen. Canonical checknamn och deras
workflowkälla (`.github/workflows/ci.yml` + `pull_request`) ägs av
`config/agent-workflow.json`; GitHubs live rulesets äger mergekraven.
`npm run workflow:contract` stoppar drift mellan policy, workflow, hook och
router. Lokalt körs `npm run verify:pr -- --plan` och relevanta riktade
kontroller före push; CI publicerar tung profil eller ett explicit light-kvitto.

Required checks publiceras en gång per aktuell PR-head. Strict/up-to-date i
ruleset gör gamla basresultat ogiltiga. PR-head-workflows är explicit read-only;
skrivande automation måste köra betrodd default-branch-kod. Dependabot-
controllern får endast begära native auto-merge; GitHub väntar själv på ruleset.
Alla controller-skrivningar använder Actions-secreten
`DEPENDABOT_AUTOMERGE_TOKEN`. Dependabot utlöser den betrodda controllern via
`workflow_run` efter CI; mänskliga PR-events använder `pull_request_target`.
Det låter mergepushen starta ordinarie `push`-CI; PR-head exekveras aldrig med
token och inga hemligheter behöver exponeras för Dependabots PR-workflow.
