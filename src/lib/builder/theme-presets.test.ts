import { describe, expect, it } from "vitest";

import {
  DESIGN_THEME_OPTIONS,
  THEME_CLUSTERS,
  THEME_PRESETS,
  getThemeColors,
  normalizeDesignTheme,
  resolveThemePalette,
  type ThemeClusterId,
  type ThemePalette,
} from "./theme-presets";

const CLUSTER_IDS = Object.keys(THEME_CLUSTERS) as ThemeClusterId[];

const PALETTE_FIELDS: Array<keyof ThemePalette> = [
  "background",
  "foreground",
  "card",
  "cardForeground",
  "primary",
  "primaryForeground",
  "secondary",
  "secondaryForeground",
  "muted",
  "mutedForeground",
  "accent",
  "accentForeground",
  "border",
  "ring",
];

describe("THEME_CLUSTERS", () => {
  it("covers every preset hue in both color modes", () => {
    expect(CLUSTER_IDS.sort()).toEqual(Object.keys(THEME_PRESETS).sort());
    for (const id of CLUSTER_IDS) {
      for (const mode of ["light", "dark"] as const) {
        for (const field of PALETTE_FIELDS) {
          const value = THEME_CLUSTERS[id][mode][field];
          expect(value, `${id}.${mode}.${String(field)}`).toMatch(/^oklch\(/);
        }
      }
    }
  });

  /**
   * `designTheme` is persisted in request meta, so a cluster id is not just a UI
   * label — dropping one would silently downgrade an existing chat's saved choice
   * to "off" via `normalizeDesignTheme`'s fallback.
   */
  it("keeps every id reachable from the UI options and normalizer", () => {
    for (const id of CLUSTER_IDS) {
      expect(DESIGN_THEME_OPTIONS.some((option) => option.value === id)).toBe(true);
      expect(normalizeDesignTheme(id)).toBe(id);
    }
  });

  it("keeps the legacy three-color contract in sync with the cluster's light palette", () => {
    for (const id of CLUSTER_IDS) {
      const legacy = getThemeColors(id);
      expect(legacy).not.toBeNull();
      expect(THEME_CLUSTERS[id].light.primary).toBe(legacy!.primary);
      expect(THEME_CLUSTERS[id].light.secondary).toBe(legacy!.secondary);
      expect(THEME_CLUSTERS[id].light.accent).toBe(legacy!.accent);
    }
  });

  it("gives light and dark genuinely different surfaces", () => {
    for (const id of CLUSTER_IDS) {
      expect(THEME_CLUSTERS[id].light.background).not.toBe(THEME_CLUSTERS[id].dark.background);
      expect(THEME_CLUSTERS[id].light.foreground).not.toBe(THEME_CLUSTERS[id].dark.foreground);
    }
  });

  it("gives every cluster a Swedish label", () => {
    for (const id of CLUSTER_IDS) {
      expect(THEME_CLUSTERS[id].label.length).toBeGreaterThan(0);
      expect(THEME_CLUSTERS[id].label).not.toBe(id);
    }
  });
});

describe("resolveThemePalette", () => {
  it("returns null when Färg is off or custom", () => {
    expect(resolveThemePalette("off", "light")).toBeNull();
    expect(resolveThemePalette("custom", "dark")).toBeNull();
  });

  it("selects the palette matching the Färgläge choice", () => {
    expect(resolveThemePalette("blue", "dark")).toEqual(THEME_CLUSTERS.blue.dark);
    expect(resolveThemePalette("blue", "light")).toEqual(THEME_CLUSTERS.blue.light);
  });

  it("falls back to the light palette on auto", () => {
    expect(resolveThemePalette("red", "auto")).toEqual(THEME_CLUSTERS.red.light);
  });

  /**
   * Regression guard for the mid-project surface flip.
   *
   * The Färgläge choice only reaches the server on init. Deriving it from the
   * pinned variant's `colorMode` looks reasonable but breaks the exact case this
   * asserts: Färgläge=mörkt with a LIGHT variant would re-resolve to the light
   * palette on every follow-up and flip a dark site back. `finalize-prompts.ts`
   * therefore renders the locked palette on init only — the mode is never guessed.
   */
  it("resolves dark and light to genuinely opposite surfaces, so a wrong mode is never cosmetic", () => {
    const dark = resolveThemePalette("blue", "dark")!;
    const light = resolveThemePalette("blue", "light")!;
    expect(dark.background).not.toBe(light.background);
    expect(dark.foreground).not.toBe(light.foreground);
    expect(dark.card).not.toBe(light.card);
    // `auto` must never silently mean "dark" — that is what makes guessing unsafe.
    expect(resolveThemePalette("blue", "auto")).toEqual(light);
  });
});
