import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  EVALUATION_BODY_MARKER,
  EVALUATION_TITLE_PREFIX,
  INDEPENDENT_REVIEW_MODEL,
  INDEPENDENT_REVIEW_PROCEDURE,
  STAGES,
  RunStateError,
  acquireLease,
  advanceStage,
  assertWorktreeBinding,
  claimCandidate,
  completePass,
  createRunState,
  heartbeatLease,
  normalizeFsPath,
  parseActiveQueue,
  pauseRun,
  promoteRun,
  readLivePullRequestEvidence,
  readLivePreviewPolicyEvidence,
  rebaselineLegacyState,
  recordReviewPass,
  recoverStaleLease,
  releaseLease,
  reopenReview,
  skipCandidate,
} from "./run-state.mjs";

const START = "2026-08-11T20:00:00.000Z";
const LATER = "2026-08-11T20:06:00.000Z";
const MUCH_LATER = "2026-08-12T01:00:00.000Z";
const SECOND_PASS = "2026-08-11T20:12:00.000Z";
const HEAD_SHA = "a".repeat(40);
const NEW_HEAD_SHA = "b".repeat(40);
const MERGE_SHA = "c".repeat(40);
const BASE_SHA = "d".repeat(40);
const NEW_BASE_SHA = "e".repeat(40);
const POLICY_BLOB_SHA = "f".repeat(40);
const REVIEW_TIME = "2026-08-11T20:06:10.000Z";
const READY_TIME = "2026-08-11T20:06:20.000Z";
const MERGED_TIME = "2026-08-11T20:06:30.000Z";
const CLEANUP_TIME = "2026-08-11T20:06:40.000Z";
const COMPLETE_TIME = "2026-08-11T20:06:50.000Z";
const SECOND_REVIEW = "2026-08-11T20:12:10.000Z";
const SECOND_COMPLETE = "2026-08-11T20:12:20.000Z";
const PASS_WORKTREE = resolve("godnatt-test-worktree");
const SCRIPT_PATH = fileURLToPath(new URL("./run-state.mjs", import.meta.url));
const candidate = {
  id: "SM-022",
  title: "Säker cleanup",
  priority: "P1",
};
const secondCandidate = {
  id: "SM-023",
  title: "Andra säkra buggen",
  priority: "P2",
};

function fresh(overrides = {}) {
  const mode = overrides.mode ?? "full";
  return createRunState({
    count: 2,
    mode,
    cooldownMinutes: 5,
    leaseMinutes: 60,
    now: START,
    runId: "run-1",
    automationId: "godnatt-bugg",
    trustedRolloutEvidence: mode === "full" ? rolloutEvidence({ observedAt: START }) : null,
    ...overrides,
  });
}

function rolloutEvidence({
  deliveryBranch = "preview",
  refSha = BASE_SHA,
  observedAt = START,
} = {}) {
  return {
    provider: "gh-api-graphql",
    repository: "owner/sajtmaskin",
    localRepository: "owner/sajtmaskin",
    refName: "preview",
    refSha,
    policyPath: "config/agent-workflow.json",
    policyBlobSha: POLICY_BLOB_SHA,
    deliveryBranch,
    observedAt,
  };
}

function pilot() {
  return fresh({
    count: 1,
    mode: "pilot",
    promotionCode: "pilot-capability",
  });
}

function evaluation() {
  return fresh({
    count: 2,
    mode: "evaluation",
  });
}

function acquired(state = fresh(), now = START) {
  return acquireLease(state, {
    now,
    token: "token-1",
    trustedRolloutEvidence:
      state.mode === "full" ? rolloutEvidence({ refSha: BASE_SHA, observedAt: now }) : null,
  }).state;
}

function legacyFullWithoutRuntimeGrant(state, version) {
  const legacy = structuredClone(state);
  legacy.version = version;
  delete legacy.fullRolloutEvidence;
  return legacy;
}

function claimed(state = acquired(), now = START) {
  return claimCandidate(state, {
    token: "token-1",
    smId: candidate.id,
    candidates: [candidate],
    now,
  });
}

function pullEvidence({
  branch = "fix/sm-022-safe-cleanup",
  prNumber = 123,
  headSha = HEAD_SHA,
  state = "OPEN",
  isDraft = true,
  baseRefName = "preview",
  repository = "owner/sajtmaskin",
  localRepository = repository,
  headRepository = repository,
  localBranch = branch,
  localHeadSha = headSha,
  mergeCommitOid = state === "MERGED" ? MERGE_SHA : null,
  mergedAt = state === "MERGED" ? MERGED_TIME : null,
  titlePrefixPresent = false,
  bodyMarkerPresent = false,
  blockingLabels = [],
  liveBaseSha = BASE_SHA,
  localWorktree = PASS_WORKTREE,
  remoteBranchRef = `refs/heads/${branch}`,
  remoteBranchAbsent = null,
  worktreeClean = null,
  previewAncestryStatus = null,
  previewMergeBaseSha = null,
  observedAt = LATER,
} = {}) {
  return {
    provider: "gh-api",
    repository,
    localRepository,
    headRepository,
    prNumber,
    state,
    isDraft,
    baseRefName,
    headRefName: branch,
    headRefOid: headSha,
    localBranch,
    localHeadSha,
    localWorktree,
    liveBaseSha,
    mergeCommitOid,
    mergedAt,
    titlePrefixPresent,
    bodyMarkerPresent,
    blockingLabels,
    remoteBranchRef,
    remoteBranchAbsent,
    worktreeClean,
    previewAncestryStatus,
    previewMergeBaseSha,
    observedAt,
  };
}

function evaluationEvidence(overrides = {}) {
  return pullEvidence({
    titlePrefixPresent: true,
    bodyMarkerPresent: true,
    blockingLabels: ["do-not-merge"],
    ...overrides,
  });
}

function independentReview(state, overrides = {}) {
  const evidence = pullEvidence({
    branch: state.current.branch,
    prNumber: state.current.prNumber,
    headSha: state.current.headSha,
    isDraft: state.current.isDraft,
    observedAt: REVIEW_TIME,
    ...(state.mode === "evaluation"
      ? { titlePrefixPresent: true, bodyMarkerPresent: true, blockingLabels: ["do-not-merge"] }
      : {}),
    ...(overrides.evidence ?? {}),
  });
  return recordReviewPass(state, {
    token: overrides.token ?? "token-1",
    source: overrides.source ?? "independent-agent",
    verdict: overrides.verdict ?? "clean",
    reviewedSha: overrides.reviewedSha ?? state.current.headSha,
    reviewedBaseSha: overrides.reviewedBaseSha ?? state.current.baseSha,
    note: overrides.note,
    now: overrides.now ?? evidence.observedAt,
    sourceMetadata:
      overrides.sourceMetadata ??
      (overrides.source === undefined || overrides.source === "independent-agent"
        ? { model: INDEPENDENT_REVIEW_MODEL }
        : null),
    trustedEvidence: evidence,
  });
}

function advanceToDraft(
  state,
  {
    token = "token-1",
    now = LATER,
    branch = "fix/sm-022-safe-cleanup",
    prNumber = 123,
    headSha = HEAD_SHA,
  } = {},
) {
  for (const stage of ["verified", "investigated"]) {
    state = advanceStage(state, {
      token,
      stage,
      now,
    });
  }
  state = advanceStage(state, {
    token,
    stage: "worktree-ready",
    metadata: {
      branch,
      worktree: PASS_WORKTREE,
    },
    now,
  });
  for (const stage of ["implemented", "reviewed"]) {
    state = advanceStage(state, {
      token,
      stage,
      now,
    });
  }
  const draftMetadata =
    state.mode === "evaluation"
      ? evaluationEvidence({ branch, prNumber, headSha, observedAt: now })
      : pullEvidence({ branch, prNumber, headSha, observedAt: now });
  return advanceStage(state, {
    token,
    stage: "draft-pr",
    trustedEvidence: draftMetadata,
    now,
  });
}

