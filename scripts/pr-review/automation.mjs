import {
  MAX_DIFF_CHARS,
  applyFollowUpStatuses,
  buildDiffLocationIndex,
  claimRun,
  createInitialState,
  decideReview,
  decodeMarker,
  EXHAUSTIVE_MARKER_PREFIX,
  FINDING_MARKER_PREFIX,
  FOLLOW_UP_MARKER_PREFIX,
  markRunFailed,
  mergeResolutionLedger,
  parseStateComment,
  renderExhaustiveReview,
  renderFindingComment,
  renderFollowUpComment,
  renderStateComment,
  TARGET_BASE_BRANCH,
  validateExhaustiveResult,
  validateFollowUpResult,
} from "./core.mjs";

const AUTOMATION_LOGIN = "github-actions[bot]";
export const MAX_GITHUB_PULL_FILES = 3_000;

export class IncompletePullFileUniverseError extends Error {
  constructor(message) {
    super(message);
    this.name = "IncompletePullFileUniverseError";
  }
}

export class DiscardedReviewFindingsError extends Error {
  constructor(discardedFindings) {
    super(
      `Reviewer returned ${discardedFindings} finding(s) that could not be anchored to the complete current diff`,
    );
    this.name = "DiscardedReviewFindingsError";
    this.discardedFindings = discardedFindings;
  }
}

/**
 * GitHub documents a hard 3,000-file ceiling for the pull-files endpoint.
 * `changed_files` from the live PR object is therefore the independent count
 * that proves whether the paginated response is complete. Missing counts,
 * truncation and duplicate/malformed records all block an exhaustive receipt.
 */
export function assertCompletePullFileUniverse({ changedFiles, files }) {
  if (!Number.isSafeInteger(changedFiles) || changedFiles < 0) {
    throw new IncompletePullFileUniverseError(
      "GitHub returned no valid changed_files count for the current PR head",
    );
  }
  if (changedFiles > MAX_GITHUB_PULL_FILES) {
    throw new IncompletePullFileUniverseError(
      `PR has ${changedFiles} changed files, above GitHub's ${MAX_GITHUB_PULL_FILES}-file review API limit`,
    );
  }
  if (!Array.isArray(files)) {
    throw new IncompletePullFileUniverseError("GitHub returned no pull-file collection");
  }
  const filenames = files.map((file) => file?.filename);
  if (filenames.some((filename) => typeof filename !== "string" || filename.length === 0)) {
    throw new IncompletePullFileUniverseError("GitHub returned a malformed pull-file record");
  }
  if (new Set(filenames).size !== filenames.length) {
    throw new IncompletePullFileUniverseError(
      "GitHub returned duplicate pull-file records; completeness cannot be proven",
    );
  }
  if (files.length !== changedFiles) {
    throw new IncompletePullFileUniverseError(
      `GitHub reported ${changedFiles} changed files but returned ${files.length}`,
    );
  }
}

function completedStateFromReview(state, review, reviewComments, now, minimumRunCount = 1) {
  const snapshot = decodeMarker(review.body, EXHAUSTIVE_MARKER_PREFIX);
  if (!snapshot || !snapshot.headSha || !Array.isArray(snapshot.findings)) return state;
  const commentIds = new Map();
  for (const comment of reviewComments.filter((item) => item.author === AUTOMATION_LOGIN)) {
    const marker = decodeMarker(comment.body, FINDING_MARKER_PREFIX);
    if (marker?.findingId) commentIds.set(marker.findingId, comment.id);
  }
  const at = now.toISOString();
  const resolutionLedger = mergeResolutionLedger({
    resolutionLedger: snapshot.resolutionLedger ?? state.resolutionLedger,
    previousFindings: state.findings,
    currentFindings: snapshot.findings,
    headSha: snapshot.headSha,
    now,
  }).map((entry) => ({
    ...entry,
    originalCommentId: entry.originalCommentId ?? commentIds.get(entry.id) ?? null,
  }));
  return {
    ...state,
    firstReviewedHeadSha: state.firstReviewedHeadSha ?? snapshot.headSha,
    // Always take the published review's head — recovery must not leave a
    // sticky incomplete lastRun that reclaim logic treats as retryable.
    latestProcessedHeadSha: snapshot.headSha,
    exhaustiveReviewCompleted: true,
    totalRunCount: Math.max(minimumRunCount, snapshot.runNumber ?? 1, state.totalRunCount),
    resolutionLedger,
    findings: snapshot.findings.map((finding) => ({
      ...finding,
      originalCommentId:
        resolutionLedger.find((entry) => entry.id === finding.id)?.originalCommentId ??
        finding.originalCommentId ??
        commentIds.get(finding.id) ??
        null,
    })),
    github: { ...state.github, exhaustiveReviewId: review.id },
    updatedAt: at,
    lastRun: {
      kind: "exhaustive",
      headSha: snapshot.headSha,
      status: "completed",
      at,
      error: null,
    },
  };
}

