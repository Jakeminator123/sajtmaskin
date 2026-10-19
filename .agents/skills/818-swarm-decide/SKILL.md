---
name: 818-swarm-decide
description: Use for /818 or one structured go/no-go: three read-only angles, parent verification, one decision and a minimal reviewed change. Use /kedja for bugs.
---

# 818 — one question → three angles → one decision

The name is historical (eight agents). Since 2026-08-02 it is **three**: more
agents on one question produced correlated opinions, not independent ones. This
is for decisions; a bug has a runnable acceptance test and belongs in
[`kedja-fix-pipeline`](../kedja-fix-pipeline/SKILL.md).

## Pattern (orchestrator = main agent)

1. One-sentence problem statement from the user, or ask one clarifying line.
   Never guess the scope.
2. **Three** parallel `Task` calls: `explore`, `readonly: true`, `<sol>` per
   [`subagent-models.mdc`](../../../.cursor/rules/subagent-models.mdc), one fixed
   angle each (table below). No fourth.
3. Max 6 lines per answer, table or bullets, `%` or H/M/L. No prose.
4. **Parent verifies** every load-bearing claim with repo tools before deciding.
   Subagents miss existing guards and sometimes invent `fil:rad`.
5. Aggregate into one table + **one** recommended action.
6. **Promote before writing:** if the decision is clear and narrow, enter the
   canonical [`pr-workflow`](../pr-workflow/SKILL.md) before the first edit; it
   owns base, branch, verification, PR, mandate and cleanup. `/818` is never an
   alternate delivery path. Otherwise list the blockers and stop without edits.
7. Verify with `npm run verify:pr -- --plan` plus targeted checks.
8. One readonly `<sol>` agent reviews the **intent** of the change without
   rewriting code; two only for protected paths.

## The three angles

| # | Angle | What the agent answers |
|---|---|---|
| 1 | **Konsekvens** | What breaks — call sites, tests that lock today's behaviour, migrations |
| 2 | **Motståndaren** | The strongest case _against_, plus the cheapest alternative that avoids the change |
| 3 | **Kanon** | Who already owns the decision — glossary, manifest, policy, a backlog row, a finished plan |

Forward risk, counter-case and ownership do not overlap, so two agents agreeing
is a real signal.

## Prompt template

```text
READ-ONLY. Do not edit anything.

Question: {FRÅGA}
Relevant paths: {PATHS}
Your angle: {VINKEL} — answer ONLY from this angle.

Read the actual files. Cite fil:rad. If you cannot anchor a claim, drop it.
Max 6 lines, no preamble, no summary line.

Bedömning: <one sentence>
Bevis: <fil:rad + what you saw>
Säkerhet: <H/M/L or %>
Om du har fel: <the assumption that would break your answer>
```

Not for defects (`/kedja`), huge multi-area refactors (scoped plan) or
single-file typos (just fix them).
