/**
 * Small pure helpers used by `buildDynamicContext` — string normalization,
 * capability-hint extraction, shadcn toolkit summary passthrough, theme-token
 * rendering and fallback body-background recipe.
 *
 * Extracted from `src/lib/gen/system-prompt.ts` 2026-04-21.
 */

import type { ScaffoldVariant } from "../scaffold-variants";
import type { ScaffoldId } from "../scaffolds/types";
import { buildRegistryDrivenShadcnToolkitSummary } from "../data/shadcn-toolkit-summary";

export function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : [];
}

export function extractCapabilityHintLines(capabilityHints?: string): string[] {
  if (!capabilityHints?.trim()) return [];
  return capabilityHints
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));
}

export function buildShadcnToolkitSummary(ctx?: {
  scaffoldId?: ScaffoldId | null;
}): string[] {
  return buildRegistryDrivenShadcnToolkitSummary(
    ctx?.scaffoldId ? ctx : undefined,
  );
}

/**
 * Standardized "sterile but better" body background recipe used when a variant
 * does not ship its own `bodyBackgroundImage`. Keeps a calm visual rhythm
 * derived from the variant's own primary color instead of leaving the surface
 * dead-flat. Light variants get a soft top-left primary wash; dark variants
 * get a slightly heavier wash so depth is still readable on near-black.
 */
export function buildFallbackBodyBackgroundImage(
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

export function formatThemeTokenLines(
  variant: ScaffoldVariant | null | undefined,
): string[] {
  const tokens = variant?.themeTokens;
  if (!tokens) return [];
  const entries = [
    ["--background", tokens.background],
    ["--foreground", tokens.foreground],
    ["--card", tokens.card],
    ["--card-foreground", tokens.cardForeground],
    ["--primary", tokens.primary],
    ["--primary-foreground", tokens.primaryForeground],
    ["--secondary", tokens.secondary],
    ["--secondary-foreground", tokens.secondaryForeground],
    ["--muted", tokens.muted],
    ["--muted-foreground", tokens.mutedForeground],
    ["--accent", tokens.accent],
    ["--accent-foreground", tokens.accentForeground],
    ["--border", tokens.border],
    ["--ring", tokens.ring],
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
