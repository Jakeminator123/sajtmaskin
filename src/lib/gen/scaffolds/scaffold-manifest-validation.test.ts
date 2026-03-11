import { describe, expect, it } from "vitest";
import { runScaffoldManifestChecks } from "./scaffold-manifest-validation";

describe("runScaffoldManifestChecks", () => {
  it("keeps all registered scaffolds structurally valid", () => {
    expect(runScaffoldManifestChecks()).toEqual([]);
  });
});
