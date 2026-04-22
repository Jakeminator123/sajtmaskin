/**
 * Builds a `ScaffoldQueryContext` from the Brief LLM output so scaffold
 * selection (keyword + embedding) can weigh pages / styleKeywords / domain
 * hints without duplicating the brief-parsing across call-sites.
 *
 * Extracted from `src/lib/gen/orchestrate.ts` 2026-04-21.
 */

import type { ScaffoldQueryContext } from "../scaffolds";

export function buildScaffoldQueryContext(
  brief: Record<string, unknown> | null,
): ScaffoldQueryContext | undefined {
  if (!brief) return undefined;

  const briefPages = Array.isArray((brief as { pages?: unknown }).pages)
    ? ((brief as { pages?: Array<{ name?: unknown; path?: unknown; purpose?: unknown }> }).pages ?? [])
        .slice(0, 10)
        .map((page) => ({
          name: typeof page.name === "string" ? page.name.trim() : undefined,
          path: typeof page.path === "string" ? page.path.trim() : undefined,
          purpose: typeof page.purpose === "string" ? page.purpose.trim() : undefined,
        }))
    : [];

  const styleKeywords = Array.isArray(
    (brief as { visualDirection?: { styleKeywords?: unknown } }).visualDirection?.styleKeywords,
  )
    ? ((brief as { visualDirection?: { styleKeywords?: unknown[] } }).visualDirection?.styleKeywords ?? [])
        .filter((keyword): keyword is string => typeof keyword === "string" && keyword.trim().length > 0)
        .slice(0, 12)
    : [];

  const domainHints: string[] = [];
  const businessType = (brief as { businessType?: unknown }).businessType;
  if (typeof businessType === "string" && businessType.trim()) domainHints.push(businessType.trim());
  const industry = (brief as { industry?: unknown }).industry;
  if (typeof industry === "string" && industry.trim()) domainHints.push(industry.trim());

  if (briefPages.length === 0 && styleKeywords.length === 0 && domainHints.length === 0) {
    return undefined;
  }

  return {
    briefPages,
    styleKeywords,
    domainHints,
  };
}
