import { describe, expect, it } from "vitest";
import { sanitizeVercelProjectName } from "./vercelDeploy";

describe("sanitizeVercelProjectName", () => {
  it("normalizes to a valid lowercase hyphenated slug", () => {
    expect(sanitizeVercelProjectName("My Cool Site!!")).toBe("my-cool-site");
    expect(sanitizeVercelProjectName("  Åäö Bistro  ")).toBe("bistro");
  });

  it("truncates overly long names without trailing hyphen", () => {
    const result = sanitizeVercelProjectName("a".repeat(80));
    expect(result.length).toBeLessThanOrEqual(52);
    expect(result.endsWith("-")).toBe(false);
  });

  it("uses a collision-safe random fallback when no valid slug remains (U#69)", () => {
    const a = sanitizeVercelProjectName("!!!");
    const b = sanitizeVercelProjectName("###");
    expect(a).toMatch(/^sajtmaskin-[a-f0-9]{8}$/);
    expect(b).toMatch(/^sajtmaskin-[a-f0-9]{8}$/);
    // Two empty inputs must not collide on a shared timestamp.
    expect(a).not.toBe(b);
  });
});
