import { afterEach, describe, expect, it, vi } from "vitest";

import type { VersionStatus } from "@/lib/logging/event-bus-types";
import { STALE_VERIFICATION_TIMEOUT_MS } from "@/lib/gen/defaults";
import {
  isNonTerminalVerificationState,
  isTimedOutVerificationState,
  reconcileTerminalDbState,
} from "./stale-verification";

function makeStatus(overrides: Partial<VersionStatus> = {}): VersionStatus {
  return {
    runId: "root",
    phase: "verifying",
    previewBlocked: false,
    verificationBlocked: false,
    repairPassIndex: 0,
    lastBuildError: null,
    eventCount: 3,
    done: false,
    verifierOutcome: null,
    degradations: [],
    ...overrides,
  };
}

describe("isNonTerminalVerificationState", () => {
  it("is true only for pending/verifying/repairing", () => {
    for (const s of ["pending", "verifying", "repairing"]) {
      expect(isNonTerminalVerificationState(s)).toBe(true);
    }
    for (const s of ["repair_available", "passed", "failed", null, undefined, "weird"]) {
      expect(isNonTerminalVerificationState(s)).toBe(false);
    }
  });
});

describe("isTimedOutVerificationState", () => {
  afterEach(() => vi.useRealTimers());

  it("is false for terminal states regardless of age", () => {
    const old = new Date(Date.now() - STALE_VERIFICATION_TIMEOUT_MS - 60_000).toISOString();
    expect(isTimedOutVerificationState("passed", old)).toBe(false);
    expect(isTimedOutVerificationState("failed", old)).toBe(false);
    expect(isTimedOutVerificationState("repair_available", old)).toBe(false);
  });

  it("is false for a missing or unparseable createdAt", () => {
    expect(isTimedOutVerificationState("verifying", null)).toBe(false);
    expect(isTimedOutVerificationState("verifying", undefined)).toBe(false);
    expect(isTimedOutVerificationState("verifying", "not-a-date")).toBe(false);
  });

  it("is false when recent, true once past the route budget", () => {
    const recent = new Date(Date.now() - 1_000).toISOString();
    expect(isTimedOutVerificationState("verifying", recent)).toBe(false);

    const staleIso = new Date(Date.now() - STALE_VERIFICATION_TIMEOUT_MS - 10_000).toISOString();
    expect(isTimedOutVerificationState("verifying", staleIso)).toBe(true);

    const staleDate = new Date(Date.now() - STALE_VERIFICATION_TIMEOUT_MS - 10_000);
    expect(isTimedOutVerificationState("repairing", staleDate)).toBe(true);
    expect(isTimedOutVerificationState("pending", staleDate)).toBe(true);
  });
});

describe("reconcileTerminalDbState", () => {
  it("lets DB failed override even a done bus (no false-green)", () => {
    const done = makeStatus({ phase: "done", done: true });
    const out = reconcileTerminalDbState(done, "failed");
    expect(out.phase).toBe("failed");
  });

  it("never upgrades a failed bus via DB passed alone (not promoted)", () => {
    const failed = makeStatus({ phase: "failed" });
    expect(reconcileTerminalDbState(failed, "passed")).toBe(failed);
    expect(reconcileTerminalDbState(failed, "passed", "draft")).toBe(failed);
  });

  it("upgrades a terminal failed bus when DB says promoted+passed (M#flap1)", () => {
    // gate-fail → repair → accept-repair → promoted leaves a stale terminal
    // `failed` on the bus. The authoritative store says promoted/passed —
    // the status surface must agree instead of pinning a false-red.
    const failed = makeStatus({ phase: "failed" });
    const out = reconcileTerminalDbState(failed, "passed", "promoted");
    expect(out.phase).toBe("done");
    expect(out.done).toBe(true);
  });

  it("preserves degradations when promoting a stale failed bus (no solid green lie)", () => {
    const failed = makeStatus({
      phase: "failed",
      degradations: [{ kind: "product_postcheck_skipped", message: "skip", meta: null }],
    });
    const out = reconcileTerminalDbState(failed, "passed", "promoted");
    expect(out.phase).toBe("done");
    expect(out.degradations).toHaveLength(1);
  });

  it("leaves a done bus untouched when the DB is not failed", () => {
    const done = makeStatus({ phase: "done", done: true });
    expect(reconcileTerminalDbState(done, "passed")).toBe(done);
    expect(reconcileTerminalDbState(done, "pending")).toBe(done);
  });

  it("maps DB failed → phase failed when the bus is still spinning", () => {
    const out = reconcileTerminalDbState(makeStatus({ phase: "verifying" }), "failed");
    expect(out.phase).toBe("failed");
  });

  it("maps DB passed → done when the bus reports no blockers", () => {
    const out = reconcileTerminalDbState(makeStatus({ phase: "verifying" }), "passed");
    expect(out.phase).toBe("done");
    expect(out.done).toBe(true);
  });

  it("preserves degradations when settling passed → done (no false green)", () => {
    const degraded = makeStatus({
      phase: "verifying",
      degradations: [{ kind: "product_postcheck_skipped", message: "skip", meta: null }],
    });
    const out = reconcileTerminalDbState(degraded, "passed");
    expect(out.phase).toBe("done");
    expect(out.degradations).toHaveLength(1);
  });

  it("does NOT settle passed → done while the bus reports blockers", () => {
    const blocked = makeStatus({ phase: "blocked", verificationBlocked: true });
    const out = reconcileTerminalDbState(blocked, "passed");
    expect(out.phase).toBe("blocked");
    expect(out.done).toBe(false);
  });

  it("leaves non-terminal / accept-pending DB states untouched", () => {
    for (const s of ["pending", "verifying", "repairing", "repair_available", null, undefined]) {
      const status = makeStatus({ phase: "verifying" });
      expect(reconcileTerminalDbState(status, s)).toBe(status);
    }
  });

  // 2026-07 terminal-neutral supersede (Bugbot on the lifecycle-simplification
  // branch): the verify lanes return early on supersede WITHOUT a terminal bus
  // emit, so DB `superseded` must settle a still-spinning projection — and
  // override stale terminal bus phases — or the builder spins forever.
  it("maps DB superseded → phase superseded when the bus is still spinning", () => {
    const out = reconcileTerminalDbState(makeStatus({ phase: "verifying" }), "superseded");
    expect(out.phase).toBe("superseded");
  });

  it("lets DB superseded override stale terminal bus phases (neutral, never red/green)", () => {
    expect(
      reconcileTerminalDbState(makeStatus({ phase: "failed" }), "superseded").phase,
    ).toBe("superseded");
    expect(
      reconcileTerminalDbState(makeStatus({ phase: "done", done: true }), "superseded").phase,
    ).toBe("superseded");
  });

  it("preserves degradations when settling superseded", () => {
    const degraded = makeStatus({
      phase: "verifying",
      degradations: [{ kind: "product_postcheck_skipped", message: "skip", meta: null }],
    });
    const out = reconcileTerminalDbState(degraded, "superseded");
    expect(out.phase).toBe("superseded");
    expect(out.degradations).toHaveLength(1);
  });
});
