import { describe, expect, it } from "vitest";
import { buildScorecard } from "./scorecard";

describe("buildScorecard", () => {
  it("maps project-sanity to autofix and placeholder checks to code-quality", () => {
    const card = buildScorecard([
      {
        name: "project-sanity",
        passed: false,
        message: "package.json: Imported third-party package is not pinned",
        score: 0,
      },
      {
        name: "no-bracket-placeholders",
        passed: false,
        message: "Found 1 bracket placeholder",
        score: 0.75,
      },
      {
        name: "tier2-readiness",
        passed: false,
        message: "Missing `next` in dependencies [dependency_install_failure]",
        score: 0,
      },
      {
        name: "repair-early-stop",
        passed: true,
        message: "Repair loops stop early on no-op output",
        score: 1,
      },
      {
        name: "server-verify-policy",
        passed: true,
        message: "Background verify is policy-driven",
        score: 1,
      },
    ]);

    const autofix = card.categories.find((category) => category.category === "autofix");
    const codeQuality = card.categories.find((category) => category.category === "code-quality");
    const orchestration = card.categories.find((category) => category.category === "orchestration");

    expect(autofix?.checks.map((check) => check.name)).toContain("project-sanity");
    expect(autofix?.checks.map((check) => check.name)).toContain("tier2-readiness");
    expect(autofix?.checks.map((check) => check.name)).toContain("repair-early-stop");
    expect(codeQuality?.checks.map((check) => check.name)).toContain("no-bracket-placeholders");
    expect(orchestration?.checks.map((check) => check.name)).toContain("server-verify-policy");
  });
});
