import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { parse, stringify } from "yaml";
import { describe, expect, it } from "vitest";

import { evaluateCiScopeWorkflow, evaluateDossierAcceptanceWorkflow } from "./check-contract.mjs";

const source = readFileSync(".github/workflows/ci.yml", "utf8");
const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
type WorkflowStep = { name: string; run: string; if?: string; "continue-on-error"?: boolean };
type WorkflowJob = { if?: string; steps?: WorkflowStep[]; "continue-on-error"?: boolean };
const workflow = parse(source) as { jobs: Record<string, WorkflowJob> };
const aggregate = workflow.jobs.quality.steps?.find(
  (step) => step.name === "Aggregate required quality result",
)?.run;
if (!aggregate) throw new Error("Missing quality aggregate");

const success = {
  SCOPE_RESULT: "success",
  RUN_HEAVY: "true",
  CORE_RESULT: "success",
  TESTS_RESULT: "success",
  PERSISTENCE_RESULT: "success",
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
    expect(run({ RUN_HEAVY: "false", CORE_RESULT: "skipped", TESTS_RESULT: "skipped", PERSISTENCE_RESULT: "skipped" })).toBe(0);
  });

  it.each(["failure", "cancelled", "skipped", "", "unknown"])(
    "blocks missing/failed real persistence on heavy and fallback: %s", (PERSISTENCE_RESULT) => {
      expect(run({ PERSISTENCE_RESULT })).toBe(1);
      expect(run({ SCOPE_RESULT: "failure", RUN_HEAVY: "false", PERSISTENCE_RESULT })).toBe(1);
      if (PERSISTENCE_RESULT !== "skipped") expect(run({ RUN_HEAVY: "false", PERSISTENCE_RESULT })).toBe(1);
    },
  );

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

