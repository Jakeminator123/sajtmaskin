import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { getVariantById, type ScaffoldVariant } from "@/lib/gen/scaffold-variants";
import { formatBodyBackgroundRecipeLines, formatThemeTokenLines } from "./theme-token";

const LANDING_PAGE_GLOBALS = path.resolve(
  process.cwd(),
  "src/lib/gen/scaffolds/landing-page/files/app/globals.css",
);

describe("formatThemeTokenLines", () => {
  it("emits nothing without themeTokens", () => {
    expect(formatThemeTokenLines(null)).toEqual([]);
    expect(
      formatThemeTokenLines({
        id: "empty",
        scaffoldId: "landing-page",
        label: "Empty",
        keywords: [],
        fontPairings: [],
        signatureMotif: "none",
        colorMode: "light",
        promptHints: [],
      }),
    ).toEqual([]);
  });

  /**
   * 2026-08-19: futuristic-investment-landing (dark + gold) was selected, but
   * v1/v2 shipped a light surface. Variant tokens were listed as `--background`
   * while every scaffold's `@theme inline` names the utility as
   * `--color-background` with a literal — so a copied `--background` never
   * reached `bg-background`.
   */
  it("emits variant colors under Tailwind v4 --color- names", () => {
    const variant = getVariantById("landing-page", "futuristic-investment-landing");
    if (!variant) throw new Error("futuristic-investment-landing not registered");

    const text = formatThemeTokenLines(variant).join("\n");
    expect(text).toContain(`--color-background: ${variant.themeTokens!.background}`);
    expect(text).toContain(`--color-foreground: ${variant.themeTokens!.foreground}`);
    expect(text).toContain(`--color-primary: ${variant.themeTokens!.primary}`);
    expect(text).toContain(`--radius: ${variant.themeTokens!.radius}`);
    // No bare token may slip through: `- --background:` at the start of a bullet
    // is the failure mode, while `--color-background` legitimately contains it.
    expect(text).not.toMatch(/^ *- --(?!color-|radius)[a-z]/m);
    expect(text).not.toContain("Body background recipe");
    expect(text).not.toContain("radial-gradient");
  });

  it("emits the body wash as its own recipe, not as an @theme token", () => {
    const variant = getVariantById("landing-page", "futuristic-investment-landing");
    if (!variant) throw new Error("futuristic-investment-landing not registered");

    const recipe = formatBodyBackgroundRecipeLines(variant).join("\n");
    expect(recipe).toContain("Body background recipe");
    expect(recipe).toContain("NOT inside `@theme inline`");
    expect(recipe).toContain("apply this backgroundImage on `body` in `globals.css`");
    expect(recipe).toContain(`color-mix(in oklab, ${variant.themeTokens!.primary} 14%`);
    expect(recipe).not.toContain("--color-");
    expect(recipe).not.toContain("Emit exactly these values");
  });

  it("keeps an explicit bodyBackgroundImage out of the token list", () => {
    const variant: ScaffoldVariant = {
      id: "with-image",
      scaffoldId: "landing-page",
      label: "With image",
      keywords: [],
      fontPairings: [],
      signatureMotif: "none",
      colorMode: "dark",
      promptHints: [],
      themeTokens: {
        background: "oklch(0.145 0 0)",
        primary: "oklch(0.8 0.13 88)",
        bodyBackgroundImage: "radial-gradient(circle at top, gold 0%, transparent 40%)",
      },
    };
    const tokens = formatThemeTokenLines(variant).join("\n");
    const recipe = formatBodyBackgroundRecipeLines(variant).join("\n");
    expect(tokens).toContain("--color-background:");
    expect(tokens).not.toContain("radial-gradient");
    expect(recipe).toContain("radial-gradient(circle at top, gold 0%, transparent 40%)");
    expect(recipe).toContain("NOT inside `@theme inline`");
  });

  it("matches the landing-page scaffold contract Tailwind utilities actually read", () => {
    const css = readFileSync(LANDING_PAGE_GLOBALS, "utf8");
    expect(css).toContain("@theme inline");
    expect(css).toMatch(/--color-background:\s*oklch\(/);
    expect(css).not.toContain("var(--background)");
    expect(css).toContain("@apply bg-background text-foreground");
  });
});
