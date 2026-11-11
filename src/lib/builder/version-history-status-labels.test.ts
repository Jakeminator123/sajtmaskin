import { describe, expect, it } from "vitest";
import {
  formatProductPostcheckSkipTooltip,
  localizeVerificationSummary,
  productPostcheckAdvisoryReasonFromDegradations,
  productPostcheckSkipReasonFromDegradations,
  resolveVersionHistorySummary,
  shouldShowVerifiedBadge,
  userFacingVerificationSummary,
  versionHistoryPreviewChip,
  versionHistoryStatusBadge,
  versionHistoryTechnicalDetails,
  versionHistoryUncheckedReadyBadge,
  versionHistoryVerificationChip,
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
    ["promoted", "Godkänd", "default"],
    ["ready", "Klar", "secondary"],
    ["degraded", "Klar med anmärkning", "outline"],
    ["verifying", "Kontrolleras", "secondary"],
    ["generating", "Skapas", "secondary"],
    ["repairing", "Reparerar", "outline"],
    ["retrying", "Ersatt", "outline"],
    ["blocked", "Blockerad", "outline"],
    ["failed", "Fel", "destructive"],
    ["idle", "Utkast", "secondary"],
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
      "Kontrolleras",
    );
  });
});

describe("versionHistoryStatusBadge — false-green guard", () => {
  it("never renders a degraded run as a solid-success badge", () => {
    const badge = versionHistoryStatusBadge(display("degraded"));
    expect(badge.label).not.toBe("Godkänd");
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
  it("shows a known verification summary in Swedish", () => {
    expect(
      resolveVersionHistorySummary(display("ready"), "  Automatic verification passed.  "),
    ).toBe("Automatisk verifiering godkänd.");
  });

  it("keeps unknown machine summaries off the card (V-11)", () => {
    expect(resolveVersionHistorySummary(display("ready"), "integration_migration_required:rev-a")).toBeNull();
    expect(
      resolveVersionHistorySummary(display("failed"), "Automatic verification failed: tsc TS2304"),
    ).toBe("Automatisk verifiering misslyckades.");
  });

  it("returns null when there is no summary and the state needs none", () => {
    expect(resolveVersionHistorySummary(display("ready"), null)).toBeNull();
    expect(resolveVersionHistorySummary(display("idle"), "   ")).toBeNull();
  });

  it("synthesizes a fallback for the superseded (retrying) state", () => {
    expect(resolveVersionHistorySummary(display("retrying"), null)).toMatch(/Ersatt av en nyare/);
  });

  it("says it in Swedish instead of the raw degradation message", () => {
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
      "Versionen är sparad, men alla kontroller kunde inte köras klart.",
    );
  });

  // Riggbilden 2026-11-11: "F2 Product Postcheck skipped (product_postcheck_skipped:…".
  it("never shows the F2 machine string on the card", () => {
    const degraded = display("degraded", {
      degraded: true,
      degradations: [
        {
          kind: "product_postcheck_skipped",
          message: "F2 Product Postcheck skipped (product_postcheck_skipped: browser_crashed).",
          meta: { skippedReason: "browser_crashed", infrastructureSkip: true },
        },
      ],
    });
    const summary = resolveVersionHistorySummary(
      degraded,
      "F2 Product Postcheck skipped (product_postcheck_skipped: browser_crashed).",
    );
    expect(summary).not.toMatch(/F2|product_postcheck|browser_crashed/);
    expect(versionHistoryStatusBadge(degraded).tooltip).not.toMatch(/product_postcheck|F2/);
  });

  it("surfaces a product-postcheck skip reason instead of the passed verify summary", () => {
    const degraded = display("degraded", {
      degraded: true,
      degradations: [
        {
          kind: "product_postcheck_skipped",
          message: "F2 Product Postcheck skipped.",
          meta: { skippedReason: "preview_not_running" },
        },
      ],
    });
    expect(resolveVersionHistorySummary(degraded, "Automatic verification passed.")).toBe(
      formatProductPostcheckSkipTooltip("preview_not_running"),
    );
    expect(resolveVersionHistorySummary(degraded, "Automatic verification passed.")).toBe(
      "Produktkontrollen hoppades över: förhandsvisningen var inte igång för den här versionen.",
    );
  });
});

describe("product-postcheck skip reason on Klar med anmärkning", () => {
  it("explains the skip in Swedish and keeps the machine reason out of the tooltip", () => {
    const badge = versionHistoryStatusBadge(
      display("degraded", {
        degraded: true,
        degradations: [
          {
            kind: "product_postcheck_skipped",
            message: "F2 Product Postcheck skipped.",
            meta: { skippedReason: "preview_not_running" },
          },
        ],
      }),
    );
    expect(badge.label).toBe("Klar med anmärkning");
    expect(badge.variant).toBe("outline");
    expect(badge.className).toContain("amber");
    expect(badge.tooltip).not.toContain("product_postcheck_skipped");
    expect(badge.tooltip).not.toContain("preview_not_running");
    expect(badge.tooltip).toMatch(/inte igång/);
  });

  it("explains capture_failed in the tooltip", () => {
    const badge = versionHistoryStatusBadge(
      display("degraded", {
        degraded: true,
        degradations: [
          {
            kind: "product_postcheck_skipped",
            message: "F2 Product Postcheck skipped (product_postcheck_skipped: capture_failed).",
            meta: { skippedReason: "capture_failed" },
          },
        ],
      }),
    );
    expect(badge.tooltip).not.toContain("capture_failed");
    expect(badge.tooltip).toMatch(/skärmbilderna/);
  });

  it("reads the reason from meta first", () => {
    expect(
      productPostcheckSkipReasonFromDegradations([
        {
          kind: "product_postcheck_skipped",
          message: "F2 Product Postcheck skipped.",
          meta: { skippedReason: "preview_not_running" },
        },
      ]),
    ).toBe("preview_not_running");
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

describe("advisory-yta för infrastruktur-skip — SM-072", () => {
  const infraSkip = {
    kind: "product_postcheck_skipped" as const,
    message: "F2 Product Postcheck skipped (product_postcheck_skipped: browser_crashed).",
    meta: { skippedReason: "browser_crashed", infrastructureSkip: true },
  };

  it("behåller Godkänd-etiketten men säger att kontrollen inte kunde köras", () => {
    const badge = versionHistoryStatusBadge(
      display("promoted", { degradations: [infraSkip] }),
    );
    expect(badge.label).toBe("Godkänd");
    expect(badge.variant).toBe("default");
    expect(badge.className).toBeUndefined();
    expect(badge.tooltip).toContain("Produktkontrollen kunde inte köras");
    expect(badge.tooltip).toContain("inte i sajten");
  });

  it("plockar ut advisory-orsaken men inte den produktbärande", () => {
    expect(productPostcheckAdvisoryReasonFromDegradations([infraSkip])).toBe("browser_crashed");
    expect(
      productPostcheckAdvisoryReasonFromDegradations([
        {
          kind: "product_postcheck_skipped",
          message: "skip",
          meta: { skippedReason: "preview_not_running" },
        },
      ]),
    ).toBeNull();
  });

  it("degraded-ytan ignorerar advisory-noteringen", () => {
    // Annars skulle den gula tooltippen skylla på infrastrukturen.
    expect(productPostcheckSkipReasonFromDegradations([infraSkip])).toBeNull();
  });

  it("sammanfattningen förklarar utan att anklaga sajten", () => {
    const summary = resolveVersionHistorySummary(
      display("promoted", { degradations: [infraSkip] }),
      null,
    );
    expect(summary).toContain("Produktkontrollen kunde inte köras");
    expect(summary).not.toContain("Klar men med luckor");
  });

  it("Verifierad-badgen får visas när bara kontrollen dog", () => {
    expect(shouldShowVerifiedBadge("verified", false)).toBe(true);
  });

  it("en produktbärande skip behåller den gula etiketten och sin skarpa text", () => {
    const badge = versionHistoryStatusBadge(
      display("degraded", {
        degradations: [
          {
            kind: "product_postcheck_skipped",
            message: "skip",
            meta: { skippedReason: "preview_not_running" },
          },
        ],
      }),
    );
    expect(badge.label).toBe("Klar med anmärkning");
    expect(badge.className).toContain("amber");
    expect(badge.tooltip).toContain("Produktkontrollen hoppades över");
  });
});

describe("versionshistorikens kort på begriplig svenska (V-11)", () => {
  it("visar inget märke för en orörd designversion, men felet syns", () => {
    expect(versionHistoryVerificationChip("design_ready", false)).toBeNull();
    expect(versionHistoryVerificationChip("unverified", false)).toBeNull();
    expect(versionHistoryVerificationChip("verified", true)?.label).toBe("Kontrollerad");
    expect(versionHistoryVerificationChip("failed", false)?.label).toBe("Kontroll misslyckades");
    expect(versionHistoryVerificationChip("repair_available", false)?.label).toBe("Fix redo");
    expect(versionHistoryVerificationChip("superseded", false)?.label).toBe("Ersatt");
  });

  it("visar förhandsvisningens läge bara när användaren kan agera", () => {
    expect(versionHistoryPreviewChip("running")).toBeNull();
    expect(versionHistoryPreviewChip(null)).toBeNull();
    for (const status of ["starting", "stopped", "version_mismatch", "missing", "build_error"]) {
      const chip = versionHistoryPreviewChip(status);
      expect(chip?.label).toBeTruthy();
      expect(chip?.label).not.toMatch(/VM/);
    }
  });

  it("en sparad men okontrollerad version blir aldrig grön", () => {
    const base = versionHistoryStatusBadge(display("ready"));
    const withPreview = versionHistoryUncheckedReadyBadge(base, true);
    const withoutPreview = versionHistoryUncheckedReadyBadge(base, false);
    expect(withPreview.label).toBe("Sparad");
    expect(withoutPreview.label).toBe("Sparad, ingen förhandsvisning");
    for (const badge of [withPreview, withoutPreview]) {
      expect(badge.variant).toBe("outline");
      expect(badge.className ?? "").not.toMatch(/emerald|green/);
    }
  });

  it("lägger koder, rå sammanfattning och URL i tekniska detaljer", () => {
    const rows = versionHistoryTechnicalDetails({
      display: display("degraded", {
        degraded: true,
        degradations: [
          {
            kind: "product_postcheck_skipped",
            message: "F2 Product Postcheck skipped (product_postcheck_skipped: preview_not_running).",
            meta: { skippedReason: "preview_not_running" },
          },
        ],
      }),
      verificationSummary: "Automatic verification passed.",
      releaseState: "draft",
      verificationState: "pending",
      verificationSurfaceStatus: "design_ready",
      runtimeStatus: "running",
      qualityTier: "tier2",
      previewUrl: "https://vm-fly-jakem.fly.dev/6d05c34a",
    });
    const text = rows.map((row) => `${row.label}: ${row.value}`).join("\n");
    expect(text).toContain("Status: degraded\n");
    expect(text).toContain("Release/verify: draft / pending");
    expect(text).toContain("Kontrollyta: design_ready");
    expect(text).toContain("Förhandsvisning: running · tier2");
    expect(text).toContain("product_postcheck_skipped: preview_not_running");
    expect(text).toContain("Sammanfattning: Automatic verification passed.");
    expect(text).toContain("Preview-URL: https://vm-fly-jakem.fly.dev/6d05c34a");
  });

  it("utelämnar tomma rader", () => {
    const rows = versionHistoryTechnicalDetails({ display: display("ready") });
    expect(rows).toEqual([{ label: "Status", value: "ready" }]);
  });

  it("översätter bara kända sammanfattningar", () => {
    expect(userFacingVerificationSummary("Server-side repair in progress.")).toBe(
      "Serverreparation pågår.",
    );
    expect(userFacingVerificationSummary("Superseded by repaired version v3")).toBe(
      "Ersatt av en reparerad version.",
    );
    expect(userFacingVerificationSummary("Something exotic happened.")).toBeNull();
    expect(userFacingVerificationSummary("   ")).toBeNull();
  });
});
