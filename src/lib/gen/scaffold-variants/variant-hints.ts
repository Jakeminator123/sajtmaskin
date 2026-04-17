/**
 * Compact variant summary for Brief-LLM consumption.
 *
 * Used by the "pre-match" step in create-chat-stream-post: a fast,
 * keyword-only scaffold+variant pick that runs *before* brief generation
 * so the Brief-LLM can harmonize its design choices with the variant's
 * defaults (fonts, color mode, motif, curated style rules).
 *
 * The pre-match is a hint — the real scaffold/variant selection runs
 * later in resolveOrchestrationBase / finalizeOrchestrationPrompts with
 * full embedding + brief context.
 */

import type { ScaffoldVariant } from "./types";
import type { ScaffoldManifest } from "../scaffolds/types";

export interface VariantHints {
  scaffoldLabel: string;
  colorMode: string;
  signatureMotif: string;
  fontPairing: string | null;
  promptHints: string[];
  /** 2-3 most distinctive layouts from signaturePatterns (compact for brief). */
  signatureLayouts: string[];
  /** 2 most distinctive motifs from signaturePatterns. */
  signatureMotifs: string[];
}

export function buildVariantHintsForBrief(
  scaffold: ScaffoldManifest | null,
  variant: ScaffoldVariant | null,
): VariantHints | null {
  if (!variant) return null;
  return {
    scaffoldLabel: scaffold?.label ?? variant.scaffoldId,
    colorMode: variant.colorMode,
    signatureMotif: variant.signatureMotif,
    fontPairing: variant.fontPairings[0]
      ? `${variant.fontPairings[0].heading} + ${variant.fontPairings[0].body}`
      : null,
    promptHints: variant.promptHints.slice(0, 3),
    signatureLayouts: variant.signaturePatterns?.layouts.slice(0, 3) ?? [],
    signatureMotifs: variant.signaturePatterns?.motifs.slice(0, 2) ?? [],
  };
}

export function formatVariantHintsForPrompt(hints: VariantHints): string {
  const lines = [
    "Scaffold variant hint (use as design starting point, adjust when user intent differs):",
    `- Scaffold: ${hints.scaffoldLabel}`,
    `- Color mode: ${hints.colorMode}`,
    `- Signature motif: ${hints.signatureMotif}`,
  ];
  if (hints.fontPairing) lines.push(`- Suggested font pairing: ${hints.fontPairing}`);
  if (hints.promptHints.length > 0) lines.push(`- Style cues: ${hints.promptHints.join(", ")}`);
  if (hints.signatureLayouts.length > 0) {
    lines.push(`- Signature layouts: ${hints.signatureLayouts.join(" | ")}`);
  }
  if (hints.signatureMotifs.length > 0) {
    lines.push(`- Signature motifs: ${hints.signatureMotifs.join(" | ")}`);
  }
  return lines.join("\n");
}
