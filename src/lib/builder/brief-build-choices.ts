/**
 * Compact Byggval → Deep Brief context (client-safe).
 *
 * Client Deep Brief (`/api/ai/brief`) historically only saw the freeform prompt.
 * That brief then wins over the server auto-brief, so style/intent/page-count
 * pins from Byggval never reached the brief LLM. This module turns the same
 * meta fields create-chat already sends into cache extras + typed payload.
 *
 * Prompt formatting (scaffold labels / variant hints) lives in
 * `brief-build-choices-format.ts` — keep it off the client graph so Turbopack
 * does not pull `next/server` / `fs` via scaffold-search.
 */

import type { InitBuildChoicesMeta } from "@/lib/builder/init-build-choices";

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
