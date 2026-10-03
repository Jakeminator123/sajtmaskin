#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isInvalidatingBotEvent } from "./merge-ready-freshness.mjs";
import { requiredCheckOwnerSpec } from "../workflow/required-check-owners.mjs";
import { decodeMarker, EXHAUSTIVE_MARKER_PREFIX, parseStateComment } from "../pr-review/core.mjs";
import {
  parseAccountFallbackRequest,
  parseAccountReviewMarker,
  parseAccountReviewReceiptMarker,
} from "../pr-review/account-fallback.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const POLICY = JSON.parse(readFileSync(resolve(ROOT, "config/agent-workflow.json"), "utf8"));

/** Leveransgrenen som review-window observerar. `trunk` är produktion. */
export function deliveryRef(policy = POLICY) {
  const branch = policy?.deliveryBranch;
  if (branch !== "preview") {
    throw new Error("deliveryBranch måste vara preview");
  }
  return branch;
}
const CHECK_NAME = "review-window";
const EXTERNAL_ID_PREFIX = "sajtmaskin-trusted-review-window:v1:";
const POLL_SECONDS = 20;
const MAX_PROVENANCE_ATTEMPTS = 20;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const epoch = (value) => {
  const parsed = Date.parse(value ?? "");
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
};
const iso = (seconds) => new Date(seconds * 1000).toISOString();
const matchesAny = (name, patterns) =>
  patterns.some((pattern) => name.toLowerCase().includes(pattern.toLowerCase()));

function reviewEvidenceEpoch(review) {
  const submitted = epoch(review.submitted_at);
  const updated = epoch(review.updated_at);
  if (submitted === null || updated === null) return null;
  return Math.max(submitted, updated);
}

function newestByIdentity(runs) {
  const newest = new Map();
  for (const run of runs) {
    const key = `${run.app?.id ?? run.app?.slug ?? "unknown"}:${run.name}`;
    const previous = newest.get(key);
    // CheckRun saknar ett serverbundet created_at. För kanoniska Actions-jobb
    // kommer ordningen därför från det live-verifierade WorkflowRun/Job-objektet.
    // Externa GitHub-appar hålls separata av app-id och används bara som review-
    // kvitton/veton, aldrig som required core-checkar.
    const runTime =
      epoch(
        run.provenance?.workflowRun?.created_at ??
          run.provenance?.job?.started_at ??
          run.completed_at ??
          run.started_at,
      ) ?? 0;
    const previousTime =
      epoch(
        previous?.provenance?.workflowRun?.created_at ??
          previous?.provenance?.job?.started_at ??
          previous?.completed_at ??
          previous?.started_at,
      ) ?? 0;
    if (!previous || runTime > previousTime || (runTime === previousTime && run.id > previous.id)) {
      newest.set(key, run);
    }
  }
  return [...newest.values()];
}

/**
 * Pure check-run decision used by both the live controller and unit tests.
 * Core required checks are only trusted from GitHub Actions; external review
 * receipts and security vetoes retain their own GitHub App identity.
 */
export function evaluateHeadChecks(
  checkRuns,
  policy = POLICY,
  trustedReview = { valid: false, completedAtEpoch: 0 },
) {
  const runs = checkRuns.filter(
    (run) => !(run.name === CHECK_NAME && run.external_id?.startsWith(EXTERNAL_ID_PREFIX)),
  );
  const requiredNames = policy.requiredChecks.filter((name) => name !== CHECK_NAME);
  const requiredNameSet = new Set(requiredNames);
  const requiredCollisions = runs.filter(
    (run) =>
      requiredNameSet.has(run.name) &&
      run.provenance?.collision === true &&
      run.provenance?.kind !== "stale-workflow-job",
  );
  const trustedRequiredRuns = newestByIdentity(
    runs.filter((run) => requiredNameSet.has(run.name) && run.provenance?.valid === true),
  );
  const required = requiredNames.map((name) => ({
    name,
    run: trustedRequiredRuns.find((candidate) => candidate.name === name),
  }));

  // Ett vanligt PR-head-jobb kan välja samma namn som reviewkvittot och får
  // automatiskt samma github-actions-app. Bara externa appar räknas här;
  // den egna PR AI-reviewn verifieras i stället från live state + review-ID.
  const qualifyingCandidates = runs.filter((run) =>
    matchesAny(run.name ?? "", policy.review.qualifyingCheckPatterns),
  );
  const qualifying = newestByIdentity(
    qualifyingCandidates.filter((run) => run.app?.slug !== "github-actions"),
  );
  const reviewJobCollisions = qualifyingCandidates.filter(
    (run) =>
      run.app?.slug === "github-actions" &&
      run.provenance?.collision === true &&
      run.provenance?.kind !== "stale-workflow-job",
  );
  const identityCollisions = [...requiredCollisions, ...reviewJobCollisions];
  const security = newestByIdentity(runs).filter((run) =>
    matchesAny(run.name ?? "", policy.review.securityVetoCheckPatterns),
  );
  // Deployment checks are exact optional names: absent is valid, but a
  // present pending/failed deployment blocks. Substring matching here would
  // incorrectly classify e.g. "Vercel Agent Review" as a deployment.
  const deploymentNames = new Set(policy.review.deploymentCheckNames ?? []);
  const deployments = newestByIdentity(runs).filter((run) => deploymentNames.has(run.name ?? ""));

  const externalCompletedSuccess = qualifying.filter(
    (run) =>
      run.status === "completed" &&
      run.conclusion === "success",
  ).length;
  const completedSuccess = externalCompletedSuccess + (trustedReview.valid ? 1 : 0);
  const qualifyingPending = qualifying.filter((run) => run.status !== "completed").length;
  const securityPending = security.filter((run) => run.status !== "completed").length;
  const securityFailed = security.filter(
    (run) => run.status === "completed" && run.conclusion !== "success",
  ).length;
  const deploymentPending = deployments.filter((run) => run.status !== "completed").length;
  const deploymentFailed = deployments.filter(
    (run) => run.status === "completed" && run.conclusion !== "success",
  ).length;
  const requiredMissing = required.filter(({ run }) => !run).map(({ name }) => name);
  const requiredPending = required
    .filter(({ run }) => run && run.status !== "completed")
    .map(({ name }) => name);
  const requiredFailed = required
    .filter(({ run }) => run?.status === "completed" && run.conclusion !== "success")
    .map(({ name }) => name);

  let latestCompletionEpoch = 0;
  let completionTimesValid = true;
  const timingRuns = new Set([
    ...qualifying,
    ...security,
    ...deployments,
    ...required.map(({ run }) => run).filter(Boolean),
  ]);
  for (const run of timingRuns) {
    if (run.status !== "completed") continue;
    const completed = epoch(run.provenance?.job?.completed_at ?? run.completed_at);
    if (completed === null) completionTimesValid = false;
    else latestCompletionEpoch = Math.max(latestCompletionEpoch, completed);
  }
  if (trustedReview.valid) {
    if (
      !Number.isSafeInteger(trustedReview.completedAtEpoch) ||
      trustedReview.completedAtEpoch <= 0
    ) {
      completionTimesValid = false;
    } else {
      latestCompletionEpoch = Math.max(latestCompletionEpoch, trustedReview.completedAtEpoch);
    }
  }

  // CheckRun REST har inget run-level created_at. Sjuminutersgolvet kommer
  // därför från den bevisade CI WorkflowRun-resursens server-created_at.
  let latestRequiredCreatedEpoch = 0;
  let requiredCreatedTimesValid = true;
  for (const { run } of required) {
    if (!run) continue;
    const created = epoch(run.provenance?.workflowRun?.created_at);
    if (created === null) requiredCreatedTimesValid = false;
    else latestRequiredCreatedEpoch = Math.max(latestRequiredCreatedEpoch, created);
  }

  return {
    // Cursor-/Codex-/bugbot-kvitton noteras men blockerar inte. Neutral är
    // inte en utförd review och får aldrig räknas som success. En Cloud Agent
    // som 404:ar eller hoppas över ska inte hålla review-window röd. Säkerhet,
    // Vercel och namnkollisioner spärrar fortfarande.
    botsDone:
      securityPending === 0 &&
      securityFailed === 0 &&
      deploymentPending === 0 &&
      deploymentFailed === 0 &&
      identityCollisions.length === 0 &&
      completionTimesValid,
    requiredDone:
      requiredMissing.length === 0 &&
      requiredPending.length === 0 &&
      requiredFailed.length === 0 &&
      requiredCollisions.length === 0 &&
      requiredCreatedTimesValid,
    completedSuccess,
    qualifyingPending,
    securityPending,
    securityFailed,
    deploymentPending,
    deploymentFailed,
    requiredMissing,
    requiredPending,
    requiredFailed,
    requiredCollisions: requiredCollisions.map((run) => run.name),
    reviewJobCollisions: reviewJobCollisions.map((run) => run.name),
    identityCollisions: identityCollisions.map((run) => run.name),
    completionTimesValid,
    latestCompletionEpoch,
    requiredCreatedTimesValid,
    latestRequiredCreatedEpoch,
  };
}

