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

  it("fails open by default (allows) when the signal read throws (back-compat)", async () => {
    const decision = await assertPromoteAllowed("ver-1", async () => {
      throw new Error("db not configured");
    });
    expect(decision.allowed).toBe(true);
  });

  it("fails closed (indeterminate) on a read error when opted in (B08)", async () => {
    const decision = await assertPromoteAllowed(
      "ver-1",
      async () => {
        throw new Error("db timeout");
      },
      { onReadError: "indeterminate" },
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect("indeterminate" in decision && decision.indeterminate).toBe(true);
      expect(decision.reason).toContain("promote guard signal unavailable");
      expect(decision.reason).toContain("db timeout");
    }
  });

  it("still ALLOWS a null (no-telemetry) signal even when opted into fail-closed", async () => {
    // A `null` is not a read ERROR — the no-telemetry back-compat path must stay
    // fail-open regardless of `onReadError`, so template-import/rollback rows are
    // never blocked.
    const decision = await assertPromoteAllowed("ver-1", async () => null, {
      onReadError: "indeterminate",
    });
    expect(decision.allowed).toBe(true);
  });

  it("still BLOCKS an explicit blocking signal even when opted into fail-closed", async () => {
    const decision = await assertPromoteAllowed("ver-1", async () => "verifier_failed", {
      onReadError: "indeterminate",
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect("indeterminate" in decision).toBe(false);
      expect("signal" in decision && decision.signal).toBe("verifier_failed");
    }
  });

  it("does not block on unknown/legacy signal values", async () => {
    const decision = await assertPromoteAllowed("ver-1", async () => "some_future_value");
    expect(decision.allowed).toBe(true);
  });
});
