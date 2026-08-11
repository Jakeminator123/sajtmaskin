import { describe, expect, it } from "vitest";

import { THEME_CLUSTERS } from "@/lib/builder/theme-presets";
import { renderLockedColorPaletteBlock } from "./sections/brief-visual-media";
import { splitContextIntoBudgetBlocks } from "./budget";

describe("renderLockedColorPaletteBlock", () => {
  it("renders nothing when Färg is off", () => {
    expect(renderLockedColorPaletteBlock(null, null)).toEqual([]);
    expect(renderLockedColorPaletteBlock(undefined, "Havsblå")).toEqual([]);
  });

  /**
   * The token names must match what the scaffolds actually ship inside
   * `@theme inline` — Tailwind v4's `--color-*` form. The bare `--background`
   * spelling would leave `bg-background` unmapped, so a palette the prompt calls
   * "locked" could silently fail to apply.
   */
  it("emits every palette token under its Tailwind v4 --color- name", () => {
    const palette = THEME_CLUSTERS.red.dark;
    const text = renderLockedColorPaletteBlock(palette, "Tegelröd").join("\n");

    expect(text).toContain("## Locked Color Palette");
    expect(text).toContain("Tegelröd");
    for (const [token, value] of [
      ["--color-background", palette.background],
      ["--color-foreground", palette.foreground],
      ["--color-card", palette.card],
      ["--color-card-foreground", palette.cardForeground],
      ["--color-primary", palette.primary],
      ["--color-primary-foreground", palette.primaryForeground],
      ["--color-secondary", palette.secondary],
      ["--color-secondary-foreground", palette.secondaryForeground],
      ["--color-muted", palette.muted],
      ["--color-muted-foreground", palette.mutedForeground],
      ["--color-accent", palette.accent],
      ["--color-accent-foreground", palette.accentForeground],
      ["--color-border", palette.border],
      ["--color-ring", palette.ring],
    ]) {
      expect(text).toContain(`${token}: ${value}`);
    }
    // No bare token may slip through: `- --background:` at the start of a bullet
    // is the failure mode, while `--color-background` legitimately contains it.
    expect(text).not.toMatch(/^ *- --(?!color-)[a-z]/m);
  });

  /**
   * The variant ships a complete `themeTokens` set labelled "variant defaults",
   * which is what used to decide background/card/muted. Without an explicit
   * supersede the user could pick Tegelröd and still get a neutral grey shell.
   */
  it("states that it outranks the variant theme tokens", () => {
    const text = renderLockedColorPaletteBlock(THEME_CLUSTERS.violet.light, "Plommon").join("\n");
    expect(text).toMatch(/supersedes the Scaffold Variant theme tokens/i);
    expect(text).toMatch(/do not fall back to a neutral grey surface/i);
  });

  it("leaves radius and typography to the variant", () => {
    const text = renderLockedColorPaletteBlock(THEME_CLUSTERS.green.light, "Skogsgrön").join("\n");
    expect(text).not.toContain("--radius");
    expect(text).toMatch(/keep the variant's radius, typography/i);
  });

  it("is budgeted as a required block so pruning cannot drop the user's choice", () => {
    const blocks = splitContextIntoBudgetBlocks(
      renderLockedColorPaletteBlock(THEME_CLUSTERS.blue.light, "Havsblå").join("\n"),
    );
    const block = blocks.find((entry) => entry.title === "Locked Color Palette");
    expect(block).toBeDefined();
    expect(block!.required).toBe(true);
    expect(block!.priority).toBeGreaterThanOrEqual(94);
  });
});
