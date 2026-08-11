import { describe, expect, it } from "vitest";
import {
  MAX_RUNS,
  applyFollowUpStatuses,
  buildDiffLocationIndex,
  claimRun,
  createInitialState,
  decideReview,
  followUpInstructions,
  followUpJsonSchema,
  isMergedMoreThanOneHourAgo,
  validateExhaustiveResult,
  validateFollowUpResult,
} from "./core.mjs";

const PR = {
  repository: "Jakeminator123/sajtmaskin",
  number: 42,
  baseRef: "master",
  headSha: "a".repeat(40),
  headRepository: "Jakeminator123/sajtmaskin",
  draft: true,
  mergedAt: null,
};

function stateWithFinding() {
  return {
    ...createInitialState(PR),
    exhaustiveReviewCompleted: true,
    totalRunCount: 1,
    latestProcessedHeadSha: "b".repeat(40),
    findings: [
      {
        id: "F-existing",
        title: "Broken branch",
        body: "The new branch returns the wrong value.",
        impact: 7,
        confidence: 90,
        path: "src/example.ts",
        line: 2,
        endLine: null,
        originalCommentId: 7,
        status: "open",
        statusReason: null,
      },
    ],
  };
}

describe("PR review state machine", () => {
  it("allows exactly one initial exhaustive review, including for drafts", () => {
    const state = createInitialState(PR);
    expect(decideReview({ pr: PR, state })).toEqual({ kind: "exhaustive" });
    const claimed = claimRun(state, { kind: "exhaustive", headSha: PR.headSha });
    expect(claimed.latestProcessedHeadSha).toBeNull();
    // Incomplete claim must be reclaimable — not a permanent skip.
    expect(decideReview({ pr: PR, state: claimed })).toEqual({ kind: "exhaustive" });
    const reclaimed = claimRun(claimed, { kind: "exhaustive", headSha: PR.headSha });
    expect(reclaimed.totalRunCount).toBe(1);

    const completed = {
      ...reclaimed,
      exhaustiveReviewCompleted: true,
      latestProcessedHeadSha: PR.headSha,
      lastRun: { ...reclaimed.lastRun, status: "completed", error: null },
    };
    expect(decideReview({ pr: PR, state: completed })).toEqual({
      kind: "skip",
      reason: "head-already-processed",
    });
    expect(decideReview({ pr: { ...PR, headSha: "c".repeat(40) }, state: completed })).toEqual({
      kind: "skip",
      reason: "nothing-to-follow-up",
    });
  });

  it("skips a second exhaustive attempt only after a completed claim", () => {
    const state = {
      ...createInitialState(PR),
      totalRunCount: 1,
      exhaustiveReviewCompleted: false,
      latestProcessedHeadSha: null,
      lastRun: {
        kind: "exhaustive",
        headSha: PR.headSha,
        status: "completed",
        at: "2026-08-11T00:00:00.000Z",
        error: null,
      },
    };
    expect(decideReview({ pr: { ...PR, headSha: "c".repeat(40) }, state })).toEqual({
      kind: "skip",
      reason: "exhaustive-attempt-already-used",
    });
  });

  it("reclaims after a failed claim without burning another run slot", () => {
    const failed = {
      ...claimRun(createInitialState(PR), { kind: "exhaustive", headSha: PR.headSha }),
      lastRun: {
        kind: "exhaustive",
        headSha: PR.headSha,
        status: "failed",
        at: "2026-08-11T00:00:00.000Z",
        error: "runner killed",
      },
    };
    expect(decideReview({ pr: PR, state: failed })).toEqual({ kind: "exhaustive" });
    const reclaimed = claimRun(failed, { kind: "exhaustive", headSha: PR.headSha });
    expect(reclaimed.totalRunCount).toBe(1);
    expect(reclaimed.latestProcessedHeadSha).toBeNull();
  });

  it("counts a new head after a failed run instead of free reclaim", () => {
    const failedOnB = {
      ...stateWithFinding(),
      totalRunCount: MAX_RUNS,
      latestProcessedHeadSha: "b".repeat(40),
      lastRun: {
        kind: "follow-up",
        headSha: "b".repeat(40),
        status: "failed",
        at: "2026-08-11T00:00:00.000Z",
        error: "provider down",
      },
    };
    expect(decideReview({ pr: { ...PR, headSha: "c".repeat(40) }, state: failedOnB })).toEqual({
      kind: "skip",
      reason: "run-limit",
    });
    expect(() =>
      claimRun(failedOnB, { kind: "follow-up", headSha: "c".repeat(40) }),
    ).toThrow("PR review run limit reached");
  });

  it("uses synchronize only for finding-specific follow-up", () => {
    const state = stateWithFinding();
    expect(decideReview({ pr: PR, state })).toMatchObject({
      kind: "follow-up",
      findings: [{ id: "F-existing" }],
    });
  });

  it("never re-reviews a clean PR on later commits", () => {
    const state = { ...stateWithFinding(), findings: [] };
    expect(decideReview({ pr: PR, state })).toEqual({
      kind: "skip",
      reason: "nothing-to-follow-up",
    });
  });

  it("hard-stops after three total runs", () => {
    const state = { ...stateWithFinding(), totalRunCount: MAX_RUNS };
    expect(decideReview({ pr: PR, state })).toEqual({ kind: "skip", reason: "run-limit" });
  });

  it("skips non-master bases and merged PRs", () => {
    expect(
      decideReview({ pr: { ...PR, baseRef: "release" }, state: createInitialState(PR) }),
    ).toEqual({
      kind: "skip",
      reason: "wrong-base",
    });
    expect(
      decideReview({
        pr: { ...PR, mergedAt: "2026-08-11T00:00:00Z" },
        state: createInitialState(PR),
      }),
    ).toEqual({
      kind: "skip",
      reason: "merged",
    });
  });

  it("detects the absolute merged-more-than-one-hour guard", () => {
    expect(
      isMergedMoreThanOneHourAgo(
        { ...PR, mergedAt: "2026-08-11T10:00:00Z" },
        new Date("2026-08-11T11:00:01Z"),
      ),
    ).toBe(true);
  });
});

