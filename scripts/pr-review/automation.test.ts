import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createInitialState, parseStateComment, renderStateComment } from "./core.mjs";
import {
  assertCompletePullFileUniverse,
  MAX_GITHUB_PULL_FILES,
  runReviewAutomation,
} from "./automation.mjs";
import {
  createReviewRunResult,
  decideTrustedReceipt,
  publishTrustedReceipt,
  writeReviewRunResult,
} from "./receipt.mjs";

function createHarness() {
  const pr = {
    repository: "Jakeminator123/sajtmaskin",
    number: 88,
    baseRef: "master",
    headSha: "a".repeat(40),
    changedFiles: 1,
    headRepository: "Jakeminator123/sajtmaskin",
    draft: true,
    mergedAt: null as string | null,
  };
  const issueComments: Array<{
    id: number;
    body: string;
    createdAt: string;
    authorAssociation: string;
    author: string;
  }> = [];
  const reviews: Array<{ id: number; body: string; author: string; commitId: string }> = [];
  const reviewComments: Array<{ id: number; body: string; author: string }> = [];
  let nextId = 1;
  let writes = 0;
  const calls = { exhaustive: 0, followUp: 0 };

  const github = {
    async getPullRequest() {
      return { ...pr };
    },
    async listIssueComments() {
      return issueComments.map((item) => ({ ...item }));
    },
    async listReviews() {
      return reviews.map((item) => ({ ...item }));
    },
    async listReviewComments() {
      return reviewComments.map((item) => ({ ...item }));
    },
    async listPullFiles() {
      return [
        {
          filename: "src/example.ts",
          status: "modified",
          patch: "@@ -1,1 +1,2 @@\n const ok = true;\n+const broken = true;",
        },
      ];
    },
    async getPullDiff() {
      return "diff --git a/src/example.ts b/src/example.ts\n+const broken = true;";
    },
    async createIssueComment(_number: number, body: string) {
      writes += 1;
      const created = {
        id: nextId++,
        body,
        createdAt: "2026-08-11T12:00:00Z",
        authorAssociation: "NONE",
        author: "github-actions[bot]",
      };
      issueComments.push(created);
      return created;
    },
    async updateIssueComment(id: number, body: string) {
      writes += 1;
      const comment = issueComments.find((item) => item.id === id);
      if (!comment) throw new Error("comment missing");
      comment.body = body;
      return comment;
    },
    async createReview(
      _number: number,
      body: { body: string; commit_id: string; comments: Array<{ body: string }> },
    ) {
      writes += 1;
      const review = {
        id: nextId++,
        body: body.body,
        author: "github-actions[bot]",
        commitId: body.commit_id,
      };
      reviews.push(review);
      for (const comment of body.comments) {
        reviewComments.push({ id: nextId++, body: comment.body, author: "github-actions[bot]" });
      }
      return review;
    },
    async reactToReviewComment() {
      writes += 1;
      return {};
    },
    async getFindingContext() {
      return {
        relevantFiles: [{ path: "src/example.ts", content: "const broken = false;" }],
        maintainerComments: [],
      };
    },
  };

  const model = {
    async exhaustive() {
      calls.exhaustive += 1;
      return {
        summary: "One credible finding.",
        findings: [
          {
            title: "Broken value",
            body: "The added value violates the branch contract.",
            impact: 7,
            confidence: 90,
            path: "src/example.ts",
            line: 2,
            endLine: null,
          },
        ],
      };
    },
    async followUp(_input: string, expectedIds: string[]) {
      calls.followUp += 1;
      return {
        statuses: expectedIds.map((findingId) => ({
          findingId,
          status: "fixed",
          reason: "The value is now guarded.",
        })),
      };
    },
  };

  return {
    pr,
    github,
    model,
    calls,
    reviews,
    reviewComments,
    issueComments,
    get writes() {
      return writes;
    },
  };
}

function currentState(harness: ReturnType<typeof createHarness>) {
  const state = harness.issueComments
    .map((comment) => parseStateComment(comment.body))
    .find(Boolean);
  if (!state) throw new Error("state missing");
  return state;
}

