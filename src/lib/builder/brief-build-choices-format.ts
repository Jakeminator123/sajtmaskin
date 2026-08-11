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

/**
 * Prompt appendix for Deep Brief: structured Byggval constraints plus, when a
 * site type was chosen, the same variant hint block create-chat would send to
 * the server auto-brief path.
 */
export function formatBriefBuildChoicesForPrompt(
  input: BriefBuildChoicesInput | null | undefined,
): string | undefined {
  if (!input) return undefined;
  const lines: string[] = [];
  if (input.buildIntent === "website" || input.buildIntent === "app") {
    lines.push(
      `- Build intent (user choice): ${input.buildIntent === "app" ? "app / product UI" : "marketing website"}`,
    );
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
  if (lines.length === 0) return undefined;

  const constraintBlock = [
    "Byggval constraints (user selections — treat as hard requirements, not suggestions):",
    ...lines,
  ].join("\n");

  let variantBlock: string | undefined;
  if (input.scaffoldId) {
    const scaffold = getScaffoldById(input.scaffoldId);
    const pinned =
      resolveVariantForStyleChoice(input.scaffoldId, input.styleChoiceHint) ?? null;
    const hints = buildVariantHintsForBrief(scaffold, pinned);
    if (hints) variantBlock = formatVariantHintsForPrompt(hints);
  }

  return [constraintBlock, variantBlock].filter(Boolean).join("\n\n");
}
