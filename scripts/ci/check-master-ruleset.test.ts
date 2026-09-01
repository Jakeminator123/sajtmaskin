import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateMasterRuleset } from "./check-master-ruleset.mjs";

const spec = JSON.parse(
  readFileSync(
    resolve(".github/rulesets/protect-master.expected.json"),
    "utf8",
  ),
);

function matchingLiveRuleset() {
  return {
    id: spec.rulesetId,
    name: spec.expected.name,
    target: spec.expected.target,
    enforcement: spec.expected.enforcement,
    conditions: structuredClone(spec.expected.conditions),
    rules: [
      {
        type: "pull_request",
        parameters: structuredClone(spec.expected.pull_request),
      },
      {
        type: "required_status_checks",
        parameters: structuredClone(spec.expected.required_status_checks),
      },
    ],
  };
}

describe("Protect master ruleset drift", () => {
  it("accepts the versioned expected state", () => {
    expect(evaluateMasterRuleset(matchingLiveRuleset(), spec)).toEqual([]);
  });

  it("detects the verified live C1 drift", () => {
    const live = matchingLiveRuleset();
    live.rules[0].parameters.required_review_thread_resolution = false;
    live.rules[1].parameters.strict_required_status_checks_policy = false;
    live.rules[1].parameters.required_status_checks =
      live.rules[1].parameters.required_status_checks.filter(
        (check: { context: string }) => check.context !== "review-window",
      );

    expect(evaluateMasterRuleset(live, spec)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("required review thread resolution"),
        expect.stringContaining("strict required status checks"),
        expect.stringContaining("required status checks"),
      ]),
    );
  });

  it("keeps the declared native approval count exact", () => {
    const live = matchingLiveRuleset();
    live.rules[0].parameters.required_approving_review_count = 1;

    expect(evaluateMasterRuleset(live, spec)).toEqual([
      expect.stringContaining("required approving review count"),
    ]);
  });

  it("fails closed when a protected rule disappears", () => {
    const live = matchingLiveRuleset();
    live.rules = live.rules.filter(
      (rule: { type: string }) => rule.type !== "required_status_checks",
    );

    expect(evaluateMasterRuleset(live, spec)).toEqual([
      "expected exactly one required_status_checks rule, got 0",
    ]);
  });
});
