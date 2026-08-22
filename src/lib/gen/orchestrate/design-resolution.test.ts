import { describe, expect, it } from "vitest";
import type { ThemePalette } from "@/lib/builder/theme-presets";
import { getVariantById } from "../scaffold-variants";
import {
  detectFollowUpDesignAxes,
  detectFollowUpDesignFields,
  resolveDesignContract,
} from "./design-resolution";

const variant = getVariantById("landing-page", "editorial-lux")!;

const inferredBrief = {
  designIntent: { explicitAxes: [], explicitFields: [] },
  toneAndVoice: ["calm"],
  motionLevel: "minimal" as const,
  qualityBar: "clean" as const,
  visualDirection: {
    styleKeywords: ["clean"],
    colorMode: "light" as const,
    colorPalette: {
      primary: "#3b82f6",
      secondary: "#6366f1",
      accent: "#f59e0b",
      background: "#0a0a0a",
      text: "#ffffff",
    },
    typography: { headings: "Inter", body: "Inter" },
  },
};

describe("resolveDesignContract", () => {
  it("does not let inferred/simplified Brief defaults overwrite a complete variant", () => {
    const result = resolveDesignContract({ brief: inferredBrief, variant });

    expect(result.themeTokens.primary).toMatchObject({
      value: variant.themeTokens?.primary,
      source: "variant",
    });
    expect(result.typography.heading).toMatchObject({
      value: variant.fontPairings[0]?.heading,
      source: "variant",
    });
    expect(result.colorMode).toMatchObject({ value: "dark", source: "variant" });
    expect(result.styleKeywords).toMatchObject({
      value: variant.keywords.slice(0, 8),
      source: "variant",
    });
    expect(result.themeTokens.bodyBackgroundImage).toMatchObject({ source: "variant" });
    expect(result.motionLevel).toMatchObject({ value: "minimal", source: "brief-inferred" });
  });

  it("lets only explicitly constrained Brief axes replace overlapping variant values", () => {
    const result = resolveDesignContract({
      brief: {
        ...inferredBrief,
        designIntent: {
          explicitAxes: ["style", "palette", "typography", "color-mode"],
          explicitFields: [
            "palette.primary",
            "palette.secondary",
            "palette.accent",
            "palette.background",
            "palette.text",
            "typography.headings",
            "typography.body",
          ],
        },
      },
      variant,
    });

    expect(result.themeTokens.primary).toMatchObject({
      value: "#3b82f6",
      source: "brief-explicit",
      locked: true,
    });
    expect(result.themeTokens.card).toMatchObject({
      value: "#0a0a0a",
      source: "brief-explicit",
    });
    expect(result.typography.heading).toMatchObject({
      value: "Inter",
      source: "brief-explicit",
      locked: true,
    });
    expect(result.colorMode).toMatchObject({
      value: "light",
      source: "brief-explicit",
      locked: true,
    });
    expect(result.styleKeywords).toMatchObject({
      value: ["clean"],
      source: "brief-explicit",
      locked: true,
    });
  });

  it("overrides only an explicitly named accent and keeps inferred palette siblings on Variant", () => {
    const result = resolveDesignContract({
      brief: {
        ...inferredBrief,
        designIntent: {
          explicitAxes: ["palette"],
          explicitFields: ["palette.accent"],
        },
        visualDirection: {
          ...inferredBrief.visualDirection,
          colorPalette: {
            ...inferredBrief.visualDirection.colorPalette,
            accent: "#ff0000",
          },
        },
      },
      variant,
    });

    expect(result.themeTokens.accent).toMatchObject({
      value: "#ff0000",
      source: "brief-explicit",
      locked: true,
    });
    expect(result.themeTokens.primary).toMatchObject({
      value: variant.themeTokens?.primary,
      source: "variant",
    });
    expect(result.themeTokens.background).toMatchObject({
      value: variant.themeTokens?.background,
      source: "variant",
    });
    expect(result.themeTokens.accentForeground).toMatchObject({
      value: "#111111",
      source: "brief-explicit",
    });
  });

  it("overrides only an explicitly named heading font", () => {
    const result = resolveDesignContract({
      brief: {
        ...inferredBrief,
        designIntent: {
          explicitAxes: ["typography"],
          explicitFields: ["typography.headings"],
        },
        visualDirection: {
          ...inferredBrief.visualDirection,
          typography: { headings: "Fraunces", body: "Invented Body" },
        },
      },
      variant,
    });

    expect(result.typography.heading).toMatchObject({
      value: "Fraunces",
      source: "brief-explicit",
    });
    expect(result.typography.body).toMatchObject({
      value: variant.fontPairings[0]?.body,
      source: "variant",
    });
  });

  it("lets a broad explicit palette own every palette field without fabricating exact provenance", () => {
    const result = resolveDesignContract({
      brief: {
        ...inferredBrief,
        designIntent: { explicitAxes: ["palette"], explicitFields: [] },
      },
      variant,
    });

    expect(result.explicitFields).toEqual([]);
    expect(result.themeTokens.primary).toMatchObject({
      value: "#3b82f6",
      source: "brief-explicit",
    });
    expect(result.themeTokens.background).toMatchObject({
      value: "#0a0a0a",
      source: "brief-explicit",
    });
    expect(result.themeTokens.foreground).toMatchObject({
      value: "#ffffff",
      source: "brief-explicit",
    });
  });

  it("lets broad explicit typography own both fonts while keeping explicitFields empty", () => {
    const result = resolveDesignContract({
      brief: {
        ...inferredBrief,
        designIntent: { explicitAxes: ["typography"], explicitFields: [] },
        visualDirection: {
          ...inferredBrief.visualDirection,
          typography: { headings: "Fraunces", body: "Source Serif 4" },
        },
      },
      variant,
    });

    expect(result.explicitFields).toEqual([]);
    expect(result.typography.heading).toMatchObject({
      value: "Fraunces",
      source: "brief-explicit",
    });
    expect(result.typography.body).toMatchObject({
      value: "Source Serif 4",
      source: "brief-explicit",
    });
  });

  it("derives a readable companion and coherent surfaces for a full explicit palette", () => {
    const result = resolveDesignContract({
      brief: {
        ...inferredBrief,
        designIntent: {
          explicitAxes: ["palette"],
          explicitFields: [
            "palette.primary",
            "palette.secondary",
            "palette.accent",
            "palette.background",
            "palette.text",
          ],
        },
        visualDirection: {
          ...inferredBrief.visualDirection,
          colorPalette: {
            primary: "#000000",
            secondary: "#eeeeee",
            accent: "#222222",
            background: "#ffffff",
            text: "#111111",
          },
        },
      },
      variant,
    });

    expect(result.themeTokens.primaryForeground).toMatchObject({
      value: "#ffffff",
      source: "brief-explicit",
      locked: true,
    });
    expect(result.themeTokens.card).toMatchObject({
      value: "#ffffff",
      source: "brief-explicit",
    });
    expect(result.themeTokens.cardForeground?.value).toBe("#111111");
    expect(result.themeTokens.border?.value).toContain("color-mix(in oklab, #111111 18%, #ffffff)");
    expect(result.themeTokens.ring?.value).toBe("#000000");
  });

  it("applies the builder's full palette as the final color authority", () => {
    const lockedColorPalette: ThemePalette = {
      background: "bg",
      foreground: "fg",
      card: "card",
      cardForeground: "card-fg",
      primary: "primary",
      primaryForeground: "primary-fg",
      secondary: "secondary",
      secondaryForeground: "secondary-fg",
      muted: "muted",
      mutedForeground: "muted-fg",
      accent: "accent",
      accentForeground: "accent-fg",
      border: "border",
      ring: "ring",
    };
    const result = resolveDesignContract({
      brief: inferredBrief,
      variant,
      lockedColorPalette,
      colorModeHint: "light",
    });

    expect(result.themeTokens.card).toEqual({
      value: "card",
      source: "user-locked",
      locked: true,
    });
    expect(result.themeTokens.radius?.value).toBe(variant.themeTokens?.radius);
    expect(result.colorMode).toEqual({
      value: "light",
      source: "user-locked",
      locked: true,
    });
  });

  it("preserves the accepted full palette and color mode on a neutral follow-up", () => {
    const lockedColorPalette: ThemePalette = {
      background: "#08090a",
      foreground: "#f7f7f5",
      card: "#111315",
      cardForeground: "#f7f7f5",
      primary: "#d4a853",
      primaryForeground: "#08090a",
      secondary: "#24272b",
      secondaryForeground: "#f7f7f5",
      muted: "#1a1d20",
      mutedForeground: "#a8adb4",
      accent: "#7a5cff",
      accentForeground: "#ffffff",
      border: "#30343a",
      ring: "#d4a853",
    };
    const accepted = resolveDesignContract({
      brief: inferredBrief,
      variant,
      lockedColorPalette,
      colorModeHint: "dark",
    });
    const followUp = resolveDesignContract({
      brief: inferredBrief,
      variant,
      priorResolvedDesign: accepted,
    });

    expect(followUp.colorMode).toEqual(accepted.colorMode);
    expect(followUp.themeTokens).toEqual(accepted.themeTokens);
    expect(followUp.themeTokens.card).toMatchObject({
      value: "#111315",
      source: "user-locked",
    });
  });

  it("keeps structured user tone exact and makes fallback washes follow final CSS tokens", () => {
    const fallbackVariant = getVariantById("landing-page", "corporate-grid")!;
    const result = resolveDesignContract({
      brief: inferredBrief,
      variant: fallbackVariant,
      toneKeywordsHint: ["direct", "confident"],
    });

    expect(result.toneAndVoice).toEqual({
      value: ["direct", "confident"],
      source: "user-locked",
      locked: true,
    });
    expect(result.themeTokens.bodyBackgroundImage?.value).toContain("var(--color-primary)");
  });

  it("keeps legacy brief-first semantics when provenance is absent", () => {
    const { designIntent: _designIntent, ...legacyBrief } = inferredBrief;
    const result = resolveDesignContract({ brief: legacyBrief, variant });

    expect(result.themeTokens.primary?.value).toBe("#3b82f6");
    expect(result.typography.heading.value).toBe("Inter");
    expect(result.themeTokens.primary?.source).toBe("brief-explicit");
  });

  it("delegates only the exact compound field across later neutral edits", () => {
    const accepted = resolveDesignContract({ brief: inferredBrief, variant });
    const targeted = resolveDesignContract({
      brief: inferredBrief,
      variant,
      priorResolvedDesign: accepted,
      currentRequestAxes: detectFollowUpDesignAxes("Byt bakgrunden till blå"),
      currentRequestFields: detectFollowUpDesignFields("Byt bakgrunden till blå"),
    });
    const neutral = resolveDesignContract({
      brief: inferredBrief,
      variant,
      priorResolvedDesign: targeted,
      currentRequestAxes: detectFollowUpDesignAxes("Byt hero-rubriken till Välkommen"),
      currentRequestFields: detectFollowUpDesignFields("Byt hero-rubriken till Välkommen"),
    });

    expect(targeted.unresolvedAxes).toEqual([]);
    expect(targeted.unresolvedFields).toEqual(["palette.background"]);
    expect(neutral.unresolvedAxes).toEqual([]);
    expect(neutral.unresolvedFields).toEqual(["palette.background"]);
    expect(neutral.themeTokens).toEqual(accepted.themeTokens);
    expect(neutral.typography).toEqual(accepted.typography);
  });

  it("keeps accent and heading ownership field-granular through three turns", () => {
    const accepted = resolveDesignContract({ brief: inferredBrief, variant });
    const accentEdit = resolveDesignContract({
      brief: inferredBrief,
      variant,
      priorResolvedDesign: accepted,
      currentRequestAxes: detectFollowUpDesignAxes("Gör accenten röd"),
      currentRequestFields: detectFollowUpDesignFields("Gör accenten röd"),
    });
    const headingEdit = resolveDesignContract({
      brief: inferredBrief,
      variant,
      priorResolvedDesign: accentEdit,
      currentRequestAxes: detectFollowUpDesignAxes("Ändra rubrikfonten till Fraunces"),
      currentRequestFields: detectFollowUpDesignFields("Ändra rubrikfonten till Fraunces"),
    });
    const neutral = resolveDesignContract({
      brief: inferredBrief,
      variant,
      priorResolvedDesign: headingEdit,
      currentRequestAxes: detectFollowUpDesignAxes("Byt hero-rubriken till Välkommen"),
      currentRequestFields: detectFollowUpDesignFields("Byt hero-rubriken till Välkommen"),
    });

    expect(accentEdit.unresolvedAxes).toEqual([]);
    expect(accentEdit.unresolvedFields).toEqual(["palette.accent"]);
    expect(headingEdit.unresolvedAxes).toEqual([]);
    expect(headingEdit.unresolvedFields).toEqual(["palette.accent", "typography.headings"]);
    expect(neutral.unresolvedFields).toEqual(["palette.accent", "typography.headings"]);
    expect(neutral.themeTokens.primary).toEqual(accepted.themeTokens.primary);
    expect(neutral.themeTokens.background).toEqual(accepted.themeTokens.background);
    expect(neutral.typography.body).toEqual(accepted.typography.body);
  });

  it("delegates a broad palette request as a whole axis", () => {
    const accepted = resolveDesignContract({ brief: inferredBrief, variant });
    const result = resolveDesignContract({
      brief: inferredBrief,
      variant,
      priorResolvedDesign: accepted,
      currentRequestAxes: detectFollowUpDesignAxes("Ändra hela paletten"),
      currentRequestFields: detectFollowUpDesignFields("Ändra hela paletten"),
    });

    expect(result.unresolvedAxes).toEqual(["palette"]);
    expect(result.unresolvedFields).toEqual([]);
  });

  it("detects palette/font requests without mistaking heading-size edits for typography", () => {
    expect(detectFollowUpDesignAxes("Byt bakgrunden till blå")).toEqual(["palette"]);
    expect(detectFollowUpDesignAxes("Gör accenten röd")).toEqual(["palette"]);
    expect(detectFollowUpDesignAxes("Use a warmer accent")).toEqual(["palette"]);
    expect(detectFollowUpDesignAxes("Ändra rubrikfonten till Fraunces")).toEqual(["typography"]);
    expect(detectFollowUpDesignAxes("Gör sajten mer minimalistisk")).toEqual(["style"]);
    expect(detectFollowUpDesignAxes("Make the site more playful")).toEqual(["style"]);
    expect(detectFollowUpDesignAxes("Gör rubriken större")).toEqual([]);
    expect(detectFollowUpDesignFields("Byt bakgrunden till blå")).toEqual(["palette.background"]);
    expect(detectFollowUpDesignFields("Gör accenten röd")).toEqual(["palette.accent"]);
    expect(detectFollowUpDesignFields("Ändra rubrikfonten till Fraunces")).toEqual([
      "typography.headings",
    ]);
    expect(detectFollowUpDesignFields("Använd Fraunces i rubrikerna")).toEqual([
      "typography.headings",
    ]);
    expect(detectFollowUpDesignFields("Use Inter for body text")).toEqual(["typography.body"]);
    expect(detectFollowUpDesignFields("Gör rubriken större")).toEqual([]);
    expect(detectFollowUpDesignFields("Ändra hela paletten")).toEqual([]);
    expect(detectFollowUpDesignFields("Byt font")).toEqual([]);
  });
});

describe("follow-up design ownership", () => {
  it.each(["Gör sidan mörk", "Gör den ljusare", "Make the site dark", "Make it lighter"])(
    "treats a site-wide dark/light request as color-mode + palette: %s",
    (prompt) => {
      expect(detectFollowUpDesignAxes(prompt)).toEqual(
        expect.arrayContaining(["color-mode", "palette"]),
      );
    },
  );

  it("does not promote a local dark heading request to a global color mode", () => {
    expect(detectFollowUpDesignAxes("Gör rubriken mörk")).toEqual([]);
  });

  it("lets a site-wide warmer request reopen both style and palette", () => {
    expect(detectFollowUpDesignAxes("Gör sajten varmare")).toEqual(
      expect.arrayContaining(["style", "palette"]),
    );
    expect(detectFollowUpDesignAxes("Gör rubriken varmare")).toEqual([]);
  });
});
