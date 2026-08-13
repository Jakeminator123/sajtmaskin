import { describe, expect, it } from "vitest";
import {
  extractSectionZonesFromBridge,
  isNearIdenticalParentSectionRect,
  isSameInsertionPoint,
  nearestInsertionPoint,
  sectionZonesFromCode,
  type BridgeSectionCandidate,
  type SectionZone,
} from "./section-analyzer";

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

describe("extractSectionZonesFromBridge", () => {
  const candidates: BridgeSectionCandidate[] = [
    {
      tag: "section",
      id: null,
      className: "hero banner",
      text: "Välkommen",
      selector: "section.hero",
      vpPercent: { x: 0, y: 0, w: 100, h: 40 },
    },
    {
      tag: "section",
      className: "features",
      selector: "section.features",
      vpPercent: { x: 0, y: 42, w: 100, h: 35 },
    },
    {
      tag: "footer",
      className: "site-footer",
      selector: "footer",
      vpPercent: { x: 0, y: 80, w: 100, h: 18 },
    },
  ];

  it("maps bridge payload into named section zones for placement anchors", () => {
    const zones = extractSectionZonesFromBridge(candidates);
    expect(zones.length).toBeGreaterThanOrEqual(2);
    expect(zones.some((z) => z.type === "hero")).toBe(true);
    expect(zones.some((z) => z.type === "features" || z.type === "footer")).toBe(true);

    const afterHero = nearestInsertionPoint(40, zones);
    expect(afterHero.placement).toBe("after-hero");
    expect(afterHero.label).toBe("Efter Hero");
  });

  it("drops invalid rows and returns empty zones for garbage payloads", () => {
    expect(extractSectionZonesFromBridge(null)).toEqual([]);
    expect(extractSectionZonesFromBridge(undefined)).toEqual([]);
    expect(
      extractSectionZonesFromBridge([
        { tag: "section" },
        { vpPercent: { x: 0, y: 0, w: 100, h: 40 } },
        { tag: "section", vpPercent: { x: "nope" as unknown as number, y: 0, w: 100, h: 40 } },
      ]),
    ).toEqual([]);
  });

  it("falls through to top/bottom insertion when no usable zones remain", () => {
    const zones = extractSectionZonesFromBridge([
      // Too small for extractSectionZones (height < 8%).
      { tag: "div", className: "tiny", vpPercent: { x: 0, y: 10, w: 100, h: 2 } },
    ]);
    expect(zones).toEqual([]);
    expect(nearestInsertionPoint(20, zones).placement).toBe("top");
    expect(nearestInsertionPoint(80, zones).placement).toBe("bottom");
  });

  it("does not let nested full-width wrappers duplicate zones or starve a footer", () => {
    // Bridge collectSections hoppar över parent-identiska barn (1 % vh); det
    // speglas här. Om en stack ändå slinker igenom ska extract-merge kollapsa
    // dem så footern fortfarande får ett ankare.
    const vh = 800;
    expect(
      isNearIdenticalParentSectionRect(
        { top: 0, bottom: 680 },
        { top: 0, bottom: 680 },
        vh,
      ),
    ).toBe(true);
    expect(
      isNearIdenticalParentSectionRect(
        { top: 0, bottom: 680 },
        { top: 0, bottom: 660 }, // 20px = 2.5% > 1%
        vh,
      ),
    ).toBe(false);
    expect(
      isNearIdenticalParentSectionRect(
        { top: 680, bottom: 800 },
        { top: 0, bottom: 800 },
        vh,
      ),
    ).toBe(false);

    const nestedWrappers: BridgeSectionCandidate[] = Array.from({ length: 6 }, (_, i) => ({
      tag: "div",
      className: `wrap-${i}`,
      vpPercent: { x: 0, y: 0, w: 100, h: 85 },
    }));
    nestedWrappers.push({
      tag: "footer",
      className: "site-footer",
      selector: "footer",
      vpPercent: { x: 0, y: 85, w: 100, h: 15 },
    });

    const zones = extractSectionZonesFromBridge(nestedWrappers);
    expect(zones.filter((z) => z.top === 0).length).toBe(1);
    expect(zones.some((z) => z.type === "footer")).toBe(true);
    expect(nearestInsertionPoint(100, zones).placement).toMatch(/after-footer|bottom/);
  });
});

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

describe("sectionZonesFromCode", () => {
  it("builds named placement bands from homepage source", () => {
    const code = `
export default function Page() {
  return (
    <main>
      <section className="hero-banner">Welcome</section>
      <section className="features-grid">Items</section>
      <footer className="site-footer">Bye</footer>
    </main>
  );
}
`;
    const zones = sectionZonesFromCode(code);
    expect(zones.length).toBeGreaterThanOrEqual(2);
    expect(zones.some((z) => z.type === "hero")).toBe(true);
    const mid = nearestInsertionPoint(40, zones);
    expect(mid.placement.startsWith("after-")).toBe(true);
    expect(mid.label.startsWith("Efter")).toBe(true);
  });

  it("returns empty when no sections are detectable", () => {
    expect(sectionZonesFromCode("export default function Page() { return <main />; }")).toEqual(
      [],
    );
  });
});