function readyForMerge(state = claimed()) {
  state = advanceToDraft(state);
  state = advanceStage(state, {
    token: "token-1",
    stage: "ci-review",
    now: LATER,
    trustedEvidence: pullEvidence(),
  });
  state = independentReview(state);
  return advanceStage(state, {
    token: "token-1",
    stage: "ready-to-merge",
    now: READY_TIME,
    trustedEvidence: pullEvidence({ isDraft: false, observedAt: READY_TIME }),
  });
}

function cleanupReady(state = readyForMerge()) {
  state = advanceStage(state, {
    token: "token-1",
    stage: "merged",
    now: MERGED_TIME,
    trustedEvidence: pullEvidence({
      state: "MERGED",
      isDraft: false,
      liveBaseSha: MERGE_SHA,
      observedAt: MERGED_TIME,
    }),
  });
  return advanceStage(state, {
    token: "token-1",
    stage: "cleanup",
    now: CLEANUP_TIME,
    trustedEvidence: pullEvidence({
      state: "MERGED",
      isDraft: false,
      liveBaseSha: MERGE_SHA,
      remoteBranchAbsent: true,
      worktreeClean: true,
      observedAt: CLEANUP_TIME,
    }),
  });
}

describe("parseActiveQueue", () => {
  it("returns unchecked records only from Aktiv kö", () => {
    const markdown = [
      "# Backlog",
      "## Aktiv kö",
      "| Klar | Status | Prio | Fynd | Källa | Nästa steg |",
      "|---|---|---|---|---|---|",
      "| [ ] | Bekräftad | P1 | \x60SM-022\x60 **Säker cleanup:** detalj | test | fixa |",
      "| [x] | Klar | P2 | \x60SM-099\x60 **Ignorera** | test | klar |",
      "## Arkiv",
      "| [ ] | Arkiv | P0 | \x60SM-777\x60 **Inte aktiv** | test | ingen |",
    ].join("\n");

    assert.deepEqual(parseActiveQueue(markdown), [
      {
        id: "SM-022",
        checkbox: "[ ]",
        status: "Bekräftad",
        priority: "P1",
        title: "Säker cleanup",
        finding: "\x60SM-022\x60 **Säker cleanup:** detalj",
        source: "test",
        nextStep: "fixa",
      },
    ]);
  });

  it("rejects duplicate active IDs", () => {
    const row = "| [ ] | Ny | P2 | \x60SM-022\x60 **Dublett** | test | fixa |";
    const markdown = ["## Aktiv kö", row, row, "## Arkiv"].join("\n");
    assert.throws(() => parseActiveQueue(markdown), RunStateError);
  });
});

describe("lease safety", () => {
  it("persists only a token hash and returns the raw token only from acquire", () => {
    const result = acquireLease(fresh(), {
      now: START,
      token: "raw-runner-secret",
      trustedRolloutEvidence: rolloutEvidence(),
    });
    assert.equal(result.token, "raw-runner-secret");
    assert.equal("token" in result.state.lease, false);
    assert.match(result.state.lease.tokenHash, /^[a-f0-9]{64}$/u);
    assert.doesNotMatch(JSON.stringify(result.state), /raw-runner-secret/u);
  });

  it("refuses a concurrent runner", () => {
    const state = acquired();
    assert.throws(() => acquireLease(state, { now: LATER, token: "token-2" }), /aktiv lease/u);
  });

  it("requires explicit recovery after expiry", () => {
    const state = acquired();
    assert.throws(
      () => acquireLease(state, { now: MUCH_LATER, token: "token-2" }),
      /återställas uttryckligen/u,
    );
    const recovered = recoverStaleLease(state, {
      runId: "run-1",
      reason: "runner verifierat stoppad",
      now: MUCH_LATER,
    });
    assert.equal(recovered.status, "ready");
    assert.equal(recovered.lease, null);
  });

  it("blocks every normal full mutation when a v3/v4 active lease lacks a runtime rollout grant", () => {
    let reviewable = advanceToDraft(claimed());
    reviewable = advanceStage(reviewable, {
      token: "token-1",
      stage: "ci-review",
      now: LATER,
      trustedEvidence: pullEvidence(),
    });
    const completable = cleanupReady();

    for (const version of [3, 4]) {
      const fixtures = [
        () =>
          claimCandidate(legacyFullWithoutRuntimeGrant(acquired(), version), {
            token: "token-1",
            smId: candidate.id,
            candidates: [candidate],
            now: LATER,
          }),
        () =>
          heartbeatLease(legacyFullWithoutRuntimeGrant(acquired(), version), {
            token: "token-1",
            now: LATER,
          }),
        () =>
          advanceStage(legacyFullWithoutRuntimeGrant(claimed(), version), {
            token: "token-1",
            stage: "verified",
            now: LATER,
          }),
        () => independentReview(legacyFullWithoutRuntimeGrant(reviewable, version)),
        () =>
          completePass(legacyFullWithoutRuntimeGrant(completable, version), {
            token: "token-1",
            outcome: "fixed",
            evidence: "försök utan runtime rolloutgrant",
            now: COMPLETE_TIME,
            trustedEvidence: pullEvidence({
              state: "MERGED",
              isDraft: false,
              liveBaseSha: MERGE_SHA,
              remoteBranchAbsent: true,
              worktreeClean: true,
              observedAt: COMPLETE_TIME,
            }),
          }),
      ];
      for (const mutate of fixtures) {
        assert.throws(mutate, /rolloutgrant bundet till aktiv lease/u);
      }
    }
  });

  it("binds a full rollout grant to the exact active lease", () => {
    const state = acquired();
    assert.equal(state.fullRolloutEvidence.grantedForLeaseAt, state.lease.acquiredAt);
    assert.doesNotThrow(() => heartbeatLease(state, { token: "token-1", now: SECOND_PASS }));
    assert.doesNotThrow(() =>
      advanceStage(claimed(), {
        token: "token-1",
        stage: "verified",
        now: SECOND_PASS,
      }),
    );

    const replayed = structuredClone(state);
    replayed.fullRolloutEvidence.grantedForLeaseAt = LATER;
    assert.throws(
      () => heartbeatLease(replayed, { token: "token-1", now: LATER }),
      /rolloutgrant bundet till aktiv lease/u,
    );

    const staleAtAcquisition = structuredClone(state);
    staleAtAcquisition.fullRolloutEvidence.observedAt = "2026-08-11T19:00:00.000Z";
    assert.throws(
      () => heartbeatLease(staleAtAcquisition, { token: "token-1", now: LATER }),
      /Rollout-evidence är stale/u,
    );

    const weakened = structuredClone(state);
    weakened.fullRolloutEvidence.deliveryBranch = "master";
    assert.throws(
      () => heartbeatLease(weakened, { token: "token-1", now: LATER }),
      /deliveryBranch=preview/u,
    );
  });

  it("keeps safe release and pause available, then requires fresh validated acquire", () => {
    const legacy = legacyFullWithoutRuntimeGrant(advanceToDraft(claimed()), 3);
    const historyBefore = structuredClone(legacy.history);
    const released = releaseLease(legacy, {
      token: "token-1",
      reason: "frigör legacy lease före nytt live-policybevis",
      now: REVIEW_TIME,
    });
    assert.equal(released.status, "ready");
    assert.equal(released.lease, null);
    assert.deepEqual(released.history.slice(0, -1), historyBefore);
    assert.equal(released.history.at(-1).kind, "lease-released");
    assert.equal(released.current.stage, "draft-pr");
    assert.equal(released.current.branch, "fix/sm-022-safe-cleanup");
    assert.equal(released.current.worktree, PASS_WORKTREE);
    assert.equal(released.current.prNumber, 123);
    assert.equal(released.runId, legacy.runId);
    assert.equal(released.mode, "full");
    assert.equal(released.automationId, legacy.automationId);
    assert.equal(released.promotionAuthorizationHash, legacy.promotionAuthorizationHash);

    assert.throws(
      () => acquireLease(released, { now: REVIEW_TIME, token: "token-2" }),
      /canonical preview-policy/u,
    );
    const reacquired = acquireLease(released, {
      now: REVIEW_TIME,
      token: "token-2",
      trustedRolloutEvidence: rolloutEvidence({ observedAt: REVIEW_TIME }),
    }).state;
    assert.equal(reacquired.fullRolloutEvidence.grantedForLeaseAt, reacquired.lease.acquiredAt);
    assert.deepEqual(reacquired.current, released.current);
    assert.deepEqual(reacquired.history, released.history);
    assert.equal(reacquired.promotionAuthorizationHash, released.promotionAuthorizationHash);
    assert.throws(
      () => heartbeatLease(reacquired, { token: "token-1", now: READY_TIME }),
      /Ogiltig eller saknad runner-token/u,
    );
    assert.doesNotThrow(() => heartbeatLease(reacquired, { token: "token-2", now: READY_TIME }));

    const paused = pauseRun(legacyFullWithoutRuntimeGrant(acquired(), 4), {
      token: "token-1",
      reason: "säker halt utan rolloutgrant",
      now: LATER,
    });
    assert.equal(paused.status, "paused");
    assert.equal(paused.lease, null);

    assert.doesNotThrow(() => heartbeatLease(acquired(pilot()), { token: "token-1", now: LATER }));
    assert.doesNotThrow(() =>
      heartbeatLease(acquired(evaluation()), { token: "token-1", now: LATER }),
    );
  });
});

