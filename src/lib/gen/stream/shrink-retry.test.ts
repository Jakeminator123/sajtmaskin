import { describe, expect, it } from "vitest";
import {
  buildShrinkRetrySuggestion,
  hasCriticalShrink,
  type RejectedShrink,
} from "./shrink-retry";

describe("hasCriticalShrink", () => {
  it("returns false for an empty or nullish list", () => {
    expect(hasCriticalShrink(undefined)).toBe(false);
    expect(hasCriticalShrink(null)).toBe(false);
    expect(hasCriticalShrink([])).toBe(false);
  });

  it("returns true when app/page.tsx was rejected", () => {
    const rejected: RejectedShrink[] = [
      { file: "app/page.tsx", previousSize: 13000, newSize: 200 },
    ];
    expect(hasCriticalShrink(rejected)).toBe(true);
  });

  it("returns true when src/app/page.tsx was rejected", () => {
    const rejected: RejectedShrink[] = [
      { file: "src/app/page.tsx", previousSize: 13000, newSize: 200 },
    ];
    expect(hasCriticalShrink(rejected)).toBe(true);
  });

  it("returns true when app/layout.tsx was rejected", () => {
    const rejected: RejectedShrink[] = [
      { file: "app/layout.tsx", previousSize: 3000, newSize: 80 },
    ];
    expect(hasCriticalShrink(rejected)).toBe(true);
  });

  it("returns false when only non-critical components were rejected", () => {
    const rejected: RejectedShrink[] = [
      { file: "app/components/Feature.tsx", previousSize: 2000, newSize: 50 },
      { file: "app/about/page.tsx", previousSize: 2500, newSize: 500 },
    ];
    expect(hasCriticalShrink(rejected)).toBe(false);
  });
});

describe("buildShrinkRetrySuggestion", () => {
  it("returns null when no critical shrink is present", () => {
    expect(buildShrinkRetrySuggestion(undefined)).toBeNull();
    expect(buildShrinkRetrySuggestion([])).toBeNull();
    expect(
      buildShrinkRetrySuggestion([
        { file: "app/components/Feature.tsx", previousSize: 1000, newSize: 50 },
      ]),
    ).toBeNull();
  });

  it("returns a suggestion with retryPrompt and ctaLabel when app/page.tsx was rejected", () => {
    const suggestion = buildShrinkRetrySuggestion([
      { file: "app/page.tsx", previousSize: 13000, newSize: 200 },
    ]);
    expect(suggestion).not.toBeNull();
    expect(suggestion!.files).toContain("app/page.tsx");
    expect(suggestion!.ctaLabel.length).toBeGreaterThan(0);
    expect(suggestion!.retryPrompt).toContain("app/page.tsx");
    expect(suggestion!.retryPrompt).toContain("bracket placeholder");
    expect(suggestion!.reason).toContain("app/page.tsx");
  });

  it("lists at most five critical files", () => {
    const many: RejectedShrink[] = Array.from({ length: 8 }, (_, idx) => ({
      file: idx % 2 === 0 ? "app/page.tsx" : "app/layout.tsx",
      previousSize: 10000,
      newSize: 100,
    }));
    const suggestion = buildShrinkRetrySuggestion(many);
    expect(suggestion).not.toBeNull();
    expect(suggestion!.files.length).toBeLessThanOrEqual(5);
  });

  it("ignores non-critical files when picking the listed paths", () => {
    const suggestion = buildShrinkRetrySuggestion([
      { file: "app/page.tsx", previousSize: 13000, newSize: 200 },
      { file: "app/components/Feature.tsx", previousSize: 1000, newSize: 50 },
    ]);
    expect(suggestion).not.toBeNull();
    expect(suggestion!.files).toEqual(["app/page.tsx"]);
  });
});
