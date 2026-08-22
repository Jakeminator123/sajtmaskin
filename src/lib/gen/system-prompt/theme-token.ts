/**
 * Theme-token rendering helpers for the scaffold-variant block.
 *
 * Color names must match Tailwind v4 `@theme inline` (`--color-*`). The
 * historical `--background` spelling does not map to `bg-background`.
 */

import type { ScaffoldVariant } from "../scaffold-variants";

/**
 * Standardized "sterile but better" body background recipe used when a variant
 * does not ship its own `bodyBackgroundImage`. Keeps a calm visual rhythm
 * derived from the final primary/accent CSS variables instead of leaving the
 * surface dead-flat. The variant still controls the intensity: light variants
 * get a soft wash; dark variants get a slightly heavier one so depth remains
 * readable after Brief/user colors replace the variant defaults.
 */
export function resolveVariantBodyBackgroundImage(
  variant: ScaffoldVariant | null | undefined,
): string | null {
  const tokens = variant?.themeTokens;
  if (!tokens) return null;
  if (tokens.bodyBackgroundImage) return tokens.bodyBackgroundImage;
  const primary = tokens.primary;
  const accent = tokens.accent;
  if (!primary && !accent) return null;
  const isDark = variant?.colorMode === "dark";
  const primaryMix = isDark ? 14 : 6;
  const accentMix = isDark ? 10 : 5;
  const primaryStop = primary
    ? `radial-gradient(circle at top left, color-mix(in oklab, var(--color-primary) ${primaryMix}%, transparent) 0%, transparent 38%)`
    : null;
  const accentStop = accent
    ? `radial-gradient(circle at bottom right, color-mix(in oklab, var(--color-accent) ${accentMix}%, transparent) 0%, transparent 42%)`
    : null;
  return [primaryStop, accentStop].filter(Boolean).join(", ") || null;
}

export function formatThemeTokenLines(variant: ScaffoldVariant | null | undefined): string[] {
  const tokens = variant?.themeTokens;
  if (!tokens) return [];
  // Tailwind v4 `@theme inline` names color tokens `--color-*`, which is what
  // every scaffold's `app/globals.css` actually ships as literals (not
  // `--color-background: var(--background)`). Emitting the bare `--background`
  // form would leave `bg-background` / `text-foreground` on the scaffold
  // defaults even if the model copied these lines into `:root`.
  const entries = [
    ["--color-background", tokens.background],
    ["--color-foreground", tokens.foreground],
    ["--color-card", tokens.card],
    ["--color-card-foreground", tokens.cardForeground],
    ["--color-primary", tokens.primary],
    ["--color-primary-foreground", tokens.primaryForeground],
    ["--color-secondary", tokens.secondary],
    ["--color-secondary-foreground", tokens.secondaryForeground],
    ["--color-muted", tokens.muted],
    ["--color-muted-foreground", tokens.mutedForeground],
    ["--color-accent", tokens.accent],
    ["--color-accent-foreground", tokens.accentForeground],
    ["--color-border", tokens.border],
    ["--color-ring", tokens.ring],
    ["--radius", tokens.radius],
  ] as const;

  return entries
    .filter(([, value]) => Boolean(value))
    .map(([token, value]) => `  - ${token}: ${value}`);
}

/**
 * Body wash / image recipe for the variant. Not a theme token — must be
 * applied on `body` in `app/globals.css`, never dumped into `@theme inline`.
 */
export function formatBodyBackgroundRecipeLines(
  variant: ScaffoldVariant | null | undefined,
): string[] {
  const tokens = variant?.themeTokens;
  if (!tokens) return [];
  if (tokens.bodyBackgroundImage) {
    return [
      "- **Body background recipe** (apply this backgroundImage on `body` in `globals.css` — NOT inside `@theme inline`):",
      `  - ${tokens.bodyBackgroundImage}`,
    ];
  }
  const fallback = resolveVariantBodyBackgroundImage(variant);
  if (!fallback) return [];
  return [
    "- **Body background recipe** (standardized fallback — apply this backgroundImage on `body` in `globals.css` — NOT inside `@theme inline` so the surface is not dead-flat):",
    `  - ${fallback}`,
  ];
}
