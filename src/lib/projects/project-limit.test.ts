import { afterEach, describe, expect, it, vi } from "vitest";
import { isPaidProjectTier } from "./project-limit";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isPaidProjectTier", () => {
  it("gives the paid project cap above 100 credits, as before", () => {
    expect(isPaidProjectTier({ diamonds: 101 })).toBe(true);
    expect(isPaidProjectTier({ diamonds: 100 })).toBe(false);
    expect(isPaidProjectTier({ diamonds: null })).toBe(false);
    expect(isPaidProjectTier(null)).toBe(false);
  });

  it("always gives an admin the paid cap, whatever the balance (SM-154)", () => {
    vi.stubEnv("ADMIN_EMAILS", "admin@example.com, annan@example.com");
    expect(isPaidProjectTier({ diamonds: 0, email: "Admin@Example.com" })).toBe(true);
    expect(isPaidProjectTier({ diamonds: 0, email: "kund@example.com" })).toBe(false);
  });
});
