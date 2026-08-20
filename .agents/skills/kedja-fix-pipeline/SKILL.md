---
name: kedja-fix-pipeline
description: >-
  Staged bug-fix pipeline for Sajtmaskin. A cheap orchestrator drives seven steps — frame, workspace, repro, localize, decide, fix, judge, review — where a failing test written in step 2 is what lets cheap agents be judged mechanically instead of by opinion. Write steps run in dedicated git worktrees, never in the main checkout; the winner is committed on its kedja branch (never pushed) while losers stay uncommitted. Use when the user runs /kedja, says "kedja", or asks to drive one specific bug through a staged multi-agent fix flow. Fix mode — the opposite of /automat, which is audit only.
---

# Kedja — staged bug fix

The orchestrator is the cheap model in the user's chat. Subagents are cheap too; none of them are trusted. What makes the flow work is that **step 2 produces a red test**, so step 6 is a measurement rather than a judgement call.

**Expensive orchestrator? Delegate.** If the model in the user's chat is not a cheap Grok-class orchestrator, the DEFAULT is delegated mode (see command stub `kedja.md § Delegerat läge`): the parent does step 0 only, launches ONE cheap runner subagent that drives steps 1–6 end to end, receives only the final report table, then runs step 7 (bugbot) itself. Every report an orchestrator receives is re-paid in every later turn — do not carry the bulk in an expensive context.

**This skill is the sole fulltext** for steps, prompts, judging and teardown. The slash command is a short stub (args + stop + delegate) — do not re-read duplicated procedure from the command.

## Hard rules

1. **No writes in the main checkout.** Every write step runs inside a worktree created in step 1. No `git checkout`/`switch` in the main checkout (`agent-worktree.mdc`).
2. **No push, rebase or PR** (`git.mdc`) — but the WINNER is committed on its `kedja/<slug>-<x>` branch as the final step. An uncommitted winner looks like debris to every other agent's cleanup sweep (`kedja-clean` refuses branches with own commits — a commit is the winner's life insurance; two uncommitted winners were swept 2026-08-04). Losers stay uncommitted and are torn down after their diffs are saved.
3. **One bug.** Adjacent findings go to `/buggrapport`, not into the diff (`mvp-scope-freeze.mdc`).
4. **Models from the canonical rule** in [`subagent-models.mdc`](../../../.cursor/rules/subagent-models.mdc): `<grok-4.5>` for localisation, repro and fix agents, and for step 7 `bugbot` (`model: <grok-4.5>`). `<grok-4.5>` is a role placeholder — resolve it against the Grok entry the rule designates, looked up in your own session's `<available_subagent_models>`, rather than copying a slug from an older line. Never default to Opus/expensive thinking models.
5. **Never remove a worktree with raw git.** `npm run worktree:remove -- <path> [--force]` only. Raw `git worktree remove` follows the `node_modules` junction and empties the main checkout's copy — and dropping `--force` does not help, because git only refuses on dirty or _untracked_ entries while a junctioned `node_modules` is _ignored_. A hook denies both forms.
6. **One retry, then stop.** Two red judging rounds means the bug is too big for the chain; report that instead of looping.

## Worktree recipe

`worktree:link` refuses a path that git does not already know, so the order is fixed:

```powershell
git worktree add ..\sajtmaskin-kedja-<slug>-a -b kedja/<slug>-a origin/master
npm run worktree:link -- ..\sajtmaskin-kedja-<slug>-a
```

- **Always pass the base `origin/master`.** Omit it and git bases the candidate on the main checkout's HEAD at that moment, so every candidate silently inherits whatever the owner has committed locally but not pushed. All candidates must start from the same published trunk, or the judging round compares diffs against different baselines.
- `<slug>` = 2–4 words, kebab-case, transliterated (å→a, ä→a, ö→o).
- One suffix per candidate: `-a`, `-b`, `-c`.
- Run subagents with `working_directory` set to the worktree's absolute path, and say the path in the prompt too — an agent that guesses will land in the main checkout.
- Teardown after the diffs are saved: `npm run worktree:remove -- ..\sajtmaskin-kedja-<slug>-b --force`.

## Prompt templates

### Step 2 — repro agent (1 agent, writes, `<grok-4.5>`)

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

**Copy the verified test file into every other candidate worktree** before
step 5/6 so all candidates are judged by the exact same red test + counter-test
(same path under each worktree root). Do not re-write the tests per candidate.