describe("review output contracts", () => {
  const files = [
    {
      filename: "src/example.ts",
      status: "modified",
      patch: "@@ -1,2 +1,3 @@\n const a = 1;\n+const broken = true;\n return a;",
    },
  ];

  it("publishes only real RIGHT-side diff locations inline", () => {
    const result = validateExhaustiveResult(
      {
        summary: "One valid, one hallucinated.",
        findings: [
          {
            title: "Valid",
            body: "Changed line is broken.",
            impact: 8,
            confidence: 95,
            path: "src/example.ts",
            line: 2,
            endLine: null,
          },
          {
            title: "Hallucinated",
            body: "This line is not in the diff.",
            impact: 9,
            confidence: 99,
            path: "src/example.ts",
            line: 99,
            endLine: null,
          },
        ],
      },
      buildDiffLocationIndex(files),
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.title).toBe("Valid");
  });

  it("discards unknown paths without throwing so valid findings still publish", () => {
    const result = validateExhaustiveResult(
      {
        summary: "One valid, one unknown file.",
        findings: [
          {
            title: "Valid",
            body: "Changed line is broken.",
            impact: 8,
            confidence: 95,
            path: "src/example.ts",
            line: 2,
            endLine: null,
          },
          {
            title: "Unknown path",
            body: "Model invented a file outside the diff.",
            impact: 9,
            confidence: 99,
            path: "src/missing.ts",
            line: 1,
            endLine: null,
          },
        ],
      },
      buildDiffLocationIndex(files),
    );
    expect(result.discardedFindings).toBe(1);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.title).toBe("Valid");
  });

  it("makes it structurally impossible for follow-up output to add findings", () => {
    const schema = followUpJsonSchema(["F-existing"]);
    expect(schema.properties).toEqual({ statuses: expect.any(Object) });
    expect(JSON.stringify(schema)).not.toContain('"findings"');
    expect(followUpInstructions(["F-existing"])).toContain(
      "Do not search for, mention, or output any new",
    );
  });

  it("rejects unknown, duplicate, or omitted finding IDs", () => {
    const findings = stateWithFinding().findings;
    expect(() =>
      validateFollowUpResult(
        { statuses: [{ findingId: "F-new", status: "fixed", reason: "No longer present." }] },
        findings,
      ),
    ).toThrow("changed the finding set");
    expect(() => validateFollowUpResult({ statuses: [] }, findings)).toThrow("omitted");
  });

  it("updates only existing finding statuses", () => {
    const state = stateWithFinding();
    const updated = applyFollowUpStatuses(state, [
      { findingId: "F-existing", status: "fixed", reason: "Guard added." },
    ]);
    expect(updated.findings).toHaveLength(1);
    expect(updated.findings[0]).toMatchObject({ id: "F-existing", status: "fixed" });
  });
});
