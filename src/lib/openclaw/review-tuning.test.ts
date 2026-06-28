import { describe, it, expect } from "vitest";

import { resolveReviewReasoningEffort } from "./review-tuning";

describe("resolveReviewReasoningEffort", () => {
  it("defaults to high when unset", () => {
    expect(resolveReviewReasoningEffort(undefined)).toBe("high");
    expect(resolveReviewReasoningEffort(null)).toBe("high");
  });

  it("passes through valid efforts (case-insensitive)", () => {
    expect(resolveReviewReasoningEffort("minimal")).toBe("minimal");
    expect(resolveReviewReasoningEffort("low")).toBe("low");
    expect(resolveReviewReasoningEffort("medium")).toBe("medium");
    expect(resolveReviewReasoningEffort("HIGH")).toBe("high");
    expect(resolveReviewReasoningEffort("  Medium  ")).toBe("medium");
  });

  it("returns null for disabling values", () => {
    for (const value of ["off", "none", "false", "0", ""]) {
      expect(resolveReviewReasoningEffort(value)).toBeNull();
    }
  });

  it("falls back to high for unknown values", () => {
    expect(resolveReviewReasoningEffort("ultra")).toBe("high");
  });
});
