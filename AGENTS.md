# Agent entry — Sajtmaskin

Använd **selektiv kontext**. Läs inte en fast dokumentstack före varje uppgift;
börja med uppgiften, sökvägarna den nämner och den minsta ägare som behövs.

## Router

| När | Läs |
|---|---|
| Okänd produktyta | `docs/README.md`, därefter högst relevant mental modell eller kodkarta |
| Kodändring | närliggande kod, tester och relevant `.cursor/rules/*.mdc` |
| Terminologi | riktad sökning i `docs/architecture/glossary.md`; läs inte hela filen |
| Env/DB | `config/env-policy.json` eller `docs/ENV.md`, bara relevant sektion |
| Buggkö | sök på exakt `SM-###`/rubrik i `BUG-SWARM-BACKLOG.md`; läs inte hela filen |
| PR/merge | `git.mdc`, `workflow.mdc`; `pr-merge.mdc` först efter skapad PR eller mergeuppdrag |
| Branch → PR → master | `docs/runbooks/agent-pr-workflow.md`; kör alltid `npm run change-impact` och `npm run verify:pr` |

Snabb kodrouter: [`.cursor/rules/repo-router.mdc`](.cursor/rules/repo-router.mdc).
Cursor-konfiguration: [`.cursor/README.md`](.cursor/README.md). Codex:
[`.codex/README.md`](.codex/README.md).

## Canonical owner

Avgör ägare per faktatyp: körbar kod/manifest/policy → validator/schema →
genererad projektion → handskriven mental modell → historik. Git är arkivet;
skapa inte backupkopior av aktiva docs. Full policy:
[`docs/documentation-lifecycle.md`](docs/documentation-lifecycle.md).

## Arbetsregel

- Bevara användarens och andra agenters ändringar; stage bara uppgiftens filer.
- Håll diffen smal och uppdatera beroende länkar/docs i samma ändring.
- Branch, commit, push, PR och merge kräver användarens mandat enligt `git.mdc`.
- Merga aldrig utan ett separat uttryckligt mergeuppdrag.
- Kör `npm run verify:pr -- --base origin/master`; impactmotorn väljer minsta relevanta kontroller.
- Svara kort på svenska när användaren gör det; skilj bevis från antagande.
- Pausa vid dataförlust, security/cross-tenant, oklar owner eller stort scope.

Review: false-green, saknad verifiering och kontraktsbrott är riktiga fynd.
Smak, formattering och hypotetiska nits är inte blockers.
