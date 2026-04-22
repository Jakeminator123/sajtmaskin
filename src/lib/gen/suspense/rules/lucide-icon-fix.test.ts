import { describe, expect, it } from "vitest";

import { findNearestIcon, FALLBACK_ICON } from "./lucide-icon-fix";

describe("findNearestIcon — semantic alias map (SAJ-15 / A2)", () => {
  it("maps hospitality bed variants to Bed instead of Circle", () => {
    expect(findNearestIcon("BedDouble")).toBe("Bed");
    expect(findNearestIcon("BedSingle")).toBe("Bed");
    expect(findNearestIcon("BedKing")).toBe("Bed");
    expect(findNearestIcon("BedQueen")).toBe("Bed");
  });

  it("maps brand icons to safe replacements (existing behaviour preserved)", () => {
    expect(findNearestIcon("Instagram")).toBe("Camera");
    expect(findNearestIcon("Github")).toBe("Code2");
  });

  it("still resolves real lucide icons unchanged via case-insensitive exact", () => {
    expect(findNearestIcon("ArrowRight")).toBe("ArrowRight");
    expect(findNearestIcon("arrowright")).toBe("ArrowRight");
  });

  it("strips trailing 'Icon' suffix before fallback", () => {
    expect(findNearestIcon("MailIcon")).toBe("Mail");
  });

  it("falls back to Circle when nothing matches", () => {
    expect(findNearestIcon("TotallyMadeUpThing")).toBe(FALLBACK_ICON);
  });
});
