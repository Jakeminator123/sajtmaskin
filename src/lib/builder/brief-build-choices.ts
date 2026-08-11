/**
 * Compact Byggval → Deep Brief context.
 *
 * Client Deep Brief (`/api/ai/brief`) historically only saw the freeform prompt.
 * That brief then wins over the server auto-brief, so style/intent/page-count
 * pins from Byggval never reached the brief LLM. This module turns the same
 * meta fields create-chat already sends into a prompt appendix + cache extras.
 */

import type { InitBuildChoicesMeta } from "@/lib/builder/init-build-choices";
import { getScaffoldById } from "@/lib/gen/scaffolds/registry";
import {
  buildVariantHintsForBrief,
  formatVariantHintsForPrompt,
} from "@/lib/gen/scaffold-variants/variant-hints";
import { resolveVariantForStyleChoice } from "@/lib/gen/scaffold-variants/style-choice-variants";

export type BriefBuildChoicesInput = {
  buildIntent?: "website" | "app";
  scaffoldId?: string;
  pageCountHint?: number;
  styleChoiceHint?: string;
  styleKeywordsHint?: string[];
  toneKeywordsHint?: string[];
  colorModeHint?: "light" | "dark";
  complexityHint?: "simple" | "medium" | "complex";
};

export function briefBuildChoicesFromMeta(
  meta: InitBuildChoicesMeta,
): BriefBuildChoicesInput {
  return {
    buildIntent: meta.buildIntent,
    scaffoldId: meta.scaffoldId,
    pageCountHint: meta.pageCountHint,
    styleChoiceHint: meta.styleChoiceHint,
    styleKeywordsHint: meta.styleKeywordsHint,
    toneKeywordsHint: meta.toneKeywordsHint,
    colorModeHint: meta.colorModeHint,
    complexityHint: meta.complexityHint,
  };
}

/** Stable extras for Redis brief-cache hashing (order-independent). */
export function briefBuildChoicesCacheExtras(
  input: BriefBuildChoicesInput | null | undefined,
): Record<string, string | number | boolean | null> {
  if (!input) return {};
  return {
    buildIntent: input.buildIntent ?? null,
    scaffoldId: input.scaffoldId ?? null,
    pageCountHint: typeof input.pageCountHint === "number" ? input.pageCountHint : null,
    styleChoiceHint: input.styleChoiceHint ?? null,
    styleKeywordsHint: (input.styleKeywordsHint ?? []).join("|") || null,
    toneKeywordsHint: (input.toneKeywordsHint ?? []).join("|") || null,
    colorModeHint: input.colorModeHint ?? null,
    complexityHint: input.complexityHint ?? null,
  };
}

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
