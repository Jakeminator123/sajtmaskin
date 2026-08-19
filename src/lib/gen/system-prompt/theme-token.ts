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
 * derived from the variant's own primary color instead of leaving the surface
 * dead-flat. Light variants get a soft top-left primary wash; dark variants
 * get a slightly heavier wash so depth is still readable on near-black.
 */
function buildFallbackBodyBackgroundImage(
  variant: ScaffoldVariant | null | undefined,
): string | null {
  const tokens = variant?.themeTokens;
  if (!tokens) return null;
  const primary = tokens.primary;
  const accent = tokens.accent;
  if (!primary && !accent) return null;
  const isDark = variant?.colorMode === "dark";
  const primaryMix = isDark ? 14 : 6;
  const accentMix = isDark ? 10 : 5;
  const primaryStop = primary
    ? `radial-gradient(circle at top left, color-mix(in oklab, ${primary} ${primaryMix}%, transparent) 0%, transparent 38%)`
    : null;
  const accentStop = accent
    ? `radial-gradient(circle at bottom right, color-mix(in oklab, ${accent} ${accentMix}%, transparent) 0%, transparent 42%)`
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

  const lines = entries
    .filter(([, value]) => Boolean(value))
    .map(([token, value]) => `  - ${token}: ${value}`);
  if (tokens.bodyBackgroundImage) {
    // bodyBackgroundImage is NOT a CSS variable — it's a body-styling
    // recipe. Emit it under its own sub-bullet with an explicit application
    // hint so the model adds it to `body { background-image: … }` in
    // app/globals.css rather than treating it as a stray --token.
    lines.push(
      `  - **Body background recipe** (apply on \`body { background-image: ... }\` in \`app/globals.css\`):`,
      `    - ${tokens.bodyBackgroundImage}`,
    );
  } else {
    const fallback = buildFallbackBodyBackgroundImage(variant);
    if (fallback) {
      lines.push(
        `  - **Body background recipe** (standardized fallback — apply on \`body { background-image: ... }\` in \`app/globals.css\` so the surface is not dead-flat):`,
        `    - ${fallback}`,
      );
    }
  }
  return lines;
}
