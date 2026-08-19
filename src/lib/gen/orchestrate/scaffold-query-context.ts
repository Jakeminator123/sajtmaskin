/**
 * Builds a `ScaffoldQueryContext` from the Brief so scaffold selection
 * (keyword + embedding) can weigh pages, style and domain.
 *
 * `siteBriefSchema` owns `domainProfile` + `toneAndVoice`. Older readers
 * looked for `businessType` / `industry`, which the schema never had. Tone is
 * deliberately not a scaffold-selection signal: it belongs to copy and
 * scaffold-variant resolution and must not make a domain scaffold eligible.
 */

import {
  isDomainProfile,
  type DomainProfile,
} from "@/lib/builder/domain-inference";
import type { ScaffoldQueryContext } from "../scaffolds";

/**
 * Tokens that already live in the scaffold keyword banks.
 * Two complementary hits so a thin «hemsida»-prompt can reach MIN_SCORE
 * without a flat +2 boost (that promotion is forbidden).
 */
const DOMAIN_PROFILE_HINTS: Record<DomainProfile, readonly string[]> = {
  restaurant: ["restaurang", "restaurant", "tjänster", "services"],
  hotel: ["hotell", "hotel", "tjänster", "services"],
  "spa-salon": ["spa", "salong", "studio", "tjänster"],
  clinic: ["clinic", "klinik", "tjänster", "services"],
  "event-venue": ["tjänster", "services", "studio", "kampanj"],
  ecommerce: ["ecommerce", "webshop"],
  portfolio: ["portfolio", "fotograf"],
  saas: ["saas", "plattform"],
  agency: ["agency", "byrå"],
  education: ["tjänster", "services"],
  "real-estate": ["tjänster", "services"],
  general: [],
};

export function domainProfileToScaffoldHints(
  domainProfile: DomainProfile,
): string[] {
  return [...DOMAIN_PROFILE_HINTS[domainProfile]];
}

function readDomainProfile(brief: Record<string, unknown>): DomainProfile | null {
  const raw = brief.domainProfile;
  if (typeof raw === "string" && isDomainProfile(raw)) return raw;
  if (raw && typeof raw === "object") {
    const domain = (raw as { domain?: unknown }).domain;
    if (typeof domain === "string" && isDomainProfile(domain)) return domain;
  }
  return null;
}

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

  const domainProfile = readDomainProfile(brief);
  const domainHints = domainProfile ? domainProfileToScaffoldHints(domainProfile) : [];

  if (
    briefPages.length === 0 &&
    styleKeywords.length === 0 &&
    domainHints.length === 0
  ) {
    return undefined;
  }

  return {
    briefPages,
    styleKeywords,
    domainHints,
  };
}
