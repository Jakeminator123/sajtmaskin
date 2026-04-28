import { describe, expect, it } from "vitest";

import { findNearestIcon, lucideIconFix } from "./lucide-icon-fix";

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

  it("does not invent Circle aliases when nothing matches", () => {
    expect(findNearestIcon("TotallyMadeUpThing")).toBeNull();
  });
});

describe("lucideIconFix", () => {
  it("does not rewrite LucideIcon into a fallback runtime icon alias", () => {
    const line = 'import { LucideIcon, Flame } from "lucide-react";';
    const fixed = lucideIconFix.transform(line, {} as never);

    expect(fixed).toBe('import { Flame } from "lucide-react";');
    expect(fixed).not.toContain("Circle as LucideIcon");
  });

  it("removes existing runtime aliases whose local name is LucideIcon", () => {
    const line = 'import { Circle as LucideIcon, Flame } from "lucide-react";';
    const fixed = lucideIconFix.transform(line, {} as never);

    expect(fixed).toBe('import { Flame } from "lucide-react";');
    expect(fixed).not.toContain("Circle as LucideIcon");
  });

  it("preserves real lucide runtime icons that are short or uncommon", () => {
    const line = 'import { Cpu, Gamepad2, Sandwich } from "lucide-react";';
    const fixed = lucideIconFix.transform(line, {} as never);

    expect(fixed).toBe(line);
    expect(fixed).not.toContain("Circle as");
  });
});
