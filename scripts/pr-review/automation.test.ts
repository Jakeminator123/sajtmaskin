import { describe, expect, it } from "vitest";
import { createInitialState, parseStateComment, renderStateComment } from "./core.mjs";
import { runReviewAutomation } from "./automation.mjs";

function createHarness() {
  const pr = {
    repository: "Jakeminator123/sajtmaskin",
    number: 88,
    baseRef: "master",
    headSha: "a".repeat(40),
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
  const reviews: Array<{ id: number; body: string; author: string }> = [];
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
    async createReview(_number: number, body: { body: string; comments: Array<{ body: string }> }) {
      writes += 1;
      const review = { id: nextId++, body: body.body, author: "github-actions[bot]" };
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

  it("uses later synchronize events only for existing findings", async () => {
    const harness = createHarness();
    await runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 });
    harness.pr.headSha = "b".repeat(40);
    await runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 });
    expect(harness.calls).toEqual({ exhaustive: 1, followUp: 1 });
    expect(harness.reviews).toHaveLength(1);
    expect(currentState(harness).findings).toMatchObject([{ status: "fixed" }]);

    harness.pr.headSha = "c".repeat(40);
    await runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 });
    expect(harness.calls).toEqual({ exhaustive: 1, followUp: 1 });
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

  it("records provider failure without claiming a successful exhaustive review", async () => {
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
      lastRun: { status: "failed" },
    });
    expect(harness.reviews).toHaveLength(0);
    harness.pr.headSha = "b".repeat(40);
    await runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 });
    expect(harness.calls.exhaustive).toBe(1);
  });

  it("never re-runs a clean exhaustive review on a later head", async () => {
    const harness = createHarness();
    harness.model.exhaustive = async () => {
      harness.calls.exhaustive += 1;
      return { summary: "Clean.", findings: [] };
    };
    await runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 });
    harness.pr.headSha = "b".repeat(40);
    await runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 });
    expect(harness.calls).toEqual({ exhaustive: 1, followUp: 0 });
    expect(harness.reviews).toHaveLength(1);
  });

  it("fails closed instead of publishing hallucinated inline locations", async () => {
    const harness = createHarness();
    harness.model.exhaustive = async () => {
      harness.calls.exhaustive += 1;
      return {
        summary: "Unverifiable.",
        findings: [
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
    await expect(
      runReviewAutomation({ github: harness.github, model: harness.model, prNumber: 88 }),
    ).rejects.toThrow("ogiltig eller overifierbar diffposition");
    expect(harness.reviews).toHaveLength(0);
    expect(currentState(harness).lastRun.status).toBe("failed");
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
