import { describe, expect, it } from "vitest";
import {
  localizeVerificationSummary,
  resolveVersionHistorySummary,
  shouldShowVerifiedBadge,
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
    repairPassIndex: 0,
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

  it("appends bounded repair progress to the Reparerar label", () => {
    expect(versionHistoryStatusBadge(display("repairing", { repairPassIndex: 1 })).label).toBe(
      "Reparerar 1/2",
    );
    expect(versionHistoryStatusBadge(display("repairing", { repairPassIndex: 2 })).label).toBe(
      "Reparerar 2/2",
    );
  });

  it("keeps the plain Reparerar label before the first pass index arrives", () => {
    expect(versionHistoryStatusBadge(display("repairing", { repairPassIndex: 0 })).label).toBe(
      "Reparerar",
    );
  });

  it("clamps a runaway pass index so it never shows more than the max", () => {
    expect(versionHistoryStatusBadge(display("repairing", { repairPassIndex: 9 })).label).toBe(
      "Reparerar 2/2",
    );
  });

  it("only annotates the repairing state, not other spinners", () => {
    expect(versionHistoryStatusBadge(display("verifying", { repairPassIndex: 1 })).label).toBe(
      "Verifierar",
    );
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
        {
          kind: "verifier_skipped_safe_fixes_only",
          message: "Verifier skipped after safe autofix only.",
        },
      ],
    });
    expect(resolveVersionHistorySummary(degraded, null)).toBe(
      "Verifier skipped after safe autofix only.",
    );
  });

  it("falls back to generic degraded copy when no message is available", () => {
    expect(resolveVersionHistorySummary(display("degraded", { degraded: true }), null)).toMatch(
      /hoppades över eller hittade blockerande fel/i,
    );
  });
});

describe("localizeVerificationSummary", () => {
  it("localizes the F2 pass string", () => {
    expect(localizeVerificationSummary("Automatic verification passed.")).toBe(
      "Automatisk verifiering godkänd.",
    );
  });

  it("localizes the F3 server-verify pass string (pin: added 2026-07-09)", () => {
    expect(localizeVerificationSummary("Automatic server verification passed.")).toBe(
      "Automatisk serververifiering godkänd.",
    );
  });

  it("preserves unknown diagnostic strings verbatim", () => {
    expect(localizeVerificationSummary("Something exotic happened.")).toBe(
      "Something exotic happened.",
    );
  });

  it("returns null for empty input", () => {
    expect(localizeVerificationSummary(null)).toBeNull();
    expect(localizeVerificationSummary("   ")).toBeNull();
  });
});

describe("shouldShowVerifiedBadge (B09 false-green guard)", () => {
  it("shows the emerald Verifierad badge when verified and not degraded", () => {
    expect(shouldShowVerifiedBadge("verified", false)).toBe(true);
  });

  it("suppresses Verifierad when the lifecycle is degraded (no split false-green)", () => {
    // A promoted+passed DB row whose bus carries degradations[] (e.g.
    // product_postcheck_skipped) must NOT show emerald "Verifierad" next to the
    // amber "Degraderad" lifecycle badge.
    expect(shouldShowVerifiedBadge("verified", true)).toBe(false);
  });

  it("never shows Verifierad for non-verified surface statuses", () => {
    expect(shouldShowVerifiedBadge("failed", false)).toBe(false);
    expect(shouldShowVerifiedBadge("verifying", false)).toBe(false);
    expect(shouldShowVerifiedBadge("design_ready", false)).toBe(false);
    expect(shouldShowVerifiedBadge(null, false)).toBe(false);
    expect(shouldShowVerifiedBadge(undefined, false)).toBe(false);
  });
});