function enrichFindingCommentIds(state, reviewComments) {
  const commentIds = new Map();
  for (const comment of reviewComments.filter((item) => item.author === AUTOMATION_LOGIN)) {
    const marker = decodeMarker(comment.body, FINDING_MARKER_PREFIX);
    if (marker?.findingId) commentIds.set(marker.findingId, comment.id);
  }
  let changed = false;
  const resolutionLedger = (state.resolutionLedger ?? []).map((entry) => {
    const originalCommentId = entry.originalCommentId ?? commentIds.get(entry.id) ?? null;
    if (originalCommentId !== entry.originalCommentId) changed = true;
    return originalCommentId === entry.originalCommentId ? entry : { ...entry, originalCommentId };
  });
  const findings = state.findings.map((finding) => {
    const originalCommentId = finding.originalCommentId ?? commentIds.get(finding.id) ?? null;
    if (originalCommentId !== finding.originalCommentId) changed = true;
    return originalCommentId === finding.originalCommentId
      ? finding
      : { ...finding, originalCommentId };
  });
  if (!changed) return state;
  return {
    ...state,
    resolutionLedger,
    findings,
  };
}

function applyRecoveredFollowUps(state, comments) {
  let recovered = state;
  const snapshots = comments
    .filter((comment) => comment.author === AUTOMATION_LOGIN)
    .map((comment) => ({ comment, snapshot: decodeMarker(comment.body, FOLLOW_UP_MARKER_PREFIX) }))
    .filter(({ snapshot }) => snapshot?.headSha && Array.isArray(snapshot.statuses))
    .sort((a, b) => a.snapshot.runNumber - b.snapshot.runNumber);
  for (const { comment, snapshot } of snapshots) {
    const alreadyCompleted =
      snapshot.runNumber < recovered.totalRunCount ||
      (snapshot.runNumber === recovered.totalRunCount &&
        recovered.lastRun?.status === "completed" &&
        recovered.latestProcessedHeadSha === snapshot.headSha);
    if (alreadyCompleted) continue;
    try {
      const statuses = validateFollowUpResult(
        { statuses: snapshot.statuses },
        recovered.findings.filter((finding) =>
          ["open", "still-present", "cannot-verify"].includes(finding.status),
        ),
      );
      recovered = applyFollowUpStatuses(
        {
          ...recovered,
          totalRunCount: snapshot.runNumber,
          latestProcessedHeadSha: snapshot.headSha,
          github: {
            ...recovered.github,
            followUpCommentIds: [...recovered.github.followUpCommentIds, comment.id],
          },
        },
        statuses,
        new Date(comment.createdAt),
      );
    } catch {
      // Ignore malformed or stale recovery markers; the canonical state stays unchanged.
    }
  }
  return recovered;
}

