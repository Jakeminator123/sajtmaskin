/**
 * Canonical domain/site-type inference.
 *
 * Rules live in `config/domain-rules.json` — the single editable source for
 * domain keywords. This file builds runtime regexes from that JSON.
 *
 * Consumed by:
 * - site-brief-generation.ts  (site-type hint for brief LLM prompt)
 * - promptAssist.ts           (structure/contract hints for addendum fallback)
 * - capability-inference.ts   (hospitality veto on ecommerce)
 */

import rulesJson from "@/../config/domain-rules.json";

export type DomainProfile =
  | "restaurant"
  | "hotel"
  | "spa-salon"
  | "clinic"
  | "event-venue"
  | "ecommerce"
  | "portfolio"
  | "saas"
  | "agency"
  | "education"
  | "real-estate"
  | "general";

interface DomainRule {
  domain: DomainProfile;
  briefHint: string;
  pattern: RegExp;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Unicode-aware "word boundary" via lookarounds on \p{L}/\p{N}.
 * JavaScript's `\b` is ASCII-only — `/\bcafé\b/i.test("ett café här")`
 * returns `false` because `é` is not in `\w`. Same trap hits keywords
 * that start or end with å/ä/ö/é (`café`, `kafé`, `öppettider`, `byrå`, …).
 * Mirrors the safe pattern used in `gen/scaffolds/matcher.ts`.
 */
function buildRules(
  json: Array<{
    domain: string;
    briefHint: string;
    keywords_sv: string[];
    keywords_en: string[];
  }>,
): DomainRule[] {
  return json.map((entry) => {
    const allKeywords = [...entry.keywords_sv, ...entry.keywords_en];
    const alternation = allKeywords.map(escapeRegex).join("|");
    return {
      domain: entry.domain as DomainProfile,
      briefHint: entry.briefHint,
      pattern: new RegExp(
        `(^|[^\\p{L}\\p{N}])(?:${alternation})(?=[^\\p{L}\\p{N}]|$)`,
        "iu",
      ),
    };
  });
}

const DOMAIN_RULES: DomainRule[] = buildRules(rulesJson);

export function inferDomain(prompt: string): DomainProfile {
  const lower = prompt.toLowerCase();
  for (const rule of DOMAIN_RULES) {
    if (rule.pattern.test(lower)) {
      return rule.domain;
    }
  }
  return "general";
}

export function inferSiteTypeHintFromDomain(prompt: string): string | null {
  const lower = prompt.toLowerCase();
  for (const rule of DOMAIN_RULES) {
    if (rule.pattern.test(lower)) {
      return rule.briefHint;
    }
  }
  return null;
}

/** Expose rules for tooling/backoffice inspection. */
export function getDomainRules(): ReadonlyArray<{
  domain: DomainProfile;
  briefHint: string;
  keywords: string[];
}> {
  return rulesJson.map((entry) => ({
    domain: entry.domain as DomainProfile,
    briefHint: entry.briefHint,
    keywords: [...entry.keywords_sv, ...entry.keywords_en],
  }));
}