describe("mode and authorization", () => {
  it("allows exactly one pass in pilot mode", () => {
    assert.throws(
      () =>
        fresh({
          count: 2,
          mode: "pilot",
          promotionCode: "pilot-capability",
        }),
      /exakt ett pass/u,
    );
  });

  it("hard-stops pilot at draft-pr", () => {
    const state = advanceToDraft(claimed(acquired(pilot())));
    assert.throws(
      () =>
        advanceStage(state, {
          token: "token-1",
          stage: "ci-review",
          now: LATER,
        }),
      /får inte gå förbi draft-pr/u,
    );
  });

  it("allows a bounded evaluation batch but never merge stages", () => {
    const state = advanceToDraft(claimed(acquired(evaluation())));
    assert.equal(state.mode, "evaluation");
    assert.equal(state.requestedPasses, 2);
    assert.equal(state.current.isDraft, true);
    assert.throws(
      () =>
        advanceStage(state, {
          token: "token-1",
          stage: "ci-review",
          now: LATER,
        }),
      /aldrig gå förbi draft-pr/u,
    );
  });

  it("requires a minimum five-minute cooldown", () => {
    for (const cooldownMinutes of [0, 4]) {
      assert.throws(
        () => fresh({ cooldownMinutes }),
        /cooldown-minutes måste vara mellan 5 och 1440/u,
      );
    }
  });

  it("refuses to promote evaluation mode into merge authority", () => {
    const paused = pauseRun(advanceToDraft(claimed(acquired(evaluation()))), {
      token: "token-1",
      reason: "adminutvärdering pausad",
      now: LATER,
    });
    assert.throws(
      () =>
        promoteRun(paused, {
          runId: "run-1",
          authorization: "påhittad-capability",
          reason: "försök eskalera",
          now: LATER,
        }),
      /Bara en pilot-run/u,
    );
  });

  it("requires the private pilot capability to promote", () => {
    const paused = pauseRun(advanceToDraft(claimed(acquired(pilot()))), {
      token: "token-1",
      reason: "pilot väntar på ägaren",
      now: LATER,
    });
    assert.throws(
      () =>
        promoteRun(paused, {
          runId: "run-1",
          authorization: "fel-capability",
          reason: "påstått mandat",
          now: LATER,
        }),
      /Ogiltig promotion capability/u,
    );

    const promoted = promoteRun(paused, {
      runId: "run-1",
      authorization: "pilot-capability",
      reason: "ägaren anropade godnatt-bugg full för denna run",
      now: LATER,
      trustedRolloutEvidence: rolloutEvidence({ observedAt: LATER }),
    });
    assert.equal(promoted.mode, "full");
    assert.equal(promoted.status, "ready");
    assert.equal(promoted.promotionAuthorizationHash, null);
  });

  it("fails full begin, acquire, and promotion closed without fresh canonical preview rollout", () => {
    assert.throws(
      () =>
        createRunState({
          count: 1,
          mode: "full",
          cooldownMinutes: 5,
          leaseMinutes: 60,
          now: START,
          runId: "blocked-full",
        }),
      /canonical preview-policy/u,
    );
    assert.throws(
      () => fresh({ trustedRolloutEvidence: rolloutEvidence({ deliveryBranch: "master" }) }),
      /deliveryBranch=preview/u,
    );
    assert.throws(
      () => acquireLease(fresh(), { now: START, token: "token-1" }),
      /canonical preview-policy/u,
    );
    assert.throws(
      () =>
        acquireLease(fresh(), {
          now: LATER,
          token: "token-1",
          trustedRolloutEvidence: rolloutEvidence({ observedAt: START }),
        }),
      /stale/u,
    );

    const pausedPilot = pauseRun(advanceToDraft(claimed(acquired(pilot()))), {
      token: "token-1",
      reason: "pilot väntar på rollout",
      now: LATER,
    });
    assert.throws(
      () =>
        promoteRun(pausedPilot, {
          runId: "run-1",
          authorization: "pilot-capability",
          reason: "ägarmandat utan verifierad rollout",
          now: LATER,
        }),
      /canonical preview-policy/u,
    );

    assert.doesNotThrow(() => acquired(pilot()));
    assert.doesNotThrow(() => acquired(evaluation()));
  });
});

