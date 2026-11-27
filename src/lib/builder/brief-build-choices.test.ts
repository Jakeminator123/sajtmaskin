import { describe, expect, it } from "vitest";
import { briefBuildChoicesCacheExtras } from "./brief-build-choices";
import { formatBriefBuildChoicesForPrompt } from "./brief-build-choices-format";
import { getThemeColors, resolveThemePalette } from "./theme-presets";

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
    expect(text).toContain("Build intent (user choice): website");
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

  it("passes a chosen color family without assigning an auto surface", () => {
    const text = formatBriefBuildChoicesForPrompt({
      scaffoldId: "base-nextjs", styleChoiceHint: "warm", designThemePreset: "orange",
    });
    expect(text).toContain("Color theme family: orange");
    expect(text).toContain(getThemeColors("orange")!.primary);
    expect(text).toContain("Color mode: auto");
    expect(text).toContain("visualDirection.colorPalette");
    expect(text).not.toContain(resolveThemePalette("orange", "light")!.background);
    expect(text).not.toContain("- Color mode: light");
  });

  it("includes the full palette for an explicit color mode and keys the family into cache", () => {
    const orange = { designThemePreset: "orange", colorModeHint: "dark" as const };
    const green = { ...orange, designThemePreset: "green" };
    const text = formatBriefBuildChoicesForPrompt(orange);
    expect(text).toContain(resolveThemePalette("orange", "dark")!.background);
    expect(text).toContain("- Color mode: dark");
    expect(text).not.toContain("Color mode: auto");
    expect(briefBuildChoicesCacheExtras(orange)).not.toEqual(briefBuildChoicesCacheExtras(green));
    expect(briefBuildChoicesCacheExtras({ themeColors: getThemeColors("orange") }))
      .not.toEqual(briefBuildChoicesCacheExtras({ themeColors: getThemeColors("green") }));
  });
});