### Step 3 — localisation agents (3 parallel, `readonly: true`, `<grok-4.5>`)

Same bug and same test output for all three; only the angle differs.

| #   | Angle                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | The code path — read the owner file and follow the values that reach the failing assertion                                     |
| 2   | The call sites — who calls this, with what, and which caller would change behaviour if the owner changed                       |
| 3   | The test and its neighbours — what existing tests lock in today's behaviour, and which one must be rewritten alongside the fix |

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

### Step 4 — choose root cause (orchestrator / runner)

Read the code at the anchors the three hypotheses cite. If **two or more**
agree on the same place, that is a strong signal — lock that root cause and
continue. If they contradict: re-run step 3 **once** with a sharper question.
Still unclear → **stop** (do not coin-flip). Fix agents in step 5 receive the
chosen root cause; they must not re-diagnose.

### Step 5 — fix agents (N parallel, write, `<grok-4.5>`)

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

**Read the test diff line by line, not just its outcome.** The whole chain rests on the step 2 test measuring the right thing; if it does not, the mechanical verdict is worthless, and red-before/green-after will not reveal it. Before opening a PR the orchestrator reads the test addition itself and asks: does the red test measure the bug or a proxy? Is the counter-test the _closest legitimate_ case? And — easiest to miss — **does the test assert what the fix deliberately gives up?** On #780 `rebuild-content.test.ts` locked that the wrong file is not corrupted but said nothing about the right file's fix now being dropped on a fence miss; the trade-off lived only in the head of whoever read the diff. One more assertion turned it into a contract.

`subagent_type: "bugbot"`, `readonly: true`, `description: "Bugbot"`, `model: "<grok-4.5>"` (bug-grind role in the canonical rule — never Opus/expensive thinking models as default), prompt form per `AGENTS.md § Review guidelines`:

```text
Full Repository Path: {WINNER_WORKTREE_PATH}
Diff: uncommitted changes
```

**"diff is empty" fallback (verified 2026-08-05).** Use the form above first. Bugbot may answer _"the diff … is empty"_ on a kedja worktree; that means the pass did NOT run — never record it as "no findings". Observed: an unpushed kedja branch returned empty for both `uncommitted changes` and `branch changes`, while the same form worked in a linked worktree whose branch had a pushed upstream. On an empty answer:

1. Save the patch with `git add -A -N` then `git diff HEAD` — the same procedure as `captureDiff` in `scripts/cursor/kedja-clean.mjs`. A plain `git diff` omits the untracked repro test, so Bugbot would review an incomplete winner.
2. Run the pass against the MAIN checkout with `Diff: natural language`, a per-file Change Description, and Custom Instructions telling it to read `.cursor/kedja/<run>/kandidat-<x>.diff` and review it as if applied.

Document the pass as `bugbot-local`.

**Read the answer critically — the pass does not always see the whole branch.** On a multi-commit branch Bugbot can judge a subset and report findings that are false against the whole. Reproduced twice on #780: it claimed three backlog rows were deleted without archival _and_ that all three defects were still in the code, while the archive rows and all three fixes sat in the same diff. Verify every finding against the actual end state before acting — and never dismiss one without doing that, since the same weakness can just as easily hide a real finding.

Which command shows the truth depends on where you are, and getting it wrong is easy:

| State                                              | Verify with                                                                                                                                                                        |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Step 7, winner **not yet committed** (the default) | `git add -A -N` + `git diff master` in the worktree, or read the file on disk. `HEAD` does not contain the fix yet, so `git show HEAD:<file>` would falsely "confirm" the finding. |
| After _After the run_ step 2, or on a PR branch    | `git diff master...HEAD` and `git show HEAD:<file>`                                                                                                                                |

## Judging order

Cheapest signal first, so a broken candidate is eliminated before it costs a typecheck.

| #   | Check                                                      | Applies to                     |
| --- | ---------------------------------------------------------- | ------------------------------ |
| 1   | `npx vitest run <testfil>` — red test **and** counter-test | every candidate                |
| 2   | Remaining tests in the owner's directory                   | candidates that passed 1       |
| 3   | `npm run typecheck`                                        | candidates that passed 2       |
| 4   | `node scripts/dev/check-unicode-regex.mjs`                 | only if the diff touches regex |

