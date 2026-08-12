import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  EVALUATION_BODY_MARKER,
  EVALUATION_TITLE_PREFIX,
  STAGES,
  RunStateError,
  acquireLease,
  advanceStage,
  assertWorktreeBinding,
  claimCandidate,
  completePass,
  createRunState,
  normalizeFsPath,
  parseActiveQueue,
  pauseRun,
  promoteRun,
  recordReviewPass,
  recoverStaleLease,
  skipCandidate,
} from "./run-state.mjs";

const START = "2026-08-11T20:00:00.000Z";
const LATER = "2026-08-11T20:06:00.000Z";
const MUCH_LATER = "2026-08-12T01:00:00.000Z";
const SECOND_PASS = "2026-08-11T20:12:00.000Z";
const HEAD_SHA = "a".repeat(40);
const NEW_HEAD_SHA = "b".repeat(40);
const MERGE_SHA = "c".repeat(40);
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
  return createRunState({
    count: 2,
    mode: "full",
    cooldownMinutes: 5,
    leaseMinutes: 60,
    now: START,
    runId: "run-1",
    automationId: "godnatt-bugg",
    ...overrides,
  });
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
  return acquireLease(state, { now, token: "token-1" }).state;
}

function claimed(state = acquired(), now = START) {
  return claimCandidate(state, {
    token: "token-1",
    smId: candidate.id,
    candidates: [candidate],
    now,
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
      ? {
          isDraft: true,
          mergeForbidden: true,
          adminReviewRequired: true,
          prTitlePrefix: EVALUATION_TITLE_PREFIX,
          prBodyMarker: EVALUATION_BODY_MARKER,
          blockingLabel: "do-not-merge",
        }
      : state.mode === "pilot"
        ? { isDraft: true }
        : {};
  return advanceStage(state, {
    token,
    stage: "draft-pr",
    metadata: { prNumber, headSha, ...draftMetadata },
    now,
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
    });
    assert.equal(promoted.mode, "full");
    assert.equal(promoted.status, "ready");
    assert.equal(promoted.promotionAuthorizationHash, null);
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
          metadata: { prNumber: 123, headSha: "FULL_SHA" },
          now: LATER,
        }),
      /40-teckens head-SHA/u,
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
          metadata: { prNumber: 123, headSha: HEAD_SHA },
          now: LATER,
        }),
      /kräver is-draft/u,
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
          metadata: { prNumber: 123, headSha: HEAD_SHA, isDraft: false },
          now: LATER,
        }),
      /Pilot draft-pr kräver verifierat is-draft=true/u,
    );
  });

  it("requires a current-SHA review and caps PR review passes at three", () => {
    let state = advanceToDraft(claimed());
    state = advanceStage(state, { token: "token-1", stage: "ci-review", now: LATER });
    for (let index = 0; index < 3; index += 1) {
      state = recordReviewPass(state, {
        token: "token-1",
        source: index === 0 ? "pr-ai-review" : "bugbot-local",
        verdict: "blocked",
        sha: HEAD_SHA,
        note: "fynd kvarstår",
        now: LATER,
      });
    }
    assert.throws(
      () =>
        recordReviewPass(state, {
          token: "token-1",
          source: "bugbot-local",
          verdict: "clean",
          sha: HEAD_SHA,
          now: LATER,
        }),
      /Högst tre/u,
    );
    assert.throws(
      () =>
        advanceStage(state, {
          token: "token-1",
          stage: "ready-to-merge",
          now: LATER,
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

    state = advanceStage(state, { token: "token-1", stage: "ci-review", now: LATER });
    state = recordReviewPass(state, {
      token: "token-1",
      source: "pr-ai-review",
      verdict: "clean",
      sha: HEAD_SHA,
      now: LATER,
    });
    state = advanceStage(state, {
      token: "token-1",
      stage: "ready-to-merge",
      now: LATER,
    });
    state = advanceStage(state, {
      token: "token-1",
      stage: "merged",
      metadata: { mergeSha: MERGE_SHA },
      now: LATER,
    });
    state = advanceStage(state, {
      token: "token-1",
      stage: "cleanup",
      now: LATER,
    });
    state = completePass(state, {
      token: "token-1",
      outcome: "fixed",
      evidence: "PR #123 merged; app-worktree handoff verified",
      now: LATER,
    });

    assert.equal(state.completedPasses, 1);
    assert.equal(state.mergedPasses, 1);
    assert.equal(state.draftPasses, 0);
    assert.equal(state.remainingPasses, 1);
    assert.equal(state.status, "cooldown");
    assert.equal(state.current, null);
    assert.equal(state.lease, null);
    assert.equal(state.notBefore, "2026-08-11T20:11:00.000Z");
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
    state = recordReviewPass(state, {
      token: "token-1",
      source: "bugbot-local",
      verdict: "clean",
      sha: HEAD_SHA,
      note: "inga trovärdiga fynd",
      now: LATER,
    });
    state = completePass(state, {
      token: "token-1",
      outcome: "draft-fix",
      evidence: "PR #123 är draft, adminspärrad och omergad",
      now: LATER,
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
    state = recordReviewPass(state, {
      token: "token-2",
      source: "codex",
      verdict: "findings-fixed",
      sha: NEW_HEAD_SHA,
      note: "fynd åtgärdade på aktuell SHA",
      now: SECOND_PASS,
    });
    state = completePass(state, {
      token: "token-2",
      outcome: "draft-fix",
      evidence: "PR #124 är draft, adminspärrad och omergad",
      now: SECOND_PASS,
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
    assert.equal(state.history.some((entry) => entry.item?.mergeSha), false);
  });

  it("invalidates a clean review when head SHA changes", () => {
    let state = advanceToDraft(claimed());
    state = advanceStage(state, { token: "token-1", stage: "ci-review", now: LATER });
    state = recordReviewPass(state, {
      token: "token-1",
      source: "codex",
      verdict: "clean",
      sha: HEAD_SHA,
      now: LATER,
    });
    state = advanceStage(state, {
      token: "token-1",
      stage: "ci-review",
      metadata: { headSha: NEW_HEAD_SHA },
      now: LATER,
    });
    assert.throws(
      () =>
        advanceStage(state, {
          token: "token-1",
          stage: "ready-to-merge",
          now: LATER,
        }),
      /exakt aktuell head-SHA/u,
    );
  });

  it("uses the latest current-SHA review verdict for merge eligibility", () => {
    let state = advanceToDraft(claimed());
    state = advanceStage(state, { token: "token-1", stage: "ci-review", now: LATER });
    state = recordReviewPass(state, {
      token: "token-1",
      source: "codex",
      verdict: "clean",
      sha: HEAD_SHA,
      now: LATER,
    });
    state = recordReviewPass(state, {
      token: "token-1",
      source: "pr-ai-review",
      verdict: "blocked",
      sha: HEAD_SHA,
      note: "senare fynd",
      now: LATER,
    });
    assert.throws(
      () =>
        advanceStage(state, {
          token: "token-1",
          stage: "ready-to-merge",
          now: LATER,
        }),
      /godkänd review för exakt aktuell head-SHA/u,
    );

    state = recordReviewPass(state, {
      token: "token-1",
      source: "bugbot-local",
      verdict: "findings-fixed",
      sha: HEAD_SHA,
      note: "senaste fynd åtgärdade",
      now: LATER,
    });
    assert.equal(
      advanceStage(state, {
        token: "token-1",
        stage: "ready-to-merge",
        now: LATER,
      }).current.stage,
      "ready-to-merge",
    );
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

  it("persists full state and rejects a second live runner", () => {
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

      const begin = run(
        "begin",
        "--count",
        "2",
        "--mode",
        "full",
        "--automation-id",
        "godnatt-bugg",
      );
      assert.equal(begin.status, 0, begin.stderr);
      const beginPayload = JSON.parse(begin.stdout);
      assert.equal(beginPayload.promotionCode, null);
      assert.equal(beginPayload.state.remainingPasses, 2);
      assert.equal(beginPayload.state.mergedPasses, 0);
      assert.equal(beginPayload.state.draftPasses, 0);

      const acquire = run("acquire");
      assert.equal(acquire.status, 0, acquire.stderr);
      assert.ok(JSON.parse(acquire.stdout).token);

      const concurrent = run("acquire");
      assert.equal(concurrent.status, 3);
      assert.match(concurrent.stderr, /aktiv lease/u);

      const status = run("status");
      assert.equal(status.status, 0, status.stderr);
      assert.equal(JSON.parse(status.stdout).state.status, "running");
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });
});
