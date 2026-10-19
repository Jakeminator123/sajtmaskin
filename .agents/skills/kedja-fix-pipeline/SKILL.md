---
name: kedja-fix-pipeline
description: Use for /kedja or one staged multi-agent bug fix with failing-test acceptance, isolated worktrees, compared candidates and independent review. Not broad audit.
---

# Kedja — staged bug fix

No agent is trusted because the model is strong. The flow works because **step 2
produces a red test**, so judging is a measurement, not an opinion. Default: one
`<sol>` runner does steps 1–6 and the parent receives only the final table and
runs step 7, so intermediate reports stay out of the parent context. This skill
is the sole fulltext; the slash command is a stub. The winner's delivery always
follows [`pr-workflow`](../pr-workflow/SKILL.md); this skill owns only the
candidate and judging phase.

## Hard rules

1. **No writes in the main checkout.** Every write step runs in a worktree from
   step 1; no `git checkout`/`switch` in the main checkout.
2. **No candidate is pushed, rebased or opened as a PR during comparison.** The
   winner is committed on its `fix/kedja-<slug>-<x>` branch and enters
   `pr-workflow` only if push/PR is authorised; otherwise report the local
   winner. Losers stay uncommitted and are torn down after their diffs are saved.
3. **One bug.** Adjacent findings go to `/buggrapport`, not into the diff.
4. **Models** per [`subagent-models.mdc`](../../../.cursor/rules/subagent-models.mdc):
   `<luna>` only for mechanical read-only localisation; `<sol>` for repro, fixes,
   runner and review.
5. **Never remove a worktree with raw git.** Only
   `npm run worktree:remove -- <path> [--force]`; raw `git worktree remove`
   follows the `node_modules` junction and empties the main checkout's copy, and
   a hook denies it.
6. **One retry, then stop.** Two red judging rounds mean the bug is too big for
   the chain; report that instead of looping.

## Step 1 — worktrees

`<worktrees>` is `%USERPROFILE%\.cursor\worktrees\sajtmaskin`; keep the
`sajtmaskin-kedja-` prefix. `worktree:setup` refuses paths git does not know, so
the order is fixed:

```powershell
git fetch origin preview
git rev-parse origin/preview   # freeze this SHA; write it literally below
git worktree add <worktrees>\sajtmaskin-kedja-<slug>-a -b fix/kedja-<slug>-a <base-SHA>
npm run worktree:setup -- <worktrees>\sajtmaskin-kedja-<slug>-a
```

- **Base:** always the frozen `origin/preview` SHA (`pr-workflow` § 1.2), the
  same for every candidate; omitting it inherits the main checkout's unpushed
  commits. When the bug is a production claim («Bevis på `master`», prod repro),
  verify the premise read-only against `origin/master` and confirm it still
  reproduces on the preview base before fixing.
- `<slug>` = 2–4 words, kebab-case, transliterated (å→a, ä→a, ö→o); one suffix
  per candidate (`-a`, `-b`, `-c`).
- Give subagents `working_directory` = the worktree's absolute path and repeat
  the path in the prompt; an agent that guesses lands in the main checkout.

## Step 2 — repro agent (1 agent, writes, `<sol>`)

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

Prefer extending the existing test file next to the owner, matching its style.
The failing test must fail for the reason in the bug description, not because
of a typo, a missing import or a bad assertion. Run both yourself.

Return exactly:
Testfil: <path>
Kommando: npx vitest run <path>
Rött: <the actual failing assertion, 1-3 lines, verbatim>
Motprov: <name of the counter-test> — grönt
Motivering: <one sentence on why the red failure IS the bug>
```

Verify both yourself; a green "red" test is a stop condition. Copy the verified
test file to the same path in every other candidate worktree so all candidates
are judged by the same red test and counter-test.

## Step 3 — localisation (3 parallel, `readonly: true`, `<luna>`)

Same bug and test output for all three; angles: (1) the code path from the owner
file to the failing assertion, (2) the call sites and which caller would change
behaviour, (3) existing tests that lock today's behaviour and must change with
the fix.

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

## Step 4 — choose root cause

Read the code at the cited anchors. Two or more agreeing on the same place →
lock that root cause. Contradiction → re-run step 3 once with a sharper
question; still unclear → stop, do not coin-flip. Fix agents must not
re-diagnose.

## Step 5 — fix agents (N parallel, write, `<sol>`)

Same root cause, a **different named approach** per candidate; an open approach
yields N identical diffs. If you cannot name two genuinely different approaches,
run one candidate.

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

Keep the diff minimal. Do not refactor, rename, fix adjacent issues or add
comments explaining the fix. If an existing test encodes the old behaviour,
rewrite it in the same change and say so.

Run the command yourself before returning. Do NOT commit.

Return exactly:
Ansats: <one sentence>
Filer: <changed paths>
Testutfall: <pass/fail + last line of output>
Risk: <the caller most likely to be affected, or "-">
```