/** Latest bot finding that a human sign-off must be newer than. */
export function latestInvalidatingFindingEpoch({ issueComments, reviews, reviewComments }) {
  const events = [
    ...issueComments.map((comment) => ({
      eventName: "issue_comment",
      senderLogin: comment.user?.login,
      senderType: comment.user?.type,
      eventBody: comment.body,
      createdAt: comment.updated_at ?? comment.created_at,
    })),
    ...reviews.map((review) => ({
      eventName: "pull_request_review",
      senderLogin: review.user?.login,
      senderType: review.user?.type,
      eventBody: review.body,
      createdAt: reviewEvidenceEpoch(review) === null ? null : iso(reviewEvidenceEpoch(review)),
    })),
    ...reviewComments.map((comment) => ({
      eventName: "pull_request_review_comment",
      senderLogin: comment.user?.login,
      senderType: comment.user?.type,
      eventBody: comment.body,
      createdAt: comment.updated_at ?? comment.created_at,
    })),
  ];

  let latest = 0;
  for (const event of events) {
    if (!isInvalidatingBotEvent(event)) continue;
    const at = epoch(event.createdAt);
    // Ett botfynd utan verifierbar serverside-tid är ett kontraktsfel, inte
    // något som får falla bort ur sign-off-ordningen.
    if (at === null) return { valid: false, latestEpoch: 0 };
    latest = Math.max(latest, at);
  }
  return { valid: true, latestEpoch: latest };
}

/**
 * Verifiera den egna PR AI-reviewn från två separata live-resurser: den
 * beständiga state-kommentaren och det publicerade review-ID:t på exakt head.
 * Ett checknamn från github-actions är avsiktligt aldrig kvittot.
 */
function validateInternalPrAiEvidence({
  issueComments,
  reviews,
  headSha,
  repository,
  prNumber,
  policy = POLICY,
}) {
  const candidates = issueComments
    .filter(
      (comment) =>
        comment.user?.login === "github-actions[bot]" &&
        comment.user?.type === "Bot" &&
        parseStateComment(comment.body),
    )
    .sort(
      (left, right) =>
        (epoch(right.updated_at ?? right.created_at) ?? 0) -
        (epoch(left.updated_at ?? left.created_at) ?? 0),
    );
  const stateComment = candidates[0];
  const state = parseStateComment(stateComment?.body);
  if (!state) return { valid: false, reason: "betrodd PR AI-state saknas", completedAtEpoch: 0 };
  if (
    state.repository !== repository ||
    Number(state.prNumber) !== Number(prNumber) ||
    state.baseBranch !== deliveryRef(policy)
  ) {
    return {
      valid: false,
      reason: "PR AI-state hör till fel repository/PR/base",
      completedAtEpoch: 0,
    };
  }
  if (
    state.exhaustiveReviewCompleted !== true ||
    state.latestProcessedHeadSha !== headSha ||
    state.lastRun?.kind !== "exhaustive" ||
    state.lastRun?.status !== "completed" ||
    state.lastRun?.headSha !== headSha ||
    !Number.isSafeInteger(state.github?.exhaustiveReviewId) ||
    state.github.exhaustiveReviewId <= 0
  ) {
    return {
      valid: false,
      reason: "PR AI-state saknar full review av live head",
      completedAtEpoch: 0,
    };
  }
  const review = reviews.find(
    (candidate) => Number(candidate.id) === Number(state.github.exhaustiveReviewId),
  );
  const marker = decodeMarker(review?.body, EXHAUSTIVE_MARKER_PREFIX);
  if (
    !review ||
    review.user?.login !== "github-actions[bot]" ||
    review.user?.type !== "Bot" ||
    review.state === "DISMISSED" ||
    review.commit_id !== headSha ||
    marker?.headSha !== headSha ||
    !Array.isArray(marker?.findings) ||
    !Array.isArray(marker?.resolutionLedger)
  ) {
    return {
      valid: false,
      reason: "PR AI-review-ID:t bevisar inte live head",
      completedAtEpoch: 0,
    };
  }
  const stateEpoch = epoch(stateComment.updated_at ?? stateComment.created_at);
  const reviewEpoch = reviewEvidenceEpoch(review);
  if (stateEpoch === null || reviewEpoch === null) {
    return { valid: false, reason: "PR AI-evidens saknar serverside-tid", completedAtEpoch: 0 };
  }
  return {
    valid: true,
    reason: `PR AI-review ${review.id} täcker live head ${headSha.slice(0, 7)}`,
    completedAtEpoch: Math.max(stateEpoch, reviewEpoch),
  };
}

const TRUSTED_ACCOUNT_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const TRUSTED_ACCOUNT_FALLBACK_REASONS = new Set(["openai_key_missing", "openai_quota"]);

