import { describe, expect, it } from "vitest";
import { resolveSandboxPreviewModeFromPolicies } from "./runtime-url";

describe("resolveSandboxPreviewModeFromPolicies", () => {
  it("keeps fidelity2 + standard on dev_only (not dev_then_build)", () => {
    expect(
      resolveSandboxPreviewModeFromPolicies({
        previewPolicy: "fidelity2",
        verificationPolicy: "standard",
      }),
    ).toBe("dev_only");
  });

  it("upgrades fidelity2 to dev_then_build when verificationPolicy is strict", () => {
    expect(
      resolveSandboxPreviewModeFromPolicies({
        previewPolicy: "fidelity2",
        verificationPolicy: "strict",
      }),
    ).toBe("dev_then_build");
  });

  it("falls back to dev_only when previewPolicy / verificationPolicy are null or undefined", () => {
    expect(resolveSandboxPreviewModeFromPolicies({})).toBe("dev_only");
    expect(
      resolveSandboxPreviewModeFromPolicies({
        previewPolicy: null,
        verificationPolicy: null,
      }),
    ).toBe("dev_only");
    expect(
      resolveSandboxPreviewModeFromPolicies({
        previewPolicy: undefined,
        verificationPolicy: undefined,
      }),
    ).toBe("dev_only");
    expect(resolveSandboxPreviewModeFromPolicies({ previewPolicy: null })).toBe(
      "dev_only",
    );
    expect(
      resolveSandboxPreviewModeFromPolicies({ verificationPolicy: null }),
    ).toBe("dev_only");
  });

  it("promotes fidelity3 to dev_then_build without verificationPolicy", () => {
    expect(
      resolveSandboxPreviewModeFromPolicies({ previewPolicy: "fidelity3" }),
    ).toBe("dev_then_build");
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