async function loadAndReconcileState({ github, pr, now }) {
  const [comments, reviews, reviewComments] = await Promise.all([
    github.listIssueComments(pr.number),
    github.listReviews(pr.number),
    github.listReviewComments(pr.number),
  ]);
  const stateComment = comments
    .filter((comment) => comment.author === AUTOMATION_LOGIN)
    .filter((comment) => {
      const candidate = parseStateComment(comment.body);
      return candidate?.repository === pr.repository && candidate?.prNumber === pr.number;
    })
    .at(-1);
  let state = stateComment ? parseStateComment(stateComment.body) : createInitialState(pr, now);
  if (stateComment) {
    state = { ...state, github: { ...state.github, stateCommentId: stateComment.id } };
  }
  let dirty = false;

  const exhaustiveReviews = reviews
    .filter((review) => review.author === AUTOMATION_LOGIN)
    .map((review) => ({ review, snapshot: decodeMarker(review.body, EXHAUSTIVE_MARKER_PREFIX) }))
    .filter(
      ({ review, snapshot }) =>
        snapshot?.headSha === review.commitId && Array.isArray(snapshot.findings),
    );
  const latestExhaustive = exhaustiveReviews.at(-1);
  const firstExhaustive = exhaustiveReviews.at(0);
  if (!state.firstReviewedHeadSha && firstExhaustive) {
    state = { ...state, firstReviewedHeadSha: firstExhaustive.snapshot.headSha };
    dirty = true;
  }
  const currentHeadExhaustive = exhaustiveReviews.findLast(
    ({ snapshot }) => snapshot.headSha === pr.headSha,
  );
  const reviewedHeadCount = new Set(exhaustiveReviews.map(({ snapshot }) => snapshot.headSha)).size;
  if (latestExhaustive && !state.exhaustiveReviewCompleted) {
    const recovery = currentHeadExhaustive ?? latestExhaustive;
    state = completedStateFromReview(
      state,
      recovery.review,
      reviewComments,
      now,
      reviewedHeadCount,
    );
    dirty = true;
  } else if (latestExhaustive) {
    const before = state;
    state = enrichFindingCommentIds(state, reviewComments);
    // Heal only a sticky incomplete *exhaustive* claim. Never rewrite a
    // follow-up lastRun to completed — that would disable reclaim and burn
    // another MAX_RUNS slot on the next synchronize.
    const incompleteExhaustiveClaim =
      state.lastRun?.status !== "completed" &&
      (state.lastRun?.kind ?? "exhaustive") === "exhaustive";
    const publishedClaim = incompleteExhaustiveClaim
      ? exhaustiveReviews.findLast(({ snapshot }) => snapshot.headSha === state.lastRun?.headSha)
      : null;
    const currentHeadStateNeedsRecovery =
      currentHeadExhaustive &&
      (state.latestProcessedHeadSha !== pr.headSha ||
        state.lastRun?.kind !== "exhaustive" ||
        state.github?.exhaustiveReviewId !== currentHeadExhaustive.review.id);
    const previouslyReviewedCurrentHead =
      !incompleteExhaustiveClaim && currentHeadStateNeedsRecovery ? currentHeadExhaustive : null;
    const recovery = publishedClaim ?? previouslyReviewedCurrentHead;
    if (recovery) {
      // Heal only from a review for the exact claimed head. An older review is
      // not evidence that a newer interrupted head completed.
      state = completedStateFromReview(
        state,
        recovery.review,
        reviewComments,
        now,
        reviewedHeadCount,
      );
      dirty = true;
    } else if (state !== before) {
      dirty = true;
    }
  }
  const beforeFollowUps = state;
  state = applyRecoveredFollowUps(state, comments);
  if (state !== beforeFollowUps) dirty = true;
  return {
    state,
    dirty,
    comments,
    reviews,
    reviewComments,
    verifiedCurrentReview: currentHeadExhaustive
      ? {
          reviewId: currentHeadExhaustive.review.id,
          headSha: currentHeadExhaustive.snapshot.headSha,
        }
      : null,
  };
}

async function persistState(github, state) {
  if (state.github.stateCommentId) {
    await github.updateIssueComment(state.github.stateCommentId, renderStateComment(state));
    return state;
  }
  const created = await github.createIssueComment(state.prNumber, renderStateComment(state));
  const withId = { ...state, github: { ...state.github, stateCommentId: created.id } };
  await github.updateIssueComment(created.id, renderStateComment(withId));
  return withId;
}

function exhaustiveInput(pr, diff) {
  return [
    "UNTRUSTED_PR_DIFF_START",
    JSON.stringify({
      repository: pr.repository,
      prNumber: pr.number,
      base: pr.baseRef,
      headSha: pr.headSha,
    }),
    diff,
    "UNTRUSTED_PR_DIFF_END",
  ].join("\n");
}

function followUpInput(pr, findings, context) {
  return [
    "UNTRUSTED_FINDING_FOLLOW_UP_DATA_START",
    JSON.stringify({
      repository: pr.repository,
      prNumber: pr.number,
      headSha: pr.headSha,
      findings: findings.map(({ id, title, body, path, line, endLine, status }) => ({
        id,
        title,
        body,
        path,
        line,
        endLine,
        status,
      })),
      relevantFiles: context.relevantFiles,
      maintainerComments: context.maintainerComments,
    }),
    "UNTRUSTED_FINDING_FOLLOW_UP_DATA_END",
  ].join("\n");
}

