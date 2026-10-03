import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { evaluateRetiredApiReviewWorkflows } from "../workflow/check-contract.mjs";

describe("retired automatic API PR review", () => {
  it("has no workflow or renamed workflow that invokes the paid reviewer", () => {
    expect(existsSync(".github/workflows/pr-ai-review.yml")).toBe(false);
    const workflows = readdirSync(".github/workflows")
      .filter((name) => /\.ya?ml$/u.test(name))
      .map((name) => ({ name, source: readFileSync(`.github/workflows/${name}`, "utf8") }));
    expect(evaluateRetiredApiReviewWorkflows(workflows)).toEqual([]);
  });

  it.each([
    { name: "pr-ai-review.yml", source: "on: pull_request_target" },
    { name: "renamed.yml", source: "run: node scripts/pr-review/run.mjs" },
    { name: "renamed.yml", source: "run: node scripts/pr-review/receipt.mjs" },
  ])("rejects reintroducing $name as an automatic reviewer", (workflow) => {
    expect(evaluateRetiredApiReviewWorkflows([workflow])).toHaveLength(1);
  });

  it("keeps historical receipt and live-head validation without treating absence as success", () => {
    const receipt = readFileSync("scripts/pr-review/receipt.mjs", "utf8");
    const gate = readFileSync("scripts/ci/trusted-review-window.mjs", "utf8");
    expect(receipt).toContain("runResult.review.headSha !== currentHeadSha");
    expect(receipt).toContain("publishedReview?.reviewId === reviewId");
    expect(gate).toContain("validateTrustedPrAiEvidence");
    expect(gate).toContain("review.commit_id");
    expect(gate).toContain("review.author_association");
  });
});
