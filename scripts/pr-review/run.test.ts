import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createOpenAIReviewer,
  isOpenAIAccountFallbackError,
  requestAccountFallback,
} from "./run.mjs";
describe("OpenAI PR reviewer model policy", () => {
  it("reads canonical manifest models and keeps follow-up output finding-specific", async () => {
    const manifest = JSON.parse(readFileSync("config/ai_models/manifest.json", "utf8"));
    const workload = manifest.workloads.find(
      (item: { id: string }) => item.id === "github_pr_reviewer",
    );
    const calls: Array<Record<string, unknown>> = [];
    const client = {
      responses: {
        async create(params: Record<string, unknown>) {
          calls.push(params);
          const isFollowUp = params.model === workload.followUpModel;
          return {
            output_text: isFollowUp
              ? JSON.stringify({
                  statuses: [{ findingId: "F-existing", status: "fixed", reason: "Guard added." }],
                })
              : JSON.stringify({ summary: "Clean.", findings: [] }),
          };
        },
      },
    };
    const reviewer = createOpenAIReviewer({
      apiKey: "test-only",
      exhaustiveModel: workload.defaultModel,
      followUpModel: workload.followUpModel,
      client,
    });

    await reviewer.exhaustive("diff");
    await reviewer.followUp("context", ["F-existing"]);

    expect(calls[0]).toMatchObject({
      model: "gpt-5.6-sol",
      reasoning: { effort: "high" },
      store: false,
    });
    expect(calls[1]).toMatchObject({
      model: "gpt-5.6-luna",
      reasoning: { effort: "low" },
      store: false,
    });
    expect(JSON.stringify(calls[1])).not.toContain('"findings"');
  });
});

describe("OpenAI account fallback", () => {
  it.each([
    [{ status: 429, code: "insufficient_quota" }],
    [{ status: 403, error: { type: "billing_not_active" } }],
    [{ status: 400, message: "Billing hard limit reached" }],
    [
      {
        status: 429,
        message:
          "429 You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.",
      },
    ],
  ])("recognizes billing and quota failures: %o", (error) => {
    expect(isOpenAIAccountFallbackError(error)).toBe(true);
  });

  it.each([
    [{ status: 429, code: "rate_limit_exceeded" }],
    [{ status: 429, message: "Rate limit reached for requests per minute" }],
    [{ status: 500, message: "upstream failed" }],
    [{ status: 401, code: "invalid_api_key" }],
    [{ status: 403, code: "account_deactivated" }],
  ])("does not hide unrelated provider failures: %o", (error) => {
    expect(isOpenAIAccountFallbackError(error)).toBe(false);
  });

  it("does not post a Codex account handoff when billing or quota fails", async () => {
    const headSha = "a".repeat(40);
    const comments: Array<{ body: string; author: string }> = [];
    const github = {
      async getPullRequest() {
        return { headSha, baseRef: "master", mergedAt: null };
      },
      async listIssueComments() {
        return comments;
      },
      async createIssueComment(_number: number, body: string) {
        comments.push({ body, author: "github-actions[bot]" });
        return { id: comments.length };
      },
    };

    const first = await requestAccountFallback({ github, prNumber: 17, reason: "openai_quota" });
    const second = await requestAccountFallback({ github, prNumber: 17, reason: "openai_quota" });

    expect(first).toMatchObject({ kind: "skip", reason: "openai_quota", writes: 0 });
    expect(second).toMatchObject({ kind: "skip", reason: "openai_quota", writes: 0 });
    expect(comments).toHaveLength(0);
  });

  it.each([
    [{ headSha: "a".repeat(40), baseRef: "master", mergedAt: "2026-08-24T09:00:00Z" }, "merged"],
    [{ headSha: "a".repeat(40), baseRef: "release", mergedAt: null }, "wrong-base"],
  ])("does not request account work for a terminal or wrong-base PR: %o", async (pr, reason) => {
    let reads = 0;
    let writes = 0;
    const result = await requestAccountFallback({
      github: {
        async getPullRequest() {
          return pr;
        },
        async listIssueComments() {
          reads += 1;
          return [];
        },
        async createIssueComment() {
          writes += 1;
        },
      },
      prNumber: 17,
      reason: "openai_key_missing",
    });

    expect(result).toMatchObject({ kind: "skip", reason, writes: 0 });
    expect(reads).toBe(0);
    expect(writes).toBe(0);
  });
});