Winner = the **smallest** diff that clears every applicable check. Compare with `git diff --stat` in each worktree; do not pick on elegance.

Two judging traps (both hit 2026-08-05):

- **Regen gate ≠ red.** If a directory/CI gate fails because a generated view must be regenerated after the owner edit (fingerprint/addenda/embeddings/docs), run the regen command in the candidate's worktree and re-judge — that is a sync duty in the same change (`workflow.mdc`), not an elimination and not a scope breach.
- **Mock-green ≠ green.** A candidate whose diff needs an `as`-cast to pass typecheck is probably smuggling in an API the real owner does not have — green only against the test mock. Verify the signature against the real code; if fake, the candidate is eliminated on semantics (seen: `signal` cast into a loader that only accepts `{ timeoutMs }`).

Two candidates that differ only in formatting or variable extraction are **one** answer, not two. Say so in the report — it means step 5 gave no spread and the winner was effectively unopposed.

### The failure this ordering exists to catch

First run, 2026-08-02: the bug was a guard that fired on prompts it should ignore. Both candidates fixed it by making the veto absolute, which also suppressed every legitimate case — a plain "lägg till kortbetalning och byt färg på knappen" stopped being detected at all. Every check passed: the red test went green, 157 existing tests stayed green, bugbot found nothing. Nothing measured the opposite direction, so nothing could catch it.

The lesson generalises: when the fix direction is "make X stop happening", the cheapest wrong answer is always "make X never happen". Only a counter-test distinguishes them.

## Report format

```markdown
| Steg       | Utfall                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------- |
| Acceptans  | `npx vitest run …` — rött före, grönt efter                                                   |
| Rotorsak   | <one sentence + fil:rad>                                                                      |
| Kandidat a | <ansats> · grön · 12 rader · **vinnare** · `..\sajtmaskin-kedja-<slug>-a` på `kedja/<slug>-a` |
| Kandidat b | <ansats> · röd i steg 2 av domen (bröt <test>) · worktree riven, diff kvar                    |
| Utfört av  | repro: <roll/modell> · fix a/b: <roll/modell> · dom: orkestratorn maskinellt                  |
| Bugbot     | <findings, or "inga fynd">                                                                    |
| Diffar     | `.cursor/kedja/<YYYY-MM-DD_HHMM>/kandidat-*.diff` (även utslagna)                             |
| Ligger i   | `..\sajtmaskin-kedja-<slug>-a` på `kedja/<slug>-a`, committad (ej pushad)                     |
```

Every row that names a worktree must give the **absolute or repo-relative disk
path and branch**, including for eliminated candidates (their worktrees are
torn down but the diffs stay) — the user uses this table to jump in and make
targeted follow-up fixes.

Say explicitly that the winner is committed on its kedja branch but NOT pushed, and that the backlog row stays open until it is closed in the fix PR (same-PR archival, see § After the run).

## After the run — orchestrator duty

User runs no commands. Right after step 7:

1. Save each candidate diff to `.cursor/kedja/<YYYY-MM-DD_HHMM>/kandidat-<x>.diff` **before** teardown. New test files are untracked — use `git add -A -N` then `git diff HEAD` (same as `captureDiff` in `scripts/cursor/kedja-clean.mjs`).
2. **Commit the winner** on its kedja branch: real `git add <paths>` (intent-to-add alone leaves an empty blob), then commit. No push/PR unless asked (`git.mdc`). Commit is the winner's life insurance against `kedja-clean` sweeps.
3. Remove loser worktrees: `npm run worktree:remove -- <path> --force`, then `git branch -D kedja/<slug>-<x>`.
4. Report with the table above.

Leftovers: `npm run kedja:clean` (dry), then `node scripts/cursor/kedja-clean.mjs --yes --keep <winner>` (flags via `node`, not npm). Never `--yes` other agents' kedja worktrees without `--keep`.

**Backlog row closes in the same PR as the fix** (`[x]` + PR ref in archive). After merge, the merging agent tears down the winner worktree + branch.

## Related

- Command stub: [`.cursor/commands/kedja.md`](../../../.cursor/commands/kedja.md)
- Output folder: [`.cursor/kedja/README.md`](../../../.cursor/kedja/README.md)
- Audit counterpart (never fixes): [`automat-swarm`](../automat-swarm/SKILL.md)
- Promote or log a finding found on the way: `/buggrapport`
