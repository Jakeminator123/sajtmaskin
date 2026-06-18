import { describe, expect, it, vi } from "vitest";

// Stub the telemetry service so importing the guard does not pull in the real
// DB client (which throws at import time without a connection string). Every
// test below injects its own reader, so this mock's value is never used.
vi.mock("./services/generation-telemetry", () => ({
  getLatestQualityGateResultForVersion: vi.fn(async () => null),
}));

import { assertPromoteAllowed } from "./promote-guard";

describe("assertPromoteAllowed (false-green promotion guard)", () => {
  it("blocks promotion when the finalize verifier failed", async () => {
    const decision = await assertPromoteAllowed("ver-1", async () => "verifier_failed");
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.signal).toBe("verifier_failed");
      expect(decision.reason).toContain("verifier_failed");
    }
  });

  it("blocks promotion when preflight verification failed", async () => {
    const decision = await assertPromoteAllowed("ver-1", async () => "preflight_failed");
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.signal).toBe("preflight_failed");
    }
  });

  it("allows promotion when the finalize quality gate passed", async () => {
    const decision = await assertPromoteAllowed("ver-1", async () => "preflight_passed");
    expect(decision.allowed).toBe(true);
  });

  it("fails open (allows) when no telemetry signal exists (backcompat / older rows)", async () => {
    const decision = await assertPromoteAllowed("ver-1", async () => null);
    expect(decision.allowed).toBe(true);
  });

  it("fails open (allows) when the signal read throws (e.g. DB not configured)", async () => {
    const decision = await assertPromoteAllowed("ver-1", async () => {
      throw new Error("db not configured");
    });
    expect(decision.allowed).toBe(true);
  });

  it("does not block on unknown/legacy signal values", async () => {
    const decision = await assertPromoteAllowed("ver-1", async () => "some_future_value");
    expect(decision.allowed).toBe(true);
  });
});
