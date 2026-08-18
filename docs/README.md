# Dokumentation

`docs/` beskriver stabila kontrakt, ansvar, policies och mentala modeller.
Canonical owner avgörs per faktatyp; runtimekod, manifest, registries och
policies kan äga olika beslut.

## Börja här

| Fråga                                     | Dokument                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------ |
| Vilken produktvision styr arbetet?        | [`övergripande-vision-och-mål.md`](övergripande-vision-och-mål.md)                   |
| Vad är huvudflödet?                       | [`architecture/system-overview.md`](architecture/system-overview.md)                 |
| Hur hänger begreppen ihop?                | [`concepts/mental-model.md`](concepts/mental-model.md)                               |
| Byggblock/dossiers på en sida             | [`../FUSKLAPP-BYGGBLOCK.md`](../FUSKLAPP-BYGGBLOCK.md)                               |
| Var bor koden?                            | [`architecture/code-map.md`](architecture/code-map.md)                               |
| Hur fungerar init och follow-up?          | [`concepts/init-and-follow-up.md`](concepts/init-and-follow-up.md)                   |
| Hur skiljer sig designläge och integrationsbygge? | [`concepts/f2-and-f3.md`](concepts/f2-and-f3.md)                               |
| Vilka invariants gäller?                  | [`architecture/runtime-contracts.md`](architecture/runtime-contracts.md)             |
| Hur körs generationen?                    | [`architecture/llm-pipeline.md`](architecture/llm-pipeline.md)                       |
| Hur räknas och debiteras AI-kostnaden?    | [`architecture/llm-pipeline.md`](architecture/llm-pipeline.md#generationskostnad-och-credit-debitering) |
| När körs RenderGate/ReleaseGate?          | [`architecture/quality-gate-flow.md`](architecture/quality-gate-flow.md)             |
| Vilka builder-URL-fält gäller?            | [`schemas/builder-entry-contract.md`](schemas/builder-entry-contract.md)             |
| Vilket schema gäller?                     | [`schemas/README.md`](schemas/README.md)                                             |
| Vilka kontraktsindex genereras?           | [`generated/README.md`](generated/README.md)                                         |
| Hur felsöker jag preview?                 | [`runbooks/preview-white-screen.md`](runbooks/preview-white-screen.md)               |
| Hur felsöker jag integrationer?           | [`runbooks/generated-site-integrations.md`](runbooks/generated-site-integrations.md) |
| Varför strejkar lokal generation?         | [`runbooks/local-dev-generation.md`](runbooks/local-dev-generation.md)               |
| Kör jag i en Cursor Cloud-pod?            | [`runbooks/cursor-cloud-agent.md`](runbooks/cursor-cloud-agent.md)                   |
| Hur jobbar flera agenter samtidigt?       | [`runbooks/git-worktree.md`](runbooks/git-worktree.md)                               |
| Hur provisionerar jag warm-cachen?        | [`runbooks/warm-cache-setup.md`](runbooks/warm-cache-setup.md)                       |
| Varför ser merge-grinden ut så?           | [`runbooks/pr-merge-gate.md`](runbooks/pr-merge-gate.md)                             |
| Hur körs automatisk PR-granskning?        | [`runbooks/github-pr-review-automation.md`](runbooks/github-pr-review-automation.md) |
| Hur hanteras dependency-uppdateringar?    | [`dependency-policy.md`](dependency-policy.md)                                       |
| Vad applicerar DB-migrationerna?          | [`runbooks/db-migrations.md`](runbooks/db-migrations.md)                             |
| Hur aktiveras varumärkta användar-URL:er? | [`runbooks/branded-user-urls.md`](runbooks/branded-user-urls.md)                     |
| Var hamnar appens console-loggar?         | [`runbooks/vercel-log-drain.md`](runbooks/vercel-log-drain.md)                       |
| Vilka manuella underhållsknappar?         | [`../UNDERHALL.md`](../UNDERHALL.md)                                                 |
| Vilka planer är aktiva?                   | [`plans/README.md`](plans/README.md)                                                 |
| Vad har ägaren beslutat?                  | [`decisions/README.md`](decisions/README.md)                                         |

Full terminologi finns tills vidare i
[`architecture/glossary.md`](architecture/glossary.md). Regler för
dokumentationslivscykeln finns i
[`documentation-lifecycle.md`](documentation-lifecycle.md).

## Canonical owners

Ownerhierarki, dokumentnivåer och regler för genererade projektioner ägs av
[`documentation-lifecycle.md`](documentation-lifecycle.md). Genererade
kontraktsindex routeras via [`generated/README.md`](generated/README.md).
