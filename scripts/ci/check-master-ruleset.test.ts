import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REQUIRED_CHECKS_SOURCE,
  evaluateMasterRuleset,
  resolveExpectedStatusChecks,
} from "./check-master-ruleset.mjs";

const spec = JSON.parse(
  readFileSync(resolve(".github/rulesets/protect-master.expected.json"), "utf8"),
);

type StatusCheck = { context: string; integration_id?: number };

type RulesetRule = {
  type: string;
  parameters?: {
    required_approving_review_count?: number;
    required_review_thread_resolution?: boolean;
    allowed_merge_methods?: string[];
    strict_required_status_checks_policy?: boolean;
    do_not_enforce_on_create?: boolean;
    required_status_checks?: StatusCheck[];
  };
};

type LiveRuleset = {
  id: number;
  name: string;
  target: string;
  enforcement: string;
  conditions: unknown;
  rules: RulesetRule[];
};

function matchingLiveRuleset(activeSpec = spec): LiveRuleset {
  return {
    id: activeSpec.rulesetId,
    name: activeSpec.expected.name,
    target: activeSpec.expected.target,
    enforcement: activeSpec.expected.enforcement,
    conditions: structuredClone(activeSpec.expected.conditions),
    rules: [
      { type: "deletion" },
      { type: "non_fast_forward" },
      {
        type: "pull_request",
        parameters: {
          required_approving_review_count:
            activeSpec.expected.pull_request.required_approving_review_count,
          required_review_thread_resolution:
            activeSpec.expected.pull_request.required_review_thread_resolution,
          allowed_merge_methods: ["merge", "squash", "rebase"],
        },
      },
      {
        type: "required_status_checks",
        parameters: {
          strict_required_status_checks_policy:
            activeSpec.expected.required_status_checks.strict_required_status_checks_policy,
          do_not_enforce_on_create:
            activeSpec.expected.required_status_checks.do_not_enforce_on_create,
          required_status_checks: resolveExpectedStatusChecks(activeSpec),
        },
      },
    ],
  };
}

function rule(live: LiveRuleset, type: string): RulesetRule {
  const found = live.rules.find((item) => item.type === type);
  if (!found?.parameters) {
    throw new Error("missing parameterized rule " + type);
  }
  return found;
}

