# Agent entry — Sajtmaskin

Börja med uppgiften och relevant owner, inte en dokumentstack. Kod/manifest/policy
äger beteende, genererade docs är projektioner och Git är arkivet
([livscykel](docs/documentation-lifecycle.md)).

## Router

| Uppgift | Börja här |
|---|---|
| Okänd yta | `docs/README.md` → en kodkarta → runtime-owner |
| LLM/generation | `src/lib/gen/`, `docs/architecture/llm-pipeline.md` |
| Preview/VM | `preview-host/`, `src/lib/gen/preview/` |
| Builder/chat | `src/app/builder/`, `src/components/builder/` |
| Deploy | `src/lib/deploy/` |
| Env/DB | exakt nyckel i `config/env-policy.json`/`docs/ENV.md`; `src/lib/db/` |
| Scaffolds | `src/lib/gen/scaffolds/`, `config/scaffold-variants/` |
| Dossiers | `src/lib/gen/dossiers/`, `data/dossiers/{hard,soft}/`, `docs/llm/dossier-cheatsheet.md` |
| Eval | `src/lib/gen/eval/`; kör bara `npm run eval` |
| Backoffice | `sajtmaskin_backoffice.py`, `backoffice/` |
| Term/bugg | exakt term i `docs/architecture/glossary.md`, exakt `SM-###` i `BUG-SWARM-BACKLOG.md` |
| Skriv/PR/merge | `.agents/skills/pr-workflow/SKILL.md`; `pr-merge.mdc` först efter PR eller mergeuppdrag |

Kodändring: närliggande kod, tester och matchande `.cursor/rules/*.mdc`.
`templates_v0`/`v0` kan vara legacy eller API-versionering; verifiera mot kod.
Verktyg: [Cursor](.cursor/README.md), [Codex](.codex/README.md), [Claude](.claude/README.md).

## Arbetsregel

- Ny chatt: `npm run handoff:list`. Finns handoff, följ [val/läsning/kvittens](docs/runbooks/agent-handoff.md); annars fortsätt.
- `npm run inbox` rensar/skriver. Read-only: läs inkorgen.
- `npm run hooks:install` vid ny clone/hookändring; främmande hookkonflikt stoppar.
- Jobba i den öppna checkouten och bevara andras arbete. Git-mandat, förbud och
  worktree: `git.mdc`. Ändringsflöde: `workflow.mdc`.
- Före push: `npm run verify:pr -- --plan` + riktade kontroller; full regression
  ägs av CI.
- Pausa vid dataförlust, security/cross-tenant, oklar owner eller stort scope.
- Svara kort på svenska; skilj bevis från antagande.

Review: false-green, saknad verifiering och kontraktsbrott är fynd; smak och
hypotetiska nits är inte blockers.
