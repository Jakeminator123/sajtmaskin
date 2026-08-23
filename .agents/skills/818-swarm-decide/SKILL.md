---
name: 818-swarm-decide
description: Use for /818 or one structured go/no-go: three read-only angles, parent verification, one decision and a minimal reviewed change. Use /kedja for bugs.
---

# 818 — one question → three angles → one decision

The name is historical: `818` meant eight agents. Since 2026-08-02 it is **three**. Eight cheap agents on one question produced correlated opinions, not independent ones — the same code read through slightly different framings, which reads as consensus and is not. The value is the ritual: verify, decide once, change little. The trigger stays `/818` so muscle memory keeps working.

**This is for decisions, not bugs.** A bug has a runnable acceptance criterion, so it belongs in [`kedja-fix-pipeline`](../kedja-fix-pipeline/SKILL.md) where a failing test is the judge. A decision has no such judge, which is exactly why the parent must verify the facts itself.

## Pattern (orchestrator = main agent)

1. **One-sentence problem statement** from the user, or ask one clarifying line. Never guess the scope.
2. **Three** parallel `Task` calls: `explore`, `readonly: true`, `model: <luna>` (resolve the current Luna slug via [`subagent-models.mdc`](../../../.cursor/rules/subagent-models.mdc)).
3. **Three fixed angles**, one per agent — see the table below. Do not add a fourth.
4. Require **short** output: max 6 lines, table or bullets, `%` or H/M/L where it fits. No prose.
5. **Parent verifies** every load-bearing claim with repo tools before deciding. Code is source of truth; subagents may not see `.git`, may miss an existing guard, and sometimes invent `fil:rad`.
6. **Aggregate** into one table + **one** recommended action.
7. **Implement** only if the decision is clear and narrow; otherwise list the blockers and stop.
8. **Verify**: `npm run typecheck`, targeted `vitest`, `ReadLints` on touched files.
9. **Review pass**: one readonly `<terra>` agent reviews the **intent of the change** without rewriting code. Two agents only for protected paths.

## The three angles

| #   | Angle            | What the agent answers                                                                                     |
| --- | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | **Konsekvens**   | What breaks if we do it — call sites, existing tests that lock today's behaviour, migrations               |
| 2   | **Motståndaren** | The strongest case _against_, plus the cheapest alternative that avoids the change entirely                |
| 3   | **Kanon**        | Who already owns this decision — glossary, manifest, policy, a `BUG-SWARM-BACKLOG.md` row, a finished plan |

Chosen so they do not overlap: forward risk, counter-case, ownership. Two agents agreeing is only a signal when they were looking at different things.

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

## When NOT to use

- Fixing a defect → `/kedja` (it has a real judge).
- Huge multi-area refactor → a scoped plan, not a swarm.
- A single-file typo → just fix it.

## Related

- Command: [`.cursor/commands/818.md`](../../../.cursor/commands/818.md)
- Fix counterpart: [`kedja-fix-pipeline`](../kedja-fix-pipeline/SKILL.md)
- Broad audit counterpart: [`automat-swarm`](../automat-swarm/SKILL.md)