export function validateAccountPrReviewEvidence({
  issueComments,
  reviews,
  headSha,
  prAuthor = /** @type {{ login?: string; type?: string } | null} */ (null),
  trustedActors = POLICY.review.trustedAccountReviewActors ?? [],
}) {
  const normalizedHead = String(headSha ?? "").toLowerCase();
  const actors = new Set(trustedActors.map((actor) => String(actor).toLowerCase()));
  if (actors.size === 0) {
    return { valid: false, reason: "betrodda konto-reviewers saknas", completedAtEpoch: 0 };
  }
  const fallbackRequest = issueComments
    .map((comment) => ({ comment, marker: parseAccountFallbackRequest(comment.body) }))
    .filter(
      ({ comment, marker }) =>
        marker?.headSha === normalizedHead &&
        TRUSTED_ACCOUNT_FALLBACK_REASONS.has(marker.reason) &&
        comment.user?.login === "github-actions[bot]" &&
        comment.user?.type === "Bot",
    )
    .sort(
      (left, right) =>
        (epoch(right.comment.updated_at ?? right.comment.created_at) ?? 0) -
        (epoch(left.comment.updated_at ?? left.comment.created_at) ?? 0),
    )[0]?.comment;
  const isDependabotPr =
    prAuthor?.login === "dependabot[bot]" && prAuthor?.type === "Bot";
  if (!fallbackRequest && !isDependabotPr) {
    return {
      valid: false,
      reason: "betrodd kontoöverlämning för live head saknas",
      completedAtEpoch: 0,
    };
  }
  const fallbackEpoch = fallbackRequest
    ? epoch(fallbackRequest.updated_at ?? fallbackRequest.created_at)
    : 0;
  if (fallbackEpoch === null) {
    return {
      valid: false,
      reason: "kontoöverlämningen saknar serverside-tid",
      completedAtEpoch: 0,
    };
  }
  const receipts = issueComments
    .map((comment) => ({ comment, marker: parseAccountReviewReceiptMarker(comment.body) }))
    .filter(
      ({ comment, marker }) =>
        marker?.headSha === normalizedHead &&
        comment.user?.type === "User" &&
        actors.has(String(comment.user?.login ?? "").toLowerCase()) &&
        TRUSTED_ACCOUNT_ASSOCIATIONS.has(comment.author_association),
    )
    .sort(
      (left, right) =>
        (epoch(right.comment.updated_at ?? right.comment.created_at) ?? 0) -
        (epoch(left.comment.updated_at ?? left.comment.created_at) ?? 0),
    );

  for (const { comment, marker } of receipts) {
    const review = reviews.find((candidate) => Number(candidate.id) === marker.reviewId);
    const reviewMarker = parseAccountReviewMarker(review?.body);
    const sameActor =
      String(review?.user?.login ?? "").toLowerCase() ===
      String(comment.user?.login ?? "").toLowerCase();
    if (
      !review ||
      review.user?.type !== "User" ||
      !sameActor ||
      !actors.has(String(review.user?.login ?? "").toLowerCase()) ||
      !TRUSTED_ACCOUNT_ASSOCIATIONS.has(review.author_association) ||
      review.state !== "COMMENTED" ||
      String(review.commit_id ?? "").toLowerCase() !== normalizedHead ||
      reviewMarker?.headSha !== normalizedHead ||
      reviewMarker.scope !== "full-current-diff"
    ) {
      continue;
    }
    const receiptEpoch = epoch(comment.updated_at ?? comment.created_at);
    const reviewEpoch = reviewEvidenceEpoch(review);
    if (receiptEpoch === null || reviewEpoch === null) {
      return {
        valid: false,
        reason: "konto-reviewns evidens saknar serverside-tid",
        completedAtEpoch: 0,
      };
    }
    return {
      valid: true,
      reason: `konto-review ${review.id} täcker live head ${normalizedHead.slice(0, 7)}`,
      completedAtEpoch: Math.max(fallbackEpoch, receiptEpoch, reviewEpoch),
    };
  }
  return {
    valid: false,
    reason: "SHA-bundet konto-reviewkvitto saknas",
    completedAtEpoch: 0,
  };
}

export function validateTrustedPrAiEvidence(input) {
  const internal = validateInternalPrAiEvidence(input);
  if (internal.valid) return internal;
  const account = validateAccountPrReviewEvidence({
    ...input,
    trustedActors: input.trustedActors ?? POLICY.review.trustedAccountReviewActors ?? [],
  });
  if (account.valid) return account;
  return {
    valid: false,
    reason: `${internal.reason}; ${account.reason}`,
    completedAtEpoch: 0,
  };
}

export function latestRequiredWorkflowEpoch(checkRuns, fallbackEpoch) {
  const starts = checkRuns
    .filter((run) => run.provenance?.valid === true)
    .map((run) => epoch(run.provenance?.workflowRun?.created_at))
    .filter((value) => value !== null);
  return starts.length > 0 ? Math.max(...starts) : fallbackEpoch;
}

export function hasBaseInvalidation(checkRuns, headSha) {
  const marker = `${EXTERNAL_ID_PREFIX}${headSha}:base-`;
  return checkRuns.some(
    (run) =>
      run.name === CHECK_NAME &&
      run.status === "completed" &&
      run.conclusion === "action_required" &&
      run.external_id?.startsWith(marker),
  );
}

/** Keeps the 600 s bot deadline separate from the recoverable 840 s sign-off deadline. */
export function deadlineDecision({
  elapsed,
  botsReadyBeforeDeadline,
  botsDone,
  maxBotWaitSeconds,
  maxSignoffWaitSeconds,
}) {
  if (elapsed >= maxBotWaitSeconds && (!botsReadyBeforeDeadline || !botsDone)) {
    return "bot-timeout";
  }
  if (elapsed >= maxSignoffWaitSeconds) return "signoff-timeout";
  return "wait";
}

export function targetsDelivery(pr, policy = POLICY) {
  return pr?.base?.ref === deliveryRef(policy);
}

const GATE_PR_ACTIONS = new Set(["opened", "reopened", "synchronize", "ready_for_review"]);

export function shouldRunTrustedGate({
  eventName = "",
  eventAction = "",
  draft = false,
  gateRefresh = false,
} = {}) {
  if (eventName === "workflow_dispatch") {
    if (draft) return { run: false, reason: "draft" };
    return { run: true, reason: "workflow_dispatch" };
  }
  if (eventName === "issue_comment") {
    if (gateRefresh && eventAction === "created") {
      if (draft) return { run: false, reason: "draft" };
      return { run: true, reason: "gate_refresh" };
    }
    return { run: false, reason: "comment" };
  }
  if (draft && eventAction !== "ready_for_review") return { run: false, reason: "draft" };
  if (!eventName) return { run: true, reason: "unspecified" };
  if (eventName === "pull_request_target" || eventName === "pull_request") {
    if (!GATE_PR_ACTIONS.has(eventAction)) {
      return { run: false, reason: `event ${eventAction || "unknown"}` };
    }
    return { run: true, reason: eventAction };
  }
  return { run: false, reason: `event ${eventName}` };
}

export function isIntegrityGateFailure(reason) {
  const text = String(reason ?? "");
  return (
    text.includes("filistan kunde inte verifieras") ||
    text.includes("explicit bootstrap") ||
    text.includes("workflow-/filunderlaget") ||
    text.includes("checknamnskollision") ||
    text.includes("saknar verifierbar created_at") ||
    text.includes("completed_at saknas")
  );
}

export function reviewMutationRequiresNewSignoff(eventName, eventAction) {
  return eventName === "pull_request_review" && ["edited", "dismissed"].includes(eventAction);
}