describe("Protect master ruleset drift", () => {
  it("runs the real CLI independently of agent policy while failing on ruleset drift", () => {
    const source = String.raw`
      import fs from "node:fs/promises";
      import { syncBuiltinESMExports } from "node:module";
      import { pathToFileURL } from "node:url";
      const [target, expectedUrl, rawLive] = process.argv.slice(1);
      const readFile = fs.readFile;
      fs.readFile = async (path, ...args) => {
        if (String(path).replaceAll("\\", "/").endsWith("/config/agent-workflow.json")) {
          throw new Error("Unrelated agent policy must not be read");
        }
        return readFile(path, ...args);
      };
      syncBuiltinESMExports();
      globalThis.fetch = async (url) => {
        if (String(url) !== expectedUrl) throw new Error("Unexpected URL; no network allowed");
        return { ok: true, json: async () => JSON.parse(rawLive) };
      };
      await import(pathToFileURL(target).href);
    `;
    const missingProtection = matchingLiveRuleset();
    missingProtection.rules = missingProtection.rules.filter(
      (item) => item.type !== "non_fast_forward",
    );
    const cases = [
      { live: matchingLiveRuleset(), status: 0, output: "Protect master matches" },
      {
        live: missingProtection,
        status: 1,
        output: "expected exactly one non_fast_forward rule, got 0",
      },
    ];
    for (const { live, status, output } of cases) {
      const result = spawnSync(process.execPath, [
        "--input-type=module", "--eval", source,
        resolve("scripts/ci/check-master-ruleset.mjs"),
        `https://api.github.com/repos/${spec.repository}/rulesets/${spec.rulesetId}`,
        JSON.stringify(live),
      ], {
        encoding: "utf8",
        timeout: 10_000,
        env: {
          ...process.env,
          GITHUB_REPOSITORY: spec.repository,
          GITHUB_TOKEN: "",
          GH_TOKEN: "",
          GITHUB_ACTIONS: "false",
        },
      });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(status);
      expect(result.stdout + result.stderr).toContain(output);
    }
  });

  it("accepts the versioned expected state", () => {
    expect(evaluateMasterRuleset(matchingLiveRuleset(), spec)).toEqual([]);
  });

  it("keeps GitHub ruleset checks inline and independent of agent-workflow", () => {
    expect(spec.expected.required_status_checks.required_status_checks_source).toBe(
      REQUIRED_CHECKS_SOURCE,
    );
    expect(spec.expected.pull_request.required_review_thread_resolution).toBe(true);
    expect(spec.expected.required_status_checks.strict_required_status_checks_policy).toBe(true);

    const contexts = resolveExpectedStatusChecks(spec).map((check: StatusCheck) => check.context);
    expect(contexts).toEqual([
      "quality",
      "backoffice-tests",
      "schema-drift",
      "build",
      "dossier-acceptance",
      "GitGuardian Security Checks",
    ]);
    expect(contexts).not.toContain("review-window");
  });

  it("treats a tighter live GitHub ruleset as drift until expected is changed", () => {
    const live = matchingLiveRuleset();
    rule(live, "pull_request").parameters!.required_review_thread_resolution = false;
    rule(live, "required_status_checks").parameters!.strict_required_status_checks_policy = false;
    rule(live, "required_status_checks").parameters!.required_status_checks = [
      ...rule(live, "required_status_checks").parameters!.required_status_checks!,
      { context: "unexpected-check" },
    ];

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
    rule(live, "pull_request").parameters!.required_approving_review_count = 1;

    expect(evaluateMasterRuleset(live, spec)).toEqual([
      expect.stringContaining("required approving review count"),
    ]);
  });

  it("fails closed when deletion or non_fast_forward disappears", () => {
    const withoutDeletion = matchingLiveRuleset();
    withoutDeletion.rules = withoutDeletion.rules.filter((item) => item.type !== "deletion");
    expect(evaluateMasterRuleset(withoutDeletion, spec)).toEqual([
      "expected exactly one deletion rule, got 0",
    ]);

    const withoutNff = matchingLiveRuleset();
    withoutNff.rules = withoutNff.rules.filter((item) => item.type !== "non_fast_forward");
    expect(evaluateMasterRuleset(withoutNff, spec)).toEqual([
      "expected exactly one non_fast_forward rule, got 0",
    ]);
  });

  it("fails closed when squash is removed from allowed merge methods", () => {
    const live = matchingLiveRuleset();
    rule(live, "pull_request").parameters!.allowed_merge_methods = ["merge", "rebase"];

    expect(evaluateMasterRuleset(live, spec)).toEqual([
      'allowed merge methods missing squash: got ["merge","rebase"]',
    ]);
  });

  it("fails closed when a protected rule disappears", () => {
    const live = matchingLiveRuleset();
    live.rules = live.rules.filter((item) => item.type !== "required_status_checks");

    expect(evaluateMasterRuleset(live, spec)).toEqual([
      "expected exactly one required_status_checks rule, got 0",
    ]);
  });

  it("does not run on pull_request so PR CI cannot go red from GitHub UI drift", () => {
    const source = readFileSync(
      resolve(".github/workflows/master-ruleset-drift.yml"),
      "utf8",
    ).replace(/\r\n/g, "\n");

    expect(source).toMatch(/\n  push:\n    branches: \[master\]\n/);
    expect(source).toMatch(/\n  schedule:\n    - cron: "17 5 \* \* \*"\n/);
    expect(source).toMatch(/\n  workflow_dispatch:\n/);
    expect(source).not.toMatch(/\n  pull_request:/);
  });
});
