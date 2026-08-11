import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/pr-ai-review.yml", "utf8");

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

  it("executes only trusted base-branch code with least privileges", () => {
    expect(workflow).toContain("ref: ${{ github.event.repository.default_branch }}");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).not.toContain("github.event.pull_request.head.sha");
    expect(workflow).not.toContain("gh pr checkout");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("pull-requests: write");
    expect(workflow).toContain("issues: write");
    expect(workflow).toContain("checks: read");
  });

  it("uses the built-in token and only injects the OpenAI secret into the reviewer step", () => {
    expect(workflow).toContain("GITHUB_TOKEN: ${{ github.token }}");
    expect(workflow).toContain("OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}");
    expect(workflow).not.toContain("OC_REPO_READ_TOKEN");
    expect(workflow).not.toContain("GH_TOKEN:");
  });
});
