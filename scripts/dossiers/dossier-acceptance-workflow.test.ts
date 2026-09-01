import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/dossier-acceptance.yml", "utf8");

const REQUIRED_PR_PATHS = [
  ".github/workflows/dossier-acceptance.yml",
  "data/dossiers/**",
  "scripts/dossiers/**",
  "src/lib/gen/dossiers/**",
  "src/lib/gen/export/**",
  "src/lib/gen/scaffolds/landing-page/**",
  "src/lib/gen/autofix/dep-completer.ts",
  "package.json",
  "package-lock.json",
] as const;

describe("dossier acceptance workflow contract", () => {
  it("runs on pull requests that can change dossiers, materialization or the export baseline", () => {
    const start = workflow.indexOf("  pull_request:");
    const end = workflow.indexOf("  schedule:", start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const pullRequestBlock = workflow.slice(start, end);
    expect(pullRequestBlock).toContain("    paths:");
    for (const path of REQUIRED_PR_PATHS) {
      expect(pullRequestBlock).toContain(`      - "${path}"`);
    }
  });

  it("keeps weekly/manual coverage and cancels superseded runs for the same PR or ref", () => {
    expect(workflow).toContain('    - cron: "17 3 * * 2"');
    expect(workflow).toContain("  workflow_dispatch: {}");
    expect(workflow).toContain(
      "  group: dossier-acceptance-${{ github.event.pull_request.number || github.ref }}",
    );
    expect(workflow).toContain("  cancel-in-progress: true");
  });

  it("keeps intentionally-red freshness evidence out of pull-request runs", () => {
    const start = workflow.indexOf("  verification-evidence:");
    const end = workflow.indexOf("  dependency-registry:", start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(workflow.slice(start, end)).toContain("    if: github.event_name != 'pull_request'");
  });
});
