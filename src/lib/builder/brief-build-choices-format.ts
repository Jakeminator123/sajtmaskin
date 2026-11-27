/**
 * Server-side prompt appendix for Deep Brief Byggval constraints.
 * Not safe for client imports (pulls scaffold registry + variant JSON via fs).
 */

import { getScaffoldById } from "@/lib/gen/scaffolds/registry";
import {
  buildVariantHintsForBrief,
  formatVariantHintsForPrompt,
} from "@/lib/gen/scaffold-variants/variant-hints";
import { resolveVariantForStyleChoice } from "@/lib/gen/scaffold-variants/style-choice-variants";
import type { BriefBuildChoicesInput } from "@/lib/builder/brief-build-choices";
import { getThemeColors, normalizeDesignTheme, resolveThemePalette } from "./theme-presets";
import type { VariantHints } from "@/lib/gen/scaffold-variants/variant-hints";

/**
 * Prompt appendix for Deep Brief: structured Byggval constraints plus, when a
 * site type was chosen, the same variant hint block create-chat would send to
 * the server auto-brief path.
 */
export function formatBriefBuildChoicesForPrompt(
  input: BriefBuildChoicesInput | null | undefined,
  preMatchedHints?: VariantHints | null,
): string | undefined {
  if (!input && !preMatchedHints) return undefined;
  input ??= {};
  const lines: string[] = [];
  if (input.buildIntent === "website" || input.buildIntent === "app") {
    lines.push(`- Build intent (user choice): ${input.buildIntent}`);
  }
  if (input.scaffoldId) {
    const scaffold = getScaffoldById(input.scaffoldId);
    lines.push(`- Site type / scaffold: ${scaffold?.label ?? input.scaffoldId}`);
  }
  if (typeof input.pageCountHint === "number" && input.pageCountHint >= 1) {
    lines.push(`- Page count ceiling (this round): ${input.pageCountHint}`);
  }
  if (input.styleChoiceHint) {
    lines.push(`- Style choice: ${input.styleChoiceHint}`);
  }
  if (input.styleKeywordsHint?.length) {
    lines.push(`- Style keywords: ${input.styleKeywordsHint.join(", ")}`);
  }
  if (input.toneKeywordsHint?.length) {
    lines.push(`- Tone keywords: ${input.toneKeywordsHint.join(", ")}`);
  }
  if (input.colorModeHint) {
    lines.push(`- Color mode: ${input.colorModeHint}`);
  }
  if (input.complexityHint) {
    lines.push(`- Complexity: ${input.complexityHint}`);
  }
  const theme = normalizeDesignTheme(input.designThemePreset);
  const palette = input.colorModeHint
    ? resolveThemePalette(theme, input.colorModeHint)
    : getThemeColors(theme);
  const colors = palette ?? input.themeColors;
  if (colors) {
    lines.push(`- Color theme family: ${theme === "off" ? "custom" : theme}`);
    lines.push(`- Brand colors: primary ${colors.primary}, secondary ${colors.secondary}, accent ${colors.accent}`);
    if (palette && "background" in palette && "foreground" in palette) {
      lines.push(`- Surface colors: background ${palette.background}, text ${palette.foreground}`);
    }
  }
  if (input.designThemePreset !== undefined && !input.colorModeHint) {
    lines.push("- Color mode: auto. Decide light or dark from the subject, content and chosen style, then record coherent background and text colors in visualDirection.colorPalette.");
  }

  const constraintBlock = lines.length ? [
    "Byggval constraints (user selections — treat as hard requirements, not suggestions):",
    ...lines,
  ].join("\n") : undefined;

  let hints = preMatchedHints;
  if (!hints && input.scaffoldId) {
    const scaffold = getScaffoldById(input.scaffoldId);
    const pinned =
      resolveVariantForStyleChoice(input.scaffoldId, input.styleChoiceHint) ?? null;
    hints = buildVariantHintsForBrief(scaffold, pinned);
  }
  if (hints && input.designThemePreset !== undefined && !input.colorModeHint) {
    hints = {
      ...hints,
      colorMode: "either",
      themeTokens: hints.themeTokens ? {
        radius: hints.themeTokens.radius,
        bodyBackgroundImage: hints.themeTokens.bodyBackgroundImage,
      } : null,
    };
  }
  const variantBlock = hints ? formatVariantHintsForPrompt(hints) : undefined;

  return [variantBlock, constraintBlock].filter(Boolean).join("\n\n") || undefined;
}
