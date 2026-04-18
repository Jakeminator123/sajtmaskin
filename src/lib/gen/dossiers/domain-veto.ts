/**
 * Domain veto for dossier selection.
 *
 * Embedding similarity is unreliable for "lightweight" prompts: a hotel
 * site that mentions "boka rum" embeds close to `payments-stripe-checkout`
 * because of the verb "book". A portfolio that mentions "kontakta mig" can
 * end up close to `auth-*` dossiers. The result is the LLM seeing example
 * code with `import Stripe`, `import { createClient } from "@supabase/..."`
 * etc., which it then copies into the F2 output even though the user just
 * wanted a static-looking site.
 *
 * This module enforces a hard veto: when a prompt is detected as belonging
 * to a "lightweight" domain (hospitality, portfolio, blog, restaurant,
 * lokal small-business, charity, event, etc.) AND the prompt does NOT
 * include an explicit override (e.g. "med Stripe-betalning", "med
 * inloggning", "med databas"), then certain dossier categories are
 * filtered out before they reach the prompt — even if cosine similarity
 * said they were a good match.
 *
 * The veto is intentionally conservative:
 *  - It runs AFTER scoring, so embeddings still drive ranking when both
 *    sides agree.
 *  - It only blocks when the dossier category clearly mismatches the
 *    inferred domain.
 *  - Explicit user intent (keywords like "stripe", "supabase", "auth.js")
 *    overrides the veto so power-users aren't blocked.
 *
 * See BUGGRAPPORT-2026-04-18-jackes-skjuthotell.md § A2/A3/A4 for the
 * underlying problem this solves.
 */

/**
 * Lightweight domains: small-business sites where backend integrations are
 * usually NOT wanted by default.
 *
 * Note on regex: Swedish builds compound nouns freely ("Skjuthotell",
 * "Hotellrum", "Pizzeriabar"). We deliberately use plain substring matching
 * (no word boundaries) so the keyword catches both the standalone word and
 * any compound form. Examples that should match the "hospitality" pattern:
 *   "Jackes Skjuthotell" (suffix), "Hotellet vid sjön" (prefix), "Hotell".
 */
const LIGHTWEIGHT_DOMAIN_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  {
    name: "hospitality",
    pattern:
      /(?:hotell|hotel|spa\b|salong|salon|klinik|clinic|massage|frisör|frisor|barbershop|\bgym\b|\byoga\b|pilates|crossfit|fitness)/iu,
  },
  {
    name: "restaurant",
    pattern:
      /(?:restaurang|restaurant|café|cafe|kafé|bistro|bakeri|bageri|bakery|pizzeria|catering|matrestaurang|matställe|food truck|brasserie|krog\b|\bpub\b)/iu,
  },
  {
    name: "portfolio",
    pattern:
      /(?:portfolio|portfölj|portfolj|cv-sajt|personlig sajt|personal site|personal website|freelance|frilans|konstnär|fotograf|photographer|\bdesigner\b|architect|arkitekt)/iu,
  },
  {
    name: "blog",
    pattern:
      /(?:\bblogg\b|\bblog\b|nyhetssajt|newsletter|nyhetsbrev|publication|tidning|\bmagazine\b|\bmagasin\b)/iu,
  },
  {
    name: "event",
    pattern:
      /(?:konsert|concert|festival|bröllop|wedding|\bfest\b|\bparty\b|event-sajt|landningssida för event|event landing)/iu,
  },
  {
    name: "charity-or-nonprofit",
    pattern:
      /(?:välgörenhet|valgorenhet|charity|nonprofit|non-profit|ideell|kyrka|church|församling|\bförening\b|\bforening\b)/iu,
  },
  {
    name: "small-business-brochure",
    pattern:
      /(?:hantverkare|byggfirma|målerifirma|maleri|elektriker|rörmokare|rormokare|takläggare|trädgård|tradgard|\bstäd\b|cleaning|consultant|konsult|advokat|advokatbyrå|advokatbyra|tandläkare|tandlakare|veterinär|veterinar)/iu,
  },
];

/** Explicit overrides that disable the veto for a given category. */
const EXPLICIT_OVERRIDE_PATTERNS: Record<string, RegExp> = {
  payments:
    /(stripe|klarna|paypal|swish|webshop|webbshop|e-handel|ecommerce|e-commerce|checkout|kassa|kreditkort|credit card|betalning|payment|prenumeration|subscription|abonnemang|saas|köp online|sälj online|online store|nätbutik)/iu,
  auth:
    /(login|logga in|sign in|sign up|registrer|register|användarkonto|user account|medlem|member|inloggning|authentication|auth\.js|nextauth|clerk|auth0|supabase auth|google login|github login|oauth|sso)/iu,
  database:
    /(databas|database|postgres|mysql|mongodb|supabase|firebase|prisma|drizzle|orm|cms-driven|user-generated|user data|spara data|store data|persist|persistera)/iu,
  cms:
    /(cms|sanity|contentful|storyblok|strapi|wordpress|wp|payload|directus|headless cms|content management)/iu,
  realtime:
    /(realtime|real-time|chatt|chat|live update|live-uppdatering|websocket|liveblocks|ably|pusher|pubsub|notifikation|notification)/iu,
  ai:
    /(ai|gpt|llm|chatbot|chattbot|copilot|generative|openai|anthropic|claude|gemini|machine learning|ml|inference|prompt-svar)/iu,
  search:
    /(sök|sok|search|filter|sökmotor|sokmotor|algolia|meilisearch|typesense|elasticsearch|fuzzy search|full-text)/iu,
  analytics:
    /(analytics|analys|tracking|spårning|sparning|google analytics|gtm|plausible|posthog|mixpanel|amplitude|fathom|umami)/iu,
};