async function runExhaustive({ github, model, pr, state, now }) {
  const [diff, files] = await Promise.all([
    github.getPullDiff(pr.number),
    github.listPullFiles(pr.number),
  ]);
  assertCompletePullFileUniverse({ changedFiles: pr.changedFiles, files });
  if (diff.length > MAX_DIFF_CHARS) {
    const failed = markRunFailed(
      state,
      `PR-diffen är ${diff.length} tecken och överskrider reviewtaket ${MAX_DIFF_CHARS}.`,
      now,
    );
    await persistState(github, failed);
    throw new Error("PR diff is too large for an exhaustive automatic review");
  }

  const raw = await model.exhaustive(exhaustiveInput(pr, diff));
  const result = validateExhaustiveResult(raw, buildDiffLocationIndex(files));
  // A malformed path/line can be a real finding whose inline anchor was
  // truncated or hallucinated. Publishing only the valid subset would turn
  // that uncertainty into a false-green "exhaustive" receipt, so block the
  // whole review before any GitHub review is created.
  if (result.discardedFindings > 0) {
    throw new DiscardedReviewFindingsError(result.discardedFindings);
  }
  const resolutionLedger = mergeResolutionLedger({
    resolutionLedger: state.resolutionLedger,
    previousFindings: state.findings,
    currentFindings: result.findings,
    headSha: pr.headSha,
    now,
  });
  const renderedReview = renderExhaustiveReview({
    headSha: pr.headSha,
    runNumber: state.totalRunCount,
    resolutionLedger,
    ...result,
  });
  const currentPr = await github.getPullRequest(pr.number);
  if (
    currentPr.mergedAt ||
    currentPr.baseRef !== TARGET_BASE_BRANCH ||
    currentPr.headSha !== pr.headSha
  ) {
    throw new Error("PR head or base changed during exhaustive review");
  }
  const review = await github.createReview(pr.number, {
    commit_id: pr.headSha,
    event: "COMMENT",
    body: renderedReview,
    comments: result.findings.map((finding) => ({
      path: finding.path,
      line: finding.line,
      side: "RIGHT",
      body: renderFindingComment(finding),
    })),
  });

  const reviewComments = await github.listReviewComments(pr.number);
  const completed = completedStateFromReview(
    state,
    { ...review, body: renderedReview },
    reviewComments,
    now,
  );
  completed.lastRun = { ...(completed.lastRun ?? {}), status: "completed", error: null };
  return persistState(github, completed);
}

async function runFollowUp({ github, model, pr, state, findings, now }) {
  const context = await github.getFindingContext(pr, findings);
  const raw = await model.followUp(
    followUpInput(pr, findings, context),
    findings.map((finding) => finding.id),
  );
  const statuses = validateFollowUpResult(raw, findings);
  const comment = await github.createIssueComment(
    pr.number,
    renderFollowUpComment({ headSha: pr.headSha, runNumber: state.totalRunCount, statuses }),
  );
  for (const item of statuses) {
    if (item.status !== "fixed") continue;
    const finding = state.findings.find((candidate) => candidate.id === item.findingId);
    if (finding?.originalCommentId)
      await github.reactToReviewComment(finding.originalCommentId, "+1");
  }
  const completed = applyFollowUpStatuses(
    {
      ...state,
      github: {
        ...state.github,
        followUpCommentIds: [...state.github.followUpCommentIds, comment.id],
      },
    },
    statuses,
    now,
  );
  return persistState(github, completed);
}

export async function runReviewAutomation({ github, model, prNumber, now = new Date() }) {
  const pr = await github.getPullRequest(prNumber);

  // Absolute first gate: a merged PR never causes model or write operations.
  if (pr.mergedAt) return { kind: "skip", reason: "merged", modelCalls: 0, writes: 0 };
  if (pr.baseRef !== TARGET_BASE_BRANCH)
    return { kind: "skip", reason: "wrong-base", modelCalls: 0, writes: 0 };

  const reconciled = await loadAndReconcileState({ github, pr, now });
  let state = reconciled.state;
  if (reconciled.dirty) {
    // Persist recovery heals even when we skip a model run, so sticky
    // lastRun=running cannot reopen the same head on the next event.
    state = await persistState(github, state);
  }
  const decision = decideReview({ pr, state });
  if (decision.kind === "skip") {
    if (decision.reason === "head-already-processed" && reconciled.verifiedCurrentReview) {
      return {
        kind: "receipt-recovery",
        state,
        publishedReview: reconciled.verifiedCurrentReview,
      };
    }
    return decision;
  }

  state = claimRun(state, { kind: decision.kind, headSha: pr.headSha, now });
  state = await persistState(github, state);
  try {
    if (decision.kind === "exhaustive") {
      state = await runExhaustive({ github, model, pr, state, now });
    } else {
      state = await runFollowUp({ github, model, pr, state, findings: decision.findings, now });
    }
    return {
      kind: decision.kind,
      state,
      ...(decision.kind === "exhaustive"
        ? {
            publishedReview: {
              reviewId: state.github.exhaustiveReviewId,
              headSha: state.latestProcessedHeadSha,
            },
          }
        : {}),
    };
  } catch (error) {
    const failed = markRunFailed(state, error, now);
    let persisted = failed;
    try {
      persisted = await persistState(github, failed);
    } catch {
      // Preserve the original provider/GitHub error; the pre-call claim is already durable when possible.
    }
    // This is an expected GitHub API coverage limit, not a transient provider
    // crash. Return a machine-readable non-qualification so the next workflow
    // step publishes `action_required` on the live head instead of leaving the
    // trusted receipt absent or, worse, claiming a truncated review was full.
    if (
      error instanceof IncompletePullFileUniverseError ||
      error instanceof DiscardedReviewFindingsError
    ) {
      return {
        kind: "skip",
        reason:
          error instanceof IncompletePullFileUniverseError
            ? "incomplete-pull-file-universe"
            : "discarded-review-findings",
        state: persisted,
      };
    }
    throw error;
  }
}
