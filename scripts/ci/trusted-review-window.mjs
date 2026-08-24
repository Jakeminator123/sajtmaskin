#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isInvalidatingBotEvent,
  validateMergeExecuteMandate,
  validateMergeReadySignoff,
} from "./merge-ready-freshness.mjs";
import { decodeMarker, EXHAUSTIVE_MARKER_PREFIX, parseStateComment } from "../pr-review/core.mjs";
import {
  parseAccountReviewMarker,
  parseAccountReviewReceiptMarker,
} from "../pr-review/account-fallback.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const POLICY = JSON.parse(readFileSync(resolve(ROOT, "config/agent-workflow.json"), "utf8"));
const CHECK_NAME = "review-window";
const EXTERNAL_ID_PREFIX = "sajtmaskin-trusted-review-window:v1:";
const POLL_SECONDS = 20;
const MERGE_SETTLE_SECONDS = 5;
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
    (run) => requiredNameSet.has(run.name) && run.provenance?.collision === true,
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
    (run) => run.app?.slug === "github-actions" && run.provenance?.collision === true,
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
    (run) => run.status === "completed" && run.conclusion === "success",
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
    botsDone:
      completedSuccess > 0 &&
      qualifyingPending === 0 &&
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
function validateInternalPrAiEvidence({ issueComments, reviews, headSha, repository, prNumber }) {
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
    state.baseBranch !== "master"
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

export function validateAccountPrReviewEvidence({
  issueComments,
  reviews,
  headSha,
  trustedActors = POLICY.review.trustedAccountReviewActors ?? [],
}) {
  const normalizedHead = String(headSha ?? "").toLowerCase();
  const actors = new Set(trustedActors.map((actor) => String(actor).toLowerCase()));
  if (actors.size === 0) {
    return { valid: false, reason: "betrodda konto-reviewers saknas", completedAtEpoch: 0 };
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
      completedAtEpoch: Math.max(receiptEpoch, reviewEpoch),
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

export function targetsTrunk(pr, policy = POLICY) {
  return pr?.base?.ref === policy.trunk;
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

  const workflowFile = policy.review.requiredCheckWorkflow.path.split("/").at(-1);
  const canonicalPayload = await client.request(
    `/actions/workflows/${encodeURIComponent(workflowFile)}/runs?event=${encodeURIComponent(
      policy.review.requiredCheckWorkflow.event,
    )}&head_sha=${encodeURIComponent(expectedHeadSha)}&exclude_pull_requests=false&per_page=100`,
  );
  const canonicalRuns = (canonicalPayload.workflow_runs ?? [])
    .filter((run) => {
      const pullRequests = Array.isArray(run.pull_requests) ? run.pull_requests : [];
      const directAssociation = pullRequests.some(
        (pr) => Number(pr.number) === Number(prNumber) && pr.head?.sha === expectedHeadSha,
      );
      // GitHub kan returnera tom pull_requests för fork-PR-körningar. Då
      // krävs i stället exakt live-bindning till både fork-repo och branch.
      const emptyAssociationFallback =
        pullRequests.length === 0 &&
        typeof expectedHeadRepository === "string" &&
        typeof expectedHeadRef === "string" &&
        run.head_repository?.full_name === expectedHeadRepository &&
        run.head_branch === expectedHeadRef;
      return (
        normalizedWorkflowPath(run.path) === policy.review.requiredCheckWorkflow.path &&
        run.event === policy.review.requiredCheckWorkflow.event &&
        run.head_sha === expectedHeadSha &&
        run.repository?.full_name === repository &&
        (directAssociation || emptyAssociationFallback) &&
        Number.isSafeInteger(Number(run.check_suite_id)) &&
        Number.isSafeInteger(Number(run.run_attempt)) &&
        Number(run.run_attempt) > 0
      );
    })
    .sort((left, right) => {
      const time = (epoch(right.created_at) ?? 0) - (epoch(left.created_at) ?? 0);
      return time || Number(right.id) - Number(left.id);
    });
  const newestCanonicalCreatedAt = canonicalRuns[0]?.created_at ?? null;
  const newestCanonicalRuns = canonicalRuns.filter(
    (run) => run.created_at === newestCanonicalCreatedAt,
  );
  const selectedCanonicalRun = newestCanonicalRuns.length === 1 ? newestCanonicalRuns[0] : null;
  const canonicalRunAttemptOverflow =
    Number(selectedCanonicalRun?.run_attempt ?? 0) > MAX_PROVENANCE_ATTEMPTS;
  const canonicalRun = canonicalRunAttemptOverflow ? null : selectedCanonicalRun;
  const canonicalRunAmbiguous = canonicalRuns.length > 0 && canonicalRun === null;
  const canonicalSuiteIds = new Set(canonicalRuns.map((run) => Number(run.check_suite_id)));
  const canonicalJobs = canonicalRun
    ? (
        await Promise.all(
          Array.from({ length: Number(canonicalRun.run_attempt) }, async (_, index) => {
            const attempt = index + 1;
            const jobs = await client.paginate(
              `/actions/runs/${canonicalRun.id}/attempts/${attempt}/jobs`,
              "jobs",
            );
            return jobs.map((job) => ({ ...job, provenanceAttempt: attempt }));
          }),
        )
      ).flat()
    : [];
  const jobsByName = new Map();
  for (const job of canonicalJobs) {
    const values = jobsByName.get(job.name) ?? [];
    values.push(job);
    jobsByName.set(job.name, values);
  }
  const selectedJobsByName = new Map();
  const ambiguousJobNames = new Set();
  for (const [name, jobs] of jobsByName) {
    const countsByAttempt = new Map();
    for (const job of jobs) {
      const attempt = Number(job.provenanceAttempt);
      countsByAttempt.set(attempt, (countsByAttempt.get(attempt) ?? 0) + 1);
    }
    if ([...countsByAttempt.values()].some((count) => count > 1)) {
      ambiguousJobNames.add(name);
    }
    const latestAttempt = Math.max(...jobs.map((job) => Number(job.provenanceAttempt)));
    selectedJobsByName.set(
      name,
      jobs.filter((job) => Number(job.provenanceAttempt) === latestAttempt),
    );
  }

  const nonCanonicalSuites = new Map();
  for (const check of relevant) {
    const suiteId = Number(check.check_suite?.id);
    if (!Number.isSafeInteger(suiteId) || suiteId <= 0) continue;
    if (canonicalRun && suiteId === Number(canonicalRun.check_suite_id)) {
      const matchingJobs = canonicalJobs.filter(
        (job) => checkRunIdFromUrl(job.check_run_url) === Number(check.id),
      );
      if (matchingJobs.length !== 1) {
        provenanceByCheckId.set(check.id, {
          kind: matchingJobs.length === 0 ? "unbound-workflow-check" : "ambiguous-workflow-job",
          valid: false,
          collision: requiredNames.has(check.name) || matchingJobs.length > 1,
          reason:
            matchingJobs.length === 0
              ? "check kunde inte bindas till något serververifierat canonical CI-jobb"
              : `check ${check.id} gav ${matchingJobs.length} canonical CI-jobs`,
          workflowRun: canonicalRun,
        });
        continue;
      }
      const job = matchingJobs[0];
      const selectedJobs = selectedJobsByName.get(job.name) ?? [];
      const selectedAttempt = Number(selectedJobs[0]?.provenanceAttempt ?? 0);
      if (ambiguousJobNames.has(job.name)) {
        provenanceByCheckId.set(check.id, {
          kind: "ambiguous-workflow-job",
          valid: false,
          collision: true,
          reason: "ett canonical CI-attempt har flera jobs med samma skyddade namn",
          workflowRun: canonicalRun,
          job,
        });
        continue;
      }
      if (Number(job.provenanceAttempt) < selectedAttempt) {
        provenanceByCheckId.set(check.id, {
          kind: "stale-workflow-job",
          valid: false,
          collision: false,
          reason: "jobbet ersattes av ett senare canonical CI-attempt",
          workflowRun: canonicalRun,
          job,
        });
        continue;
      }
      if (selectedJobs.length !== 1 || selectedJobs[0]?.id !== job.id) {
        provenanceByCheckId.set(check.id, {
          kind: "ambiguous-workflow-job",
          valid: false,
          collision: true,
          reason: "valt CI-attempt har flera jobs med samma skyddade namn",
          workflowRun: canonicalRun,
          job,
        });
        continue;
      }
      const executionBacked = Array.isArray(job.steps) && job.steps.length > 0;
      if (!requiredNames.has(check.name)) {
        provenanceByCheckId.set(check.id, {
          kind: executionBacked ? "workflow-job" : "custom-check",
          valid: false,
          collision: executionBacked,
          reason: executionBacked
            ? "ett Actions-jobb återanvänder ett reserverat reviewkvittonamn"
            : "custom review-check är endast UX; live state + review-ID krävs",
          workflowRun: canonicalRun,
          job,
        });
        continue;
      }
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
          ? "latest canonical CI workflow/job"
          : "check/job är inte senaste identiska canonical CI-försöket",
        workflowRun: canonicalRun,
        job,
      });
      continue;
    }
    if (canonicalSuiteIds.has(suiteId)) {
      provenanceByCheckId.set(check.id, {
        kind: canonicalRunAmbiguous ? "ambiguous-workflow-run" : "stale-workflow-job",
        valid: false,
        collision: canonicalRunAmbiguous,
        reason: canonicalRunAmbiguous
          ? canonicalRunAttemptOverflow
            ? `canonical CI-run har fler än ${MAX_PROVENANCE_ATTEMPTS} attempts; skapa en ny head`
            : "flera canonical CI-runs delar senaste server-created_at"
          : "äldre canonical CI-run ersatt av en nyare run på samma head",
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
        provenanceByCheckId.set(check.id, {
          kind: "workflow-job",
          valid: false,
          collision: true,
          reason: "check kommer från annan workflow/event/head än senaste canonical CI",
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
  if (pr.base.ref !== policy.trunk) {
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

function hashBody(value) {
  return createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

function sortById(values) {
  return [...values].sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0));
}

/**
 * Fingerprint only GitHub-server data that can affect the final merge
 * decision. Bodies are hashed so logs/tests never need to echo review text.
 */
export function mergeEvidenceFingerprint({ evidence, checkRuns, commandComment }) {
  const normalized = {
    pr: {
      number: evidence.pr.number,
      state: evidence.pr.state,
      draft: evidence.pr.draft,
      headSha: evidence.pr.head?.sha,
      baseRef: evidence.pr.base?.ref,
      baseSha: evidence.baseSha,
      baseIsAncestor: evidence.baseIsAncestor,
      labels: (evidence.pr.labels ?? []).map((label) => label.name).sort(),
      fileUniverseComplete: evidence.fileUniverseComplete,
      manualMergeFiles: [...(evidence.manualMergeFiles ?? [])].sort(),
    },
    command: {
      id: commandComment.id,
      createdAt: commandComment.created_at,
      updatedAt: commandComment.updated_at,
      body: hashBody(commandComment.body),
      login: commandComment.user?.login,
      type: commandComment.user?.type,
      association: commandComment.author_association,
    },
    checks: sortById(checkRuns).map((run) => ({
      id: run.id,
      name: run.name,
      status: run.status,
      conclusion: run.conclusion,
      startedAt: run.started_at,
      completedAt: run.completed_at,
      appId: run.app?.id,
      appSlug: run.app?.slug,
      externalId: run.external_id,
      provenance: {
        kind: run.provenance?.kind,
        valid: run.provenance?.valid,
        workflowRunId: run.provenance?.workflowRun?.id,
        workflowPath: run.provenance?.workflowRun?.path,
        workflowEvent: run.provenance?.workflowRun?.event,
        workflowCreatedAt: run.provenance?.workflowRun?.created_at,
        jobId: run.provenance?.job?.id,
        jobCheckRunUrl: run.provenance?.job?.check_run_url,
      },
    })),
    issueComments: sortById(evidence.issueComments).map((comment) => ({
      id: comment.id,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      body: hashBody(comment.body),
      login: comment.user?.login,
      type: comment.user?.type,
      association: comment.author_association,
    })),
    reviews: sortById(evidence.reviews).map((review) => ({
      id: review.id,
      state: review.state,
      submittedAt: review.submitted_at,
      updatedAt: review.updated_at,
      commitId: review.commit_id,
      body: hashBody(review.body),
      login: review.user?.login,
      type: review.user?.type,
    })),
    reviewComments: sortById(evidence.reviewComments).map((comment) => ({
      id: comment.id,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      commitId: comment.commit_id,
      body: hashBody(comment.body),
      login: comment.user?.login,
      type: comment.user?.type,
    })),
  };
  return createHash("sha256").update(JSON.stringify(normalized), "utf8").digest("hex");
}

/** Latest server timestamp for every PR conversation item except the command
 * itself. Missing timestamps fail closed instead of silently dropping data. */
export function latestConversationEpoch(evidence, commandCommentId) {
  const values = [];
  for (const comment of evidence.issueComments) {
    if (Number(comment.id) === Number(commandCommentId)) continue;
    values.push(comment.updated_at ?? comment.created_at);
  }
  for (const review of evidence.reviews) {
    const reviewAt = reviewEvidenceEpoch(review);
    if (reviewAt === null) return { valid: false, latestEpoch: 0 };
    values.push(iso(reviewAt));
  }
  for (const comment of evidence.reviewComments) {
    values.push(comment.updated_at ?? comment.created_at);
  }
  let latest = 0;
  for (const value of values) {
    const parsed = epoch(value);
    if (parsed === null) return { valid: false, latestEpoch: 0 };
    latest = Math.max(latest, parsed);
  }
  return { valid: true, latestEpoch: latest };
}

async function readMergeSnapshot(client, prNumber, commentId, expectedHeadSha, policy) {
  const [commandComment, evidence, rawCheckRuns] = await Promise.all([
    client.request(`/issues/comments/${commentId}`),
    readLiveEvidence(client, prNumber, expectedHeadSha, policy),
    listCheckRuns(client, expectedHeadSha),
  ]);
  const checkRuns = await enrichCheckRunProvenance({
    client,
    checkRuns: rawCheckRuns,
    expectedHeadSha,
    expectedHeadRepository: evidence.pr.head?.repo?.full_name,
    expectedHeadRef: evidence.pr.head?.ref,
    prNumber,
    repository: client.repository,
    policy,
  });
  const trustedReview = validateTrustedPrAiEvidence({
    issueComments: evidence.issueComments ?? [],
    reviews: evidence.reviews ?? [],
    headSha: expectedHeadSha,
    repository: client.repository,
    prNumber,
  });
  return { commandComment, evidence, checkRuns, trustedReview };
}

export function validateMergeSnapshot({
  snapshot,
  prNumber,
  expectedHeadSha,
  expectedBaseSha,
  policy = POLICY,
}) {
  const { commandComment, evidence, checkRuns, trustedReview } = snapshot;
  if (evidence.staleHead || evidence.wrongBase) {
    return { valid: false, reason: "PR-head eller base flyttades" };
  }
  const pr = evidence.pr;
  if (pr.state !== "open" || pr.draft === true) {
    return { valid: false, reason: "PR:n är stängd eller draft" };
  }
  if (!evidence.fileUniverseComplete) {
    return { valid: false, reason: "PR-filistan kunde inte verifieras komplett" };
  }
  if (evidence.manualMergeFiles.length > 0) {
    return {
      valid: false,
      reason: `workflow-infrastruktur kräver explicit bootstrap: ${evidence.manualMergeFiles.join(", ")}`,
    };
  }
  if (!targetsTrunk(pr, policy)) {
    return { valid: false, reason: `PR:n riktas mot ${pr.base?.ref ?? "okänd base"}` };
  }
  if (pr.head?.sha?.toLowerCase() !== expectedHeadSha.toLowerCase()) {
    return { valid: false, reason: "live head matchar inte merge-kommandot" };
  }
  if (
    evidence.baseSha?.toLowerCase() !== expectedBaseSha.toLowerCase() ||
    evidence.baseIsAncestor !== true
  ) {
    return { valid: false, reason: "live master matchar inte kommandot eller saknas i PR-head" };
  }
  if (!String(commandComment.issue_url ?? "").endsWith(`/issues/${prNumber}`)) {
    return { valid: false, reason: "merge-kommentaren hör inte till den aktuella PR:n" };
  }
  if (commandComment.updated_at !== commandComment.created_at) {
    return { valid: false, reason: "merge:execute-kommentaren har redigerats" };
  }
  const mandate = validateMergeExecuteMandate({
    body: commandComment.body ?? "",
    createdAt: commandComment.created_at,
    authorLogin: commandComment.user?.login,
    authorType: commandComment.user?.type,
    authorAssociation: commandComment.author_association,
    headSha: expectedHeadSha,
    baseSha: expectedBaseSha,
  });
  if (!mandate.valid) return mandate;
  if (!(pr.labels ?? []).some((label) => label.name === "merge:ready")) {
    return { valid: false, reason: "merge:ready-label saknas vid final merge" };
  }

  // Lita aldrig på `review-window`-namnet eller external_id som merge-mandat:
  // alla vanliga workflows delar GitHub Actions-appidentitet och en check run-
  // skapare väljer external_id själv. Den betrodda default-branch-controllern
  // återvaliderar därför core-checkar, botar, live sign-off och sjuminutersgolv
  // direkt. GitHubs required check är fortfarande en UX/native branch gate.
  const checks = evaluateHeadChecks(checkRuns, policy, trustedReview);
  if (!checks.botsDone || !checks.requiredDone) {
    return { valid: false, reason: failureSummary(checks, "live merge-evidens är inte klar") };
  }
  const signoffMinimumEpoch = Math.max(
    checks.latestCompletionEpoch,
    checks.latestRequiredCreatedEpoch + Number(policy.review.minHeadAgeSeconds ?? 0),
  );
  const signoff = validateEvidence(evidence, expectedHeadSha, signoffMinimumEpoch);
  if (!signoff.valid) {
    return { valid: false, reason: `live sign-off avvisad: ${signoff.reason}` };
  }
  const commandEpoch = epoch(commandComment.created_at);
  const conversation = latestConversationEpoch(evidence, commandComment.id);
  if (!conversation.valid || commandEpoch === null) {
    return { valid: false, reason: "PR-konversationens serverside-tider kunde inte verifieras" };
  }
  if (commandEpoch <= Math.max(conversation.latestEpoch, checks.latestCompletionEpoch)) {
    return {
      valid: false,
      reason: "merge:execute måste postas strikt efter alla checks, reviews och kommentarer",
    };
  }

  return {
    valid: true,
    reason: mandate.reason,
    fingerprint: mergeEvidenceFingerprint(snapshot),
  };
}

function validateEvidence(evidence, headSha, minimumEpoch) {
  const findings = latestInvalidatingFindingEpoch(evidence);
  if (!findings.valid) return { valid: false, reason: "botfynd saknar verifierbar tid" };
  const effectiveMinimum = Math.max(minimumEpoch, findings.latestEpoch);
  return validateMergeReadySignoff({
    headSha,
    baseSha: evidence.baseSha,
    baseIsAncestor: evidence.baseIsAncestor,
    labels: (evidence.pr.labels ?? []).map((label) => label.name),
    prAuthorLogin: evidence.pr.user?.login,
    minimumSignoffCreatedAt: iso(effectiveMinimum),
    prBody: evidence.pr.body ?? "",
    comments: evidence.issueComments.map((comment) => ({
      body: comment.body ?? "",
      createdAt: comment.created_at,
      authorLogin: comment.user?.login,
      authorType: comment.user?.type,
      authorAssociation: comment.author_association,
    })),
  });
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
  if (state.completedSuccess === 0) return "inget lyckat reviewkvitto för live head";
  if (state.qualifyingPending > 0)
    return `${state.qualifyingPending} reviewkvitton är fortfarande pending`;
  if (!state.completionTimesValid) return "completed_at saknas för en verifierad check";
  return `merge-ready-beviset är ogiltigt: ${freshnessReason}`;
}

export async function runTrustedGate({
  client,
  prNumber,
  now = () => Math.floor(Date.now() / 1000),
  pause = sleep,
  policy = POLICY,
  invalidateExistingSignoff = false,
}) {
  const initialPr = await client.request(`/pulls/${prNumber}`);
  if (!targetsTrunk(initialPr, policy)) {
    return { conclusion: "ignored", reason: `base ${initialPr.base?.ref ?? "unknown"}` };
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
      if (liveEvidence.wrongBase || !targetsTrunk(livePr, policy)) {
        await completeGateCheck(
          client,
          gate.id,
          "neutral",
          "PR riktas inte längre mot trunk",
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
        repository: client.repository,
        prNumber,
      });

      const current = now();
      const elapsed = current - runStarted;
      latestState = evaluateHeadChecks(runs, policy, trustedReview);
      const windowStart = latestState.latestRequiredCreatedEpoch;
      const headAge = windowStart > 0 ? current - windowStart : 0;
      if (hasBaseInvalidation(rawRuns, headSha)) {
        latestFreshnessReason = "master har flyttats efter att denna head verifierades";
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

      if (headAge >= policy.review.minHeadAgeSeconds && botsDone && latestState.requiredDone) {
        const minimumEpoch = Math.max(
          windowStart + policy.review.minHeadAgeSeconds,
          latestState.latestCompletionEpoch,
          invalidateExistingSignoff ? runStarted : 0,
        );
        const first = validateEvidence(liveEvidence, headSha, minimumEpoch);
        latestFreshnessReason = first.reason;
        if (first.valid) {
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
            repository: client.repository,
            prNumber,
          });
          const confirmationState = evaluateHeadChecks(
            confirmationRuns,
            policy,
            confirmationReview,
          );
          const confirmationMinimum = Math.max(
            confirmationState.latestRequiredCreatedEpoch + policy.review.minHeadAgeSeconds,
            confirmationState.latestCompletionEpoch,
            invalidateExistingSignoff ? runStarted : 0,
          );
          const confirmation =
            confirmationEvidence.staleHead || confirmationEvidence.wrongBase
              ? { valid: false, reason: "head eller base flyttades under slutvalideringen" }
              : !confirmationEvidence.fileUniverseComplete ||
                  confirmationEvidence.manualMergeFiles.length > 0
                ? { valid: false, reason: "workflow-/filunderlaget ändrades" }
                : validateEvidence(confirmationEvidence, headSha, confirmationMinimum);
          if (
            confirmation.valid &&
            confirmationState.botsDone &&
            confirmationState.requiredDone &&
            !hasBaseInvalidation(confirmationRawRuns, headSha)
          ) {
            await completeGateCheck(
              client,
              gate.id,
              "success",
              "Betrodd review-window godkänd",
              `${confirmation.reason}. Övriga required checks och reviewkvitton är verifierade på ${headSha}.`,
              now(),
            );
            finished = true;
            return { conclusion: "success", reason: confirmation.reason };
          }
          latestState = confirmationState;
          latestFreshnessReason = confirmation.reason;
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
    throw new Error(summary);
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

export async function runTrustedMerge({
  client,
  prNumber,
  commentId,
  pause = sleep,
  settleSeconds = MERGE_SETTLE_SECONDS,
  policy = POLICY,
}) {
  const [initialPr, initialComment] = await Promise.all([
    client.request(`/pulls/${prNumber}`),
    client.request(`/issues/comments/${commentId}`),
  ]);
  if (!targetsTrunk(initialPr, policy)) {
    throw new Error(`PR #${prNumber} riktas inte mot ${policy.trunk}`);
  }
  if (!String(initialComment.issue_url ?? "").endsWith(`/issues/${prNumber}`)) {
    throw new Error("merge:execute-kommentaren hör inte till den aktuella PR:n");
  }
  const expectedHeadSha = initialPr.head?.sha ?? "";
  if (!/^[0-9a-f]{40}$/i.test(expectedHeadSha)) throw new Error("GitHub gav ogiltig PR-head");
  const basePath = policy.trunk
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const initialBaseRef = await client.request(`/git/ref/heads/${basePath}`);
  const expectedBaseSha = initialBaseRef.object?.sha ?? "";
  const initialMandate = validateMergeExecuteMandate({
    body: initialComment.body ?? "",
    createdAt: initialComment.created_at,
    authorLogin: initialComment.user?.login,
    authorType: initialComment.user?.type,
    authorAssociation: initialComment.author_association,
    headSha: expectedHeadSha,
    baseSha: expectedBaseSha,
  });
  if (!initialMandate.valid) throw new Error(initialMandate.reason);

  const readAndValidate = async () => {
    const snapshot = await readMergeSnapshot(client, prNumber, commentId, expectedHeadSha, policy);
    const validation = validateMergeSnapshot({
      snapshot,
      prNumber,
      expectedHeadSha,
      expectedBaseSha,
      policy,
    });
    if (!validation.valid) throw new Error(validation.reason);
    return { snapshot, validation };
  };

  const first = await readAndValidate();
  await pause(Math.max(1, settleSeconds) * 1000);
  const second = await readAndValidate();
  if (second.validation.fingerprint !== first.validation.fingerprint) {
    throw new Error("checks eller PR-evidens ändrades under merge-settle; posta nytt mandat");
  }

  // En omedelbar tredje läsning krymper fönstret efter settle. Därefter görs
  // en separat live base/compare precis före SHA-CAS:en i merge-API:t.
  const final = await readAndValidate();
  if (final.validation.fingerprint !== second.validation.fingerprint) {
    throw new Error("checks eller PR-evidens ändrades precis före merge");
  }

  const [livePr, liveBaseRef, liveComment] = await Promise.all([
    client.request(`/pulls/${prNumber}`),
    client.request(`/git/ref/heads/${basePath}`),
    client.request(`/issues/comments/${commentId}`),
  ]);
  const liveBaseSha = liveBaseRef.object?.sha ?? "";
  if (
    livePr.state !== "open" ||
    livePr.head?.sha?.toLowerCase() !== expectedHeadSha.toLowerCase() ||
    liveBaseSha.toLowerCase() !== expectedBaseSha.toLowerCase() ||
    liveComment.updated_at !== initialComment.updated_at ||
    hashBody(liveComment.body) !== hashBody(initialComment.body)
  ) {
    throw new Error("head, base eller merge-mandat flyttades precis före merge");
  }
  const comparison = await client.request(`/compare/${liveBaseSha}...${expectedHeadSha}`);
  if (
    !["ahead", "identical"].includes(comparison.status) ||
    comparison.merge_base_commit?.sha?.toLowerCase() !== liveBaseSha.toLowerCase()
  ) {
    throw new Error("PR-head innehåller inte live master precis före merge");
  }

  const result = await client.request(`/pulls/${prNumber}/merge`, {
    method: "PUT",
    body: { sha: expectedHeadSha, merge_method: "squash" },
  });
  if (result?.merged !== true) {
    throw new Error(`GitHub avvisade merge: ${result?.message ?? "okänd orsak"}`);
  }
  console.log(`Merged PR #${prNumber} at ${expectedHeadSha} onto ${expectedBaseSha}`);
  const postMergeFailures = [];
  let mergedBaseSha = result.sha ?? "";
  if (!/^[0-9a-f]{40}$/i.test(mergedBaseSha)) {
    try {
      const mergedBaseRef = await client.request(`/git/ref/heads/${basePath}`);
      mergedBaseSha = mergedBaseRef.object?.sha ?? "";
    } catch (error) {
      postMergeFailures.push(
        `kunde inte läsa merge-SHA: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (/^[0-9a-f]{40}$/i.test(mergedBaseSha)) {
    try {
      // GITHUB_TOKEN-genererade push-event startar normalt inte nya workflows.
      // Gör därför samma base-invalidering explicit efter terminal merge.
      await invalidateForBasePush({ client, baseSha: mergedBaseSha });
    } catch (error) {
      postMergeFailures.push(
        `base-invalidering: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else {
    postMergeFailures.push("GitHub gav ingen giltig 40-teckens merge-SHA");
  }

  // workflow_dispatch är ett dokumenterat undantag från GITHUB_TOKEN:s
  // recursion-skydd. Kör båda post-merge-grindarna explicit på master.
  for (const workflow of ["ci.yml", "db-blob-sync-check.yml"]) {
    try {
      await client.request(`/actions/workflows/${workflow}/dispatches`, {
        method: "POST",
        body: { ref: policy.trunk },
      });
    } catch (error) {
      postMergeFailures.push(
        `${workflow} dispatch: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (postMergeFailures.length > 0) {
    throw new Error(
      `POST_MERGE_VERIFICATION_FAILED — PR #${prNumber} är redan mergad; kör base-invalidering och workflow_dispatch manuellt: ${postMergeFailures.join("; ")}`,
    );
  }
  return {
    merged: true,
    headSha: expectedHeadSha,
    baseSha: expectedBaseSha,
    mergeSha: result.sha ?? null,
  };
}

export async function invalidateForBasePush({
  client,
  baseSha,
  now = () => Math.floor(Date.now() / 1000),
}) {
  const pulls = await client.paginate("/pulls?state=open&base=master");
  const failures = [];
  for (const pr of pulls) {
    // Drafts kan inte mergeas och flera långlivade ägar-/admin-PR:er ska inte
    // muteras av agentautomation. ready_for_review skapar en ny live-check när
    // de faktiskt lämnar draftläget.
    if (pr.draft === true) continue;
    try {
      const summary = `Uppdatera PR-head med master ${baseSha}, kör om grinden och signera den nya live-basen.`;
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
            title: "Master har flyttats",
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
  const repository = process.env.REPO ?? process.env.GITHUB_REPOSITORY ?? "";
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? "";
  if (!repository || !token) throw new Error("REPO/GITHUB_REPOSITORY och GH_TOKEN krävs");
  const client = createClient({ repository, token });
  const mode = process.argv[2] ?? "gate";
  if (mode === "invalidate-base") {
    const baseSha = process.env.BASE_SHA ?? "";
    if (!/^[0-9a-f]{40}$/i.test(baseSha)) throw new Error("BASE_SHA måste vara exakt 40 hex");
    await invalidateForBasePush({ client, baseSha });
    return;
  }
  const prNumber = Number(process.env.PR_NUMBER);
  if (!Number.isInteger(prNumber) || prNumber <= 0)
    throw new Error("PR_NUMBER måste vara positivt");
  if (mode === "merge") {
    const commentId = Number(process.env.COMMENT_ID);
    if (!Number.isInteger(commentId) || commentId <= 0)
      throw new Error("COMMENT_ID måste vara positivt");
    await runTrustedMerge({ client, prNumber, commentId });
    return;
  }
  await runTrustedGate({
    client,
    prNumber,
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