describe("PR review automation integration", () => {
  it("fails closed before the model when GitHub cannot return the complete file universe", async () => {
    const harness = createHarness();
    harness.pr.changedFiles = MAX_GITHUB_PULL_FILES + 1;

    const result = await runReviewAutomation({
      github: harness.github,
      model: harness.model,
      prNumber: 88,
    });

    expect(result).toMatchObject({
      kind: "skip",
      reason: "incomplete-pull-file-universe",
      state: { lastRun: { status: "failed" } },
    });
    expect(harness.calls).toEqual({ exhaustive: 0, followUp: 0 });
    expect(harness.reviews).toHaveLength(0);
    const runResult = createReviewRunResult(result);
    expect(runResult).toMatchObject({
      outcome: "unqualified",
      reason: "incomplete-pull-file-universe",
    });
    expect(decideTrustedReceipt({ runResult, currentHeadSha: harness.pr.headSha }).conclusion).toBe(
      "action_required",
    );
  });

  it("rejects mismatched or duplicate pull-file responses below the API cap", () => {
    expect(() =>
      assertCompletePullFileUniverse({
        changedFiles: 2,
        files: [{ filename: "a.ts" }],
      }),
    ).toThrow("reported 2 changed files but returned 1");
    expect(() =>
      assertCompletePullFileUniverse({
        changedFiles: 2,
        files: [{ filename: "a.ts" }, { filename: "a.ts" }],
      }),
    ).toThrow("duplicate pull-file records");
  });

  it("creates one exhaustive review and duplicate delivery creates no second review", async () => {
    const harness = createHarness();
    await runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 });
    await runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 });
    expect(harness.calls).toEqual({ exhaustive: 1, followUp: 0 });
    expect(harness.reviews).toHaveLength(1);
    expect(currentState(harness)).toMatchObject({
      exhaustiveReviewCompleted: true,
      totalRunCount: 1,
    });
  });

  it("recovers a failed receipt on the same head without another model call", async () => {
    const harness = createHarness();
    const directory = await mkdtemp(join(tmpdir(), "pr-review-recovery-"));
    const resultPath = join(directory, "result.json");
    const currentHeadResponse = () =>
      new Response(JSON.stringify({ head: { sha: harness.pr.headSha } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    try {
      const first = await runReviewAutomation({
        github: harness.github,
        model: harness.model,
        prNumber: 88,
      });
      await writeReviewRunResult(resultPath, first);
      const failingFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
        if (!init?.method || init.method === "GET") return currentHeadResponse();
        return new Response("check service unavailable", { status: 502 });
      }) as typeof fetch;
      await expect(
        publishTrustedReceipt({
          token: "test-token",
          repository: "Jakeminator123/sajtmaskin",
          prNumber: 88,
          resultPath,
          fetchImpl: failingFetch,
        }),
      ).rejects.toThrow("GitHub API POST /check-runs failed (502)");

      const writesBeforeRecovery = harness.writes;
      const recovered = await runReviewAutomation({
        github: harness.github,
        model: harness.model,
        prNumber: 88,
      });
      expect(recovered).toMatchObject({
        kind: "receipt-recovery",
        publishedReview: {
          reviewId: expect.any(Number),
          headSha: harness.pr.headSha,
        },
      });
      expect(harness.calls).toEqual({ exhaustive: 1, followUp: 0 });
      expect(harness.reviews).toHaveLength(1);
      expect(harness.writes).toBe(writesBeforeRecovery);

      await writeReviewRunResult(resultPath, recovered);
      const successfulFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
        if (!init?.method || init.method === "GET") return currentHeadResponse();
        return new Response(JSON.stringify({ id: 99 }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;
      await expect(
        publishTrustedReceipt({
          token: "test-token",
          repository: "Jakeminator123/sajtmaskin",
          prNumber: 88,
          resultPath,
          fetchImpl: successfulFetch,
        }),
      ).resolves.toMatchObject({
        head_sha: harness.pr.headSha,
        conclusion: "success",
      });
    } finally {
      await rm(directory, { recursive: true });
    }
  });

  it("does not recover a receipt when review commit and trusted marker disagree", async () => {
    const harness = createHarness();
    await runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 });
    const publishedReview = harness.reviews[0];
    if (!publishedReview) throw new Error("review missing");
    publishedReview.commitId = "b".repeat(40);

    const result = await runReviewAutomation({
      github: harness.github,
      model: harness.model,
      prNumber: 88,
    });
    expect(result).toEqual({ kind: "skip", reason: "head-already-processed" });
    expect(createReviewRunResult(result).outcome).toBe("unqualified");
    expect(harness.calls).toEqual({ exhaustive: 1, followUp: 0 });
    expect(harness.reviews).toHaveLength(1);
  });

  it("keeps an older open finding in the resolution ledger after a clean new head", async () => {
    const harness = createHarness();
    await runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 });
    const originalFinding = currentState(harness).findings[0];
    if (!originalFinding) throw new Error("finding missing");
    expect(originalFinding.status).toBe("open");

    harness.pr.headSha = "b".repeat(40);
    harness.model.exhaustive = async () => {
      harness.calls.exhaustive += 1;
      return { summary: "No new findings.", findings: [] };
    };
    await runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 });

    expect(currentState(harness).findings).toEqual([]);
    expect(currentState(harness).resolutionLedger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: originalFinding.id,
          status: "open",
          originalCommentId: originalFinding.originalCommentId,
          firstSeenHeadSha: "a".repeat(40),
          lastSeenHeadSha: "a".repeat(40),
        }),
      ]),
    );
  });

  it("heals sticky incomplete lastRun from a published exhaustive review", async () => {
    const harness = createHarness();
    await runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 });
    const stateComment = harness.issueComments.find((comment) => parseStateComment(comment.body));
    if (!stateComment) throw new Error("state missing");
    const broken = {
      ...currentState(harness),
      latestProcessedHeadSha: null,
      lastRun: {
        kind: "exhaustive",
        headSha: harness.pr.headSha,
        status: "running",
        at: "2026-08-11T12:00:00.000Z",
        error: null,
      },
    };
    stateComment.body = renderStateComment(broken);

    await runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 });
    expect(harness.calls).toEqual({ exhaustive: 1, followUp: 0 });
    expect(currentState(harness)).toMatchObject({
      exhaustiveReviewCompleted: true,
      latestProcessedHeadSha: harness.pr.headSha,
      lastRun: { status: "completed" },
    });
  });

  it("recovers a deleted state comment without resetting reviewed-head budget", async () => {
    const harness = createHarness();
    await runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 });
    harness.pr.headSha = "b".repeat(40);
    await runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 });
    harness.issueComments.splice(0);

    const duplicate = await runReviewAutomation({
      github: harness.github,
      model: harness.model,
      prNumber: 88,
    });
    expect(duplicate).toMatchObject({
      kind: "receipt-recovery",
      publishedReview: { headSha: "b".repeat(40) },
    });
    expect(createReviewRunResult(duplicate).outcome).toBe("qualified");
    expect(harness.calls).toEqual({ exhaustive: 2, followUp: 0 });
    expect(currentState(harness)).toMatchObject({
      firstReviewedHeadSha: "a".repeat(40),
      latestProcessedHeadSha: "b".repeat(40),
      totalRunCount: 2,
    });

    harness.pr.headSha = "c".repeat(40);
    await runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 });
    expect(harness.calls).toEqual({ exhaustive: 3, followUp: 0 });
    expect(currentState(harness).totalRunCount).toBe(3);
  });

  it("does not publish a duplicate when a branch returns to a reviewed SHA", async () => {
    const harness = createHarness();
    await runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 });
    harness.pr.headSha = "b".repeat(40);
    await runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 });
    harness.pr.headSha = "a".repeat(40);

    const result = await runReviewAutomation({
      github: harness.github,
      model: harness.model,
      prNumber: 88,
    });
    expect(result).toMatchObject({
      kind: "receipt-recovery",
      publishedReview: { headSha: "a".repeat(40) },
    });
    expect(createReviewRunResult(result).outcome).toBe("qualified");
    expect(harness.calls).toEqual({ exhaustive: 2, followUp: 0 });
    expect(harness.reviews).toHaveLength(2);
    expect(currentState(harness)).toMatchObject({
      firstReviewedHeadSha: "a".repeat(40),
      latestProcessedHeadSha: "a".repeat(40),
      totalRunCount: 2,
    });
  });

  it("upgrades a legacy finding-only current head to a qualifying exhaustive review", async () => {
    const harness = createHarness();
    await runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 });
    harness.pr.headSha = "b".repeat(40);
    const stateComment = harness.issueComments.find((comment) => parseStateComment(comment.body));
    if (!stateComment) throw new Error("state missing");
    const legacy = {
      ...currentState(harness),
      latestProcessedHeadSha: harness.pr.headSha,
      totalRunCount: 2,
      lastRun: {
        kind: "follow-up",
        headSha: harness.pr.headSha,
        status: "completed",
        at: "2026-08-11T12:00:00.000Z",
        error: null,
      },
    };
    stateComment.body = renderStateComment(legacy);

    const result = await runReviewAutomation({
      github: harness.github,
      model: harness.model,
      prNumber: 88,
    });
    expect(harness.calls).toEqual({ exhaustive: 2, followUp: 0 });
    expect(harness.reviews).toHaveLength(2);
    expect(createReviewRunResult(result)).toMatchObject({
      outcome: "qualified",
      review: { headSha: "b".repeat(40) },
    });
    expect(currentState(harness)).toMatchObject({
      latestProcessedHeadSha: "b".repeat(40),
      totalRunCount: 3,
      lastRun: { kind: "exhaustive", status: "completed" },
    });
  });

  it("does not heal a failed new-head review from an older published review", async () => {
    const harness = createHarness();
    await runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 });
    harness.pr.headSha = "b".repeat(40);
    harness.model.exhaustive = async () => {
      harness.calls.exhaustive += 1;
      throw new Error("exhaustive provider down");
    };
    await expect(
      runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 }),
    ).rejects.toThrow("exhaustive provider down");
    expect(currentState(harness).lastRun).toMatchObject({
      kind: "exhaustive",
      headSha: "b".repeat(40),
      status: "failed",
    });
    expect(currentState(harness).latestProcessedHeadSha).toBe("a".repeat(40));

    harness.model.exhaustive = async () => {
      harness.calls.exhaustive += 1;
      return { summary: "Recovered current head.", findings: [] };
    };
    await runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 });
    expect(harness.calls).toEqual({ exhaustive: 3, followUp: 0 });
    expect(harness.reviews).toHaveLength(2);
    expect(currentState(harness).lastRun).toMatchObject({
      kind: "exhaustive",
      headSha: "b".repeat(40),
      status: "completed",
    });
    expect(currentState(harness).totalRunCount).toBe(2);
  });

  it("runs a qualifying exhaustive review for each new head until the run limit", async () => {
    const harness = createHarness();
    await runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 });
    harness.pr.headSha = "b".repeat(40);
    const head2Result = await runReviewAutomation({
      github: harness.github,
      model: harness.model,
      prNumber: 88,
    });
    expect(createReviewRunResult(head2Result)).toMatchObject({
      automationKind: "exhaustive",
      outcome: "qualified",
      review: { headSha: "b".repeat(40) },
    });

    harness.pr.headSha = "c".repeat(40);
    const head3Result = await runReviewAutomation({
      github: harness.github,
      model: harness.model,
      prNumber: 88,
    });
    expect(createReviewRunResult(head3Result)).toMatchObject({
      outcome: "qualified",
      review: { headSha: "c".repeat(40) },
    });
    expect(harness.calls).toEqual({ exhaustive: 3, followUp: 0 });
    expect(harness.reviews).toHaveLength(3);
    expect(currentState(harness)).toMatchObject({
      firstReviewedHeadSha: "a".repeat(40),
      latestProcessedHeadSha: "c".repeat(40),
      totalRunCount: 3,
    });

    harness.pr.headSha = "d".repeat(40);
    const head4Result = await runReviewAutomation({
      github: harness.github,
      model: harness.model,
      prNumber: 88,
    });
    expect(head4Result).toEqual({ kind: "skip", reason: "run-limit" });
    expect(createReviewRunResult(head4Result).outcome).toBe("unqualified");
    expect(harness.calls).toEqual({ exhaustive: 3, followUp: 0 });
  });

  it("skips a merged PR before every model and write operation", async () => {
    const harness = createHarness();
    harness.pr.mergedAt = "2026-08-11T10:00:00Z";
    const result = await runReviewAutomation({
      github: harness.github,
      model: harness.model,
      prNumber: 88,
      now: new Date("2026-08-11T12:00:00Z"),
    });
    expect(result).toEqual({ kind: "skip", reason: "merged", modelCalls: 0, writes: 0 });
    expect(harness.calls).toEqual({ exhaustive: 0, followUp: 0 });
    expect(harness.writes).toBe(0);
  });

  it("does not publish when the PR head moves while the model is reviewing", async () => {
    const harness = createHarness();
    harness.model.exhaustive = async () => {
      harness.calls.exhaustive += 1;
      harness.pr.headSha = "b".repeat(40);
      return { summary: "Stale result.", findings: [] };
    };

    await expect(
      runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 }),
    ).rejects.toThrow("PR head or base changed during exhaustive review");
    expect(harness.reviews).toHaveLength(0);
    expect(currentState(harness)).toMatchObject({
      latestProcessedHeadSha: null,
      lastRun: {
        kind: "exhaustive",
        headSha: "a".repeat(40),
        status: "failed",
      },
    });
  });

  it("records provider failure and allows reclaim on a later head", async () => {
    const harness = createHarness();
    harness.model.exhaustive = async () => {
      harness.calls.exhaustive += 1;
      throw new Error("provider unavailable");
    };
    await expect(
      runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 }),
    ).rejects.toThrow("provider unavailable");
    expect(currentState(harness)).toMatchObject({
      totalRunCount: 1,
      exhaustiveReviewCompleted: false,
      latestProcessedHeadSha: null,
      lastRun: { status: "failed" },
    });
    expect(harness.reviews).toHaveLength(0);
    harness.pr.headSha = "b".repeat(40);
    harness.model.exhaustive = async () => {
      harness.calls.exhaustive += 1;
      return { summary: "Recovered.", findings: [] };
    };
    await runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 });
    expect(harness.calls.exhaustive).toBe(2);
    expect(currentState(harness).lastRun.status).toBe("completed");
  });

  it("re-runs a clean exhaustive review and qualifies the new head", async () => {
    const harness = createHarness();
    harness.model.exhaustive = async () => {
      harness.calls.exhaustive += 1;
      return { summary: "Clean.", findings: [] };
    };
    const head1Result = await runReviewAutomation({
      github: harness.github,
      model: harness.model,
      prNumber: 88,
    });
    harness.pr.headSha = "b".repeat(40);
    const head2Result = await runReviewAutomation({
      github: harness.github,
      model: harness.model,
      prNumber: 88,
    });
    expect(harness.calls).toEqual({ exhaustive: 2, followUp: 0 });
    expect(harness.reviews).toHaveLength(2);
    expect(createReviewRunResult(head1Result)).toMatchObject({
      outcome: "qualified",
      review: { headSha: "a".repeat(40) },
    });
    expect(createReviewRunResult(head2Result)).toMatchObject({
      outcome: "qualified",
      review: { headSha: "b".repeat(40) },
    });
  });

  it("fails closed when any inline location cannot be anchored to the complete diff", async () => {
    const harness = createHarness();
    harness.model.exhaustive = async () => {
      harness.calls.exhaustive += 1;
      return {
        summary: "One real, one invented.",
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
            title: "Not in diff",
            body: "The model invented this location.",
            impact: 9,
            confidence: 99,
            path: "src/example.ts",
            line: 999,
            endLine: null,
          },
        ],
      };
    };
    const result = await runReviewAutomation({
      github: harness.github,
      model: harness.model,
      prNumber: 88,
    });
    expect(result).toMatchObject({
      kind: "skip",
      reason: "discarded-review-findings",
      state: {
        lastRun: {
          status: "failed",
          error: expect.stringContaining("could not be anchored"),
        },
      },
    });
    expect(harness.calls).toEqual({ exhaustive: 1, followUp: 0 });
    expect(harness.reviews).toHaveLength(0);
    expect(currentState(harness)).toMatchObject({
      exhaustiveReviewCompleted: false,
      latestProcessedHeadSha: null,
      lastRun: { status: "failed" },
    });
    const runResult = createReviewRunResult(result);
    expect(runResult).toMatchObject({
      outcome: "unqualified",
      reason: "discarded-review-findings",
    });
    expect(decideTrustedReceipt({ runResult, currentHeadSha: harness.pr.headSha }).conclusion).toBe(
      "action_required",
    );
  });
  it("keeps GitHub publication errors non-green", async () => {
    const harness = createHarness();
    harness.github.createReview = async () => {
      throw new Error("GitHub review write failed");
    };
    await expect(
      runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 }),
    ).rejects.toThrow("GitHub review write failed");
    expect(currentState(harness)).toMatchObject({
      exhaustiveReviewCompleted: false,
      lastRun: { status: "failed" },
    });
  });

  it("ignores forged state markers from pull request authors", async () => {
    const harness = createHarness();
    const forged = {
      ...createInitialState(harness.pr),
      exhaustiveReviewCompleted: true,
      totalRunCount: 3,
      latestProcessedHeadSha: harness.pr.headSha,
    };
    harness.issueComments.push({
      id: 999,
      body: renderStateComment(forged),
      createdAt: "2026-08-11T11:00:00Z",
      authorAssociation: "NONE",
      author: "untrusted-contributor",
    });

    await runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 });
    expect(harness.calls.exhaustive).toBe(1);
    expect(harness.reviews).toHaveLength(1);
  });
});