describe("single blocking owner for repeated quality checks", () => {
  const scopeTests = "npx vitest run scripts/workflow/workflow.test.ts scripts/workflow/ci-scope.test.ts scripts/workflow/ci-quality.test.ts";
  const routeCheck = "npm run route-timeouts:check";

  // These workflow conditions use only boolean operators and string comparisons,
  // which have the same semantics in JS for these producer values. Evaluate the
  // committed expression, not a reimplemented heavy/light decision function.
  function scheduled(jobName: string, command: string, result: string, heavy: string, cancelled = false) {
    const job = workflow.jobs[jobName];
    const context = { needs: { scope: { result, outputs: { run_heavy: heavy } } }, cancelled: () => cancelled };
    const enabled = (condition?: string) => condition === undefined || runInNewContext(
      condition.replace(/^\$\{\{\s*|\s*\}\}$/gu, ""), context, { timeout: 100 },
    );
    return enabled(job.if) && job.steps?.some((step) => step.run === command && enabled(step.if));
  }

  it.each([
    ["heavy", "success", "true", false],
    ["explicit light", "success", "false", true],
    ["failed scope", "failure", "false", false],
    ["skipped scope", "skipped", "false", false],
    ["missing scope", "", "false", false],
    ["missing output", "success", "", false],
    ["invalid output", "success", "unknown", false],
  ])("retains exactly one quality owner on %s", (_label, result, heavy, light) => {
    const fullSuite = scheduled("quality-tests", "npm run test:ci -- --shard=${{ matrix.shard }}/4", result, heavy);
    const targetedTests = scheduled("quality-contracts", scopeTests, result, heavy);
    const preflight = scheduled("quality-core", "npm run preflight:common", result, heavy);
    const targetedRoutes = scheduled("quality-contracts", routeCheck, result, heavy);
    expect([fullSuite, targetedTests]).toEqual([!light, light]);
    expect([preflight, targetedRoutes]).toEqual([!light, light]);
    // The runtime validator is not a duplicate of its tests: always retain it.
    expect(scheduled("quality-contracts", "npm run workflow:contract", result, heavy)).toBe(true);
  });

  it("does not keep targeted work alive after cancellation", () => {
    expect(scheduled("quality-contracts", scopeTests, "success", "false", true)).toBe(false);
    expect(scheduled("quality-contracts", routeCheck, "success", "false", true)).toBe(false);
  });

  it.each([scopeTests, routeCheck])("rejects missing, skipped or nonblocking light coverage: %s", (command) => {
    for (const change of ["remove", "skip", "allow-failure", "duplicate"]) {
      const changed = structuredClone(workflow);
      const job = changed.jobs["quality-contracts"];
      const step = job.steps!.find((candidate) => candidate.run === command)!;
      if (change === "remove") job.steps = job.steps!.filter((candidate) => candidate !== step);
      if (change === "skip") step.if = "${{ false }}";
      if (change === "allow-failure") step["continue-on-error"] = true;
      if (change === "duplicate") job.steps!.push({ ...step });
      expect(evaluateCiScopeWorkflow(stringify(changed), scripts), change).not.toEqual([]);
    }
  });

  it("rejects loss of the heavy preflight or its Vercel route check", () => {
    const changed = structuredClone(workflow);
    changed.jobs["quality-core"].steps = changed.jobs["quality-core"].steps!
      .filter((step) => step.run !== "npm run preflight:common");
    expect(evaluateCiScopeWorkflow(stringify(changed), scripts)).not.toEqual([]);
    for (const name of ["preflight:common", "prebuild", "route-timeouts:check"]) {
      expect(evaluateCiScopeWorkflow(source, { ...scripts, [name]: "echo skipped" }), name).not.toEqual([]);
    }
  });
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
    ["SCOPE_RESULT: ${{ needs.scope.result }}", "SCOPE_RESULT: success"],
    ["RUN_HEAVY: ${{ needs.scope.outputs.run_heavy }}", "RUN_HEAVY: true"],
    ["CORE_RESULT: ${{ needs['quality-core'].result }}", "CORE_RESULT: success"],
    ["TESTS_RESULT: ${{ needs['quality-tests'].result }}", "TESTS_RESULT: success"],
    ["PERSISTENCE_RESULT: ${{ needs['quality-project-persistence'].result }}", "PERSISTENCE_RESULT: success"],
    ["quality-contracts, quality-project-persistence, preview-host", "quality-contracts, preview-host"],
    ["run: npm run test:e2e:project-persistence\n", "run: npm run test:e2e:project-persistence:list\n"],
    ["      - name: Real isolated project persistence (blocking)", "      - name: Real isolated project persistence (blocking)\n        continue-on-error: true"],
    ["  quality-project-persistence:\n", "  quality-project-persistence:\n    continue-on-error: true\n"],
    ["CONTRACTS_RESULT: ${{ needs['quality-contracts'].result }}", "CONTRACTS_RESULT: success"],
    ["PREVIEW_HOST_RESULT: ${{ needs['preview-host-guards'].result }}", "PREVIEW_HOST_RESULT: success"],
    ["DEAD_CODE_RESULT: ${{ needs['dead-code'].result }}", "DEAD_CODE_RESULT: success"],
    [
      "run_preview_host: ${{ steps.classify.outputs.run_preview_host }}",
      "run_preview_host: ${{ steps.classify.outputs.safe_docs_only }}",
    ],
    [
      "RUN_PREVIEW_HOST: ${{ needs.scope.result != 'success' || needs.scope.outputs.run_preview_host != 'false' }}",
      "RUN_PREVIEW_HOST: false",
    ],
    ["run: npm run test:discovery:check", "run: echo discovery-skipped"],
    ["types: [opened, synchronize, reopened, ready_for_review]", "types: [opened, synchronize, reopened, ready_for_review, converted_to_draft]"],
  ])("rejects incomplete or nonblocking sharding: %s", (before, after) => {
    const changed = source.replace(before, after);
    expect(changed).not.toBe(source);
    expect(evaluateCiScopeWorkflow(changed, scripts).length).toBeGreaterThan(0);
  });

  it("does not let a filtered package script replace the full suite", () => {
    expect(evaluateCiScopeWorkflow(source, { ...scripts, "test:ci": "vitest run src/components" }))
      .not.toEqual([]);
    expect(evaluateCiScopeWorkflow(source, { ...scripts, "test:discovery:check": "echo skipped" }))
      .not.toEqual([]);
    expect(evaluateCiScopeWorkflow(source, { ...scripts, "test:e2e:project-persistence": "playwright test --list" }))
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
