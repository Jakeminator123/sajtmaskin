import { describe, expect, it } from "vitest";
import { buildVariantHintsForBrief, formatVariantHintsForPrompt } from "./variant-hints";
import type { ScaffoldVariant } from "./types";
import type { ScaffoldManifest } from "../scaffolds/types";

const baseVariant: ScaffoldVariant = {
  id: "warm-local",
  scaffoldId: "landing-page",
  label: "Warm Local",
  keywords: [],
  fontPairings: [
    { heading: "DM Serif Display", body: "DM Sans" },
    { heading: "Lora", body: "Karla" },
  ],
  signatureMotif: "warm tints, rounded surfaces, and softly layered cards",
  colorMode: "light",
  promptHints: ["Prioritize opening hours."],
  themeTokens: {
    background: "oklch(0.985 0.012 82)",
    foreground: "oklch(0.24 0.02 42)",
    primary: "oklch(0.66 0.16 52)",
    primaryForeground: "oklch(0.99 0 0)",
    secondary: "oklch(0.95 0.02 82)",
    accent: "oklch(0.9 0.04 65)",
    border: "oklch(0.88 0.01 65)",
    ring: "oklch(0.66 0.16 52)",
    radius: "1.1rem",
    bodyBackgroundImage: "radial-gradient(circle at top left, peach 0%, transparent 26%)",
  },
};

const baseScaffold: Partial<ScaffoldManifest> = {
  id: "landing-page",
  label: "Landing Page",
};

describe("buildVariantHintsForBrief", () => {
  it("projects themeTokens onto the hint object verbatim", () => {
    const hints = buildVariantHintsForBrief(
      baseScaffold as ScaffoldManifest,
      baseVariant,
    );
    expect(hints?.themeTokens?.background).toBe("oklch(0.985 0.012 82)");
    expect(hints?.themeTokens?.primary).toBe("oklch(0.66 0.16 52)");
    expect(hints?.themeTokens?.bodyBackgroundImage).toContain("radial-gradient");
    expect(hints?.themeTokens?.radius).toBe("1.1rem");
  });

  it("exposes all font pairings, not just the first", () => {
    const hints = buildVariantHintsForBrief(
      baseScaffold as ScaffoldManifest,
      baseVariant,
    );
    expect(hints?.fontPairings.length).toBe(2);
    expect(hints?.fontPairings[1]).toEqual({ heading: "Lora", body: "Karla" });
  });

  it("returns null themeTokens when variant has no theme block", () => {
    const variantNoTokens: ScaffoldVariant = { ...baseVariant, themeTokens: undefined };
    const hints = buildVariantHintsForBrief(
      baseScaffold as ScaffoldManifest,
      variantNoTokens,
    );
    expect(hints?.themeTokens).toBeNull();
  });
});

describe("formatVariantHintsForPrompt", () => {
  it("emits Variant theme tokens block with concrete OKLCH values", () => {
    const hints = buildVariantHintsForBrief(
      baseScaffold as ScaffoldManifest,
      baseVariant,
    )!;
    const formatted = formatVariantHintsForPrompt(hints);
    expect(formatted).toContain("Variant theme tokens");
    expect(formatted).toContain("background: oklch(0.985 0.012 82)");
    expect(formatted).toContain("primary: oklch(0.66 0.16 52)");
    expect(formatted).toContain("radius: 1.1rem");
    expect(formatted).toContain("bodyBackgroundImage");
  });

  it("emits alternate font pairings when available", () => {
    const hints = buildVariantHintsForBrief(
      baseScaffold as ScaffoldManifest,
      baseVariant,
    )!;
    const formatted = formatVariantHintsForPrompt(hints);
    expect(formatted).toContain("Suggested font pairing: DM Serif Display + DM Sans");
    expect(formatted).toContain("Alternate font pairings: Lora + Karla");
  });

  it("omits theme tokens block when variant has no themeTokens", () => {
    const variantNoTokens: ScaffoldVariant = { ...baseVariant, themeTokens: undefined };
    const hints = buildVariantHintsForBrief(
      baseScaffold as ScaffoldManifest,
      variantNoTokens,
    )!;
    const formatted = formatVariantHintsForPrompt(hints);
    expect(formatted).not.toContain("Variant theme tokens");
  });
});
