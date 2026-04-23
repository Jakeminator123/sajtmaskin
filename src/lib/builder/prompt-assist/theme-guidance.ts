/**
 * Theme + visual identity + quality bar + seasonal palette helpers.
 *
 * Split out of `promptAssist.ts` (OMTAG-03 wave-rest) — no behavior change.
 */

import type { ThemeColors } from "../theme-presets";
import { hasAny } from "./formatters";

export interface ColorPalette {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  text?: string;
}

export function toColorPalette(themeOverride?: ThemeColors | null): ColorPalette {
  if (!themeOverride) return {};
  const palette: ColorPalette = {};
  if (themeOverride.primary) palette.primary = themeOverride.primary;
  if (themeOverride.secondary) palette.secondary = themeOverride.secondary;
  if (themeOverride.accent) palette.accent = themeOverride.accent;
  return palette;
}

export function buildThemeAccentLines(themeOverride?: ThemeColors | null): string[] {
  if (!themeOverride) return [];
  const lines: string[] = [];
  if (themeOverride.secondary) {
    lines.push(
      `Use the secondary color (${themeOverride.secondary}) for supporting surfaces and secondary UI elements.`,
    );
  }
  if (themeOverride.accent) {
    lines.push(
      `Use the accent color (${themeOverride.accent}) for highlights, badges, and hover accents.`,
    );
  }
  return lines;
}

export function buildThemeTokenLines(themeOverride?: ThemeColors | null): string[] {
  if (!themeOverride) return [];
  const tokens: string[] = [];
  if (themeOverride.primary) tokens.push(`- --primary: ${themeOverride.primary}`);
  if (themeOverride.secondary) tokens.push(`- --secondary: ${themeOverride.secondary}`);
  if (themeOverride.accent) tokens.push(`- --accent: ${themeOverride.accent}`);
  if (tokens.length === 0) return [];
  return [
    "Theme tokens (must match exactly):",
    ...tokens,
    "Do not change these values.",
  ];
}

export function hasThemeOverride(themeOverride?: ThemeColors | null): boolean {
  return Boolean(
    themeOverride &&
      (themeOverride.primary || themeOverride.secondary || themeOverride.accent),
  );
}

function isDarkPalette(palette: ColorPalette): boolean {
  const bg = (palette.background || "").toLowerCase();
  return (
    bg.includes("#0") ||
    bg.includes("#1") ||
    bg.includes("#2") ||
    bg.includes("dark") ||
    bg.includes("black") ||
    bg.includes("oklch(0.")
  );
}

const VISUAL_IDENTITY_GUIDANCE = {
  detailed: [
    "Never use flat pure-white backgrounds across the whole page.",
    "Use layered backgrounds: gradients, soft tints, and section bands to create depth.",
    "Ensure the hero uses a distinctive background (gradient or tinted panel).",
    "Pick a distinct font pairing (e.g., Inter + Space Grotesk, DM Sans + DM Mono).",
    "Create a cohesive color palette: primary, secondary, accent, with consistent application.",
  ],
  compact: [
    "Never use flat pure-white backgrounds across the whole page.",
    "Use layered backgrounds: gradients, soft tints, and section bands to create depth.",
    "Ensure the hero uses a distinctive background (gradient or tinted panel).",
    "Pick a distinct font pairing (e.g., Inter + Space Grotesk, DM Sans + DM Mono).",
  ],
};