export function createClient({ repository, token, fetchImpl = fetch }) {
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) throw new Error(`Ogiltigt repository: ${repository}`);
  const root = `https://api.github.com/repos/${owner}/${repo}`;

  async function request(path, { method = "GET", body } = {}) {
    const response = await fetchImpl(path.startsWith("http") ? path : `${root}${path}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "sajtmaskin-trusted-review-window",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub ${method} ${path} -> ${response.status}: ${text.slice(0, 300)}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async function paginate(path, key = null) {
    const all = [];
    for (let page = 1; ; page += 1) {
      const separator = path.includes("?") ? "&" : "?";
      const payload = await request(`${path}${separator}per_page=100&page=${page}`);
      const values = key ? payload[key] : payload;
      all.push(...values);
      if (values.length < 100) return all;
    }
  }

  async function graphql(query, variables) {
    const response = await fetchImpl("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "sajtmaskin-trusted-review-window",
      },
      body: JSON.stringify({ query, variables }),
    });
    const payload = await response.json();
    if (!response.ok || payload.errors?.length > 0) {
      const details = payload.errors?.map((error) => error.message).join("; ") ?? "unknown error";
      throw new Error(`GitHub GraphQL -> ${response.status}: ${details.slice(0, 500)}`);
    }
    return payload.data;
  }

  async function listReviewsWithServerTimes(prNumber) {
    const query = `
      query SajtmaskinPullRequestReviews(
        $owner: String!
        $repo: String!
        $number: Int!
        $cursor: String
      ) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $number) {
            reviews(first: 100, after: $cursor) {
              totalCount
              nodes {
                id
                fullDatabaseId
                body
                state
                submittedAt
                updatedAt
                authorAssociation
                author { login __typename }
                commit { oid }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      }
    `;
    const nodes = [];
    let cursor = null;
    let expectedTotal = null;
    const seenCursors = new Set();
    while (true) {
      const data = await graphql(query, { owner, repo, number: prNumber, cursor });
      const connection = data?.repository?.pullRequest?.reviews;
      if (!connection || !Array.isArray(connection.nodes)) {
        throw new Error("GitHub GraphQL saknar komplett PR-review-connection");
      }
      if (!Number.isSafeInteger(connection.totalCount) || connection.totalCount < 0) {
        throw new Error("GitHub GraphQL saknar verifierbart review-antal");
      }
      expectedTotal ??= connection.totalCount;
      if (expectedTotal !== connection.totalCount) {
        throw new Error("PR-review-antal ändrades under GraphQL-paginering");
      }
      nodes.push(...connection.nodes);
      if (!connection.pageInfo?.hasNextPage) break;
      if (typeof connection.pageInfo.endCursor !== "string") {
        throw new Error("GitHub GraphQL review-paginering saknar cursor");
      }
      if (seenCursors.has(connection.pageInfo.endCursor)) {
        throw new Error("GitHub GraphQL review-paginering upprepade samma cursor");
      }
      seenCursors.add(connection.pageInfo.endCursor);
      cursor = connection.pageInfo.endCursor;
    }
    if (nodes.length !== expectedTotal) {
      throw new Error(`PR-review-listan är ofullständig: ${nodes.length}/${expectedTotal}`);
    }
    const seen = new Set();
    return nodes.map((node) => {
      const id = Number(node.fullDatabaseId);
      if (
        !Number.isSafeInteger(id) ||
        id <= 0 ||
        seen.has(id) ||
        epoch(node.submittedAt) === null ||
        epoch(node.updatedAt) === null ||
        typeof node.author?.login !== "string" ||
        node.author.login.trim() === "" ||
        !["User", "Bot"].includes(node.author.__typename)
      ) {
        throw new Error(
          "PR-review saknar unik identitet, verifierbar författare eller serverbunden submit/update-tid",
        );
      }
      seen.add(id);
      const actorLogin = node.author.login.trim();
      const normalizedLogin =
        node.author.__typename === "Bot" && !actorLogin.toLowerCase().endsWith("[bot]")
          ? `${actorLogin}[bot]`
          : actorLogin;
      return {
        id,
        node_id: node.id,
        body: node.body,
        state: node.state,
        commit_id: node.commit?.oid ?? null,
        submitted_at: node.submittedAt,
        updated_at: node.updatedAt,
        author_association: node.authorAssociation,
        user: {
          // GraphQL Bot.login är appsluggen (t.ex. `github-actions`) medan
          // REST-resurserna använder `github-actions[bot]`. Normalisera exakt
          // vid API-gränsen så samma aktör inte får två identiteter i evidensen.
          login: normalizedLogin,
          type: node.author?.__typename === "Bot" ? "Bot" : "User",
        },
      };
    });
  }

  return { request, paginate, listReviewsWithServerTimes, repository };
}

async function listCheckRuns(client, sha) {
  return client.paginate(`/commits/${sha}/check-runs?filter=all`, "check_runs");
}

function normalizedWorkflowPath(path) {
  return String(path ?? "").split("@")[0];
}

function checkRunIdFromUrl(url) {
  const match = /\/check-runs\/(\d+)$/.exec(String(url ?? ""));
  return match ? Number(match[1]) : null;
}

function ownedWorkflowKey(spec) {
  return `${normalizedWorkflowPath(spec?.path)}::${spec?.event ?? ""}`;
}

function workflowFileFromPath(path) {
  return String(path ?? "")
    .split("/")
    .at(-1);
}

function runAssociatedWithCurrentPr(
  run,
  { expectedHeadSha, prNumber, repository, expectedHeadRepository, expectedHeadRef },
) {
  const pullRequests = Array.isArray(run.pull_requests) ? run.pull_requests : [];
  const directAssociation = pullRequests.some(
    (pr) => Number(pr.number) === Number(prNumber) && pr.head?.sha === expectedHeadSha,
  );
  // GitHub kan returnera tom pull_requests för fork-PR-körningar. Då
  // krävs i stället exakt live-bindning till både fork-repo och branch.
  const emptyAssociationFallback =
    pullRequests.length === 0 &&
    typeof expectedHeadRepository === "string" &&
    expectedHeadRepository.length > 0 &&
    typeof expectedHeadRef === "string" &&
    expectedHeadRef.length > 0 &&
    run.head_repository?.full_name === expectedHeadRepository &&
    run.head_branch === expectedHeadRef;
  // Samma-repo draft→ready/cancel-in-progress lämnar ofta pull_requests tom
  // på den avbrutna körningen. Den är fortfarande en legitim same-head-run
  // av den deklarerade ägar-workflowen, inte en spoofad namnkollision.
  const sameRepoEmptyAssociation =
    pullRequests.length === 0 &&
    run.repository?.full_name === repository &&
    run.head_sha === expectedHeadSha &&
    (!run.head_repository?.full_name || run.head_repository.full_name === repository);
  return directAssociation || emptyAssociationFallback || sameRepoEmptyAssociation;
}

function ownedWorkflowRunRank(run) {
  const status = String(run.status ?? "");
  const conclusion = String(run.conclusion ?? "");
  if (status === "completed" && conclusion === "success") return 4;
  if (status === "completed" && conclusion !== "cancelled" && conclusion !== "skipped") return 3;
  if (status !== "completed") return 2;
  return 1;
}

function compareOwnedWorkflowRuns(left, right) {
  const time = (epoch(right.created_at) ?? 0) - (epoch(left.created_at) ?? 0);
  if (time) return time;
  const rank = ownedWorkflowRunRank(right) - ownedWorkflowRunRank(left);
  if (rank) return rank;
  return Number(right.id) - Number(left.id);
}

function selectOwnedWorkflowRun(runs) {
  if (!Array.isArray(runs) || runs.length === 0) {
    return { selected: null, ambiguous: false, attemptOverflow: false };
  }
  const selected = [...runs].sort(compareOwnedWorkflowRuns)[0];
  const attemptOverflow = Number(selected?.run_attempt ?? 0) > MAX_PROVENANCE_ATTEMPTS;
  if (!selected || attemptOverflow) {
    return { selected: null, ambiguous: true, attemptOverflow };
  }
  return { selected, ambiguous: false, attemptOverflow: false };
}

function indexSelectedJobs(jobs) {
  const jobsByName = new Map();
  for (const job of jobs) {
    const values = jobsByName.get(job.name) ?? [];
    values.push(job);
    jobsByName.set(job.name, values);
  }
  const selectedJobsByName = new Map();
  const ambiguousJobNames = new Set();
  for (const [name, namedJobs] of jobsByName) {
    const countsByAttempt = new Map();
    for (const job of namedJobs) {
      const attempt = Number(job.provenanceAttempt);
      countsByAttempt.set(attempt, (countsByAttempt.get(attempt) ?? 0) + 1);
    }
    if ([...countsByAttempt.values()].some((count) => count > 1)) {
      ambiguousJobNames.add(name);
    }
    const latestAttempt = Math.max(...namedJobs.map((job) => Number(job.provenanceAttempt)));
    selectedJobsByName.set(
      name,
      namedJobs.filter((job) => Number(job.provenanceAttempt) === latestAttempt),
    );
  }
  return { selectedJobsByName, ambiguousJobNames };
}

async function loadOwnedWorkflowSelection({
  client,
  spec,
  expectedHeadSha,
  prNumber,
  repository,
  expectedHeadRepository,
  expectedHeadRef,
}) {
  const file = spec.file || workflowFileFromPath(spec.path);
  const payload = await client.request(
    `/actions/workflows/${encodeURIComponent(file)}/runs?head_sha=${encodeURIComponent(
      expectedHeadSha,
    )}&exclude_pull_requests=false&per_page=100`,
  );
  // Senaste PR-associerade owned run är trust-rot. Bara en äldre same-repo
  // `push` på samma ägarfil och SHA (preview-tipp som promote-head) läggs i
  // suiteIds och blir stale. workflow_dispatch, schedule och andra event
  // failar closed. Fork-head_repository hålls utanför.
  const ownedHeadRuns = (payload.workflow_runs ?? []).filter(
    (run) =>
      normalizedWorkflowPath(run.path) === spec.path &&
      run.head_sha === expectedHeadSha &&
      run.repository?.full_name === repository &&
      Number.isSafeInteger(Number(run.check_suite_id)) &&
      Number.isSafeInteger(Number(run.run_attempt)) &&
      Number(run.run_attempt) > 0,
  );
  const runs = ownedHeadRuns.filter(
    (run) =>
      run.event === spec.event &&
      runAssociatedWithCurrentPr(run, {
        expectedHeadSha,
        prNumber,
        repository,
        expectedHeadRepository,
        expectedHeadRef,
      }),
  );
  const { selected, ambiguous, attemptOverflow } = selectOwnedWorkflowRun(runs);
  const extraOlderSameRepoPushRuns = selected
    ? ownedHeadRuns.filter((run) => {
        if (run.event !== "push") return false;
        if (run.head_repository?.full_name && run.head_repository.full_name !== repository) {
          return false;
        }
        const pushCreated = epoch(run.created_at);
        const selectedCreated = epoch(selected.created_at);
        return pushCreated !== null && selectedCreated !== null && pushCreated < selectedCreated;
      })
    : [];
  const jobs = selected
    ? (
        await Promise.all(
          Array.from({ length: Number(selected.run_attempt) }, async (_, index) => {
            const attempt = index + 1;
            const attemptJobs = await client.paginate(
              `/actions/runs/${selected.id}/attempts/${attempt}/jobs`,
              "jobs",
            );
            return attemptJobs.map((job) => ({ ...job, provenanceAttempt: attempt }));
          }),
        )
      ).flat()
    : [];
  return {
    spec,
    runs,
    selected,
    ambiguous,
    attemptOverflow,
    jobs,
    ...indexSelectedJobs(jobs),
    suiteIds: new Set(
      [...runs, ...extraOlderSameRepoPushRuns].map((run) => Number(run.check_suite_id)),
    ),
  };
}

function classifyCheckAgainstSelectedRun({
  check,
  selection,
  requiredNames,
  policy,
  canonicalOwner,
}) {
  const selectedRun = selection.selected;
  if (requiredNames.has(check.name)) {
    const owner = requiredCheckOwnerSpec(check.name, policy);
    if (
      normalizedWorkflowPath(selectedRun.path) !== owner.path ||
      selectedRun.event !== owner.event
    ) {
      return {
        kind: "workflow-job",
        valid: false,
        collision: true,
        reason: "check kommer från annan workflow än dess deklarerade ägare",
        workflowRun: selectedRun,
      };
    }
  }
  const matchingJobs = selection.jobs.filter(
    (job) => checkRunIdFromUrl(job.check_run_url) === Number(check.id),
  );
  if (matchingJobs.length !== 1) {
    return {
      kind: matchingJobs.length === 0 ? "unbound-workflow-check" : "ambiguous-workflow-job",
      valid: false,
      collision: requiredNames.has(check.name) || matchingJobs.length > 1,
      reason:
        matchingJobs.length === 0
          ? "check kunde inte bindas till något serververifierat canonical CI-jobb"
          : `check ${check.id} gav ${matchingJobs.length} canonical CI-jobs`,
      workflowRun: selectedRun,
    };
  }
  const job = matchingJobs[0];
  const selectedJobs = selection.selectedJobsByName.get(job.name) ?? [];
  const selectedAttempt = Number(selectedJobs[0]?.provenanceAttempt ?? 0);
  if (selection.ambiguousJobNames.has(job.name)) {
    return {
      kind: "ambiguous-workflow-job",
      valid: false,
      collision: true,
      reason: "ett canonical CI-attempt har flera jobs med samma skyddade namn",
      workflowRun: selectedRun,
      job,
    };
  }
  if (Number(job.provenanceAttempt) < selectedAttempt) {
    return {
      kind: "stale-workflow-job",
      valid: false,
      collision: false,
      reason: "jobbet ersattes av ett senare canonical CI-attempt",
      workflowRun: selectedRun,
      job,
    };
  }
  if (selectedJobs.length !== 1 || selectedJobs[0]?.id !== job.id) {
    return {
      kind: "ambiguous-workflow-job",
      valid: false,
      collision: true,
      reason: "valt CI-attempt har flera jobs med samma skyddade namn",
      workflowRun: selectedRun,
      job,
    };
  }
  const executionBacked = Array.isArray(job.steps) && job.steps.length > 0;
  if (!requiredNames.has(check.name)) {
    return {
      kind: executionBacked ? "workflow-job" : "custom-check",
      valid: false,
      collision: executionBacked,
      reason: executionBacked
        ? "ett Actions-jobb återanvänder ett reserverat reviewkvittonamn"
        : "custom review-check är endast UX; live state + review-ID krävs",
      workflowRun: selectedRun,
      job,
    };
  }
  const jobMatches =
    executionBacked &&
    job.name === check.name &&
    job.status === check.status &&
    (job.conclusion ?? null) === (check.conclusion ?? null) &&
    job.started_at === check.started_at &&
    (job.completed_at ?? null) === (check.completed_at ?? null);
  const owner = requiredCheckOwnerSpec(check.name, policy);
  const isCanonicalOwner =
    normalizedWorkflowPath(owner.path) === normalizedWorkflowPath(canonicalOwner?.path) &&
    owner.event === canonicalOwner?.event;
  return {
    kind: "workflow-job",
    valid: jobMatches,
    collision: !jobMatches,
    reason: jobMatches
      ? isCanonicalOwner
        ? "latest canonical CI workflow/job"
        : "latest owned required-check workflow/job"
      : isCanonicalOwner
        ? "check/job är inte senaste identiska canonical CI-försöket"
        : "check/job är inte senaste identiska owned workflow-försöket",
    workflowRun: selectedRun,
    job,
  };
}

/**
 * Bind varje relevant github-actions-check till den serverägda WorkflowRun och
 * Job som faktiskt skapade den. Checknamn/app-id ensamt är aldrig proveniens.
 */
export async function enrichCheckRunProvenance({
  client,
  checkRuns,
  expectedHeadSha,
  expectedHeadRepository = "",
  expectedHeadRef = "",
  prNumber,
  repository,
  policy = POLICY,
}) {
  const requiredNames = new Set(policy.requiredChecks.filter((name) => name !== CHECK_NAME));
  const relevant = checkRuns.filter(
    (run) =>
      run.app?.slug === "github-actions" &&
      (requiredNames.has(run.name) ||
        matchesAny(run.name ?? "", policy.review.qualifyingCheckPatterns)),
  );
  const provenanceByCheckId = new Map();
  for (const run of relevant) {
    const suiteId = Number(run.check_suite?.id);
    if (!Number.isSafeInteger(suiteId) || suiteId <= 0) {
      provenanceByCheckId.set(run.id, {
        kind: "unknown",
        valid: false,
        collision: true,
        reason: "check_suite.id saknas",
      });
    }
  }

  const canonicalOwner = policy.review.requiredCheckWorkflow;
  const ownerSpecs = new Map();
  ownerSpecs.set(ownedWorkflowKey(canonicalOwner), {
    path: canonicalOwner.path,
    event: canonicalOwner.event,
    file: workflowFileFromPath(canonicalOwner.path),
  });
  for (const check of relevant) {
    if (!requiredNames.has(check.name)) continue;
    const owner = requiredCheckOwnerSpec(check.name, policy);
    ownerSpecs.set(ownedWorkflowKey(owner), owner);
  }
  const ownerSelections = new Map();
  await Promise.all(
    [...ownerSpecs.values()].map(async (spec) => {
      const selection = await loadOwnedWorkflowSelection({
        client,
        spec,
        expectedHeadSha,
        prNumber,
        repository,
        expectedHeadRepository,
        expectedHeadRef,
      });
      ownerSelections.set(ownedWorkflowKey(spec), selection);
    }),
  );

  const nonCanonicalSuites = new Map();
  for (const check of relevant) {
    const suiteId = Number(check.check_suite?.id);
    if (!Number.isSafeInteger(suiteId) || suiteId <= 0) continue;
    const owner = requiredNames.has(check.name)
      ? requiredCheckOwnerSpec(check.name, policy)
      : canonicalOwner;
    const selection = ownerSelections.get(ownedWorkflowKey(owner));
    if (selection?.selected && suiteId === Number(selection.selected.check_suite_id)) {
      provenanceByCheckId.set(
        check.id,
        classifyCheckAgainstSelectedRun({
          check,
          selection,
          requiredNames,
          policy,
          canonicalOwner,
        }),
      );
      continue;
    }
    if (selection?.suiteIds.has(suiteId)) {
      provenanceByCheckId.set(check.id, {
        kind: selection.ambiguous ? "ambiguous-workflow-run" : "stale-workflow-job",
        valid: false,
        collision: selection.ambiguous,
        reason: selection.ambiguous
          ? selection.attemptOverflow
            ? `owned workflow-run har fler än ${MAX_PROVENANCE_ATTEMPTS} attempts; skapa en ny head`
            : "flera owned workflow-runs kunde inte skiljas på samma head"
          : "äldre eller avbruten owned workflow-run ersatt av en senare run på samma head",
      });
      continue;
    }
    const values = nonCanonicalSuites.get(suiteId) ?? [];
    values.push(check);
    nonCanonicalSuites.set(suiteId, values);
  }

  await Promise.all(
    [...nonCanonicalSuites.entries()].map(async ([suiteId, suiteChecks]) => {
      const payload = await client.request(
        `/actions/runs?check_suite_id=${suiteId}&exclude_pull_requests=false&per_page=100`,
      );
      const workflowRuns = (payload.workflow_runs ?? []).filter(
        (run) => Number(run.check_suite_id) === suiteId,
      );
      if (workflowRuns.length !== 1) {
        for (const check of suiteChecks) {
          provenanceByCheckId.set(check.id, {
            kind: workflowRuns.length === 0 ? "custom-check" : "workflow-job",
            valid: false,
            collision:
              requiredNames.has(check.name) ||
              workflowRuns.length > 0 ||
              check.name !== "trusted-pr-ai-review",
            reason: `check suite ${suiteId} gav ${workflowRuns.length} workflow runs`,
          });
        }
        return;
      }
      const workflowRun = workflowRuns[0];
      const runAttempts = Number(workflowRun.run_attempt);
      if (
        !Number.isSafeInteger(runAttempts) ||
        runAttempts <= 0 ||
        runAttempts > MAX_PROVENANCE_ATTEMPTS
      ) {
        for (const check of suiteChecks) {
          provenanceByCheckId.set(check.id, {
            kind: "ambiguous-workflow-run",
            valid: false,
            collision: true,
            reason: `non-canonical workflow run har ogiltigt antal attempts: ${workflowRun.run_attempt}`,
            workflowRun,
          });
        }
        return;
      }
      const workflowJobs = (
        await Promise.all(
          Array.from({ length: runAttempts }, async (_, index) => {
            const attempt = index + 1;
            const jobs = await client.paginate(
              `/actions/runs/${workflowRun.id}/attempts/${attempt}/jobs`,
              "jobs",
            );
            return jobs.map((job) => ({ ...job, provenanceAttempt: attempt }));
          }),
        )
      ).flat();
      for (const check of suiteChecks) {
        const matchingJobs = workflowJobs.filter(
          (job) => checkRunIdFromUrl(job.check_run_url) === Number(check.id),
        );
        if (matchingJobs.length === 0 && check.name === "trusted-pr-ai-review") {
          provenanceByCheckId.set(check.id, {
            kind: "custom-check",
            valid: false,
            collision: false,
            reason: "custom review-check är endast UX; live state + review-ID krävs",
            workflowRun,
          });
          continue;
        }
        if (matchingJobs.length !== 1) {
          provenanceByCheckId.set(check.id, {
            kind: matchingJobs.length === 0 ? "unbound-workflow-check" : "ambiguous-workflow-job",
            valid: false,
            collision: true,
            reason:
              matchingJobs.length === 0
                ? "non-canonical check kunde inte bevisas vara det interna reviewkvittot"
                : `check ${check.id} gav ${matchingJobs.length} non-canonical workflow-jobs`,
            workflowRun,
          });
          continue;
        }
        const job = matchingJobs[0];
        const executionBacked = Array.isArray(job.steps) && job.steps.length > 0;
        if (check.name === "trusted-pr-ai-review" && !executionBacked) {
          provenanceByCheckId.set(check.id, {
            kind: "custom-check",
            valid: false,
            collision: false,
            reason: "step-less custom review-check är endast UX; live state + review-ID krävs",
            workflowRun,
            job,
          });
          continue;
        }
        const owner = requiredNames.has(check.name)
          ? requiredCheckOwnerSpec(check.name, policy)
          : null;
        const canonicalOwner = policy.review?.requiredCheckWorkflow;
        const isExternalOwner =
          Boolean(owner) &&
          (owner.path !== canonicalOwner?.path || owner.event !== canonicalOwner?.event);
        const ownedHere =
          isExternalOwner &&
          normalizedWorkflowPath(workflowRun.path) === owner.path &&
          workflowRun.event === owner.event &&
          workflowRun.head_sha === expectedHeadSha &&
          workflowRun.repository?.full_name === repository;
        if (ownedHere) {
          const jobMatches =
            executionBacked &&
            job.name === check.name &&
            job.status === check.status &&
            (job.conclusion ?? null) === (check.conclusion ?? null) &&
            job.started_at === check.started_at &&
            (job.completed_at ?? null) === (check.completed_at ?? null);
          provenanceByCheckId.set(check.id, {
            kind: "workflow-job",
            valid: jobMatches,
            collision: !jobMatches,
            reason: jobMatches
              ? "latest owned required-check workflow/job"
              : "check/job är inte senaste identiska owned workflow-försöket",
            workflowRun,
            job,
          });
          continue;
        }
        provenanceByCheckId.set(check.id, {
          kind: "workflow-job",
          valid: false,
          collision: true,
          reason: requiredNames.has(check.name)
            ? "check kommer från annan workflow än dess deklarerade ägare"
            : "check kommer från annan workflow/event/head än senaste canonical CI",
          workflowRun,
          job,
        });
      }
    }),
  );

  return checkRuns.map((run) => ({
    ...run,
    ...(provenanceByCheckId.has(run.id) ? { provenance: provenanceByCheckId.get(run.id) } : {}),
  }));
}

async function createGateCheck(client, headSha, nowEpoch) {
  return client.request("/check-runs", {
    method: "POST",
    body: {
      name: CHECK_NAME,
      head_sha: headSha,
      external_id: `${EXTERNAL_ID_PREFIX}${headSha}:${nowEpoch}`,
      status: "in_progress",
      started_at: iso(nowEpoch),
      output: {
        title: "Betrodd review- och freshness-grind kör",
        summary: "Väntar på övriga required checks, reviewkvitton och en live head/base-sign-off.",
      },
    },
  });
}

async function completeGateCheck(client, checkId, conclusion, title, summary, nowEpoch) {
  return client.request(`/check-runs/${checkId}`, {
    method: "PATCH",
    body: {
      status: "completed",
      conclusion,
      completed_at: iso(nowEpoch),
      output: { title, summary },
    },
  });
}

async function supersedeRunningChecks(client, runs, currentId, nowEpoch) {
  const stale = runs.filter(
    (run) =>
      run.id !== currentId &&
      run.name === CHECK_NAME &&
      run.external_id?.startsWith(EXTERNAL_ID_PREFIX) &&
      run.status !== "completed",
  );
  await Promise.all(
    stale.map((run) =>
      completeGateCheck(
        client,
        run.id,
        "neutral",
        "Ersatt av ny betrodd körning",
        `Check run ${currentId} validerar samma head med nyare live-data.`,
        nowEpoch,
      ),
    ),
  );
}

async function readLiveEvidence(
  client,
  prNumber,
  expectedHeadSha,
  policy,
  { fileCache = null, refreshFiles = false } = {},
) {
  const pr = await client.request(`/pulls/${prNumber}`);
  if (pr.head.sha.toLowerCase() !== expectedHeadSha.toLowerCase()) {
    return { staleHead: true, pr };
  }
  if (pr.base.ref !== deliveryRef(policy)) {
    return { staleHead: false, wrongBase: true, pr };
  }
  const basePath = pr.base.ref
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const baseRef = await client.request(`/git/ref/heads/${basePath}`);
  const baseSha = baseRef.object?.sha ?? "";
  const comparison = await client.request(`/compare/${baseSha}...${expectedHeadSha}`);
  const baseIsAncestor =
    ["ahead", "identical"].includes(comparison.status) &&
    comparison.merge_base_commit?.sha?.toLowerCase() === baseSha.toLowerCase();
  // PR-filistan är immutable för en given head-SHA. Den kan vara upp till
  // tusentals poster, så pollingloopen läser den en gång per head och gör en
  // ny serverläsning först i slutbekräftelsen.
  const cachedFiles =
    !refreshFiles && fileCache?.headSha === expectedHeadSha ? fileCache.prFiles : null;
  const [issueComments, reviews, reviewComments, prFiles] = await Promise.all([
    client.paginate(`/issues/${prNumber}/comments`),
    client.listReviewsWithServerTimes(prNumber),
    client.paginate(`/pulls/${prNumber}/comments`),
    cachedFiles ?? client.paginate(`/pulls/${prNumber}/files`),
  ]);
  const prFilenames = prFiles.map((file) => file.filename);
  const fileUniverseComplete =
    Number.isSafeInteger(pr.changed_files) &&
    pr.changed_files === prFiles.length &&
    prFilenames.every((path) => typeof path === "string" && path.length > 0) &&
    new Set(prFilenames).size === prFilenames.length;
  const manualMergeFiles = prFiles
    .flatMap((file) => [file.filename, file.previous_filename])
    .filter((path) => typeof path === "string")
    .filter((path) =>
      policyPathStartsWithAny(path, policy.manualMergePathPrefixes ?? [".github/workflows/"]),
    );
  return {
    staleHead: false,
    wrongBase: false,
    pr,
    baseSha,
    baseIsAncestor,
    issueComments,
    reviews,
    reviewComments,
    prFiles,
    fileUniverseComplete,
    manualMergeFiles: [...new Set(manualMergeFiles)],
    fileCache: fileUniverseComplete ? { headSha: expectedHeadSha, prFiles } : null,
  };
}

function policyPathStartsWithAny(path, prefixes) {
  return prefixes.some((prefix) => String(path).startsWith(prefix));
}

function failureSummary(state, freshnessReason) {
  if (state.identityCollisions?.length > 0) {
    return `checknamnskollision utan betrodd proveniens: ${state.identityCollisions.join(", ")}`;
  }
  if (state.securityFailed > 0) return `${state.securityFailed} säkerhetsskannrar är röda`;
  if (state.securityPending > 0) return `${state.securityPending} säkerhetsskannrar är pending`;
  if (state.deploymentFailed > 0) return `${state.deploymentFailed} deployments är röda`;
  if (state.deploymentPending > 0) return `${state.deploymentPending} deployments är pending`;
  if (state.requiredMissing.length > 0)
    return `required checks saknas: ${state.requiredMissing.join(", ")}`;
  if (state.requiredPending.length > 0)
    return `required checks är pending: ${state.requiredPending.join(", ")}`;
  if (state.requiredFailed.length > 0)
    return `required checks är röda: ${state.requiredFailed.join(", ")}`;
  if (!state.requiredCreatedTimesValid)
    return "required checks saknar verifierbar created_at från canonical WorkflowRun";
  if (!state.completionTimesValid) return "completed_at saknas för en verifierad check";
  return `merge-ready-beviset är ogiltigt: ${freshnessReason}`;
}

export function gateSuccessReason(state) {
  if ((state?.completedSuccess ?? 0) > 0) {
    return "quality och qualifying reviewkvitto på live head";
  }
  return "quality på live head; reviewkvitto saknas eller hoppades över (noterat, blockerar inte)";
}

export async function runTrustedGate({
  client,
  prNumber,
  now = () => Math.floor(Date.now() / 1000),
  pause = sleep,
  policy = POLICY,
  eventName = "",
  eventAction = "",
  gateRefresh = false,
  invalidateExistingSignoff: _invalidateExistingSignoff = false,
}) {
  const initialPr = await client.request(`/pulls/${prNumber}`);
  if (!targetsDelivery(initialPr, policy)) {
    return { conclusion: "ignored", reason: `base ${initialPr.base?.ref ?? "unknown"}` };
  }
  const gateDecision = shouldRunTrustedGate({
    eventName,
    eventAction,
    draft: Boolean(initialPr.draft),
    gateRefresh,
  });
  if (!gateDecision.run) {
    return { conclusion: "ignored", reason: gateDecision.reason };
  }
  const headSha = initialPr.head.sha;
  const runStarted = now();
  const gate = await createGateCheck(client, headSha, runStarted);
  let finished = false;
  let latestState = evaluateHeadChecks([], policy);
  let latestFreshnessReason = "inte kontrollerad";
  let terminalFailureReason = null;
  let botsReadyBeforeDeadline = false;
  let fileCache = null;

  try {
    let rawRuns = await listCheckRuns(client, headSha);
    await supersedeRunningChecks(client, rawRuns, gate.id, now());

    while (true) {
      const [currentRawRuns, liveEvidence] = await Promise.all([
        listCheckRuns(client, headSha),
        readLiveEvidence(client, prNumber, headSha, policy, { fileCache }),
      ]);
      rawRuns = currentRawRuns;
      if (liveEvidence.fileCache) fileCache = liveEvidence.fileCache;
      const livePr = liveEvidence.pr;
      if (liveEvidence.staleHead) {
        await completeGateCheck(
          client,
          gate.id,
          "neutral",
          "Ersatt av ny head",
          `Live head är nu ${livePr.head.sha}; dess egen trusted review-window tar över.`,
          now(),
        );
        finished = true;
        return { conclusion: "neutral", reason: "head changed" };
      }
      if (liveEvidence.wrongBase || !targetsDelivery(livePr, policy)) {
        await completeGateCheck(
          client,
          gate.id,
          "neutral",
          "PR riktas inte längre mot leveransgrenen",
          `Live base är nu ${livePr.base?.ref ?? "unknown"}.`,
          now(),
        );
        finished = true;
        return { conclusion: "neutral", reason: "base changed" };
      }
      if (!liveEvidence.fileUniverseComplete) {
        terminalFailureReason = "PR-filistan kunde inte verifieras komplett";
        break;
      }
      if (liveEvidence.manualMergeFiles.length > 0) {
        terminalFailureReason = `workflow-infrastruktur kräver explicit bootstrap: ${liveEvidence.manualMergeFiles.join(", ")}`;
        break;
      }

      const runs = await enrichCheckRunProvenance({
        client,
        checkRuns: rawRuns,
        expectedHeadSha: headSha,
        expectedHeadRepository: livePr.head?.repo?.full_name,
        expectedHeadRef: livePr.head?.ref,
        prNumber,
        repository: client.repository,
        policy,
      });
      const trustedReview = validateTrustedPrAiEvidence({
        issueComments: liveEvidence.issueComments,
        reviews: liveEvidence.reviews,
        headSha,
        prAuthor: livePr.user,
        repository: client.repository,
        prNumber,
      });

      const current = now();
      const elapsed = current - runStarted;
      latestState = evaluateHeadChecks(runs, policy, trustedReview);
      if (latestState.requiredFailed.length > 0) {
        break;
      }
      const windowStart = latestState.latestRequiredCreatedEpoch;
      const headAge = windowStart > 0 ? current - windowStart : 0;
      if (hasBaseInvalidation(rawRuns, headSha)) {
        latestFreshnessReason = `${deliveryRef(policy)} har flyttats efter att denna head verifierades`;
        break;
      }
      if (!trustedReview.valid && latestState.completedSuccess === 0) {
        latestFreshnessReason = trustedReview.reason;
      }
      const botsDone = latestState.botsDone && headAge >= policy.review.botSettleSeconds;
      if (botsDone && elapsed < policy.review.maxBotWaitSeconds) {
        botsReadyBeforeDeadline = true;
      }

      const deadline = deadlineDecision({
        elapsed,
        botsReadyBeforeDeadline,
        botsDone,
        maxBotWaitSeconds: policy.review.maxBotWaitSeconds,
        maxSignoffWaitSeconds: policy.review.maxSignoffWaitSeconds,
      });
      if (deadline === "bot-timeout") {
        latestFreshnessReason = "botresultaten verifierades inte före bot-deadline";
        break;
      }

      if (latestState.botsDone && latestState.requiredDone) {
        const [confirmationRawRuns, confirmationEvidence] = await Promise.all([
          listCheckRuns(client, headSha),
          readLiveEvidence(client, prNumber, headSha, policy, {
            fileCache,
            refreshFiles: true,
          }),
        ]);
        const confirmationRuns = await enrichCheckRunProvenance({
          client,
          checkRuns: confirmationRawRuns,
          expectedHeadSha: headSha,
          expectedHeadRepository: confirmationEvidence.pr.head?.repo?.full_name,
          expectedHeadRef: confirmationEvidence.pr.head?.ref,
          prNumber,
          repository: client.repository,
          policy,
        });
        const confirmationReview = validateTrustedPrAiEvidence({
          issueComments: confirmationEvidence.issueComments ?? [],
          reviews: confirmationEvidence.reviews ?? [],
          headSha,
          prAuthor: confirmationEvidence.pr.user,
          repository: client.repository,
          prNumber,
        });
        const confirmationState = evaluateHeadChecks(
          confirmationRuns,
          policy,
          confirmationReview,
        );
        if (confirmationEvidence.staleHead || confirmationEvidence.wrongBase) {
          latestFreshnessReason = "head eller base flyttades under slutvalideringen";
        } else if (
          !confirmationEvidence.fileUniverseComplete ||
          confirmationEvidence.manualMergeFiles.length > 0
        ) {
          latestFreshnessReason = "workflow-/filunderlaget ändrades";
        } else if (
          confirmationState.botsDone &&
          confirmationState.requiredDone &&
          !hasBaseInvalidation(confirmationRawRuns, headSha)
        ) {
          const reason = gateSuccessReason(confirmationState);
          await completeGateCheck(
            client,
            gate.id,
            "success",
            confirmationState.completedSuccess > 0
              ? "Quality godkänd; reviewkvitto noterat"
              : "Quality godkänd; reviewkvitto noterat som saknat",
            `${reason}. merge:ready dokumenterar manuell sign-off; review-window kan bli grön utan den.`,
            now(),
          );
          finished = true;
          return { conclusion: "success", reason };
        } else {
          latestState = confirmationState;
          latestFreshnessReason = failureSummary(confirmationState, trustedReview.reason);
        }
      }

      if (deadline === "signoff-timeout") break;
      const remaining = policy.review.maxSignoffWaitSeconds - elapsed;
      await pause(Math.max(1, Math.min(POLL_SECONDS, remaining)) * 1000);
    }

    const summary = terminalFailureReason ?? failureSummary(latestState, latestFreshnessReason);
    await completeGateCheck(
      client,
      gate.id,
      "action_required",
      "Betrodd review-window blockerar merge",
      summary,
      now(),
    );
    finished = true;
    if (isIntegrityGateFailure(summary)) throw new Error(summary);
    return { conclusion: "action_required", reason: summary };
  } catch (error) {
    if (!finished) {
      try {
        await completeGateCheck(
          client,
          gate.id,
          "action_required",
          "Betrodd review-window kunde inte verifieras",
          error instanceof Error ? error.message.slice(0, 600) : String(error).slice(0, 600),
          now(),
        );
      } catch (completionError) {
        console.error("Kunde inte slutföra required check fail-closed:", completionError);
      }
    }
    throw error;
  }
}

export async function invalidateForBasePush({
  client,
  baseSha,
  now = () => Math.floor(Date.now() / 1000),
  policy = POLICY,
}) {
  const branch = deliveryRef(policy);
  const pulls = await client.paginate(
    `/pulls?state=open&base=${encodeURIComponent(branch)}`,
  );
  const failures = [];
  for (const pr of pulls) {
    // Drafts kan inte mergeas och flera långlivade ägar-/admin-PR:er ska inte
    // muteras av agentautomation. ready_for_review skapar en ny live-check när
    // de faktiskt lämnar draftläget.
    if (pr.draft === true) continue;
    try {
      const summary = `Uppdatera PR-head med ${branch} ${baseSha}, kör om grinden och signera den nya live-basen.`;
      // Skapa alltid en NY, senare check. Att PATCH:a den pågående gate-checken
      // är race-känsligt: gate-jobbet kan annars skriva success efter PATCH:en.
      // Den separata base-markören kan inte skrivas över av den äldre körningen.
      const gate = await client.request("/check-runs", {
        method: "POST",
        body: {
          name: CHECK_NAME,
          head_sha: pr.head.sha,
          external_id: `${EXTERNAL_ID_PREFIX}${pr.head.sha}:base-${baseSha}`,
          status: "completed",
          conclusion: "action_required",
          completed_at: iso(now()),
          output: {
            title: `${branch} har flyttats`,
            summary,
          },
        },
      });
      const checkIds = [gate.id];
      if ((pr.labels ?? []).some((label) => label.name === "merge:ready")) {
        await client.request(`/issues/${pr.number}/labels/merge%3Aready`, { method: "DELETE" });
      }
      console.log(`Blocked ${pr.number} at ${pr.head.sha} with checks ${checkIds.join(",")}`);
    } catch (error) {
      failures.push(`#${pr.number}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length > 0)
    throw new Error(`Base-invalidering misslyckades: ${failures.join("; ")}`);
}

async function main() {
  const mode = process.argv[2] ?? "gate";
  if (!["gate", "invalidate-base"].includes(mode)) {
    throw new Error(`Unsupported mode: ${mode}. Merge utförs manuellt; denna controller kan inte merga.`);
  }
  const repository = process.env.REPO ?? process.env.GITHUB_REPOSITORY ?? "";
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? "";
  if (!repository || !token) throw new Error("REPO/GITHUB_REPOSITORY och GH_TOKEN krävs");
  const client = createClient({ repository, token });
  if (mode === "invalidate-base") {
    const baseSha = process.env.BASE_SHA ?? "";
    if (!/^[0-9a-f]{40}$/i.test(baseSha)) throw new Error("BASE_SHA måste vara exakt 40 hex");
    await invalidateForBasePush({ client, baseSha });
    return;
  }
  const prNumber = Number(process.env.PR_NUMBER);
  if (!Number.isInteger(prNumber) || prNumber <= 0)
    throw new Error("PR_NUMBER måste vara positivt");
  await runTrustedGate({
    client,
    prNumber,
    eventName: process.env.EVENT_NAME ?? "",
    eventAction: process.env.EVENT_ACTION ?? "",
    gateRefresh: process.env.GATE_REFRESH === "1",
    invalidateExistingSignoff: reviewMutationRequiresNewSignoff(
      process.env.EVENT_NAME ?? "",
      process.env.EVENT_ACTION ?? "",
    ),
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
