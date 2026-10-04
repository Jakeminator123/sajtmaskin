import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

import { evaluateCiScopeWorkflow, evaluateDossierAcceptanceWorkflow } from "./check-contract.mjs";

const source = readFileSync(".github/workflows/ci.yml", "utf8");
const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
const workflow = parse(source) as {
  jobs: Record<string, { steps?: Array<{ name: string; run: string }> }>;
};
const aggregate = workflow.jobs.quality.steps?.find(
  (step) => step.name === "Aggregate required quality result",
)?.run;
if (!aggregate) throw new Error("Missing quality aggregate");

const success = {
  SCOPE_RESULT: "success",
  RUN_HEAVY: "true",
  CORE_RESULT: "success",
  TESTS_RESULT: "success",
  CONTRACTS_RESULT: "success",
  PREVIEW_HOST_RESULT: "success",
  DEAD_CODE_RESULT: "success",
};

// The aggregate runs on Ubuntu in Actions. Exercise that actual shell script,
// including its exit code, rather than reimplementing its decisions in a test.
describe.skipIf(process.platform === "win32")("required quality aggregate", () => {
  function run(overrides: Partial<typeof success>) {
    const result = spawnSync("bash", ["-c", aggregate!], {
      env: { ...process.env, ...success, ...overrides },
      encoding: "utf8",
      timeout: 5_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    return result.status;
  }

  it("accepts the complete heavy suite", () => {
    expect(run({})).toBe(0);
  });

  it.each(["failure", "cancelled", "skipped", "", "unknown"])(
    "blocks heavy CI when the shard matrix reports %s",
    (TESTS_RESULT) => {
      expect(run({ TESTS_RESULT })).toBe(1);
    },
  );

  it.each(["failure", "cancelled", "skipped", ""])(
    "blocks a failed or missing core result: %s",
    (CORE_RESULT) => {
      expect(run({ CORE_RESULT })).toBe(1);
    },
  );

  it("accepts skipped runtime jobs only after an explicit successful light decision", () => {
    expect(run({ RUN_HEAVY: "false", CORE_RESULT: "skipped", TESTS_RESULT: "skipped" })).toBe(0);
  });

  it.each(["failure", "cancelled", "", "unknown"])(
    "does not hide a failed shard matrix under light scope: %s",
    (TESTS_RESULT) => {
      expect(run({ RUN_HEAVY: "false", CORE_RESULT: "skipped", TESTS_RESULT })).toBe(1);
    },
  );

  it.each([
    { SCOPE_RESULT: "failure", RUN_HEAVY: "false" },
    { SCOPE_RESULT: "skipped", RUN_HEAVY: "false" },
    { SCOPE_RESULT: "", RUN_HEAVY: "false" },
    { RUN_HEAVY: "" },
    { RUN_HEAVY: "invalid" },
  ])("falls back to the complete heavy suite for invalid scope %j", (scope) => {
    expect(run({ ...scope, CORE_RESULT: "skipped", TESTS_RESULT: "skipped" })).toBe(1);
    expect(run(scope)).toBe(0);
  });

  it.each(["CONTRACTS_RESULT", "PREVIEW_HOST_RESULT", "DEAD_CODE_RESULT"] as const)(
    "retains the other blocking consumer: %s",
    (name) => {
      expect(run({ [name]: "failure" })).toBe(1);
    },
  );
});

describe("complete native test sharding contract", () => {
  it("accepts the current workflow", () => {
    expect(evaluateCiScopeWorkflow(source, scripts)).toEqual([]);
  });

  it.each([
    ["shard: [1, 2, 3, 4]", "shard: [1, 2, 3]"],
    ["shard: [1, 2, 3, 4]", "shard: [1, 2, 3, 3]"],
    ["shard: [1, 2, 3, 4]", "shard: [1, 2, 3, 4]\n        exclude: [{shard: 4}]"],
    ["fail-fast: false", "fail-fast: true"],
    ["max-parallel: 4", "max-parallel: 1"],
    ["npm run test:ci -- --shard=${{ matrix.shard }}/4", "npm run test:ci -- --shard=${{ matrix.shard }}/3"],
    ["npm run test:ci -- --shard=${{ matrix.shard }}/4", "npm run test:ci -- --shard=${{ matrix.shard }}/4 --passWithNoTests"],
    ["      - name: Test shard (blocking)", "      - name: Test shard (blocking)\n        continue-on-error: true"],
    ["  quality-tests:\n", "  quality-tests:\n    continue-on-error: true\n"],
    ["quality-core, quality-tests, quality-contracts", "quality-core, quality-contracts"],
    ["TESTS_RESULT: ${{ needs['quality-tests'].result }}", "TESTS_RESULT: success"],
    ["types: [opened, synchronize, reopened, ready_for_review]", "types: [opened, synchronize, reopened, ready_for_review, converted_to_draft]"],
  ])("rejects incomplete or nonblocking sharding: %s", (before, after) => {
    const changed = source.replace(before, after);
    expect(changed).not.toBe(source);
    expect(evaluateCiScopeWorkflow(changed, scripts).length).toBeGreaterThan(0);
  });

  it("does not let a filtered package script replace the full suite", () => {
    expect(evaluateCiScopeWorkflow(source, { ...scripts, "test:ci": "vitest run src/components" }))
      .not.toEqual([]);
  });

  it("does not restart dossier builds when switching unchanged code back to draft", () => {
    const dossier = readFileSync(".github/workflows/dossier-acceptance.yml", "utf8");
    expect(evaluateDossierAcceptanceWorkflow(dossier)).toEqual([]);
    expect(evaluateDossierAcceptanceWorkflow(dossier.replace(
      "reopened, ready_for_review]",
      "reopened, ready_for_review, converted_to_draft]",
    ))).not.toEqual([]);
  });
});
