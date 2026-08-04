---
name: kedja-fix-pipeline
description: >-
  Staged bug-fix pipeline for Sajtmaskin. A cheap orchestrator drives seven steps — frame, workspace, repro, localize, decide, fix, judge, review — where a failing test written in step 2 is what lets cheap agents be judged mechanically instead of by opinion. Write steps run in dedicated git worktrees, never in the main checkout, and nothing is committed. Use when the user runs /kedja, says "kedja", or asks to drive one specific bug through a staged multi-agent fix flow. Fix mode — the opposite of /automat, which is audit only.
---

# Kedja — staged bug fix

The orchestrator is the cheap model in the user's chat. Subagents are cheap too; none of them are trusted. What makes the flow work is that **step 2 produces a red test**, so step 6 is a measurement rather than a judgement call.

Full step list, arguments and stop conditions: [`.cursor/commands/kedja.md`](../../commands/kedja.md). This file holds the recipes and prompts.

## Hard rules

1. **No writes in the main checkout.** Every write step runs inside a worktree created in step 1. No `git checkout`/`switch` in the main checkout (`agent-worktree.mdc`).
2. **No git mutation.** No commit, push, rebase or PR — not even in the worktree. The result is handed over as an uncommitted diff (`git.mdc`).
3. **One bug.** Adjacent findings go to `/buggrapport`, not into the diff (`mvp-scope-freeze.mdc`).
4. **Models from the canonical table** in [`.cursor/README.md § Modellval för subagenter`](../../README.md#modellval-för-subagenter-kanonisk-tabell): `composer-2.5-fast` for the read-only localisation scan, `cursor-grok-4.5-high` for the repro and fix agents (they write code), `bugbot` subagent for step 7.
5. **Never remove a worktree with raw git.** `npm run worktree:remove -- <path> [--force]` only — `git worktree remove --force` follows the `node_modules` junction and empties the main checkout's copy.
6. **One retry, then stop.** Two red judging rounds means the bug is too big for the chain; report that instead of looping.

## Worktree recipe

`worktree:link` refuses a path that git does not already know, so the order is fixed:

```powershell
git worktree add ..\sajtmaskin-kedja-<slug>-a -b kedja/<slug>-a
npm run worktree:link -- ..\sajtmaskin-kedja-<slug>-a
```

- `<slug>` = 2–4 words, kebab-case, transliterated (å→a, ä→a, ö→o).
- One suffix per candidate: `-a`, `-b`, `-c`.
- Run subagents with `working_directory` set to the worktree's absolute path, and say the path in the prompt too — an agent that guesses will land in the main checkout.
- Teardown after the diffs are saved: `npm run worktree:remove -- ..\sajtmaskin-kedja-<slug>-b --force`.

## Prompt templates

### Step 2 — repro agent (1 agent, writes, `cursor-grok-4.5-high`)

```text
Work ONLY inside: {WORKTREE_PATH}. Never touch any other checkout.

Bug: {BUGG}
Anchor: {ANKARE}
Owner file(s) named by the backlog row: {AGARE}

Write TWO things. Do NOT change any production code.

1. ONE failing test that captures exactly this bug and nothing else.
2. AT LEAST ONE counter-test that passes NOW and must keep passing after the
   fix. Pick the closest legitimate case to the buggy one — if the bug is
   "X fires when it should not", the counter-test is the case where X still
   MUST fire. Without it, "disable X entirely" is a valid way to go green.

Prefer extending the existing test file next to the owner if there is one —
match its imports, naming and style.

The failing test must fail for the reason in the bug description, not because
of a typo, a missing import or a bad assertion. Run both yourself.

Return exactly:
Testfil: <path>
Kommando: npx vitest run <path>
Rött: <the actual failing assertion, 1-3 lines, verbatim>
Motprov: <name of the counter-test> — grönt
Motivering: <one sentence on why the red failure IS the bug>
```

Then verify both yourself in that worktree. A green "red" test is a stop
condition, not a nuisance.

### Step 3 — localisation agents (3 parallel, `readonly: true`, `composer-2.5-fast`)

Same bug and same test output for all three; only the angle differs.

| # | Angle |
|---|---|
| 1 | The code path — read the owner file and follow the values that reach the failing assertion |
| 2 | The call sites — who calls this, with what, and which caller would change behaviour if the owner changed |
| 3 | The test and its neighbours — what existing tests lock in today's behaviour, and which one must be rewritten alongside the fix |

```text
READ-ONLY. Do not edit anything.

Bug: {BUGG}
Failing test output:
{UTFALL}
Your angle: {VINKEL}

Read the actual files. Code is source of truth. Cite fil:rad.
Max 5 lines, no preamble.

Rotorsak: <one sentence + fil:rad>
Bevis: <what in the code makes you say that>
Emot: <the strongest reason you could be wrong, or "-">
Låst av test: <existing test that encodes today's behaviour, or "-">
```

### Step 5 — fix agents (N parallel, write, `cursor-grok-4.5-high`)

Every candidate gets the **same** root cause and a **different, named** approach. Leaving the approach open produces N identical diffs — same diagnosis, same test, same model, so they converge. If you cannot name two genuinely different approaches, run one candidate.

```text
Work ONLY inside: {WORKTREE_PATH}. Never touch any other checkout.

Bug: {BUGG}
Root cause (already decided — do not re-diagnose): {ROTORSAK}
Your assigned approach (do not substitute another): {ANSATS}
Make BOTH green: npx vitest run {TESTFIL}
  - the failing test {ROTT_TEST} must pass
  - the counter-test {MOTPROV} must STILL pass — a fix that breaks it is wrong
    even if the bug goes away
You may change: {AGARE} and the test file. Nothing else.

Keep the diff minimal. Do not refactor, do not rename, do not fix anything
adjacent you happen to notice, do not add comments explaining the fix.
If an existing test encodes the old behaviour, rewrite that test in the same
change and say so.

Run the command yourself before returning. Do NOT commit.

Return exactly:
Ansats: <one sentence>
Filer: <changed paths>
Testutfall: <pass/fail + last line of output>
Risk: <the caller most likely to be affected, or "-">
```

### Step 7 — review

`subagent_type: "bugbot"`, `readonly: true`, `description: "Bugbot"`, prompt form per `AGENTS.md § Review guidelines`:

```text
Full Repository Path: {WINNER_WORKTREE_PATH}
Diff: uncommitted changes
```

## Judging order

Cheapest signal first, so a broken candidate is eliminated before it costs a typecheck.

| # | Check | Applies to |
|---|---|---|
| 1 | `npx vitest run <testfil>` — red test **and** counter-test | every candidate |
| 2 | Remaining tests in the owner's directory | candidates that passed 1 |
| 3 | `npm run typecheck` | candidates that passed 2 |
| 4 | `node scripts/dev/check-unicode-regex.mjs` | only if the diff touches regex |

Winner = the **smallest** diff that clears every applicable check. Compare with `git diff --stat` in each worktree; do not pick on elegance.

Two candidates that differ only in formatting or variable extraction are **one** answer, not two. Say so in the report — it means step 5 gave no spread and the winner was effectively unopposed.

### The failure this ordering exists to catch

First run, 2026-08-02: the bug was a guard that fired on prompts it should ignore. Both candidates fixed it by making the veto absolute, which also suppressed every legitimate case — a plain "lägg till kortbetalning och byt färg på knappen" stopped being detected at all. Every check passed: the red test went green, 157 existing tests stayed green, bugbot found nothing. Nothing measured the opposite direction, so nothing could catch it.

The lesson generalises: when the fix direction is "make X stop happening", the cheapest wrong answer is always "make X never happen". Only a counter-test distinguishes them.

## Report format

```markdown
| Steg | Utfall |
|---|---|
| Acceptans | `npx vitest run …` — rött före, grönt efter |
| Rotorsak | <one sentence + fil:rad> |
| Kandidat a | grön · 12 rader · vinnare |
| Kandidat b | röd i steg 2 av domen (bröt <test>) |
| Bugbot | <findings, or "inga fynd"> |
| Ligger i | `..\sajtmaskin-kedja-<slug>-a` på `kedja/<slug>-a`, ocommittad |
```

Say explicitly that nothing was committed and that the backlog row is untouched.

## Related

- Command: [`.cursor/commands/kedja.md`](../../commands/kedja.md)
- Output folder: [`.cursor/kedja/README.md`](../../kedja/README.md)
- Audit counterpart (never fixes): [`automat-swarm`](../automat-swarm/SKILL.md)
- Promote or log a finding found on the way: `/buggrapport`
