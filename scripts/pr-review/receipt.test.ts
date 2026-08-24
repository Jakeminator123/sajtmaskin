import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildCheckRunPayload,
  createReviewRunResult,
  decideTrustedReceipt,
  publishTrustedReceipt,
  writeReviewRunResult,
} from "./receipt.mjs";

const head1 = "a".repeat(40);
const head2 = "b".repeat(40);
const temporaryDirectories: string[] = [];

function exhaustiveResult(headSha = head1) {
  return {
    kind: "exhaustive",
    publishedReview: { reviewId: 1234, headSha },
    state: {
      latestProcessedHeadSha: headSha,
      github: { exhaustiveReviewId: 1234 },
      lastRun: {
        kind: "exhaustive",
        headSha,
        status: "completed",
      },
    },
  };
}

async function resultPath() {
  const directory = await mkdtemp(join(tmpdir(), "pr-review-receipt-"));
  temporaryDirectories.push(directory);
  return join(directory, "result.json");
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("trusted PR review receipt", () => {
  it("writes a machine-readable qualification only for a published exhaustive review", async () => {
    const path = await resultPath();
    const runResult = await writeReviewRunResult(path, exhaustiveResult());

    expect(runResult).toEqual({
      version: 1,
      automationKind: "exhaustive",
      outcome: "qualified",
      review: {
        kind: "exhaustive",
        scope: "full-current-diff",
        headSha: head1,
        reviewId: 1234,
      },
      reason: null,
    });
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(runResult);
    expect(decideTrustedReceipt({ runResult, currentHeadSha: head1 }).conclusion).toBe("success");
  });

  it.each([
    [{ kind: "skip", reason: "nothing-to-follow-up" }, "nothing-to-follow-up"],
    [{ kind: "skip", reason: "head-already-processed" }, "head-already-processed"],
    [
      {
        kind: "follow-up",
        state: {
          latestProcessedHeadSha: head2,
          github: { exhaustiveReviewId: 1234 },
          lastRun: { kind: "follow-up", headSha: head2, status: "completed" },
        },
      },
      "follow-up-does-not-review-current-diff",
    ],
  ])("never qualifies a skip or finding-only follow-up: %s", (automationResult, reason) => {
    const runResult = createReviewRunResult(automationResult);
    expect(runResult).toMatchObject({ outcome: "unqualified", review: null, reason });
    expect(decideTrustedReceipt({ runResult, currentHeadSha: head2 }).conclusion).toBe(
      "action_required",
    );
  });

  it("blocks a previously qualified review when GitHub has moved to a new head", () => {
    const runResult = createReviewRunResult(exhaustiveResult(head1));
    expect(decideTrustedReceipt({ runResult, currentHeadSha: head2 })).toMatchObject({
      conclusion: "action_required",
      title: "Trusted PR AI review is stale",
    });
    expect(buildCheckRunPayload({ runResult, currentHeadSha: head2, prNumber: 88 })).toMatchObject({
      name: "trusted-pr-ai-review",
      head_sha: head2,
      status: "completed",
      conclusion: "action_required",
    });
  });

  it("does not qualify an incomplete or unpublished exhaustive attempt", () => {
    const complete = exhaustiveResult();
    const unpublished = {
      ...complete,
      state: { ...complete.state, github: { exhaustiveReviewId: null } },
    };
    const incomplete = {
      ...complete,
      state: {
        ...complete.state,
        lastRun: { ...complete.state.lastRun, status: "running" },
      },
    };

    expect(createReviewRunResult(unpublished)).toMatchObject({
      outcome: "unqualified",
      review: null,
    });
    expect(createReviewRunResult(incomplete)).toMatchObject({
      outcome: "unqualified",
      review: null,
    });
  });

  it("qualifies a same-head recovery only with matching published-review evidence", () => {
    const complete = exhaustiveResult();
    const recovery = { ...complete, kind: "receipt-recovery" };
    const forged = { ...recovery, publishedReview: null };
    const mismatched = {
      ...recovery,
      publishedReview: { ...recovery.publishedReview, reviewId: 9999 },
    };

    expect(createReviewRunResult(recovery)).toMatchObject({
      automationKind: "receipt-recovery",
      outcome: "qualified",
      review: { headSha: head1, reviewId: 1234 },
    });
    expect(createReviewRunResult(forged)).toMatchObject({
      outcome: "unqualified",
      review: null,
    });
    expect(createReviewRunResult(mismatched)).toMatchObject({
      outcome: "unqualified",
      review: null,
    });
  });

  it("re-fetches the live PR head before publishing and cannot attest stale model output", async () => {
    const path = await resultPath();
    await writeFile(path, `${JSON.stringify(createReviewRunResult(exhaustiveResult(head1)))}\n`);
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      if (!init?.method || init.method === "GET") {
        return new Response(JSON.stringify({ head: { sha: head2 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ id: 99 }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const payload = await publishTrustedReceipt({
      token: "test-token",
      repository: "Jakeminator123/sajtmaskin",
      prNumber: 88,
      resultPath: path,
      fetchImpl,
    });

    expect(requests.map((request) => request.url)).toEqual([
      "https://api.github.com/repos/Jakeminator123/sajtmaskin/pulls/88",
      "https://api.github.com/repos/Jakeminator123/sajtmaskin/check-runs",
    ]);
    expect(payload).toMatchObject({ head_sha: head2, conclusion: "action_required" });
    expect(JSON.parse(String(requests[1]?.init?.body))).toEqual(payload);
  });

  it("treats a missing or malformed machine result as non-success", () => {
    expect(decideTrustedReceipt({ runResult: null, currentHeadSha: head2 }).conclusion).toBe(
      "action_required",
    );
    expect(
      decideTrustedReceipt({
        runResult: { version: 1, outcome: "qualified", review: null },
        currentHeadSha: head2,
      }).conclusion,
    ).toBe("action_required");
    expect(
      decideTrustedReceipt({
        runResult: {
          ...createReviewRunResult(exhaustiveResult(head2)),
          automationKind: "skip",
        },
        currentHeadSha: head2,
      }).conclusion,
    ).toBe("action_required");
  });
});