describe("pass state machine", () => {
  it("claims only a current active candidate", () => {
    assert.throws(
      () =>
        claimCandidate(acquired(), {
          token: "token-1",
          smId: "SM-404",
          candidates: [candidate],
          now: START,
        }),
      /finns inte/u,
    );
  });

  it("allows same or next stage but never skips or moves backwards", () => {
    let state = claimed();
    state = advanceStage(state, {
      token: "token-1",
      stage: "verified",
      now: START,
    });
    state = advanceStage(state, {
      token: "token-1",
      stage: "verified",
      now: LATER,
    });
    assert.equal(state.current.stage, "verified");
    assert.throws(
      () =>
        advanceStage(state, {
          token: "token-1",
          stage: "worktree-ready",
          now: LATER,
        }),
      /inte hoppas över/u,
    );
    assert.throws(
      () =>
        advanceStage(state, {
          token: "token-1",
          stage: "claimed",
          now: LATER,
        }),
      /inte gå bakåt/u,
    );
  });

  it("requires immutable branch/worktree and valid PR/SHA evidence", () => {
    let state = claimed();
    state = advanceStage(state, { token: "token-1", stage: "verified", now: LATER });
    state = advanceStage(state, { token: "token-1", stage: "investigated", now: LATER });
    assert.throws(
      () =>
        advanceStage(state, {
          token: "token-1",
          stage: "worktree-ready",
          now: LATER,
        }),
      /kräver en fix\/feat\/docs\/chore/u,
    );

    state = advanceStage(state, {
      token: "token-1",
      stage: "worktree-ready",
      metadata: {
        branch: "fix/sm-022-safe-cleanup",
        worktree: PASS_WORKTREE,
      },
      now: LATER,
    });
    assert.throws(
      () =>
        advanceStage(state, {
          token: "token-1",
          stage: "worktree-ready",
          metadata: { branch: "fix/changed" },
          now: LATER,
        }),
      /immutable/u,
    );

    state = advanceStage(state, { token: "token-1", stage: "implemented", now: LATER });
    state = advanceStage(state, { token: "token-1", stage: "reviewed", now: LATER });
    assert.throws(
      () =>
        advanceStage(state, {
          token: "token-1",
          stage: "draft-pr",
          trustedEvidence: pullEvidence({ headSha: "FULL_SHA", localHeadSha: "FULL_SHA" }),
          now: LATER,
        }),
      /lokal aktuell HEAD/u,
    );
  });

  it("requires all draft/admin/merge guards for evaluation PRs", () => {
    let state = claimed(acquired(evaluation()));
    for (const stage of ["verified", "investigated"]) {
      state = advanceStage(state, { token: "token-1", stage, now: LATER });
    }
    state = advanceStage(state, {
      token: "token-1",
      stage: "worktree-ready",
      metadata: { branch: "fix/sm-022-safe-cleanup", worktree: PASS_WORKTREE },
      now: LATER,
    });
    state = advanceStage(state, { token: "token-1", stage: "implemented", now: LATER });
    state = advanceStage(state, { token: "token-1", stage: "reviewed", now: LATER });

    assert.throws(
      () =>
        advanceStage(state, {
          token: "token-1",
          stage: "draft-pr",
          trustedEvidence: pullEvidence(),
          now: LATER,
        }),
      /adminmarkör/u,
    );
  });

  it("requires verified draft evidence for pilot PRs", () => {
    let state = claimed(acquired(pilot()));
    for (const stage of ["verified", "investigated"]) {
      state = advanceStage(state, { token: "token-1", stage, now: LATER });
    }
    state = advanceStage(state, {
      token: "token-1",
      stage: "worktree-ready",
      metadata: { branch: "fix/sm-022-safe-cleanup", worktree: PASS_WORKTREE },
      now: LATER,
    });
    state = advanceStage(state, { token: "token-1", stage: "implemented", now: LATER });
    state = advanceStage(state, { token: "token-1", stage: "reviewed", now: LATER });

    assert.throws(
      () =>
        advanceStage(state, {
          token: "token-1",
          stage: "draft-pr",
          trustedEvidence: pullEvidence({ isDraft: false }),
          now: LATER,
        }),
      /kräver isDraft=true/u,
    );
  });

  it("requires a current-SHA review and caps PR review passes at three", () => {
    let state = advanceToDraft(claimed());
    state = advanceStage(state, {
      token: "token-1",
      stage: "ci-review",
      now: LATER,
      trustedEvidence: pullEvidence(),
    });
    for (let index = 0; index < 3; index += 1) {
      state = independentReview(state, {
        source: "bugbot-local",
        verdict: "blocked",
        note: "fynd kvarstår",
      });
    }
    assert.throws(
      () => independentReview(state, { source: "bugbot-local", verdict: "clean" }),
      /Högst tre/u,
    );
    assert.throws(
      () =>
        advanceStage(state, {
          token: "token-1",
          stage: "ready-to-merge",
          now: READY_TIME,
          trustedEvidence: pullEvidence({ isDraft: false, observedAt: READY_TIME }),
        }),
      /godkänd review/u,
    );
  });

  it("counts a full pass only after reviewed head, merge SHA, and cleanup", () => {
    let state = advanceToDraft(claimed());
    assert.throws(
      () =>
        completePass(state, {
          token: "token-1",
          outcome: "fixed",
          evidence: "PR #123",
          now: LATER,
        }),
      /efter merge och cleanup/u,
    );

    state = advanceStage(state, {
      token: "token-1",
      stage: "ci-review",
      now: LATER,
      trustedEvidence: pullEvidence(),
    });
    state = independentReview(state);
    state = advanceStage(state, {
      token: "token-1",
      stage: "ready-to-merge",
      now: READY_TIME,
      trustedEvidence: pullEvidence({ isDraft: false, observedAt: READY_TIME }),
    });
    state = advanceStage(state, {
      token: "token-1",
      stage: "merged",
      now: MERGED_TIME,
      trustedEvidence: pullEvidence({
        state: "MERGED",
        isDraft: false,
        liveBaseSha: MERGE_SHA,
        observedAt: MERGED_TIME,
      }),
    });
    state = advanceStage(state, {
      token: "token-1",
      stage: "cleanup",
      now: CLEANUP_TIME,
      trustedEvidence: pullEvidence({
        state: "MERGED",
        isDraft: false,
        liveBaseSha: MERGE_SHA,
        remoteBranchAbsent: true,
        worktreeClean: true,
        observedAt: CLEANUP_TIME,
      }),
    });
    state = completePass(state, {
      token: "token-1",
      outcome: "fixed",
      evidence: "PR #123 merged; app-worktree handoff verified",
      now: COMPLETE_TIME,
      trustedEvidence: pullEvidence({
        state: "MERGED",
        isDraft: false,
        liveBaseSha: MERGE_SHA,
        remoteBranchAbsent: true,
        worktreeClean: true,
        observedAt: COMPLETE_TIME,
      }),
    });

    assert.equal(state.completedPasses, 1);
    assert.equal(state.mergedPasses, 1);
    assert.equal(state.draftPasses, 0);
    assert.equal(state.remainingPasses, 1);
    assert.equal(state.status, "cooldown");
    assert.equal(state.current, null);
    assert.equal(state.lease, null);
    assert.equal(state.notBefore, "2026-08-11T20:11:50.000Z");
  });

  it("accepts a descendant preview tip after merge but rejects rewound or unknown ancestry", () => {
    const merged = advanceStage(readyForMerge(), {
      token: "token-1",
      stage: "merged",
      now: MERGED_TIME,
      trustedEvidence: pullEvidence({
        state: "MERGED",
        isDraft: false,
        liveBaseSha: MERGE_SHA,
        observedAt: MERGED_TIME,
      }),
    });
    const cleanupEvidence = pullEvidence({
      state: "MERGED",
      isDraft: false,
      liveBaseSha: NEW_BASE_SHA,
      previewAncestryStatus: "ahead",
      previewMergeBaseSha: MERGE_SHA,
      remoteBranchAbsent: true,
      worktreeClean: true,
      observedAt: CLEANUP_TIME,
    });
    const cleaned = advanceStage(merged, {
      token: "token-1",
      stage: "cleanup",
      now: CLEANUP_TIME,
      trustedEvidence: cleanupEvidence,
    });
    assert.equal(cleaned.current.stage, "cleanup");
    assert.equal(
      completePass(cleaned, {
        token: "token-1",
        outcome: "fixed",
        evidence: "cleanup-ready med descendant preview-tip",
        now: COMPLETE_TIME,
        trustedEvidence: { ...cleanupEvidence, observedAt: COMPLETE_TIME },
      }).completedPasses,
      1,
    );

    for (const evidence of [
      { previewAncestryStatus: "diverged", previewMergeBaseSha: MERGE_SHA },
      { previewAncestryStatus: "behind", previewMergeBaseSha: MERGE_SHA },
      { previewAncestryStatus: "ahead", previewMergeBaseSha: BASE_SHA },
      { previewAncestryStatus: null, previewMergeBaseSha: null },
    ]) {
      assert.throws(
        () =>
          advanceStage(merged, {
            token: "token-1",
            stage: "cleanup",
            now: CLEANUP_TIME,
            trustedEvidence: { ...cleanupEvidence, ...evidence },
          }),
        /ancestor.*rewound\/diverged\/okänt/u,
      );
    }

    for (const evidence of [
      { remoteBranchAbsent: false },
      { remoteBranchAbsent: null },
      { worktreeClean: false },
      { localHeadSha: NEW_HEAD_SHA },
      { localWorktree: resolve("annat-worktree") },
    ]) {
      assert.throws(() =>
        advanceStage(merged, {
          token: "token-1",
          stage: "cleanup",
          now: CLEANUP_TIME,
          trustedEvidence: { ...cleanupEvidence, ...evidence },
        }),
      );
    }
  });

  it("cycles through two distinct evaluation drafts without merge authority", () => {
    let state = advanceToDraft(claimed(acquired(evaluation())));
    assert.throws(
      () =>
        completePass(state, {
          token: "token-1",
          outcome: "draft-fix",
          evidence: "draft PR #123",
          now: LATER,
        }),
      /kräver en godkänd review/u,
    );
    state = independentReview(state, {
      source: "bugbot-local",
      note: "inga trovärdiga fynd",
    });
    state = completePass(state, {
      token: "token-1",
      outcome: "draft-fix",
      evidence: "PR #123 är draft, adminspärrad och omergad",
      now: COMPLETE_TIME,
      trustedEvidence: evaluationEvidence({ observedAt: COMPLETE_TIME }),
    });

    assert.equal(state.completedPasses, 1);
    assert.equal(state.draftPasses, 1);
    assert.equal(state.mergedPasses, 0);
    assert.equal(state.remainingPasses, 1);
    assert.equal(state.status, "cooldown");

    state = acquireLease(state, { now: SECOND_PASS, token: "token-2" }).state;
    assert.throws(
      () =>
        claimCandidate(state, {
          token: "token-2",
          smId: candidate.id,
          candidates: [candidate, secondCandidate],
          now: SECOND_PASS,
        }),
      /redan behandlats/u,
    );
    state = claimCandidate(state, {
      token: "token-2",
      smId: secondCandidate.id,
      candidates: [candidate, secondCandidate],
      now: SECOND_PASS,
    });
    assert.throws(
      () =>
        advanceToDraft(state, {
          token: "token-2",
          now: SECOND_PASS,
          branch: "fix/sm-022-safe-cleanup",
          prNumber: 124,
          headSha: NEW_HEAD_SHA,
        }),
      /Branchen .* redan använts av ett tidigare pass/u,
    );
    assert.throws(
      () =>
        advanceToDraft(state, {
          token: "token-2",
          now: SECOND_PASS,
          branch: "fix/sm-023-second-safe-bug",
          prNumber: 123,
          headSha: NEW_HEAD_SHA,
        }),
      /PR #123 har redan använts av ett tidigare pass/u,
    );
    state = advanceToDraft(state, {
      token: "token-2",
      now: SECOND_PASS,
      branch: "fix/sm-023-second-safe-bug",
      prNumber: 124,
      headSha: NEW_HEAD_SHA,
    });
    state = independentReview(state, {
      token: "token-2",
      source: "codex",
      verdict: "findings-fixed",
      note: "fynd åtgärdade på aktuell SHA",
      now: SECOND_REVIEW,
      evidence: {
        branch: "fix/sm-023-second-safe-bug",
        prNumber: 124,
        headSha: NEW_HEAD_SHA,
        observedAt: SECOND_REVIEW,
      },
    });
    state = completePass(state, {
      token: "token-2",
      outcome: "draft-fix",
      evidence: "PR #124 är draft, adminspärrad och omergad",
      now: SECOND_COMPLETE,
      trustedEvidence: evaluationEvidence({
        branch: "fix/sm-023-second-safe-bug",
        prNumber: 124,
        headSha: NEW_HEAD_SHA,
        observedAt: SECOND_COMPLETE,
      }),
    });

    assert.equal(state.status, "completed");
    assert.equal(state.completedPasses, 2);
    assert.equal(state.draftPasses, 2);
    assert.equal(state.mergedPasses, 0);
    assert.equal(state.remainingPasses, 0);
    assert.equal(
      state.history.filter((entry) => entry.kind === "evaluation-draft-completed").length,
      2,
    );
    assert.equal(
      state.history.some((entry) => entry.item?.mergeSha),
      false,
    );
  });

  it("invalidates a clean review when head SHA changes", () => {
    let state = advanceToDraft(claimed());
    state = advanceStage(state, {
      token: "token-1",
      stage: "ci-review",
      now: LATER,
      trustedEvidence: pullEvidence(),
    });
    state = independentReview(state);
    state = advanceStage(state, {
      token: "token-1",
      stage: "ci-review",
      now: READY_TIME,
      trustedEvidence: pullEvidence({ headSha: NEW_HEAD_SHA, observedAt: READY_TIME }),
    });
    assert.throws(
      () =>
        independentReview(state, {
          reviewedSha: HEAD_SHA,
          now: MERGED_TIME,
          evidence: { headSha: NEW_HEAD_SHA, observedAt: MERGED_TIME },
        }),
      /reviewed-sha/u,
    );
    assert.throws(
      () =>
        advanceStage(state, {
          token: "token-1",
          stage: "ready-to-merge",
          now: MERGED_TIME,
          trustedEvidence: pullEvidence({
            headSha: NEW_HEAD_SHA,
            isDraft: false,
            observedAt: MERGED_TIME,
          }),
        }),
      /exakt aktuell head- och base-SHA/u,
    );
  });

  it("uses the latest current-SHA review verdict for merge eligibility", () => {
    let state = advanceToDraft(claimed());
    state = advanceStage(state, {
      token: "token-1",
      stage: "ci-review",
      now: LATER,
      trustedEvidence: pullEvidence(),
    });
    state = independentReview(state);
    state = independentReview(state, {
      source: "bugbot",
      verdict: "blocked",
      note: "senare fynd",
    });
    assert.throws(
      () =>
        advanceStage(state, {
          token: "token-1",
          stage: "ready-to-merge",
          now: READY_TIME,
          trustedEvidence: pullEvidence({ isDraft: false, observedAt: READY_TIME }),
        }),
      /godkänd review för exakt aktuell head- och base-SHA/u,
    );

    state = independentReview(state, {
      source: "bugbot-local",
      verdict: "findings-fixed",
      note: "senaste fynd åtgärdade",
    });
    assert.equal(
      advanceStage(state, {
        token: "token-1",
        stage: "ready-to-merge",
        now: READY_TIME,
        trustedEvidence: pullEvidence({ isDraft: false, observedAt: READY_TIME }),
      }).current.stage,
      "ready-to-merge",
    );
  });

  it("invalidates an accepted review when the live preview base changes", () => {
    let state = advanceToDraft(claimed());
    state = advanceStage(state, {
      token: "token-1",
      stage: "ci-review",
      now: LATER,
      trustedEvidence: pullEvidence(),
    });
    state = independentReview(state);
    state = advanceStage(state, {
      token: "token-1",
      stage: "ci-review",
      now: READY_TIME,
      trustedEvidence: pullEvidence({ liveBaseSha: NEW_BASE_SHA, observedAt: READY_TIME }),
    });

    assert.throws(
      () =>
        advanceStage(state, {
          token: "token-1",
          stage: "ready-to-merge",
          now: MERGED_TIME,
          trustedEvidence: pullEvidence({
            liveBaseSha: NEW_BASE_SHA,
            isDraft: false,
            observedAt: MERGED_TIME,
          }),
        }),
      /exakt aktuell head- och base-SHA/u,
    );
    assert.throws(
      () =>
        independentReview(state, {
          reviewedBaseSha: BASE_SHA,
          evidence: { liveBaseSha: NEW_BASE_SHA, observedAt: MERGED_TIME },
          now: MERGED_TIME,
        }),
      /reviewed-base-sha/u,
    );

    state = independentReview(state, {
      reviewedBaseSha: NEW_BASE_SHA,
      evidence: { liveBaseSha: NEW_BASE_SHA, observedAt: MERGED_TIME },
      now: MERGED_TIME,
    });
    assert.equal(
      advanceStage(state, {
        token: "token-1",
        stage: "ready-to-merge",
        now: CLEANUP_TIME,
        trustedEvidence: pullEvidence({
          liveBaseSha: NEW_BASE_SHA,
          isDraft: false,
          observedAt: CLEANUP_TIME,
        }),
      }).current.stage,
      "ready-to-merge",
    );
  });

  it("reopens ready review only for an explicit immutable PR revision", () => {
    const ready = readyForMerge();
    assert.throws(
      () =>
        advanceStage(ready, {
          token: "token-1",
          stage: "ci-review",
          now: MERGED_TIME,
          trustedEvidence: pullEvidence({ observedAt: MERGED_TIME }),
        }),
      /bakåt/u,
    );
    assert.throws(
      () =>
        reopenReview(ready, {
          token: "token-1",
          reason: "ingen faktisk revision",
          now: MERGED_TIME,
          trustedEvidence: pullEvidence({ isDraft: false, observedAt: MERGED_TIME }),
        }),
      /faktiskt ändrad/u,
    );
    assert.throws(
      () =>
        reopenReview(ready, {
          token: "token-1",
          reason: "fel worktree",
          now: MERGED_TIME,
          trustedEvidence: pullEvidence({
            headSha: NEW_HEAD_SHA,
            isDraft: false,
            localWorktree: resolve("fel-worktree"),
            observedAt: MERGED_TIME,
          }),
        }),
      /immutable app-worktree/u,
    );

    const reopened = reopenReview(ready, {
      token: "token-1",
      reason: "preview och pass-head ändrades efter ready",
      now: MERGED_TIME,
      trustedEvidence: pullEvidence({
        headSha: NEW_HEAD_SHA,
        liveBaseSha: NEW_BASE_SHA,
        isDraft: false,
        observedAt: MERGED_TIME,
      }),
    });
    assert.equal(reopened.current.stage, "ci-review");
    assert.equal(reopened.current.headSha, NEW_HEAD_SHA);
    assert.equal(reopened.current.baseSha, NEW_BASE_SHA);
    assert.equal(reopened.current.reviewPasses.length, 1);
    assert.equal(reopened.current.deliveryEvidence.readyToMerge, null);
    assert.equal(reopened.history.at(-1).kind, "review-reopened");
    assert.equal(reopened.history.at(-1).reason, "preview och pass-head ändrades efter ready");
    assert.equal(reopened.history.at(-1).previousHeadSha, HEAD_SHA);
    assert.equal(reopened.history.at(-1).previousBaseSha, BASE_SHA);
    assert.equal(reopened.history.at(-1).nextHeadSha, NEW_HEAD_SHA);
    assert.equal(reopened.history.at(-1).nextBaseSha, NEW_BASE_SHA);
  });

  it("requires explicit legacy rebaseline and preserves history without trusting old reviews", () => {
    let legacy = advanceToDraft(claimed());
    legacy = advanceStage(legacy, {
      token: "token-1",
      stage: "ci-review",
      now: LATER,
      trustedEvidence: pullEvidence(),
    });
    legacy = independentReview(legacy);
    legacy.version = 3;
    delete legacy.current.baseSha;
    delete legacy.current.reviewPasses[0].baseSha;

    assert.throws(
      () =>
        advanceStage(legacy, {
          token: "token-1",
          stage: "ready-to-merge",
          now: READY_TIME,
          trustedEvidence: pullEvidence({ isDraft: false, observedAt: READY_TIME }),
        }),
      /rebaseline-legacy/u,
    );
    assert.throws(
      () =>
        rebaselineLegacyState(legacy, {
          token: "token-1",
          reason: "fel deliverybas",
          now: READY_TIME,
          trustedEvidence: pullEvidence({
            baseRefName: "master",
            liveBaseSha: NEW_BASE_SHA,
            observedAt: READY_TIME,
          }),
        }),
      /base preview/u,
    );

    const legacyV4 = structuredClone(legacy);
    legacyV4.version = 4;
    const rebasedV4 = rebaselineLegacyState(legacyV4, {
      token: "token-1",
      reason: "v4 kräver samma explicita rescue",
      now: READY_TIME,
      trustedEvidence: pullEvidence({
        liveBaseSha: NEW_BASE_SHA,
        observedAt: READY_TIME,
      }),
    });
    assert.equal(rebasedV4.current.legacySourceVersion, 4);
    assert.equal(rebasedV4.history.at(-1).sourceVersion, 4);

    const rebased = rebaselineLegacyState(legacy, {
      token: "token-1",
      reason: "ny live draft och preview-bas verifierad",
      now: READY_TIME,
      trustedEvidence: pullEvidence({
        liveBaseSha: NEW_BASE_SHA,
        observedAt: READY_TIME,
      }),
    });
    assert.equal(rebased.version, 5);
    assert.equal(rebased.current.stage, "ci-review");
    assert.equal(rebased.current.baseSha, NEW_BASE_SHA);
    assert.equal(rebased.current.legacyRebaselineRequired, false);
    assert.equal(rebased.current.reviewPasses.length, 1);
    assert.equal(rebased.current.deliveryEvidence.draftPr, null);
    assert.equal(rebased.current.deliveryEvidence.legacyRebaseline.liveBaseSha, NEW_BASE_SHA);
    assert.equal(rebased.history.at(-1).kind, "legacy-rebaselined");
    assert.throws(
      () =>
        advanceStage(rebased, {
          token: "token-1",
          stage: "ready-to-merge",
          now: MERGED_TIME,
          trustedEvidence: pullEvidence({
            liveBaseSha: NEW_BASE_SHA,
            isDraft: false,
            observedAt: MERGED_TIME,
          }),
        }),
      /godkänd review/u,
    );
  });

  it("rejects missing, user-asserted, stale, wrong-base, and wrong-head PR evidence", () => {
    let state = claimed();
    for (const stage of ["verified", "investigated"]) {
      state = advanceStage(state, { token: "token-1", stage, now: LATER });
    }
    state = advanceStage(state, {
      token: "token-1",
      stage: "worktree-ready",
      metadata: { branch: "fix/sm-022-safe-cleanup", worktree: PASS_WORKTREE },
      now: LATER,
    });
    state = advanceStage(state, { token: "token-1", stage: "implemented", now: LATER });
    state = advanceStage(state, { token: "token-1", stage: "reviewed", now: LATER });

    assert.throws(
      () => advanceStage(state, { token: "token-1", stage: "draft-pr", now: LATER }),
      /trustedEvidence/u,
    );
    assert.throws(
      () =>
        advanceStage(state, {
          token: "token-1",
          stage: "draft-pr",
          metadata: { prNumber: 123, headSha: HEAD_SHA, isDraft: true },
          now: LATER,
        }),
      /får inte registreras som metadata/u,
    );
    assert.throws(
      () =>
        advanceStage(state, {
          token: "token-1",
          stage: "draft-pr",
          trustedEvidence: pullEvidence({ observedAt: START }),
          now: LATER,
        }),
      /stale/u,
    );
    assert.throws(
      () =>
        advanceStage(state, {
          token: "token-1",
          stage: "draft-pr",
          trustedEvidence: pullEvidence({ baseRefName: "master" }),
          now: LATER,
        }),
      /base preview/u,
    );
    assert.throws(
      () =>
        advanceStage(state, {
          token: "token-1",
          stage: "draft-pr",
          trustedEvidence: pullEvidence({ localHeadSha: NEW_HEAD_SHA }),
          now: LATER,
        }),
      /lokal aktuell HEAD/u,
    );
  });

  it("requires a fresh open draft for evaluation completion", () => {
    let state = advanceToDraft(claimed(acquired(evaluation())));
    state = independentReview(state);
    assert.throws(
      () =>
        completePass(state, {
          token: "token-1",
          outcome: "draft-fix",
          evidence: "replayed review snapshot",
          now: REVIEW_TIME,
          trustedEvidence: evaluationEvidence({ observedAt: REVIEW_TIME }),
        }),
      /inte nyare/u,
    );
    assert.throws(
      () =>
        completePass(state, {
          token: "token-1",
          outcome: "draft-fix",
          evidence: "merged snapshot",
          now: COMPLETE_TIME,
          trustedEvidence: evaluationEvidence({
            state: "MERGED",
            isDraft: false,
            observedAt: COMPLETE_TIME,
          }),
        }),
      /state OPEN/u,
    );
  });

  it("registers independent-agent with Sol metadata and retires pr-ai-review", () => {
    let state = advanceToDraft(claimed());
    state = advanceStage(state, {
      token: "token-1",
      stage: "ci-review",
      now: LATER,
      trustedEvidence: pullEvidence(),
    });
    assert.throws(
      () =>
        recordReviewPass(state, {
          token: "token-1",
          source: "pr-ai-review",
          verdict: "clean",
          reviewedSha: HEAD_SHA,
          reviewedBaseSha: BASE_SHA,
          now: REVIEW_TIME,
          trustedEvidence: pullEvidence({ observedAt: REVIEW_TIME }),
        }),
      /pensionerad/u,
    );
    assert.throws(
      () =>
        recordReviewPass(state, {
          token: "token-1",
          source: "independent-agent",
          verdict: "clean",
          reviewedSha: HEAD_SHA,
          reviewedBaseSha: BASE_SHA,
          now: REVIEW_TIME,
          trustedEvidence: pullEvidence({ observedAt: REVIEW_TIME }),
        }),
      /gpt-5\.6-sol/u,
    );
    state = independentReview(state);
    assert.deepEqual(state.current.reviewPasses[0].sourceMetadata, {
      model: INDEPENDENT_REVIEW_MODEL,
      procedure: INDEPENDENT_REVIEW_PROCEDURE,
    });
  });

  it("preserves historical pr-ai-review entries and external review metadata", () => {
    let state = advanceToDraft(claimed());
    state = advanceStage(state, {
      token: "token-1",
      stage: "ci-review",
      now: LATER,
      trustedEvidence: pullEvidence(),
    });
    state.current.reviewPasses.push({
      at: REVIEW_TIME,
      source: "pr-ai-review",
      verdict: "clean",
      sha: HEAD_SHA,
      baseSha: BASE_SHA,
      note: "historisk post",
    });
    assert.equal(
      advanceStage(state, {
        token: "token-1",
        stage: "ready-to-merge",
        now: READY_TIME,
        trustedEvidence: pullEvidence({ isDraft: false, observedAt: READY_TIME }),
      }).current.stage,
      "ready-to-merge",
    );

    const external = independentReview(
      advanceStage(advanceToDraft(claimed()), {
        token: "token-1",
        stage: "ci-review",
        now: LATER,
        trustedEvidence: pullEvidence(),
      }),
      {
        source: "manual",
        sourceMetadata: {
          reviewer: "release-owner",
          url: "https://github.com/owner/sajtmaskin/pull/123#review",
          externalId: "review-123",
        },
      },
    );
    assert.equal(external.current.reviewPasses[0].sourceMetadata.externalId, "review-123");
  });

  it("does not decrement remaining when a candidate is skipped", () => {
    const state = skipCandidate(claimed(), {
      token: "token-1",
      reason: "kräver prod-bevis",
      now: LATER,
    });
    assert.equal(state.remainingPasses, 2);
    assert.equal(state.current, null);
    assert.equal(state.status, "cooldown");
  });

  it("forbids skip after a branch/worktree may need handoff", () => {
    for (const stage of STAGES.slice(STAGES.indexOf("worktree-ready"))) {
      const state = claimed();
      state.current.stage = stage;
      assert.throws(
        () =>
          skipCandidate(state, {
            token: "token-1",
            reason: "försök överge pass",
            now: LATER,
          }),
        /skip är förbjudet/u,
        stage,
      );
    }
  });

  it("binds post-worktree-ready mutations to the original app-worktree", () => {
    const state = advanceToDraft(claimed());
    assert.doesNotThrow(() => assertWorktreeBinding(state, PASS_WORKTREE));
    assert.throws(
      () => assertWorktreeBinding(state, resolve("ett-annat-worktree")),
      /bunden till ett annat app-worktree/u,
    );
  });

  it("preserves case on case-sensitive systems but folds it on Windows", () => {
    assert.notEqual(normalizeFsPath("/repo/Task", "linux"), normalizeFsPath("/repo/task", "linux"));
    assert.equal(
      normalizeFsPath("C:/Repo/Task", "win32"),
      normalizeFsPath("c:/repo/task", "win32"),
    );
  });
});

