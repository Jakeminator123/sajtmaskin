import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { getVariantById } from "@/lib/gen/scaffold-variants";
import { formatThemeTokenLines } from "./theme-token";

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
  });

  it("matches the landing-page scaffold contract Tailwind utilities actually read", () => {
    const css = readFileSync(LANDING_PAGE_GLOBALS, "utf8");
    expect(css).toContain("@theme inline");
    expect(css).toMatch(/--color-background:\s*oklch\(/);
    expect(css).not.toContain("var(--background)");
    expect(css).toContain("@apply bg-background text-foreground");
  });
});
