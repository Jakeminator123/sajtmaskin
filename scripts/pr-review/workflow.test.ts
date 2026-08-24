import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/pr-ai-review.yml", "utf8");
const reviewerSource = readFileSync("scripts/pr-review/run.mjs", "utf8");
const automationSource = readFileSync("scripts/pr-review/automation.mjs", "utf8");
const receiptSource = readFileSync("scripts/pr-review/receipt.mjs", "utf8");

describe("PR AI review workflow security contract", () => {
  it("handles all required PR lifecycle events, including drafts", () => {
    expect(workflow).toContain("pull_request_target:");
    for (const event of [
      "opened",
      "reopened",
      "synchronize",
      "converted_to_draft",
      "ready_for_review",
    ]) {
      expect(workflow).toContain(event);
    }
    expect(workflow).not.toContain("draft == false");
  });

  it("serializes one PR while allowing different PRs to run in parallel", () => {
    expect(workflow).toContain("group: pr-ai-review-${{ github.event.pull_request.number }}");
    expect(workflow).toContain("queue: max");
    expect(workflow).not.toContain("cancel-in-progress: true");
  });

  it("executes only trusted base-branch code with the receipt privilege", () => {
    expect(workflow).toContain("ref: ${{ github.event.repository.default_branch }}");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).not.toContain("ref: ${{ github.event.pull_request.head.sha }}");
    expect(workflow).not.toContain("gh pr checkout");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("pull-requests: write");
    expect(workflow).toContain("issues: write");
    expect(workflow).toContain("checks: write");
  });

  it("uses built-in tokens and keeps the OpenAI secret out of the receipt step", () => {
    expect(workflow).toContain("GITHUB_TOKEN: ${{ github.token }}");
    expect(workflow).toContain("OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}");
    expect(workflow).not.toContain("OC_REPO_READ_TOKEN");
    const receipt = workflow.slice(workflow.indexOf("- name: Publish trusted review receipt"));
    expect(receipt).not.toContain("OPENAI_API_KEY");
  });

  it("publishes from a machine result only after a successful review step", () => {
    expect(workflow).toContain("id: review");
    expect(workflow).toContain("PR_REVIEW_RESULT_PATH: ${{ runner.temp }}/pr-review-result.json");
    expect(workflow).toContain("if: steps.review.outcome == 'success'");
    expect(workflow).toContain("run: node scripts/pr-review/receipt.mjs");
    expect(workflow).not.toContain('conclusion: "success"');
    expect(workflow).not.toContain("HEAD_SHA: ${{ github.event.pull_request.head.sha }}");
    expect(reviewerSource).toContain("writeReviewRunResult(env.PR_REVIEW_RESULT_PATH, result)");
    expect(reviewerSource).toContain("changedFiles: raw.changed_files");
    expect(automationSource).toContain("assertCompletePullFileUniverse");
  });

  it("re-fetches the live head and gates success on exact reviewed-head equality", () => {
    expect(receiptSource).toContain("`/pulls/${prNumber}`");
    expect(receiptSource).toContain('path: "/check-runs"');
    expect(receiptSource).toContain("runResult.review.headSha !== currentHeadSha");
    expect(receiptSource).toContain('conclusion: "action_required"');
    expect(receiptSource).toContain('conclusion: "success"');
    expect(receiptSource).toContain("publishedReview?.reviewId === reviewId");
    expect(automationSource).toContain('kind: "receipt-recovery"');
    expect(automationSource).toContain("verifiedCurrentReview");
    expect(automationSource).toContain("snapshot?.headSha === review.commitId");
  });
});
