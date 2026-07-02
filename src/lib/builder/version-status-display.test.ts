import { describe, expect, it } from "vitest";
import {
  formatRepairPassProgress,
  mapVersionStatusToDisplay,
  MAX_REPAIR_PASSES_DISPLAY,
  type VersionDisplayContext,
} from "./version-status-display";
import { SERVER_REPAIR_MAX_PASSES } from "@/lib/gen/defaults";
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

  it("maps streaming to generating", () => {
    expect(mapVersionStatusToDisplay(status({ phase: "streaming" }), LATEST).status).toBe(
      "generating",
    );
  });

  it("surfaces granular finalize phases as their own display tokens (P2 bus events)", () => {
    // P2 (#300): the finalize timeline is now visible — autofixing / validating /
    // preflighting are surfaced as distinct tokens (with their own Swedish badge
    // labels + empty-state copy) instead of collapsing into a single generating.
    for (const phase of ["autofixing", "validating", "preflighting"] as const) {
      expect(mapVersionStatusToDisplay(status({ phase }), LATEST).status).toBe(phase);
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
    {
      kind: "verifier_skipped_safe_fixes_only" as const,
      message: "Verifier skipped after safe autofix only.",
    },
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

describe("repair pass progress", () => {
  it("threads repairPassIndex through the repairing display", () => {
    expect(
      mapVersionStatusToDisplay(status({ phase: "repairing", repairPassIndex: 2 }), LATEST)
        .repairPassIndex,
    ).toBe(2);
  });

  it("defaults repairPassIndex to 0 for non-repairing phases", () => {
    expect(
      mapVersionStatusToDisplay(status({ phase: "verifying", repairPassIndex: 2 }), LATEST)
        .repairPassIndex,
    ).toBe(0);
  });

  it("formats bounded progress and clamps a runaway index", () => {
    expect(formatRepairPassProgress(1)).toBe("1/2");
    expect(formatRepairPassProgress(2)).toBe("2/2");
    expect(formatRepairPassProgress(9)).toBe("2/2");
  });

  it("returns null when there is no active pass", () => {
    expect(formatRepairPassProgress(0)).toBeNull();
    expect(formatRepairPassProgress(-1)).toBeNull();
    expect(formatRepairPassProgress(Number.NaN)).toBeNull();
  });

  it("keeps the client display denominator in sync with the server max (drift guard)", () => {
    expect(MAX_REPAIR_PASSES_DISPLAY).toBe(SERVER_REPAIR_MAX_PASSES);
  });
});
