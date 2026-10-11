import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

import { pathMatchesPattern } from "../workflow/path-impact.mjs";
import { DOSSIER_ACCEPTANCE_PATH_CONTRACT, DOSSIER_ACCEPTANCE_PATHS } from "./acceptance-paths.mjs";
import { decideAcceptanceScope, matchesAcceptanceContract } from "./acceptance-scope.mjs";

const workflow = readFileSync(".github/workflows/dossier-acceptance.yml", "utf8");

const IN_CONTRACT_EXAMPLES = [
  ".github/workflows/dossier-acceptance.yml",
  "data/dossiers/hard/stripe-checkout/manifest.json",
  "data/dossiers/soft/maplibre-map/files/components/map.tsx",
  "scripts/dossiers/materialize-acceptance-project.ts",
  "scripts/workflow/ci-scope.mjs",
  "scripts/workflow/path-impact.mjs",
  "src/lib/gen/dossiers/acceptance-project.ts",
  "src/lib/gen/export/project-scaffold.ts",
  "src/lib/gen/scaffolds/landing-page/files/app/page.tsx",
  "src/lib/gen/scaffolds/ecommerce/files/app/product/[id]/page.tsx",
  "src/lib/gen/scaffolds/dashboard/files/app/users/page.tsx",
  "src/lib/gen/scaffolds/blog/files/app/blog/[slug]/page.tsx",
  "src/lib/gen/scaffolds/load-scaffold-files.ts",
  "src/lib/gen/autofix/dep-completer.ts",
  "src/components/ui/button.tsx",
  "components/ui/card.tsx",
  ".node-version",
  ".nvmrc",
  "package.json",
  "package-lock.json",
] as const;

const OUT_OF_CONTRACT_EXAMPLES = [
  "README.md",
  "docs/contracts/dossier-system.md",
  "config/scaffold-variants/landing-page/default.json",
  "src/lib/gen/scaffolds/auth-pages/files/app/page.tsx",
  "src/lib/gen/scaffolds/baseline-paths.ts",
  "src/app/builder/page.tsx",
  "config/agent-workflow.json",
] as const;

describe("dossier acceptance path contract", () => {
  it("lists every direct materialization dependency exactly once", () => {
    expect(DOSSIER_ACCEPTANCE_PATHS).toEqual([
      ".github/workflows/dossier-acceptance.yml",
      "data/dossiers/**",
      "scripts/dossiers/**",
      "scripts/workflow/ci-scope.mjs",
      "scripts/workflow/path-impact.mjs",
      "src/lib/gen/dossiers/**",
      "src/lib/gen/export/**",
      "src/lib/gen/scaffolds/landing-page/**",
      "src/lib/gen/scaffolds/ecommerce/**",
      "src/lib/gen/scaffolds/dashboard/**",
      "src/lib/gen/scaffolds/blog/**",
      "src/lib/gen/scaffolds/load-scaffold-files.ts",
      "src/lib/gen/autofix/dep-completer.ts",
      "src/lib/gen/data/shadcn-components.ts",
      "src/lib/gen/parser.ts",
      "src/lib/gen/preview/env-local.ts",
      "src/lib/utils/infer-file-language.ts",
      "src/lib/utils/path-utils.ts",
      "src/components/ui/**",
      "components/ui/**",
      ".node-version",
      ".nvmrc",
      "package.json",
      "package-lock.json",
    ]);
    expect(new Set(DOSSIER_ACCEPTANCE_PATHS).size).toBe(DOSSIER_ACCEPTANCE_PATHS.length);
    expect(DOSSIER_ACCEPTANCE_PATH_CONTRACT.every((entry) => entry.reason.trim().length > 0)).toBe(
      true,
    );
  });

  it("matches materialized-project owners and ignores variants plus other scaffolds", () => {
    for (const path of IN_CONTRACT_EXAMPLES) {
      expect(matchesAcceptanceContract(path), path).toBe(true);
      expect(
        DOSSIER_ACCEPTANCE_PATHS.some((pattern) => pathMatchesPattern(path, pattern)),
        path,
      ).toBe(true);
    }
    for (const path of OUT_OF_CONTRACT_EXAMPLES) {
      expect(matchesAcceptanceContract(path), path).toBe(false);
    }
  });
});

