import { describe, expect, it } from "vitest";
import { briefBuildChoicesCacheExtras } from "./brief-build-choices";
import { formatBriefBuildChoicesForPrompt } from "./brief-build-choices-format";

describe("formatBriefBuildChoicesForPrompt", () => {
  it("returns undefined when nothing is selected", () => {
    expect(formatBriefBuildChoicesForPrompt({})).toBeUndefined();
    expect(formatBriefBuildChoicesForPrompt(undefined)).toBeUndefined();
  });

  it("includes hard Byggval constraints and pinned variant hints when mapped", () => {
    const text = formatBriefBuildChoicesForPrompt({
      buildIntent: "website",
      scaffoldId: "landing-page",
      pageCountHint: 2,
      styleChoiceHint: "minimal",
      styleKeywordsHint: ["minimal", "clean"],
      toneKeywordsHint: ["professional"],
      colorModeHint: "light",
      complexityHint: "simple",
    });
    expect(text).toContain("Byggval constraints");
    expect(text).toContain("marketing website");
    expect(text).toContain("Page count ceiling (this round): 2");
    expect(text).toContain("Style choice: minimal");
    // landing-page + minimal pins minimalist-mag → variant hint block present
    expect(text).toContain("Scaffold variant hint");
  });

  it("omits variant hint block when style/scaffold pair is deliberately unmapped", () => {
    const text = formatBriefBuildChoicesForPrompt({
      scaffoldId: "dashboard",
      styleChoiceHint: "minimal",
    });
    expect(text).toContain("Byggval constraints");
    expect(text).toContain("Style choice: minimal");
    expect(text).not.toContain("Scaffold variant hint");
  });
});

describe("briefBuildChoicesCacheExtras", () => {
  it("hashes Byggval fields so identical prompts with different choices miss cache", () => {
    const a = briefBuildChoicesCacheExtras({
      buildIntent: "app",
      styleChoiceHint: "minimal",
    });
    const b = briefBuildChoicesCacheExtras({
      buildIntent: "website",
      styleChoiceHint: "minimal",
    });
    expect(a.buildIntent).toBe("app");
    expect(b.buildIntent).toBe("website");
    expect(a).not.toEqual(b);
  });
});
