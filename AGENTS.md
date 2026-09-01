# Agent entry — Sajtmaskin

Använd **selektiv kontext**. Börja med uppgiften, nämnda sökvägar och minsta
relevanta owner; läs inte en fast dokumentstack.

## Router

| När | Läs |
|---|---|
| Okänd produktyta | `docs/README.md`, sedan högst relevant modell eller kodkarta |
| Byggblock/dossiers | `övrigt/FUSKLAPP-BYGGBLOCK.md` (koden vinner) |
| Kodändring | närliggande kod, tester och matchande `.cursor/rules/*.mdc` |
| Terminologi/bugg | sök exakt term eller `SM-###`; läs inte hela glossaryn/kön |
| Env/DB | relevant del av `config/env-policy.json` eller `docs/ENV.md` |
| Skriv/PR/merge | `.agents/skills/pr-workflow/SKILL.md`, sedan `git.mdc` och `workflow.mdc`; läs `pr-merge.mdc` först efter skapad PR eller mergeuppdrag |

Snabb kodrouter: [`.cursor/rules/repo-router.mdc`](.cursor/rules/repo-router.mdc).
Cursor-konfiguration: [`.cursor/README.md`](.cursor/README.md). Codex:
[`.codex/README.md`](.codex/README.md).

## Canonical owner

Per faktatyp: körbar/deklarativ owner → konsument/validator → genererad
projektion → mental modell → historik. Git är arkivet; inga backupdocs. Policy:
[`docs/documentation-lifecycle.md`](docs/documentation-lifecycle.md).

## Arbetsregel

- Bevara andras arbete; håll diff och staging till uppgiftens filer och följdytor.
- Jobba i den öppna checkouten. Worktree och Scout/Builder/Steward bara när
  Jakob ber om det. Policy: `config/agent-workflow.json`.
- Kör `npm run hooks:install` vid färsk clone eller workflowändring; främmande
  hookkonflikt är ett stopp.
- Före push: `npm run verify:pr -- --plan` + riktat. CI äger fullprofil;
  lokal fullkörning är frivillig.
- Branch, commit, push, PR och merge kräver mandat enligt `git.mdc`; force-pusha
  aldrig master eller en delad remote-branch.
- Merga aldrig utan ett separat uttryckligt mergeuppdrag.
- Behåll worktreet tills PR:n är terminal och fjärrläget verifierat.
- Svara kort på svenska när användaren gör det; skilj bevis från antagande.
- Pausa vid dataförlust, security/cross-tenant, oklar owner eller stort scope.

Review: false-green, saknad verifiering och kontraktsbrott är fynd; smak och
hypotetiska nits är inte blockers.