/**
 * Categories that drag in heavy backend wiring (env-vars, external accounts,
 * extra build surface). Shared with the brochure hard-gate in `select.ts` so
 * both filters reach the same baseline. Domain-specific blocklists below
 * extend this with broader categories like `cms`/`ai`/`search`.
 */
export const RISKY_BACKEND_CATEGORIES = [
  "payments",
  "auth",
  "database",
  "realtime",
] as const;

/**
 * Default category blocklist per detected lightweight domain. These are
 * dossier categories that should be filtered out unless the prompt
 * explicitly mentions a service in the same area.
 */
const DOMAIN_DEFAULT_BLOCKLIST: Record<string, ReadonlyArray<string>> = {
  hospitality: [...RISKY_BACKEND_CATEGORIES, "cms", "ai", "search"],
  restaurant: [...RISKY_BACKEND_CATEGORIES, "cms", "ai", "search"],
  portfolio: [...RISKY_BACKEND_CATEGORIES, "cms", "ai", "search"],
  blog: [...RISKY_BACKEND_CATEGORIES, "ai"],
  event: [...RISKY_BACKEND_CATEGORIES, "cms", "ai", "search"],
  "charity-or-nonprofit": [...RISKY_BACKEND_CATEGORIES, "cms", "ai", "search"],
  "small-business-brochure": [...RISKY_BACKEND_CATEGORIES, "cms", "ai", "search"],
};

export type DomainVetoResult = {
  detectedDomain: string | null;
  blockedCategories: Set<string>;
  /** Categories that would normally be blocked but are unblocked because of explicit prompt keywords. */
  unblockedByExplicitOverride: Set<string>;
};

function gatherPromptText(opts: {
  prompt: string;
  brief?: Record<string, unknown> | null;
}): string {
  const parts: string[] = [opts.prompt ?? ""];
  if (opts.brief && typeof opts.brief === "object") {
    const b = opts.brief as Record<string, unknown>;
    for (const key of [
      "projectTitle",
      "siteName",
      "brandName",
      "oneSentencePitch",
      "tagline",
      "targetAudience",
      "primaryCallToAction",
      "domainProfile",
    ]) {
      const v = b[key];
      if (typeof v === "string") parts.push(v);
    }
    if (Array.isArray(b.toneAndVoice)) parts.push(b.toneAndVoice.join(" "));
    if (Array.isArray(b.mustHave)) {
      for (const m of b.mustHave) if (typeof m === "string") parts.push(m);
    }
  }
  return parts.join(" ");
}

/**
 * Detect lightweight domain + compute blocked dossier categories for it.
 * Returns `{ detectedDomain: null, blockedCategories: <empty> }` when no
 * lightweight domain is detected — in that case all dossiers are allowed
 * to flow through their normal scoring.
 */
export function computeDomainVeto(opts: {
  prompt: string;
  brief?: Record<string, unknown> | null;
}): DomainVetoResult {
  const text = gatherPromptText(opts);
  let detectedDomain: string | null = null;
  for (const { name, pattern } of LIGHTWEIGHT_DOMAIN_PATTERNS) {
    if (pattern.test(text)) {
      detectedDomain = name;
      break;
    }
  }
  if (!detectedDomain) {
    return {
      detectedDomain: null,
      blockedCategories: new Set(),
      unblockedByExplicitOverride: new Set(),
    };
  }

  const baseBlocked = DOMAIN_DEFAULT_BLOCKLIST[detectedDomain] ?? [];
  const blockedCategories = new Set<string>(baseBlocked);
  const unblockedByExplicitOverride = new Set<string>();

  // Explicit overrides: if the prompt clearly mentions a service in a
  // blocked category, unblock that category. Power-users get what they
  // asked for.
  for (const category of [...blockedCategories]) {
    const overrideRe = EXPLICIT_OVERRIDE_PATTERNS[category];
    if (overrideRe && overrideRe.test(text)) {
      blockedCategories.delete(category);
      unblockedByExplicitOverride.add(category);
    }
  }

  return { detectedDomain, blockedCategories, unblockedByExplicitOverride };
}

/**
 * Filter a list of category strings against the veto. Useful when you
 * have a list of dossier candidates and want to drop ones whose category
 * is blocked.
 */
export function filterBlockedCategories<T extends { entry: { category: string } }>(
  items: ReadonlyArray<T>,
  veto: DomainVetoResult,
): T[] {
  if (veto.blockedCategories.size === 0) return items.slice();
  return items.filter((item) => !veto.blockedCategories.has(item.entry.category));
}
