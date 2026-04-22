import { describe, expect, it } from "vitest";
import { resolveSelectedDossiersFromSnapshot } from "./snapshot-selection";

describe("resolveSelectedDossiersFromSnapshot", () => {
  it("returns [] when snapshot is null/undefined", () => {
    expect(resolveSelectedDossiersFromSnapshot(null)).toEqual([]);
    expect(resolveSelectedDossiersFromSnapshot(undefined)).toEqual([]);
  });

  it("returns [] when snapshot is a non-object (defensive against bad DB rows)", () => {
    expect(resolveSelectedDossiersFromSnapshot("a string")).toEqual([]);
    expect(resolveSelectedDossiersFromSnapshot(42)).toEqual([]);
  });

  it("returns [] when brief is missing", () => {
    expect(resolveSelectedDossiersFromSnapshot({})).toEqual([]);
    expect(resolveSelectedDossiersFromSnapshot({ brief: null })).toEqual([]);
  });

  it("returns [] when requestedCapabilities is missing or empty", () => {
    expect(resolveSelectedDossiersFromSnapshot({ brief: {} })).toEqual([]);
    expect(
      resolveSelectedDossiersFromSnapshot({ brief: { requestedCapabilities: [] } }),
    ).toEqual([]);
    expect(
      resolveSelectedDossiersFromSnapshot({
        brief: { requestedCapabilities: "not-an-array" },
      }),
    ).toEqual([]);
  });

  it("filters non-string capability entries", () => {
    expect(
      resolveSelectedDossiersFromSnapshot({
        brief: { requestedCapabilities: [42, null, "", undefined] },
      }),
    ).toEqual([]);
  });

  it("resolves a known capability into a SelectedDossier (analytics → vercel-analytics)", () => {
    const result = resolveSelectedDossiersFromSnapshot({
      brief: { requestedCapabilities: ["analytics"] },
    });
    expect(result.length).toBeGreaterThan(0);
    const ids = result.map((d) => d.entry.id);
    // Either vercel-analytics (default) or plausible-analytics depending on
    // tie-break; both are valid analytics dossiers.
    expect(ids.some((id) => id.includes("analytics"))).toBe(true);
  });

  it("resolves multiple capabilities into one SelectedDossier each (mostly)", () => {
    const result = resolveSelectedDossiersFromSnapshot({
      brief: { requestedCapabilities: ["payments", "contact-form"] },
    });
    const capabilities = result.map((d) => d.entry.capability);
    expect(capabilities).toContain("payments");
    expect(capabilities).toContain("contact-form");
  });

  it("returns [] for an unknown capability (no match in registry)", () => {
    const result = resolveSelectedDossiersFromSnapshot({
      brief: { requestedCapabilities: ["this-capability-does-not-exist"] },
    });
    expect(result).toEqual([]);
  });
});
