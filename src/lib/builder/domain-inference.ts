/**
 * Canonical domain/site-type inference.
 *
 * Single source of truth — consumed by:
 * - site-brief-generation.ts (inferSiteTypeHint for brief LLM prompt)
 * - promptAssist.ts (buildDomainStructureHints / buildDomainContractHints for addendum fallback)
 * - system-prompt.ts could use it in the future for dynamic context
 *
 * Bilingual (SV+EN) keyword regexes. Returns a typed DomainProfile.
 */

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
  /** Brief-LLM gets this as a site-type hint */
  briefHint: string;
  /** Bilingual regex (case-insensitive) */
  pattern: RegExp;
}

const DOMAIN_RULES: DomainRule[] = [
  {
    domain: "restaurant",
    briefHint: "restaurant or cafe site",
    pattern:
      /\b(restaurang|restaurant|café|cafe|kafé|bistro|bar|pub|matrestaurang|meny|menu|boka bord|book a table|takeaway)\b/i,
  },
  {
    domain: "hotel",
    briefHint: "hotel or hospitality site",
    pattern:
      /\b(hotell|hotel|boutiquehotell|boutique hotel|spa retreat|bed and breakfast|b&b)\b/i,
  },
  {
    domain: "spa-salon",
    briefHint: "spa or salon site",
    pattern:
      /\b(spa|salong|salon|frisör|barber|massage|skincare|hudvård)\b/i,
  },
  {
    domain: "clinic",
    briefHint: "healthcare site",
    pattern:
      /\b(klinik|clinic|dentist|tandläkare|läkare|doctor|veterinär|vet|medical|health|therapy)\b/i,
  },
  {
    domain: "event-venue",
    briefHint: "event or conference site",
    pattern:
      /\b(event venue|bröllop|wedding venue|konferens|conference|festival|festlokal|ticket|schedule|speaker|workshop)\b/i,
  },
  {
    domain: "ecommerce",
    briefHint: "ecommerce storefront",
    pattern:
      /\b(ecommerce|e-commerce|e-handel|webshop|webbshop|checkout|varukorg|kundvagn|storefront|online store|shop|store|cart|product)\b/i,
  },
  {
    domain: "portfolio",
    briefHint: "portfolio site",
    pattern:
      /\b(portfolio|photographer|fotograf|designer|showcase|creative studio|case study)\b/i,
  },
  {
    domain: "saas",
    briefHint: "saas product marketing site",
    pattern:
      /\b(saas|b2b|platform|dashboard|workspace|subscription|pricing|startup)\b/i,
  },
  {
    domain: "agency",
    briefHint: "agency or services site",
    pattern:
      /\b(agency|byrå|consulting|consultant|services|company|företag|företa|tjänst|tjanst)\b/i,
  },
  {
    domain: "education",
    briefHint: "education or course site",
    pattern:
      /\b(course|kurs|education|academy|school|training|learning|utbildning)\b/i,
  },
  {
    domain: "real-estate",
    briefHint: "real estate site",
    pattern:
      /\b(real estate|fastighet|property|listing|broker|mäklare|apartment|lägenhet|bostad)\b/i,
  },
];

/**
 * Infer domain profile from prompt text.
 * Returns the first matching domain or "general".
 */
export function inferDomain(prompt: string): DomainProfile {
  const lower = prompt.toLowerCase();
  for (const rule of DOMAIN_RULES) {
    if (rule.pattern.test(lower)) {
      return rule.domain;
    }
  }
  return "general";
}

/**
 * Infer a brief-friendly site-type hint string (for the brief LLM prompt).
 * Returns null for "general" (no hint needed).
 */
export function inferSiteTypeHintFromDomain(prompt: string): string | null {
  const lower = prompt.toLowerCase();
  for (const rule of DOMAIN_RULES) {
    if (rule.pattern.test(lower)) {
      return rule.briefHint;
    }
  }
  return null;
}
