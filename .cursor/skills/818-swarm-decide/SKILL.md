---
name: 818-swarm-decide
description: >-
  Runs eight parallel read-only Composer subagents on one decision topic, aggregates short reports with %-style confidence where useful, lets the parent agent implement minimally, then runs a short review pass. Use when the user runs /818, says "818", "åtta agenter", "svärm innan beslut", or wants consensus before a risky git/code change in Sajtmaskin.
---

# 818 swarm → decide → fix → review

## Trigger

- User invokes **`/818`** or mentions **818**, **åtta agenter**, **svärm**, **konsensus innan ändring**.
- Optional **`@` paths or pasted question** define the single topic.

## Pattern (orchestrator = main agent)

1. **One-sentence problem statement** from user (or ask one clarifying line).
2. **Eight** parallel `Task` calls: `explore`, `readonly: true`, `model: composer-2` or `composer-2-fast`.
3. **Eight distinct angles** — assign explicitly in each prompt, e.g.:
   - runtime / correctness risk
   - alignment with `docs/architecture/glossary.md` and terminology
   - regression / test gap
   - security or data-loss (e.g. git branch delete)
   - duplication vs canonical owner (signal ownership)
   - UX/builder impact if relevant
   - “what did we miss?”
   - conservative vs aggressive recommendation
4. Require **short** output: bullets or small table, **% or H/M/L** where it fits; **no** long prose.
5. **Parent verifies** uncertain facts with repo tools (code is source of truth). Subagents may not see `.git`.
6. **Aggregate** one table + **one** recommended action.
7. **Implement** only if clear and narrow; else list blockers.
8. **Verify**: `npm run typecheck`, targeted `vitest`, `ReadLints` on touched files.
9. **Review pass**: 1–2 (or up to 4 for sensitive changes) readonly agents review **intent of the change**, not rewrite code.

## When NOT to use

- Huge multi-area refactors → `/långbänk` or scoped plan.
- User only wants a single-file typo fix → skip swarm.

## Related

- Command file: `.cursor/commands/818.md`
- Heavy parallel audits with model matrix: `/långbänk`