describe("live evidence reader", () => {
  it("uses gh api and bounded read timeouts without network access in the test", () => {
    const calls = [];
    const execFile = (command, args, options) => {
      calls.push({ command, args, options });
      if (command === "git" && args[0] === "branch") return "fix/sm-022-safe-cleanup\n";
      if (command === "git" && args[0] === "rev-parse") return `${HEAD_SHA}\n`;
      if (command === "git" && args[0] === "remote") {
        return "https://github.com/owner/sajtmaskin.git\n";
      }
      if (command === "gh") {
        if (args[1] === "graphql") {
          return JSON.stringify({
            data: {
              repository: {
                nameWithOwner: "owner/sajtmaskin",
                preview: { target: { oid: BASE_SHA } },
              },
            },
          });
        }
        return JSON.stringify({
          number: 123,
          state: "open",
          draft: true,
          merged_at: null,
          merge_commit_sha: "d".repeat(40),
          title: `${EVALUATION_TITLE_PREFIX} test`,
          body: EVALUATION_BODY_MARKER,
          labels: [{ name: "do-not-merge" }],
          base: { ref: "preview", repo: { full_name: "owner/sajtmaskin" } },
          head: {
            ref: "fix/sm-022-safe-cleanup",
            sha: HEAD_SHA,
            repo: { full_name: "owner/sajtmaskin" },
          },
        });
      }
      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    };

    const evidence = readLivePullRequestEvidence({ prNumber: 123, execFile });
    assert.equal(evidence.state, "OPEN");
    assert.equal(evidence.mergeCommitOid, null);
    assert.equal(evidence.liveBaseSha, BASE_SHA);
    assert.equal(evidence.titlePrefixPresent, true);
    assert.equal(evidence.bodyMarkerPresent, true);
    const ghCall = calls.find((call) => call.command === "gh" && call.args[1] !== "graphql");
    assert.deepEqual(ghCall.args, ["api", "repos/{owner}/{repo}/pulls/123", "--method", "GET"]);
    assert.equal(ghCall.options.timeout, 30_000);
    assert.equal(
      calls.find((call) => call.command === "gh" && call.args[1] === "graphql").options.timeout,
      30_000,
    );
    assert.equal(
      calls
        .filter((call) => call.command === "git")
        .every((call) => call.options.timeout === 5_000),
      true,
    );
    assert.equal(
      calls
        .filter((call) => call.command === "git")
        .every((call) => call.options.env.GIT_OPTIONAL_LOCKS === "0"),
      true,
    );
  });

  it("binds cleanup to branch absence, clean worktree, and GitHub merge ancestry", () => {
    const calls = [];
    const execFile = (command, args, options) => {
      calls.push({ command, args, options });
      if (command === "git" && args[0] === "branch") return "fix/sm-022-safe-cleanup\n";
      if (command === "git" && args[0] === "rev-parse") return `${HEAD_SHA}\n`;
      if (command === "git" && args[0] === "remote") {
        return "https://github.com/owner/sajtmaskin.git\n";
      }
      if (command === "git" && args[0] === "ls-remote") return "";
      if (command === "git" && args[0] === "status") return "";
      if (command === "gh" && args[1] === "graphql") {
        return JSON.stringify({
          data: {
            repository: {
              nameWithOwner: "owner/sajtmaskin",
              preview: { target: { oid: NEW_BASE_SHA } },
            },
          },
        });
      }
      if (command === "gh" && args[1].includes("/compare/")) {
        return JSON.stringify({
          status: "ahead",
          merge_base_commit: { sha: MERGE_SHA },
        });
      }
      if (command === "gh") {
        return JSON.stringify({
          number: 123,
          state: "closed",
          draft: false,
          merged_at: MERGED_TIME,
          merge_commit_sha: MERGE_SHA,
          title: "Fix",
          body: "",
          labels: [],
          base: { ref: "preview", repo: { full_name: "owner/sajtmaskin" } },
          head: {
            ref: "fix/sm-022-safe-cleanup",
            sha: HEAD_SHA,
            repo: { full_name: "owner/sajtmaskin" },
          },
        });
      }
      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    };

    const evidence = readLivePullRequestEvidence({
      prNumber: 123,
      execFile,
      includeCleanup: true,
    });
    assert.equal(evidence.state, "MERGED");
    assert.equal(evidence.liveBaseSha, NEW_BASE_SHA);
    assert.equal(evidence.previewAncestryStatus, "ahead");
    assert.equal(evidence.previewMergeBaseSha, MERGE_SHA);
    assert.equal(evidence.remoteBranchAbsent, true);
    assert.equal(evidence.worktreeClean, true);
    assert.equal(
      calls.find((call) => call.command === "git" && call.args[0] === "ls-remote").options.timeout,
      5_000,
    );
    assert.equal(
      calls.find((call) => call.command === "gh" && call.args[1].includes("/compare/")).options
        .timeout,
      30_000,
    );

    assert.throws(
      () =>
        readLivePullRequestEvidence({
          prNumber: 123,
          includeCleanup: true,
          execFile(command, args, options) {
            if (command === "git" && args[0] === "ls-remote") {
              throw new Error("remote lookup failed");
            }
            return execFile(command, args, options);
          },
        }),
      /remote lookup failed/u,
    );
  });

  it("reads rollout policy only from the live preview ref", () => {
    const calls = [];
    const evidence = readLivePreviewPolicyEvidence({
      execFile(command, args, options) {
        calls.push({ command, args, options });
        if (command === "git") return "https://github.com/owner/sajtmaskin.git\n";
        return JSON.stringify({
          data: {
            repository: {
              nameWithOwner: "owner/sajtmaskin",
              preview: { target: { oid: BASE_SHA } },
              agentWorkflow: {
                oid: POLICY_BLOB_SHA,
                text: JSON.stringify({ deliveryBranch: "preview" }),
                isBinary: false,
              },
            },
          },
        });
      },
    });
    assert.equal(evidence.refName, "preview");
    assert.equal(evidence.refSha, BASE_SHA);
    assert.equal(evidence.policyPath, "config/agent-workflow.json");
    assert.equal(evidence.policyBlobSha, POLICY_BLOB_SHA);
    assert.equal(evidence.deliveryBranch, "preview");
    assert.match(
      calls.find((call) => call.command === "gh").args.at(-1),
      /preview:config\/agent-workflow\.json/u,
    );
  });
});