describe("dossier acceptance scope", () => {
  it("always runs the matrix on scheduled and manual events", () => {
    expect(decideAcceptanceScope({ eventName: "schedule" })).toMatchObject({
      runMatrix: true,
      reason: "trusted-schedule-full",
    });
    expect(decideAcceptanceScope({ eventName: "workflow_dispatch" })).toMatchObject({
      runMatrix: true,
      reason: "trusted-workflow_dispatch-full",
    });
  });

  it("skips the matrix for an out-of-contract PR diff", () => {
    const result = decideAcceptanceScope({
      eventName: "pull_request",
      baseSha: "a".repeat(40),
      headSha: "b".repeat(40),
      gitCommand: () => ({
        status: 0,
        stdout: "M\0README.md\0",
        stderr: "",
      }),
    });
    expect(result).toMatchObject({
      runMatrix: false,
      reason: "out-of-contract",
      files: ["README.md"],
      matched: [],
      classificationError: null,
    });
  });

  it("runs the matrix when a UI or Node pin that lands in generated projects changes", () => {
    const result = decideAcceptanceScope({
      eventName: "pull_request",
      baseSha: "a".repeat(40),
      headSha: "b".repeat(40),
      gitCommand: () => ({
        status: 0,
        stdout: "M\0src/components/ui/button.tsx\0M\0.node-version\0",
        stderr: "",
      }),
    });
    expect(result).toMatchObject({
      runMatrix: true,
      reason: "in-contract",
      classificationError: null,
    });
    expect(result.matched).toEqual(["src/components/ui/button.tsx", ".node-version"]);
  });

  it("fails closed to the matrix when the PR diff cannot be classified", () => {
    const result = decideAcceptanceScope({
      eventName: "pull_request",
      baseSha: "a".repeat(40),
      headSha: "b".repeat(40),
      gitCommand: () => ({
        status: 1,
        stdout: "",
        stderr: "git diff failed",
      }),
    });
    expect(result).toMatchObject({
      runMatrix: true,
      reason: "classification-error",
    });
    expect(result.classificationError).toContain("git diff failed");
  });
});

describe("preview push dossier scope", () => {
  it.each([
    ["src/app/builder/page.tsx", false],
    ["README.md", false],
    ["data/dossiers/hard/test/manifest.json", true],
    ["src/components/ui/button.tsx", true],
    ["scripts/workflow/ci-scope.mjs", true],
    ["package-lock.json", true],
  ])("scopes fast-forward preview push %s to matrix=%s", (path, runMatrix) => {
    expect(
      decideAcceptanceScope({
        eventName: "push",
        ref: "refs/heads/preview",
        baseSha: "a".repeat(40),
        headSha: "b".repeat(40),
        gitCommand: () => ({ status: 0, stdout: `M\0${path}\0` }),
      }),
    ).toMatchObject({ runMatrix, classificationError: null });
  });

  it("fails closed for unprovable preview pushes and keeps other refs full", () => {
    for (const baseSha of ["", "0".repeat(40), "a".repeat(40)]) {
      expect(
        decideAcceptanceScope({
          eventName: "push",
          ref: "refs/heads/preview",
          baseSha,
          headSha: "b".repeat(40),
          gitCommand: () => ({ status: 1, stdout: "" }),
        }),
      ).toMatchObject({ runMatrix: true, reason: "classification-error" });
    }
    expect(decideAcceptanceScope({ eventName: "push", ref: "refs/heads/master" })).toMatchObject({
      runMatrix: true,
    });
  });

  it("retains a renamed dependency even when its new path is irrelevant", () => {
    expect(
      decideAcceptanceScope({
        eventName: "push",
        ref: "refs/heads/preview",
        baseSha: "a".repeat(40),
        headSha: "b".repeat(40),
        gitCommand: () => ({
          status: 0,
          stdout: "R100\0src/components/ui/card.tsx\0docs/card.md\0",
        }),
      }),
    ).toMatchObject({ runMatrix: true, matched: ["src/components/ui/card.tsx"] });
  });
});

// Use Git for Windows' Bash, not WSL. CI runs this exact aggregate on Ubuntu.
const bash =
  process.platform === "win32"
    ? `${process.env.ProgramFiles ?? "C:/Program Files"}/Git/bin/bash.exe`
    : "bash";
