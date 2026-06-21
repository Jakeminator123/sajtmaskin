import { describe, expect, it } from "vitest";
import {
  resolveVersionHistorySummary,
  versionHistoryStatusBadge,
} from "./version-history-status-labels";
import type {
  VersionDisplayStatus,
  VersionStatusDisplay,
} from "./version-status-display";

function display(
  status: VersionDisplayStatus,
  overrides: Partial<VersionStatusDisplay> = {},
): VersionStatusDisplay {
  return {
    status,
    degraded: status === "degraded",
    degradations: [],
    ...overrides,
  };
}

describe("versionHistoryStatusBadge — label/variant mapping", () => {
  const cases: Array<[VersionDisplayStatus, string, string]> = [
    ["promoted", "Publicerad", "default"],
    ["ready", "Klar", "secondary"],
    ["degraded", "Degraderad", "outline"],
    ["verifying", "Verifierar", "secondary"],
    ["generating", "Genererar", "secondary"],
    ["repairing", "Reparerar", "outline"],
    ["retrying", "Ersatt", "outline"],
    ["blocked", "Blockerad", "outline"],
    ["failed", "Fel", "destructive"],
    ["idle", "Draft", "secondary"],
  ];

  it.each(cases)("maps %s → %s (%s)", (status, label, variant) => {
    const badge = versionHistoryStatusBadge(display(status));
    expect(badge.label).toBe(label);
    expect(badge.variant).toBe(variant);
  });

  it("shows a spinner only for active background work", () => {
    const spinning: VersionDisplayStatus[] = ["verifying", "generating", "repairing"];
    for (const status of [
      "promoted",
      "ready",
      "degraded",
      "verifying",
      "generating",
      "repairing",
      "retrying",
      "blocked",
      "failed",
      "idle",
    ] as VersionDisplayStatus[]) {
      expect(versionHistoryStatusBadge(display(status)).spinner).toBe(spinning.includes(status));
    }
  });

  it("shows the retry icon only for the superseded (retrying) state", () => {
    expect(versionHistoryStatusBadge(display("retrying")).retryIcon).toBe(true);
    expect(versionHistoryStatusBadge(display("ready")).retryIcon).toBe(false);
    expect(versionHistoryStatusBadge(display("failed")).retryIcon).toBe(false);
  });
});

describe("versionHistoryStatusBadge — false-green guard", () => {
  it("never renders a degraded run as a solid-success badge", () => {
    const badge = versionHistoryStatusBadge(display("degraded"));
    expect(badge.label).not.toBe("Publicerad");
    expect(badge.variant).not.toBe("default");
    // Amber accent, not a green/emerald success fill.
    expect(badge.className).toContain("amber");
    expect(badge.className ?? "").not.toContain("green");
    expect(badge.className ?? "").not.toContain("emerald");
  });

  it("only the promoted state uses the solid `default` success variant", () => {
    for (const status of [
      "ready",
      "degraded",
      "verifying",
      "generating",
      "repairing",
      "retrying",
      "blocked",
      "failed",
      "idle",
    ] as VersionDisplayStatus[]) {
      expect(versionHistoryStatusBadge(display(status)).variant).not.toBe("default");
    }
    expect(versionHistoryStatusBadge(display("promoted")).variant).toBe("default");
  });
});

describe("resolveVersionHistorySummary", () => {
  it("prefers a trimmed verificationSummary when present", () => {
    expect(resolveVersionHistorySummary(display("ready"), "  Allt grönt.  ")).toBe("Allt grönt.");
  });

  it("returns null when there is no summary and the state needs none", () => {
    expect(resolveVersionHistorySummary(display("ready"), null)).toBeNull();
    expect(resolveVersionHistorySummary(display("idle"), "   ")).toBeNull();
  });

  it("synthesizes a fallback for the superseded (retrying) state", () => {
    expect(resolveVersionHistorySummary(display("retrying"), null)).toMatch(/Ersatt av en nyare/);
  });

  it("surfaces the first degradation message for a degraded run", () => {
    const degraded = display("degraded", {
      degraded: true,
      degradations: [
        { kind: "verifier_skipped_heavy_load", message: "Verifier skipped under heavy load." },
      ],
    });
    expect(resolveVersionHistorySummary(degraded, null)).toBe("Verifier skipped under heavy load.");
  });

  it("falls back to generic degraded copy when no message is available", () => {
    expect(resolveVersionHistorySummary(display("degraded", { degraded: true }), null)).toMatch(
      /hoppades över eller hittade blockerande fel/i,
    );
  });
});
