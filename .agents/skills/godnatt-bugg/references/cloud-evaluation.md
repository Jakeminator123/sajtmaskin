# Cloud evaluation — två draft-PR-pass

Bara för ett uttryckligt admintest av cirkulariteten; inte Desktop-automationen
och aldrig merge-authority. Starta Cloud-tasken från en preview-SHA där
`.agents/skills/godnatt-bugg/` (med evaluation-state och tester),
`.codex/agents/godnatt-{investigator,worker,reviewer}.toml` och det permanenta
worktree-skyddet redan är mergade — Cloud ser bara pushade commits.
Desktop-automationen `godnatt-bugg` ska vara PAUSED före, under och efter.

## Prompt för Cloud-tasken

```text
Run the repository-local $godnatt-bugg workflow as an explicit two-pass Cloud
evaluation:

    $godnatt-bugg evaluation 2

THIS IS AN ADMIN EVALUATION WITH DRAFT-PR AUTHORITY ONLY.
MERGING, READY-FOR-REVIEW, SIGN-OFF, PR CLOSURE, AUTO-MERGE, AND REMOTE BRANCH
DELETION ARE STRICTLY FORBIDDEN.

Preflight:
1. Read root AGENTS.md, the complete $godnatt-bugg skill, and its
   cloud-evaluation, state/scheduling, and PR-gate references.
2. Verify HEAD and origin/preview. Stop unless origin/preview itself contains the
   evaluation-capable Godnatt-bugg state machine and tests.
3. Verify authenticated GitHub write access can push two dedicated branches
   and create two separate draft PRs. If not, stop and report the exact
   limitation; never pretend a branch or PR exists.
4. Verify the Desktop automation is not being activated or modified by this
   Cloud task.
5. Begin exactly one state batch with count 2 and mode evaluation. Never use
   pilot, full, scheduled, promote, merge, or cleanup stages.

For each pass:
1. Fetch fresh origin/preview and origin/master. Use master only for production
   revalidation; inspect all open PRs, labels, reviews, and
   changed paths. Avoid overlapping work.
2. Select one unchecked, bounded candidate from exactly `## Aktiv kö`. Never
   select an SM id already handled by this evaluation batch.
3. Revalidate it as relevant, already-resolved, reclassify, or blocked. Do not
   manufacture code work for a stale premise.
4. Use the project-scoped investigator, worker, and reviewer profiles when
   available. Preserve their read/write boundaries and snapshot checks.
5. Implement only the smallest safe candidate change on a unique dedicated
   branch from fresh origin/preview. Run regression and opposite-direction
   tests plus applicable repository checks.
6. Commit and push only that candidate branch. Create a DRAFT PR against
   preview. Include any backlog update in that same PR. An unmerged draft is
   not a delivered fix, and delivery to preview is not a production release.
7. Prefix the title exactly with:

   [DO NOT MERGE — ADMIN REVIEW REQUIRED]

8. Start the PR body with:

   > [!CAUTION]
   > AUTOMATED GODNATT-BUGG EVALUATION.
   > DO NOT MERGE, ENABLE AUTO-MERGE, MARK READY FOR REVIEW, OR CLOSE THIS PR
   > UNTIL AN ADMIN HAS REVIEWED AND APPROVED IT.

9. Apply an existing `do-not-merge` or `admin-review-required` label when
   available. Do not create a repository-wide label for this test.
10. Verify the draft/admin/merge guards through GitHub, then register them in
    state with the exact current 40-character head SHA and live preview-base
    SHA. The PR API's historical base SHA is not the current preview tip.
11. Allow automated review. If no useful review is available, follow the
    repository fallback to independent read-only bug review. Fix credible
    findings on the candidate branch. Any head or preview-base move requires
    re-registering the current `draft-pr` stage and a new review for both
    frozen SHAs. The review command must assert `--reviewed-sha` and
    `--reviewed-base-sha`; never use the full-only `re-review` transition here.
    Stop after at most three review/fix passes; the cap never permits merging.
12. Complete the evaluation pass only from `draft-pr`, only after a clean or
    findings-fixed review for the current head and live preview-base SHAs,
    and only after re-verifying the PR is still draft/admin-blocked and
    unmerged.

Between pass 1 and pass 2:
- Leave the first PR open and draft and leave its remote branch intact.
- Respect the state machine's five-minute notBefore cooldown; do not lower or
  bypass it.
- Return the Cloud worktree to a clean state, fetch fresh origin/preview, and
  reacquire the lease only when cooldown has elapsed.

At completion return a table with pass number, SM id, verdict, branch, draft PR
URL, tests/checks, review source/pass count, and unresolved risks. Re-read both
PRs from GitHub and explicitly confirm that both remain draft, no PR was made
ready, none was closed, and nothing was merged.

Final mandatory statement:

ADMIN REVIEW REQUIRED. TWO-PASS EVALUATION FINISHED.
NO PULL REQUEST WAS MERGED, CLOSED, OR MARKED READY.
```

## Stoppa hellre än att simulera

Kan Cloud-miljön inte pusha två branches eller skapa två separata draft-PR:er är
testet inte genomfört. Påstå inga skapade PR:er och ersätt dem inte med en
kombinerad PR eller en full-run.