describe.skipIf(process.platform === "win32" && !existsSync(bash))(
  "required dossier aggregate",
  () => {
    const aggregate = parse(workflow).jobs["dossier-acceptance"].steps[0].run;
    const success = {
      EVENT_NAME: "push",
      SCOPE_RESULT: "success",
      RUN_MATRIX: "true",
      DISCOVER_RESULT: "success",
      REGISTRY_RESULT: "success",
      BUILD_RESULT: "success",
      EVIDENCE_RESULT: "skipped",
    };
    const skipped = {
      RUN_MATRIX: "false",
      DISCOVER_RESULT: "skipped",
      REGISTRY_RESULT: "skipped",
      BUILD_RESULT: "skipped",
    };
    function run(overrides: Partial<typeof success>) {
      const result = spawnSync(bash, ["-c", aggregate], {
        env: { ...process.env, ...success, ...overrides },
        encoding: "utf8",
        timeout: 5_000,
      });
      expect(result.error).toBeUndefined();
      expect(result.signal).toBeNull();
      return result.status;
    }
    it.each(["push", "pull_request"])(
      "accepts a successful matrix or proven irrelevant %s",
      (EVENT_NAME) => {
        expect(run({ EVENT_NAME })).toBe(0);
        expect(run({ EVENT_NAME, ...skipped })).toBe(0);
      },
    );
    it.each(["schedule", "workflow_dispatch"])(
      "never permits a skipped matrix on %s",
      (EVENT_NAME) => {
        expect(run({ EVENT_NAME, EVIDENCE_RESULT: "success" })).toBe(0);
        expect(run({ EVENT_NAME, EVIDENCE_RESULT: "success", ...skipped })).toBe(1);
      },
    );
    it.each(["failure", "cancelled", "skipped", "", "unknown"])(
      "blocks failed or missing scope %s",
      (SCOPE_RESULT) => {
        expect(run({ SCOPE_RESULT, ...skipped })).toBe(1);
      },
    );
    it.each(["failure", "cancelled", "skipped", "", "unknown"])(
      "blocks failed or missing matrix %s",
      (BUILD_RESULT) => {
        expect(run({ BUILD_RESULT })).toBe(1);
        if (BUILD_RESULT !== "skipped") expect(run({ ...skipped, BUILD_RESULT })).toBe(1);
      },
    );
  },
);

describe("dossier acceptance workflow contract", () => {
  it("keeps one discovered dossier id per job and at most six builds in parallel", () => {
    expect(workflow).toContain(
      'run: echo "dossiers=$(node scripts/dossiers/list-acceptance-matrix.mjs)" >> "$GITHUB_OUTPUT"',
    );
    expect(workflow).toContain("dossier: ${{ fromJSON(needs.discover.outputs.dossiers) }}");
    expect(workflow).toContain("max-parallel: 6");
  });

  it("runs on every pull request and keeps weekly/manual coverage", () => {
    const start = workflow.indexOf("  pull_request:");
    const end = workflow.indexOf("  schedule:", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const pullRequestBlock = workflow.slice(start, end);
    expect(pullRequestBlock).not.toContain("    paths:");
    expect(pullRequestBlock).toContain("ready_for_review");
    expect(pullRequestBlock).not.toContain("converted_to_draft");
    expect(workflow).toContain('    - cron: "17 3 * * 2"');
    expect(workflow).toContain("  workflow_dispatch: {}");
    expect(workflow).toContain(
      "  group: dossier-acceptance-${{ github.event.pull_request.number || github.ref }}",
    );
    expect(workflow).toContain("  cancel-in-progress: true");
  });

  it("classifies paths before the matrix and publishes a required aggregate", () => {
    expect(workflow).toContain("  scope:");
    expect(workflow).toContain("run: node scripts/dossiers/acceptance-scope.mjs");
    expect(workflow).toContain("  dossier-acceptance:");
    expect(workflow).toContain("    if: ${{ !cancelled() }}");
    expect(workflow).toContain("EXPECT_MATRIX=true");
  });

  it("runs acceptance on preview pushes but keeps freshness only on schedule/manual", () => {
    const start = workflow.indexOf("  verification-evidence:");
    const end = workflow.indexOf("  dependency-registry:", start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(workflow.slice(start, end)).toContain(
      "    if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'",
    );
    expect(workflow).toContain("  push:\n    branches: [preview]");
    expect(workflow).toContain(
      'if [ "$EVENT_NAME" = "pull_request" ] || [ "$EVENT_NAME" = "push" ]; then',
    );
  });
});
