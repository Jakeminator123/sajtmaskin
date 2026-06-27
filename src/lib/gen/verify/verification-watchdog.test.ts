import { describe, expect, it } from "vitest";
import {
  STALE_VERIFICATION_TIMEOUT_MS,
  isTimedOutVerificationState,
  resolveStaleWatchdogFail,
} from "./verification-watchdog";

const NOW = Date.UTC(2026, 5, 27, 12, 0, 0);
const OLD = new Date(NOW - STALE_VERIFICATION_TIMEOUT_MS - 1_000).toISOString();
const RECENT = new Date(NOW - 1_000).toISOString();

describe("isTimedOutVerificationState", () => {
  it("flags in-progress states older than the timeout", () => {
    for (const state of ["pending", "verifying", "repairing"]) {
      expect(isTimedOutVerificationState(state, OLD, NOW)).toBe(true);
    }
  });

  it("ignores terminal / non-tracked states regardless of age", () => {
    for (const state of ["passed", "failed", "repair_available", "draft", null, undefined]) {
      expect(isTimedOutVerificationState(state, OLD, NOW)).toBe(false);
    }
  });

  it("does not flag a recent in-progress state", () => {
    expect(isTimedOutVerificationState("repairing", RECENT, NOW)).toBe(false);
  });

  it("returns false for missing / unparseable createdAt", () => {
    expect(isTimedOutVerificationState("pending", null, NOW)).toBe(false);
    expect(isTimedOutVerificationState("pending", "not-a-date", NOW)).toBe(false);
  });
});

describe("resolveStaleWatchdogFail (#260 round-2 — liveness-aware repairing watchdog)", () => {
  it("never fails when the row is not timed out", () => {
    expect(
      resolveStaleWatchdogFail({
        timedOut: false,
        verificationState: "repairing",
        hasExpiredRunningLease: true,
      }),
    ).toBe(false);
  });

  it("fails a timed-out pending/verifying row without needing a lease probe", () => {
    expect(
      resolveStaleWatchdogFail({
        timedOut: true,
        verificationState: "pending",
        hasExpiredRunningLease: null,
      }),
    ).toBe(true);
    expect(
      resolveStaleWatchdogFail({
        timedOut: true,
        verificationState: "verifying",
        hasExpiredRunningLease: null,
      }),
    ).toBe(true);
  });

  it("fails a timed-out repairing row ONLY when the lease was genuinely lost (expired running)", () => {
    expect(
      resolveStaleWatchdogFail({
        timedOut: true,
        verificationState: "repairing",
        hasExpiredRunningLease: true,
      }),
    ).toBe(true);
  });

  it("does NOT fail a cleanly-released stale-base repairing row (no expired running lease)", () => {
    // The #260 stale-base skip releases its lease (status='done'), so no expired
    // running lease exists. The user's newer edit B must NOT be failed here — it
    // is re-verified on its own files by the repair callers instead.
    expect(
      resolveStaleWatchdogFail({
        timedOut: true,
        verificationState: "repairing",
        hasExpiredRunningLease: false,
      }),
    ).toBe(false);
  });
});
