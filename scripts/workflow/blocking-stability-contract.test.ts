import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const BLOCKING_STABILITY_TESTS = [
  "src/lib/gen/followup-freeze.stability.test.ts",
  "src/lib/gen/followup-capabilities.stability.test.ts",
  "src/lib/logging/false-green-projection.stability.test.ts",
  "src/lib/builder/status-resolver-single-writer.stability.test.ts",
] as const;

describe("blocking deterministic stability contracts", () => {
  it("runs the explicit deterministic subset in the blocking quality job", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    const command = packageJson.scripts?.["test:stability:blocking"];

    expect(command).toBe(
      ["vitest run -c vitest.stability.config.ts", ...BLOCKING_STABILITY_TESTS].join(" "),
    );

    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(workflow).toContain("run: npm run test:stability:blocking");
  });

  it("keeps the broad stability job warn-only", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(workflow).toMatch(
      /\n  stability:\n    runs-on: ubuntu-latest\n    continue-on-error: true\n/,
    );
  });
});