export function resolveVisualIdentityGuidance(
  palette: ColorPalette,
  styleKeywords: string[],
  tone: string[],
  variant: "detailed" | "compact" = "detailed",
  options?: { themeLocked?: boolean },
): string[] {
  const base = [...VISUAL_IDENTITY_GUIDANCE[variant]];
  if (isDarkPalette(palette)) {
    // Replace "never flat white" with dark-specific guidance
    base[0] = "Use a rich dark background with subtle gradients or noise texture for depth.";
    base.push("Ensure sufficient contrast between text and dark backgrounds (WCAG AA+).");
  }
  if (options?.themeLocked) {
    const paletteIndex = base.findIndex((line) => line.toLowerCase().includes("color palette"));
    if (paletteIndex >= 0) {
      base[paletteIndex] = "Use the provided theme tokens; do not invent a new palette.";
    }
  }
  if (hasAny(styleKeywords, ["neon", "cyberpunk", "futuristic"])) {
    base.push("Use neon accent glows, high-contrast borders, and monospace or geometric fonts.");
  }
  if (hasAny(tone, ["luxury", "elegant", "premium"])) {
    base.push("Use generous whitespace, serif headings, and restrained accent color application.");
  }
  if (hasAny(tone, ["playful", "fun", "colorful", "lekfull"])) {
    base.push("Use vibrant accent colors, rounded shapes, and energetic color contrasts.");
  }
  if (palette.primary) {
    base.push(`Use the primary color (${palette.primary}) consistently for CTAs, links, and key accents.`);
  }
  return base;
}

export function isSeasonalOrCulturalTopic(value: string): boolean {
  const lower = value.toLowerCase();
  return [
    "jul",
    "christmas",
    "holiday",
    "festive",
    "vinter",
    "winter",
    "gran",
    "granar",
    "tree",
    "trees",
    "tyskland",
    "germany",
    "julmarknad",
    "market",
    "skog",
    "forest",
  ].some((keyword) => lower.includes(keyword));
}

export function getSubjectPaletteGuidance(value: string): string[] {
  const lower = value.toLowerCase();
  if (
    [
      "jul",
      "christmas",
      "festive",
      "holiday",
      "gran",
      "granar",
      "julmarknad",
      "snow",
      "snö",
      "winter",
      "vinter",
    ].some((keyword) => lower.includes(keyword))
  ) {
    return [
      "Suggested subject palette: evergreen/spruce green, deep Christmas red, snow white, bark brown, and warm gold.",
      "Use those colors in hero backgrounds, CTA accents, badges, borders, and decorative details instead of default SaaS blue.",
    ];
  }
  return [];
}

const QUALITY_BAR_GUIDANCE = {
  detailed: [
    "Aim for a premium, layered look: cards with borders, soft shadows, glassy panels, depth.",
    "Vary layouts: bento grids, split hero, stats row, logo wall, testimonial carousel, alternating sections.",
    "Increase visual density with tasteful imagery, lucide-react icons, and decorative accents.",
    "Avoid flat, empty sections; use section separators, background bands, or subtle gradients.",
  ],
  compact: [
    "Aim for a premium, layered look: cards with borders, soft shadows, glassy panels.",
    "Vary layouts: bento grids, split hero, stats row, logo wall, testimonial carousel.",
    "Use lucide-react icons and decorative accents for visual richness.",
    "Avoid flat, empty sections; use section separators or subtle gradients.",
  ],
};

export const IMAGE_DENSITY_GUIDANCE = [
  "Images in hero + at least 2 additional sections.",
  "Consistent aspect ratios and professional cropping throughout.",
];

export function resolveQualityBarGuidance(
  tone: string[],
  styleKeywords: string[],
  variant: "detailed" | "compact" = "detailed",
): string[] {
  const base = [...QUALITY_BAR_GUIDANCE[variant]];
  if (hasAny(styleKeywords, ["minimal", "clean", "simple"])) {
    return [
      "Aim for a clean, minimal look: generous whitespace, sharp typography, few decorative elements.",
      "Use simple layouts: single-column hero, clean card grid, focused CTAs.",
      "Avoid visual clutter; let content breathe with consistent spacing.",
    ];
  }
  if (hasAny(styleKeywords, ["bold", "dramatic", "intense", "maximal"])) {
    base.push("Go bold: oversized typography, full-bleed images, high-contrast sections.");
  }
  if (hasAny(tone, ["playful", "fun", "whimsical"])) {
    base.push("Add personality: custom illustrations, emoji accents, or quirky layout variations.");
  }
  return base;
}
