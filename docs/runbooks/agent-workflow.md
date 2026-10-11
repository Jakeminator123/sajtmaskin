# Agentarbete: preview först, produktion separat

Gemensam körordning för Codex och Cursor:
[PR-workflow](../../.agents/skills/pr-workflow/SKILL.md).
Maskinpolicy: [agent-workflow.json](../../config/agent-workflow.json).
Jobba i den öppna checkouten; worktrees och roller är uttryckliga tillval.

| Uppgift | Operativ owner |
| --- | --- |
| Riktade lokala kontroller utifrån ändrade filer | [workflow.mdc](../../.cursor/rules/workflow.mdc) och `verify:pr -- --plan` |
| Direktpush till preview, oberoende review, triage och SHA-bekräftelse | [Buggpass](buggpass.md) |
| PR-review, native checks och merge med mandat | [pr-merge.mdc](../../.cursor/rules/pr-merge.mdc) |
| Promote till produktion | [PR-workflow § 4b](../../.agents/skills/pr-workflow/SKILL.md#4b-promote-till-produktion) |
| Lokal isolerad arbetsyta och Windows-lås | [Git worktree](git-worktree.md) |

Direktpreview kräver Jakobs faktiska bekräftelse för aktuell SHA. Hans befintliga
adminundantag får användas för denna väg; det medger inte force/delete,
ändrade rulesets eller admin-merge av PR. Den lätta hooken kontrollerar
gransknings-/plankvitton, inte modellkörningar eller testsviter.

PR-vägen behåller oberoende review och GitHubs aktuella required checks.
Light betyder explicit klassificering, inte en utförd fullsvit. Bara den
allowlistade Dependabot-vägen använder native auto-merge. PR-head-kod får
inte skrivtoken eller produktionshemligheter.

Produktion kräver separat promote-PR, produktionsvarning och extra bekräftelse.
Preview/Development delar DEV; Production använder PROD enligt
[DB-targets](../../config/db-targets.json). Merge, CI och deploy applicerar
inte DB-schema. [DB-apply](db-migrations.md) kräver eget mandat.
