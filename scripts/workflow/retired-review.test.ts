import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { evaluateRetiredApiReviewWorkflows } from "./check-contract.mjs";

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

  it("keeps retired executables and the paid model workload out of the active repository", () => {
    const legacyFiles = existsSync("scripts/pr-review") ? readdirSync("scripts/pr-review") : [];
    expect(legacyFiles.filter((name) => /\.(?:mjs|ts)$/u.test(name))).toEqual([]);
    const manifest = JSON.parse(readFileSync("config/ai_models/manifest.json", "utf8"));
    expect(manifest.workloads.some((item: { id: string }) => item.id === "github_pr_reviewer")).toBe(false);
  });
});
