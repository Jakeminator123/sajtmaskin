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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const POLICY = JSON.parse(readFileSync(resolve(ROOT, "config/agent-workflow.json"), "utf8"));
const CHECK_NAME = "review-window";
const EXTERNAL_ID_PREFIX = "sajtmaskin-trusted-review-window:v1:";
const POLL_SECONDS = 20;
const MERGE_SETTLE_SECONDS = 5;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const epoch = (value) => {
  const parsed = Date.parse(value ?? "");
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
};
const iso = (seconds) => new Date(seconds * 1000).toISOString();
const matchesAny = (name, patterns) =>
  patterns.some((pattern) => name.toLowerCase().includes(pattern.toLowerCase()));

function newestByIdentity(runs) {
  const newest = new Map();
  for (const run of runs) {
    const key = `${run.app?.id ?? run.app?.slug ?? "unknown"}:${run.name}`;
    const previous = newest.get(key);
    // `created_at` är GitHub-serverdata. `started_at` får anroparen däremot
    // välja för custom checks och får därför bara vara fallback.
    const runTime = epoch(run.created_at ?? run.started_at) ?? 0;
    const previousTime = epoch(previous?.created_at ?? previous?.started_at) ?? 0;
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
export function evaluateHeadChecks(checkRuns, policy = POLICY) {
  const runs = newestByIdentity(checkRuns).filter(
    (run) => !(run.name === CHECK_NAME && run.external_id?.startsWith(EXTERNAL_ID_PREFIX)),
  );
  const qualifying = runs.filter((run) =>
    matchesAny(run.name ?? "", policy.review.qualifyingCheckPatterns),
  );
  const security = runs.filter((run) =>
    matchesAny(run.name ?? "", policy.review.securityVetoCheckPatterns),
  );
  // Deployment checks are exact optional names: absent is valid, but a
  // present pending/failed deployment blocks. Substring matching here would
  // incorrectly classify e.g. "Vercel Agent Review" as a deployment.
  const deploymentNames = new Set(policy.review.deploymentCheckNames ?? []);
  const deployments = runs.filter((run) => deploymentNames.has(run.name ?? ""));
  const requiredNames = policy.requiredChecks.filter((name) => name !== CHECK_NAME);
  const required = requiredNames.map((name) => ({
    name,
    run: runs.find(
      (candidate) => candidate.name === name && candidate.app?.slug === "github-actions",
    ),
  }));

  const completedSuccess = qualifying.filter(
    (run) => run.status === "completed" && run.conclusion === "success",
  ).length;
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
    const completed = epoch(run.completed_at);
    if (completed === null) completionTimesValid = false;
    else latestCompletionEpoch = Math.max(latestCompletionEpoch, completed);
  }

  // `created_at` sätts av GitHub och kan, till skillnad från `started_at`, inte
  // bakdateras av den som skapar en check run. Final merge använder den senaste
  // av de aktuella core-checkarnas startpunkter som ett serverbundet golv för
  // sjuminutersfönstret.
  let latestRequiredCreatedEpoch = 0;
  let requiredCreatedTimesValid = true;
  for (const { run } of required) {
    if (!run) continue;
    const created = epoch(run.created_at);
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
      completionTimesValid,
    requiredDone:
      requiredMissing.length === 0 &&
      requiredPending.length === 0 &&
      requiredFailed.length === 0 &&
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
      createdAt: review.submitted_at,
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

export function earliestTrustedWindowEpoch(checkRuns, fallbackEpoch) {
  const starts = checkRuns
    .filter((run) => run.name === CHECK_NAME && run.external_id?.startsWith(EXTERNAL_ID_PREFIX))
    // Checks-API:t låter anroparen välja started_at men inte created_at.
    // Återanvänd därför bara GitHubs serverbundna skapandetid mellan retriggers.
    .map((run) => epoch(run.created_at))
    .filter((value) => value !== null);
  return starts.length > 0 ? Math.min(...starts) : fallbackEpoch;
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

function createClient({ repository, token, fetchImpl = fetch }) {
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

  return { request, paginate };
}

async function listCheckRuns(client, sha) {
  return client.paginate(`/commits/${sha}/check-runs?filter=all`, "check_runs");
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

async function readLiveEvidence(client, prNumber, expectedHeadSha, expectedBaseRef) {
  const pr = await client.request(`/pulls/${prNumber}`);
  if (pr.head.sha.toLowerCase() !== expectedHeadSha.toLowerCase()) {
    return { staleHead: true, pr };
  }
  if (pr.base.ref !== expectedBaseRef) {
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
  const [issueComments, reviews, reviewComments] = await Promise.all([
    client.paginate(`/issues/${prNumber}/comments`),
    client.paginate(`/pulls/${prNumber}/reviews`),
    client.paginate(`/pulls/${prNumber}/comments`),
  ]);
  return {
    staleHead: false,
    wrongBase: false,
    pr,
    baseSha,
    baseIsAncestor,
    issueComments,
    reviews,
    reviewComments,
  };
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
  for (const review of evidence.reviews) values.push(review.submitted_at);
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
  const [commandComment, evidence, checkRuns] = await Promise.all([
    client.request(`/issues/comments/${commentId}`),
    readLiveEvidence(client, prNumber, expectedHeadSha, policy.trunk),
    listCheckRuns(client, expectedHeadSha),
  ]);
  return { commandComment, evidence, checkRuns };
}

export function validateMergeSnapshot({
  snapshot,
  prNumber,
  expectedHeadSha,
  expectedBaseSha,
  policy = POLICY,
}) {
  const { commandComment, evidence, checkRuns } = snapshot;
  if (evidence.staleHead || evidence.wrongBase) {
    return { valid: false, reason: "PR-head eller base flyttades" };
  }
  const pr = evidence.pr;
  if (pr.state !== "open" || pr.draft === true) {
    return { valid: false, reason: "PR:n är stängd eller draft" };
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
  const checks = evaluateHeadChecks(checkRuns, policy);
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
    return "required checks saknar GitHub-verifierbar created_at";
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
  let botsReadyBeforeDeadline = false;

  try {
    let runs = await listCheckRuns(client, headSha);
    await supersedeRunningChecks(client, runs, gate.id, now());

    while (true) {
      runs = await listCheckRuns(client, headSha);
      const livePr = await client.request(`/pulls/${prNumber}`);
      if (livePr.head.sha.toLowerCase() !== headSha.toLowerCase()) {
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
      if (!targetsTrunk(livePr, policy)) {
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

      const current = now();
      const elapsed = current - runStarted;
      const windowStart = earliestTrustedWindowEpoch(runs, runStarted);
      const headAge = current - windowStart;
      latestState = evaluateHeadChecks(runs, policy);
      if (hasBaseInvalidation(runs, headSha)) {
        latestFreshnessReason = "master har flyttats efter att denna head verifierades";
        break;
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
        const firstEvidence = await readLiveEvidence(client, prNumber, headSha, policy.trunk);
        if (!firstEvidence.staleHead && !firstEvidence.wrongBase) {
          const first = validateEvidence(firstEvidence, headSha, minimumEpoch);
          latestFreshnessReason = first.reason;
          if (first.valid) {
            const confirmationRuns = await listCheckRuns(client, headSha);
            const confirmationState = evaluateHeadChecks(confirmationRuns, policy);
            const confirmationEvidence = await readLiveEvidence(
              client,
              prNumber,
              headSha,
              policy.trunk,
            );
            const confirmationMinimum = Math.max(
              windowStart + policy.review.minHeadAgeSeconds,
              confirmationState.latestCompletionEpoch,
              invalidateExistingSignoff ? runStarted : 0,
            );
            const confirmation =
              confirmationEvidence.staleHead || confirmationEvidence.wrongBase
                ? { valid: false, reason: "head eller base flyttades under slutvalideringen" }
                : validateEvidence(confirmationEvidence, headSha, confirmationMinimum);
            if (
              confirmation.valid &&
              confirmationState.botsDone &&
              confirmationState.requiredDone &&
              !hasBaseInvalidation(confirmationRuns, headSha)
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
        } else {
          latestFreshnessReason = "head eller base flyttades under live-valideringen";
        }
      }

      if (deadline === "signoff-timeout") break;
      const remaining = policy.review.maxSignoffWaitSeconds - elapsed;
      await pause(Math.max(1, Math.min(POLL_SECONDS, remaining)) * 1000);
    }

    const summary = failureSummary(latestState, latestFreshnessReason);
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
