import { describe, expect, it } from "vitest";
import {
  isSameInsertionPoint,
  nearestInsertionPoint,
  type SectionZone,
} from "./sectionAnalyzer";

const ZONES: SectionZone[] = [
  { id: "hero", label: "Hero", type: "hero", top: 0, bottom: 40, height: 40 },
  {
    id: "features",
    label: "Funktioner",
    type: "features",
    top: 40,
    bottom: 80,
    height: 40,
  },
];

describe("isSameInsertionPoint", () => {
  it("treats two resolutions of the same line as equal", () => {
    // Pointer/drag events resolve to a fresh object per call; the dedupe in
    // usePreviewPanelInspectMapPlacement relies on this being value-based.
    const a = nearestInsertionPoint(41, ZONES);
    const b = nearestInsertionPoint(43, ZONES);
    expect(a).not.toBe(b);
    expect(a.placement).toBe(b.placement);
    expect(isSameInsertionPoint(a, b)).toBe(true);
  });

  it("separates different lines", () => {
    const top = nearestInsertionPoint(1, ZONES);
    const afterFeatures = nearestInsertionPoint(79, ZONES);
    expect(isSameInsertionPoint(top, afterFeatures)).toBe(false);
  });

  it("separates identical geometry with a different anchor section", () => {
    const a = nearestInsertionPoint(40, ZONES);
    const b = nearestInsertionPoint(40, [
      { ...ZONES[0], id: "hero-2", label: "Hero" },
      ZONES[1],
    ]);
    expect(a.lineYPercent).toBe(b.lineYPercent);
    expect(isSameInsertionPoint(a, b)).toBe(false);
  });

  it("handles null on either side", () => {
    const point = nearestInsertionPoint(10, ZONES);
    expect(isSameInsertionPoint(null, null)).toBe(true);
    expect(isSameInsertionPoint(null, point)).toBe(false);
    expect(isSameInsertionPoint(point, null)).toBe(false);
  });
});
