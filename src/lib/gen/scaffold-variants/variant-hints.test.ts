import { describe, expect, it } from "vitest";
import { buildVariantHintsForBrief, formatVariantHintsForPrompt } from "./variant-hints";
import { getVariantById } from "./registry";
import type { ScaffoldVariant } from "./types";
import { getScaffoldById } from "../scaffolds";
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
  sourceTemplateIds: ["8QhCJAwn16K", "8Y9E0cStKrW"],
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
  it("projects starter-neutral as dark with its exact curated tokens", () => {
    const variant = getVariantById("base-nextjs", "starter-neutral");
    const scaffold = getScaffoldById("base-nextjs");
    if (!variant) throw new Error("starter-neutral variant not registered");
    if (!scaffold) throw new Error("base-nextjs scaffold not registered");

    const hints = buildVariantHintsForBrief(scaffold, variant);

    expect(hints).toMatchObject({
      colorMode: "dark",
      themeTokens: {
        background: "oklch(0.15 0.004 0)",
        foreground: "oklch(0.95 0.004 0)",
        card: "oklch(0.18 0.004 0)",
        primary: "oklch(0.58 0.16 258)",
      },
    });
    expect(formatVariantHintsForPrompt(hints!)).toContain("- Color mode: dark");
    expect(formatVariantHintsForPrompt(hints!)).toContain(
      "background: oklch(0.15 0.004 0)",
    );
  });

  it.each(["fresh-mint", "studio-soft"])(
    "keeps the explicit light alternative %s selectable",
    (variantId) => {
      const variant = getVariantById("base-nextjs", variantId);
      const scaffold = getScaffoldById("base-nextjs");
      if (!variant) throw new Error(`${variantId} variant not registered`);
      if (!scaffold) throw new Error("base-nextjs scaffold not registered");

      const hints = buildVariantHintsForBrief(scaffold, variant);

      expect(hints?.colorMode).toBe("light");
      expect(formatVariantHintsForPrompt(hints!)).toContain("- Color mode: light");
    },
  );

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

  it("exposes only one eligible complete-project reference", () => {
    const hints = buildVariantHintsForBrief(
      baseScaffold as ScaffoldManifest,
      baseVariant,
    );
    expect(hints?.sourceTemplate).toMatchObject({
      id: "8QhCJAwn16K",
      category: "landing-pages",
    });
    expect(formatVariantHintsForPrompt(hints!)).toContain(
      "Curated full-project reference",
    );
  });

  it("läcker inte mallens titel in i brief-prompten", () => {
    // Brief-steget avgör varumärke, målgrupp, copy och sidplan. En
    // domänspecifik titel här kan göra referensens bransch mer styrande än
    // användarens egen prompt — och den får sin "bara stil"-regel först i
    // codegen, alltså för sent.
    const hints = buildVariantHintsForBrief(
      baseScaffold as ScaffoldManifest,
      baseVariant,
    );
    const prompt = formatVariantHintsForPrompt(hints!);

    expect(hints?.sourceTemplate?.title).toBeTruthy();
    expect(prompt).not.toContain(hints!.sourceTemplate!.title);
    expect(prompt).toContain("landing-pages design");
    expect(prompt).toContain("VISUAL properties only");
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
