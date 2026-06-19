import { describe, expect, it } from "vitest";
import {
  mapVersionStatusToDisplay,
  type VersionDisplayContext,
} from "./version-status-display";
import type { VersionStatus, VersionStatusPhase } from "@/lib/logging/event-bus-types";

function status(overrides: Partial<VersionStatus> & { phase: VersionStatusPhase }): VersionStatus {
  return {
    runId: "root",
    previewBlocked: false,
    verificationBlocked: false,
    repairPassIndex: 0,
    lastBuildError: null,
    eventCount: 1,
    done: overrides.phase === "done",
    verifierOutcome: null,
    degradations: [],
    ...overrides,
  };
}

const LATEST: VersionDisplayContext = { isLatest: true };

describe("mapVersionStatusToDisplay — phase branches", () => {
  it("maps verifying phase to verifying", () => {
    expect(mapVersionStatusToDisplay(status({ phase: "verifying" }), LATEST).status).toBe(
      "verifying",
    );
  });

  it("maps repairing phase to repairing", () => {
    expect(mapVersionStatusToDisplay(status({ phase: "repairing" }), LATEST).status).toBe(
      "repairing",
    );
  });

  it("maps blocked phase to blocked", () => {
    expect(mapVersionStatusToDisplay(status({ phase: "blocked" }), LATEST).status).toBe("blocked");
  });

  it("maps failed phase to failed", () => {
    expect(mapVersionStatusToDisplay(status({ phase: "failed" }), LATEST).status).toBe("failed");
  });

  it("collapses in-flight generation phases to generating", () => {
    for (const phase of ["streaming", "autofixing", "validating", "preflighting"] as const) {
      expect(mapVersionStatusToDisplay(status({ phase }), LATEST).status).toBe("generating");
    }
  });

  it("maps a clean done to ready", () => {
    expect(mapVersionStatusToDisplay(status({ phase: "done", done: true }), LATEST).status).toBe(
      "ready",
    );
  });

  it("maps idle to idle", () => {
    expect(mapVersionStatusToDisplay(status({ phase: "idle" }), LATEST).status).toBe("idle");
  });

  it("returns idle when the bus status is null (hook loading)", () => {
    const display = mapVersionStatusToDisplay(null, LATEST);
    expect(display.status).toBe("idle");
    expect(display.degraded).toBe(false);
    expect(display.degradations).toEqual([]);
  });
});

describe("mapVersionStatusToDisplay — retrying derivation", () => {
  it("shows retrying when a newer version exists and phase is non-terminal", () => {
    expect(
      mapVersionStatusToDisplay(status({ phase: "verifying" }), { isLatest: false }).status,
    ).toBe("retrying");
    expect(
      mapVersionStatusToDisplay(status({ phase: "repairing" }), { isLatest: false }).status,
    ).toBe("retrying");
    expect(
      mapVersionStatusToDisplay(status({ phase: "blocked" }), { isLatest: false }).status,
    ).toBe("retrying");
  });

  it("does NOT show retrying for terminal phases even when superseded", () => {
    expect(
      mapVersionStatusToDisplay(status({ phase: "failed" }), { isLatest: false }).status,
    ).toBe("failed");
    expect(
      mapVersionStatusToDisplay(status({ phase: "done", done: true }), { isLatest: false }).status,
    ).toBe("ready");
  });

  it("keeps the raw phase token when this version is the latest", () => {
    expect(
      mapVersionStatusToDisplay(status({ phase: "verifying" }), { isLatest: true }).status,
    ).toBe("verifying");
  });
});

describe("mapVersionStatusToDisplay — promoted derivation", () => {
  it("maps a clean done + promoted release-state to promoted", () => {
    expect(
      mapVersionStatusToDisplay(status({ phase: "done", done: true }), {
        isLatest: true,
        releaseState: "promoted",
      }).status,
    ).toBe("promoted");
  });

  it("honors promoted release-state even when the bus stream is empty", () => {
    expect(
      mapVersionStatusToDisplay(null, { isLatest: true, releaseState: "promoted" }).status,
    ).toBe("promoted");
    expect(
      mapVersionStatusToDisplay(status({ phase: "idle" }), {
        isLatest: true,
        releaseState: "promoted",
      }).status,
    ).toBe("promoted");
  });

  it("does not treat draft release-state as promoted", () => {
    expect(
      mapVersionStatusToDisplay(status({ phase: "done", done: true }), {
        isLatest: true,
        releaseState: "draft",
      }).status,
    ).toBe("ready");
  });
});

describe("mapVersionStatusToDisplay — false-green guard (degraded ≠ success)", () => {
  const degradations = [
    { kind: "verifier_skipped_heavy_load" as const, message: "Verifier skipped under heavy load." },
  ];

  it("never maps a degraded done to a clean ready", () => {
    const display = mapVersionStatusToDisplay(
      status({ phase: "done", done: true, degradations }),
      LATEST,
    );
    expect(display.status).toBe("degraded");
    expect(display.status).not.toBe("ready");
    expect(display.degraded).toBe(true);
    expect(display.degradations).toEqual(degradations);
  });

  it("never maps a degraded promoted to a clean promoted", () => {
    const display = mapVersionStatusToDisplay(status({ phase: "done", done: true, degradations }), {
      isLatest: true,
      releaseState: "promoted",
    });
    expect(display.status).toBe("degraded");
    expect(display.status).not.toBe("promoted");
    expect(display.degraded).toBe(true);
  });

  it("surfaces degraded even for promoted with an empty/idle bus stream", () => {
    const display = mapVersionStatusToDisplay(status({ phase: "idle", degradations }), {
      isLatest: true,
      releaseState: "promoted",
    });
    expect(display.status).toBe("degraded");
    expect(display.degraded).toBe(true);
  });

  it("flags degraded=true while keeping an in-flight phase token", () => {
    const display = mapVersionStatusToDisplay(
      status({ phase: "verifying", degradations }),
      LATEST,
    );
    expect(display.status).toBe("verifying");
    expect(display.degraded).toBe(true);
  });

  it("never maps a skipped-verifier done to solid green even with zero degradations", () => {
    // Defense-in-depth twin of the projection's derived degradation: even
    // if a `done` status somehow arrives with `verifierOutcome: "skipped"`
    // and an EMPTY degradations array (projection + emitter both failed to
    // attach one), the mapper must still refuse solid green. A promoted
    // release-state would otherwise render as a clean `promoted`.
    const display = mapVersionStatusToDisplay(
      status({ phase: "done", verifierOutcome: "skipped", degradations: [] }),
      { isLatest: true, releaseState: "promoted" },
    );
    expect(display.status).toBe("degraded");
    expect(display.status).not.toBe("promoted");
    expect(display.status).not.toBe("ready");
    expect(display.degraded).toBe(true);
  });
});
