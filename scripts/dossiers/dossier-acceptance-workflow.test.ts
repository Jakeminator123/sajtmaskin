import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { pathMatchesPattern } from "../workflow/path-impact.mjs";
import {
  DOSSIER_ACCEPTANCE_PATH_CONTRACT,
  DOSSIER_ACCEPTANCE_PATHS,
} from "./acceptance-paths.mjs";
import { decideAcceptanceScope, matchesAcceptanceContract } from "./acceptance-scope.mjs";

const workflow = readFileSync(".github/workflows/dossier-acceptance.yml", "utf8");

const IN_CONTRACT_EXAMPLES = [
  ".github/workflows/dossier-acceptance.yml",
  "data/dossiers/hard/stripe-checkout/manifest.json",
  "data/dossiers/soft/maplibre-map/files/components/map.tsx",
  "scripts/dossiers/materialize-acceptance-project.ts",
  "src/lib/gen/dossiers/acceptance-project.ts",
  "src/lib/gen/export/project-scaffold.ts",
  "src/lib/gen/scaffolds/landing-page/files/app/page.tsx",
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
  "src/lib/gen/scaffolds/ecommerce/files/app/page.tsx",
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
      "src/lib/gen/dossiers/**",
      "src/lib/gen/export/**",
      "src/lib/gen/scaffolds/landing-page/**",
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

describe("dossier acceptance workflow contract", () => {
  it("runs on every pull request and keeps weekly/manual coverage", () => {
    const start = workflow.indexOf("  pull_request:");
    const end = workflow.indexOf("  schedule:", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const pullRequestBlock = workflow.slice(start, end);
    expect(pullRequestBlock).not.toContain("    paths:");
    expect(pullRequestBlock).toContain("ready_for_review");
    expect(pullRequestBlock).toContain("converted_to_draft");
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

  it("keeps intentionally-red freshness evidence out of pull-request runs", () => {
    const start = workflow.indexOf("  verification-evidence:");
    const end = workflow.indexOf("  dependency-registry:", start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(workflow.slice(start, end)).toContain("    if: github.event_name != 'pull_request'");
  });
});
