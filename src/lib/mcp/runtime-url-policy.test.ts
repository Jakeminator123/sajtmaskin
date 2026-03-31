import { describe, expect, it } from "vitest";
import { resolveSandboxPreviewModeFromPolicies } from "./runtime-url";

describe("resolveSandboxPreviewModeFromPolicies", () => {
  it("keeps fidelity2 generations on dev_only", () => {
    expect(
      resolveSandboxPreviewModeFromPolicies({
        previewPolicy: "fidelity2",
        verificationPolicy: "standard",
      }),
    ).toBe("dev_only");
  });

  it("promotes fidelity3 generations to dev_then_build", () => {
    expect(
      resolveSandboxPreviewModeFromPolicies({
        previewPolicy: "fidelity3",
        verificationPolicy: "strict",
      }),
    ).toBe("dev_then_build");
  });
});
