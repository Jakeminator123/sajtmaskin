/**
 * Follow-up capability REMOVAL detection (Bugg B).
 *
 * The capability floor (`enforceFollowUpCapabilityFloor`) is deliberately
 * can-only-grow: a follow-up never silently drops an integration the base
 * version established. That invariant is right for the common case, but it
 * left a real gap — there was NO way to intentionally REMOVE an established
 * integration on a follow-up.
 *
 * Prod-fall (chat e298da50): "Ta bort Stripe-betalningsgrejjen" produced a new
 * version with the exact same files. `collectExplicitRouteRemovals` needs
 * route/page context, so an integration removal with no page name yields an
 * empty set; the floor then re-injected `payments`, `stripe-checkout` was
 * re-selected, and the files were preserved verbatim.
 *
 * This module is the explicit-removal signal that closes that gap. It pairs a
 * removal verb ("ta bort", "remove", "radera", …) with an INTEGRATION term
 * (stripe/betalning/checkout, auth/inloggning, analytics, …) and returns the
 * dossier capability ids the user asked to remove.
 *
 * Deliberately narrow — removal only shrinks *integration* capabilities
 * (the ones the floor protects and that ship server files / env wiring).
 * Visual/section removals ("ta bort hero-sektionen") are handled elsewhere
 * (route clamp / element preservation) and must NOT shrink a capability here.
 *
 * IMPORTANT: this file owns its own integration-term regexes and does NOT
 * import from `follow-up-capability-vocabulary.ts` (owned by an open PR).
 * Every pattern uses Unicode-aware look-arounds (never ASCII `\b`) so Swedish
 * `å/ä/ö` boundary correctly — see `.cursor/rules/unicode-regex.mdc`.
 */

/** Removal verbs, Swedish + English. Presence is REQUIRED before any match. */
const REMOVAL_VERB_RE =
  /(?<![\p{L}\p{N}_])(?:ta\s+bort|tag\s+bort|ta\s+väck|plocka\s+bort|radera|släng(?:\s+ut)?|slänga(?:\s+ut)?|bli\s+av\s+med|remove|delete|drop|strip\s+out|get\s+rid\s+of|rip\s+out)(?![\p{L}\p{N}_])/iu;

interface RemovalCapabilityEntry {
  /** Must match a capability id in `data/dossiers/_index/capability-map.json`. */
  capability: string;
  patterns: RegExp[];
}

/**
 * Integration capabilities that a follow-up may explicitly shrink. Mirrors the
 * F3/integration families in the capability map; intentionally excludes visual
 * section capabilities (hero/pricing/testimonials/…) — those are layout edits,
 * not integration removals.
 */
const REMOVAL_CAPABILITY_TERMS: RemovalCapabilityEntry[] = [
  {
    capability: "payments",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:stripe|klarna|swish|paypal|adyen|mollie|braintree)(?![\p{L}\p{N}_])/iu,
      // `betalning[...]` catches Swedish compounds like "betalningsgrejjen",
      // "betalningarna", "betalningsflödet" once a removal verb is present.
      /(?<![\p{L}\p{N}_])betalning[\p{L}]*(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:payments?|checkout|kassa|kortbetalning[\p{L}]*|kortköp|kreditkort|subscription[-\s]?billing|prenumerationsbetalning[\p{L}]*)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "auth",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:auth|inloggning(?:en|ar)?|logga\s+in|login|sign[-\s]?in|sign[-\s]?up|register(?:ing)?|registrering(?:en)?|clerk|next-?auth|auth\.js)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:lösenord[\p{L}]*|password|oauth)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "analytics",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:analytics|webbanalys|webb-?analys|plausible|vercel[-\s]?analytics|google[-\s]?analytics|posthog|mixpanel|fathom)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "error-tracking",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:sentry|error[-\s]?tracking|fel-?spårning|crash[-\s]?reporting|bugsnag|rollbar|datadog)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "newsletter-subscribe",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:nyhetsbrev(?:et|en)?|newsletter|mailchimp|brevo|mailerlite)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "contact-form",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:kontaktform(?:ulär(?:et)?)?|contact[-\s]?form|resend)(?![\p{L}\p{N}_])/iu,
    ],
  },
];

export interface CapabilityRemovalDetection {
  /** Dossier capability ids (matches capability-map.json) the user asked to remove. */
  removedCapabilities: string[];
  /** Concrete substrings that triggered each match (debug + telemetry). */
  matchedKeywords: string[];
}

function uniquePreservingOrder<T>(values: Iterable<T>): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/**
 * Detect explicit integration-capability removals in a follow-up prompt.
 *
 * @returns Empty result unless the prompt contains BOTH a removal verb and at
 *          least one integration term. The caller (orchestrate) removes the
 *          returned ids from the capability floor + dossier selection and
 *          deletes the corresponding dossier files from the merged output.
 */
export function detectCapabilityRemoval(message: string): CapabilityRemovalDetection {
  const trimmed = String(message ?? "").trim();
  if (!trimmed || !REMOVAL_VERB_RE.test(trimmed)) {
    return { removedCapabilities: [], matchedKeywords: [] };
  }

  const removedCapabilities: string[] = [];
  const matchedKeywords: string[] = [];
  for (const entry of REMOVAL_CAPABILITY_TERMS) {
    let matched = false;
    for (const pattern of entry.patterns) {
      const m = trimmed.match(pattern);
      if (m && typeof m[0] === "string") {
        matched = true;
        matchedKeywords.push(m[0]);
      }
    }
    if (matched) removedCapabilities.push(entry.capability);
  }

  return {
    removedCapabilities: uniquePreservingOrder(removedCapabilities),
    matchedKeywords: uniquePreservingOrder(matchedKeywords),
  };
}