## Step 6 — judging (cheapest signal first)

| # | Check | Applies to |
|---|---|---|
| 1 | `npx vitest run <testfil>` — red test **and** counter-test | every candidate |
| 2 | Remaining tests in the owner's directory | passed 1 |
| 3 | `npm run typecheck` | passed 2 |
| 4 | `node scripts/dev/check-unicode-regex.mjs` | diff touches regex |

Winner = the **smallest** diff (`git diff --stat`) that clears every applicable
check, not the most elegant. Two traps: a failing regen gate (fingerprint,
addenda, embeddings, docs) means run the regen in that worktree and re-judge —
a sync duty, not elimination; and a diff that needs an `as`-cast to typecheck is
probably green only against a mock — check the real signature and eliminate it
if fake. Candidates differing only in formatting are one answer; say so.

## Step 7 — review (parent)

Read the test diff line by line: does the red test measure the bug or a proxy,
is the counter-test the closest legitimate case, and does a test assert what the
fix deliberately gives up? Then run Bugbot: `subagent_type: "bugbot"`,
`readonly: true`, `description: "Bugbot"`, `model: "<sol>"`:

```text
Full Repository Path: {WINNER_WORKTREE_PATH}
Diff: uncommitted changes
```

"The diff is empty" means the pass did NOT run, never "no findings". Fallback:
save the patch (step 1 below) and run Bugbot against the main checkout with
`Diff: natural language`, a per-file Change Description and Custom Instructions
to review `.cursor/kedja/<run>/kandidat-<x>.diff` as if applied; record it as
`bugbot-local`. Bugbot can judge a subset of a branch, so verify every finding
against the end state before acting or dismissing: uncommitted winner →
`git add -A -N` + `git diff <base-SHA>` or the file on disk (`git show HEAD:<file>`
lacks the fix); committed → `git diff <base-SHA>...HEAD`.

## After the run — orchestrator duty

The user runs no commands. Right after step 7:

1. Save each candidate diff to `.cursor/kedja/<YYYY-MM-DD_HHMM>/kandidat-<x>.diff`
   before teardown: `git add -A -N` then `git diff HEAD` (as `captureDiff` in
   `scripts/cursor/kedja-clean.mjs`; plain `git diff` misses the untracked test).
2. Commit the winner on its `fix/kedja-*` branch with a real `git add <paths>`
   (intent-to-add alone leaves an empty blob).
3. Push/PR only if requested, via `pr-workflow`; otherwise keep the winner
   worktree for handoff. Its cleanup follows `pr-workflow` after a terminal PR,
   never merely because a draft was opened.
4. When the loser's diff is saved and GitHub confirms it owns no open PR:
   `SAJTMASKIN_DISCARD_REASON="Verifierad förlorarkandidat; diffen är sparad" npm run worktree:remove -- <path> --force`,
   then `git branch -D fix/kedja-<slug>-<x>`. `--force` without the reason fails
   closed and never bypasses an open PR.
5. Report with the table below.

`npm run kedja:clean` is legacy cleanup for old `kedja/*` branches only (flags
via `node scripts/cursor/kedja-clean.mjs --yes --keep <path>`; npm eats them).
The backlog row closes in the same PR as the fix (`[x]` + PR ref in the archive).

## Report format

```markdown
| Steg | Utfall |
|---|---|
| Acceptans | `npx vitest run …` — rött före, grönt efter |
| Rotorsak | <one sentence + fil:rad> |
| Kandidat a | <ansats> · grön · 12 rader · **vinnare** · `<worktrees>\sajtmaskin-kedja-<slug>-a` på `fix/kedja-<slug>-a` |
| Kandidat b | <ansats> · röd i steg 2 av domen (bröt <test>) · worktree riven, diff kvar |
| Utfört av | repro: <roll/modell> · fix a/b: <roll/modell> · dom: orkestratorn maskinellt |
| Bugbot | <findings, or "inga fynd"> |
| Diffar | `.cursor/kedja/<YYYY-MM-DD_HHMM>/kandidat-*.diff` (även utslagna) |
| Ligger i | `<worktrees>\sajtmaskin-kedja-<slug>-a` på `fix/kedja-<slug>-a`, committad; push-/PR-status |
```

Every row naming a worktree gives the disk path and branch, also for eliminated
candidates, so the user can jump in. State whether the winner is local-only or in
`pr-workflow`, and that the backlog row stays open until archived in the fix PR.