describe("CLI", () => {
  it("persists an evaluation batch without promotion capability", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "godnatt-bugg-evaluation-state-"));
    const run = (...args) =>
      spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
        encoding: "utf8",
        env: { ...process.env, GODNATT_BUGG_STATE_DIR: stateDir },
      });

    try {
      for (const cooldown of ["0", "4"]) {
        const invalidCooldown = run(
          "begin",
          "--count",
          "2",
          "--mode",
          "evaluation",
          "--cooldown-minutes",
          cooldown,
        );
        assert.equal(invalidCooldown.status, 2);
        assert.match(invalidCooldown.stderr, /mellan 5 och 1440/u);
      }

      const begin = run("begin", "--count", "2", "--mode", "evaluation");
      assert.equal(begin.status, 0, begin.stderr);
      const payload = JSON.parse(begin.stdout);
      assert.equal(payload.promotionCode, null);
      assert.equal(payload.state.mode, "evaluation");
      assert.equal(payload.state.requestedPasses, 2);
      assert.equal(payload.state.draftPasses, 0);
      assert.equal(payload.state.mergedPasses, 0);
      assert.equal(payload.state.automationId, null);
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it("persists hash-only lease state and rejects a second live runner", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "godnatt-bugg-state-"));
    const run = (...args) =>
      spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
        encoding: "utf8",
        env: { ...process.env, GODNATT_BUGG_STATE_DIR: stateDir },
      });

    try {
      const invalidPilot = run("begin", "--count", "2", "--mode", "pilot");
      assert.equal(invalidPilot.status, 2);
      assert.match(invalidPilot.stderr, /exakt ett pass/u);

      const begin = run("begin", "--count", "2", "--mode", "evaluation");
      assert.equal(begin.status, 0, begin.stderr);
      const beginPayload = JSON.parse(begin.stdout);
      assert.equal(beginPayload.promotionCode, null);
      assert.equal(beginPayload.state.remainingPasses, 2);
      assert.equal(beginPayload.state.mode, "evaluation");
      assert.equal(beginPayload.state.mergedPasses, 0);
      assert.equal(beginPayload.state.draftPasses, 0);

      const acquire = run("acquire");
      assert.equal(acquire.status, 0, acquire.stderr);
      const acquirePayload = JSON.parse(acquire.stdout);
      assert.ok(acquirePayload.token);
      assert.equal("token" in acquirePayload.state.lease, false);
      assert.doesNotMatch(
        readFileSync(join(stateDir, "state.json"), "utf8"),
        new RegExp(acquirePayload.token, "u"),
      );

      const concurrent = run("acquire");
      assert.equal(concurrent.status, 3);
      assert.match(concurrent.stderr, /aktiv lease/u);

      const status = run("status");
      assert.equal(status.status, 0, status.stderr);
      assert.equal(JSON.parse(status.stdout).state.status, "running");
      assert.doesNotMatch(status.stdout, new RegExp(acquirePayload.token, "u"));
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it("never takes over or unlinks an existing mutex", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "godnatt-bugg-mutex-state-"));
    const run = (...args) =>
      spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
        encoding: "utf8",
        env: { ...process.env, GODNATT_BUGG_STATE_DIR: stateDir },
      });
    const mutexPath = join(stateDir, ".mutex");
    const owner = JSON.stringify({ pid: 999999, acquiredAt: "2000-01-01T00:00:00.000Z" });
    try {
      const begin = run("begin", "--count", "1", "--mode", "evaluation");
      assert.equal(begin.status, 0, begin.stderr);
      writeFileSync(mutexPath, `${owner}\n`, "utf8");

      const status = run("status");
      assert.equal(status.status, 3);
      assert.match(status.stderr, /ägarlås.*aldrig över automatiskt/u);
      assert.equal(readFileSync(mutexPath, "utf8"), `${owner}\n`);
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it("migrates legacy lease secrets under the mutex without changing run status", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "godnatt-bugg-legacy-state-"));
    const run = (...args) =>
      spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
        encoding: "utf8",
        env: { ...process.env, GODNATT_BUGG_STATE_DIR: stateDir },
      });
    const legacyToken = "legacy-raw-runner-secret";
    const historicalToken = "historical-raw-runner-secret";
    try {
      const legacy = acquired();
      legacy.version = 3;
      legacy.lease.token = legacyToken;
      delete legacy.lease.tokenHash;
      legacy.lease.expiresAt = "2099-01-01T00:00:00.000Z";
      legacy.history.push({
        kind: "lease-recovered",
        at: START,
        previousLease: {
          token: historicalToken,
          acquiredAt: START,
          heartbeatAt: START,
          expiresAt: LATER,
        },
      });
      writeFileSync(join(stateDir, "state.json"), `${JSON.stringify(legacy, null, 2)}\n`, "utf8");

      const status = run("status");
      assert.equal(status.status, 0, status.stderr);
      const payload = JSON.parse(status.stdout);
      assert.equal(payload.state.version, 5);
      assert.equal(payload.state.status, "running");
      assert.match(payload.state.lease.tokenHash, /^[a-f0-9]{64}$/u);
      assert.doesNotMatch(status.stdout, /legacy-raw-runner-secret/u);
      assert.doesNotMatch(status.stdout, /historical-raw-runner-secret/u);

      const persisted = readFileSync(join(stateDir, "state.json"), "utf8");
      assert.doesNotMatch(persisted, /legacy-raw-runner-secret/u);
      assert.doesNotMatch(persisted, /historical-raw-runner-secret/u);
      assert.equal(JSON.parse(persisted).status, "running");

      const heartbeat = run("heartbeat", "--token", legacyToken);
      assert.equal(heartbeat.status, 0, heartbeat.stderr);
      assert.doesNotMatch(heartbeat.stdout, /legacy-raw-runner-secret/u);

      const conflict = acquired();
      conflict.version = 3;
      conflict.lease.token = legacyToken;
      conflict.lease.tokenHash = "0".repeat(64);
      conflict.lease.expiresAt = "2099-01-01T00:00:00.000Z";
      writeFileSync(join(stateDir, "state.json"), `${JSON.stringify(conflict, null, 2)}\n`, "utf8");
      const conflictStatus = run("status");
      assert.equal(conflictStatus.status, 0, conflictStatus.stderr);
      assert.equal(JSON.parse(conflictStatus.stdout).state.lease.credentialConflict, true);
      assert.doesNotMatch(conflictStatus.stdout, /legacy-raw-runner-secret/u);
      const rejectedHeartbeat = run("heartbeat", "--token", legacyToken);
      assert.equal(rejectedHeartbeat.status, 3);
      assert.match(rejectedHeartbeat.stderr, /Ogiltig eller saknad runner-token/u);
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });
});
