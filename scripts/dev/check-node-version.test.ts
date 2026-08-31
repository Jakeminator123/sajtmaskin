import { describe, expect, it } from "vitest";

import { evaluateNodeVersion, normalizeNodeVersion } from "./check-node-version.mjs";

describe("Node runtime contract", () => {
  it.each([
    ["22.23.1", "22.23.1"],
    ["v22.23.1", "22.23.1"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeNodeVersion(input)).toBe(expected);
  });

  it("accepts only the exact repository runtime", () => {
    expect(evaluateNodeVersion({ actual: "22.23.1", expected: "22.23.1" }).valid).toBe(true);
    const mismatch = evaluateNodeVersion({ actual: "24.19.0", expected: "22.23.1" });
    expect(mismatch.valid).toBe(false);
    expect(mismatch.reason).toContain("nvm use 22.23.1");
  });

  it("fails closed on malformed versions", () => {
    expect(evaluateNodeVersion({ actual: "22", expected: "22.23.1" }).valid).toBe(false);
  });
});
