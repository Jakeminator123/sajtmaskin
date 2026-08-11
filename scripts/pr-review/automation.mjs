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
  parseStateComment,
  renderExhaustiveReview,
  renderFindingComment,
  renderFollowUpComment,
  renderStateComment,
  validateExhaustiveResult,
  validateFollowUpResult,
} from "./core.mjs";

const AUTOMATION_LOGIN = "github-actions[bot]";

function completedStateFromReview(state, review, reviewComments, now) {
  const snapshot = decodeMarker(review.body, EXHAUSTIVE_MARKER_PREFIX);
  if (!snapshot || !snapshot.headSha || !Array.isArray(snapshot.findings)) return state;
  const commentIds = new Map();
  for (const comment of reviewComments.filter((item) => item.author === AUTOMATION_LOGIN)) {
    const marker = decodeMarker(comment.body, FINDING_MARKER_PREFIX);
    if (marker?.findingId) commentIds.set(marker.findingId, comment.id);
  }
  return {
    ...state,
    firstReviewedHeadSha: snapshot.headSha,
    latestProcessedHeadSha: state.latestProcessedHeadSha ?? snapshot.headSha,
    exhaustiveReviewCompleted: true,
    totalRunCount: Math.max(1, state.totalRunCount),
    findings: snapshot.findings.map((finding) => ({
      ...finding,
      originalCommentId: commentIds.get(finding.id) ?? finding.originalCommentId ?? null,
    })),
    github: { ...state.github, exhaustiveReviewId: review.id },
    updatedAt: now.toISOString(),
  };
}

function enrichFindingCommentIds(state, reviewComments) {
  const commentIds = new Map();
  for (const comment of reviewComments.filter((item) => item.author === AUTOMATION_LOGIN)) {
    const marker = decodeMarker(comment.body, FINDING_MARKER_PREFIX);
    if (marker?.findingId) commentIds.set(marker.findingId, comment.id);
  }
  return {
    ...state,
    findings: state.findings.map((finding) => ({
      ...finding,
      originalCommentId: finding.originalCommentId ?? commentIds.get(finding.id) ?? null,
    })),
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

  const exhaustiveReview = reviews.find(
    (review) =>
      review.author === AUTOMATION_LOGIN && decodeMarker(review.body, EXHAUSTIVE_MARKER_PREFIX),
  );
  if (exhaustiveReview && !state.exhaustiveReviewCompleted) {
    state = completedStateFromReview(state, exhaustiveReview, reviewComments, now);
  } else if (exhaustiveReview) {
    state = enrichFindingCommentIds(state, reviewComments);
  }
  state = applyRecoveredFollowUps(state, comments);
  return { state, comments, reviews, reviewComments };
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
  // Discarded (unanchored) findings must not abort the whole review — publish
  // the valid subset. Callers can still see discardedFindings on the result.
  const review = await github.createReview(pr.number, {
    commit_id: pr.headSha,
    event: "COMMENT",
    body: renderExhaustiveReview({ headSha: pr.headSha, ...result }),
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
    { ...review, body: renderExhaustiveReview({ headSha: pr.headSha, ...result }) },
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
  if (pr.baseRef !== "master")
    return { kind: "skip", reason: "wrong-base", modelCalls: 0, writes: 0 };

  const reconciled = await loadAndReconcileState({ github, pr, now });
  let state = reconciled.state;
  const decision = decideReview({ pr, state });
  if (decision.kind === "skip") return decision;

  state = claimRun(state, { kind: decision.kind, headSha: pr.headSha, now });
  state = await persistState(github, state);
  try {
    if (decision.kind === "exhaustive") {
      state = await runExhaustive({ github, model, pr, state, now });
    } else {
      state = await runFollowUp({ github, model, pr, state, findings: decision.findings, now });
    }
    return { kind: decision.kind, state };
  } catch (error) {
    const failed = markRunFailed(state, error, now);
    try {
      await persistState(github, failed);
    } catch {
      // Preserve the original provider/GitHub error; the pre-call claim is already durable when possible.
    }
    throw error;
  }
}
