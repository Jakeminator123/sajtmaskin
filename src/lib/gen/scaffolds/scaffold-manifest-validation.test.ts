import { describe, expect, it } from "vitest";
import { runScaffoldManifestChecks } from "./scaffold-manifest-validation";

describe("runScaffoldManifestChecks", () => {
  it("keeps all registered scaffolds free from structural errors", () => {
    const issues = runScaffoldManifestChecks();
    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });
});
