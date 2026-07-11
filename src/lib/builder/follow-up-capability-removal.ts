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

/**
 * Removal verbs, Swedish + English. Presence is REQUIRED before any match.
 * `drop` excludes the UI noun `drop-down`/`drop down` (Codex P2 on #447).
 */
const REMOVAL_VERB_RE =
  /(?<![\p{L}\p{N}_])(?:ta\s+bort|tag\s+bort|ta\s+väck|plocka\s+bort|radera|släng(?:\s+ut)?|slänga(?:\s+ut)?|bli\s+av\s+med|remove|delete|drop(?!\s*-?\s*down)|strip\s+out|get\s+rid\s+of|rip\s+out)(?![\p{L}\p{N}_])/giu;

/**
 * Additive/replacement verbs. An integration term whose NEAREST preceding verb
 * is additive sits in an add/replace clause ("… och lägg till Stripe", "… och
 * använd Klarna i stället") and must not shrink the capability (Codex P2 ×2 on
 * #447: compound add+remove and provider swap).
 */
const ADDITIVE_VERB_RE =
  /(?<![\p{L}\p{N}_])(?:lägg(?:a)?\s+(?:till|tillbaka)|sätt(?:a)?\s+tillbaka|återinför(?:a)?|(?:åter)?aktivera(?:r)?|addera|add|skapa|create|inför|installera|install|använd(?:a)?|byt(?:a)?\s+(?:till|ut\s+mot)|switch\s+to|use|ersätt(?:a)?\s+med|replace\s+with|re-?add|(?:re-?)?enable|(?:re-?)?activate|bring\s+back|put\s+back|restore|i\s?stället|istället|instead)(?![\p{L}\p{N}_])/giu;

/**
 * STRICT re-add verbs — the ONLY verbs that produce a `readdedCapabilities`
 * signal (which clears a durable removal tombstone downstream). Deliberately
 * UNAMBIGUOUS restore forms only. Generic additive language never qualifies —
 * neither bare add verbs ("Add Stripe accent colors", "Lägg till
 * checkout-sektionen" — Bugbot HIGH #1 on #497) nor add-verbs with a repeat
 * word ("Use Stripe for branding again" — Bugbot HIGH #2): both appear in
 * routine branding/layout prompts where the integration token is descriptive.
 * A false readd IS the resurrection-P1 this fix closes; a missed readd is only
 * a UX gap (the user says "lägg tillbaka Stripe"/"restore Stripe", or re-adds
 * via the Byggblock UI). Generic additive verbs keep their one legitimate
 * role: vetoing a false removal ({@link ADDITIVE_VERB_RE}).
 */
const READD_VERB_RE =
  /(?<![\p{L}\p{N}_])(?:lägg(?:a)?\s+tillbaka|sätt(?:a)?\s+tillbaka|återinför(?:a)?|återaktivera(?:r)?|re-?add|re-?enable|re-?activate|bring\s+back|put\s+back|restore)(?![\p{L}\p{N}_])/giu;

/**
 * Negation guard for re-add clauses: "jag vill INTE använda Stripe", "en sida
 * UTAN betalning", "don't add Stripe". A negated clause never re-activates.
 */
const NEGATION_RE =
  /(?<![\p{L}\p{N}_])(?:inte|icke|ingen|inga|inget|ej|utan|aldrig|not|no|without|never|don'?t|doesn'?t|won'?t|stop)(?![\p{L}\p{N}_])/iu;

/**
 * UI-control guard: "ta bort checkout-knappen" / "betalningsknappen" is a
 * layout edit, not an integration removal (Codex P2 on #447). Tested against
 * the matched term plus a short tail of following characters. Selector/menu
 * nouns included so "Add a drop-down checkout selector" is layout work, not a
 * payments re-add (granska-svärm on the readd fix). Section/page nouns
 * included so "lägg tillbaka checkout-sektionen" / "restore the checkout
 * section" is a layout restore, not an integration re-add that would clear a
 * durable removal tombstone (Bugbot HIGH #3 on #497) — this also makes the
 * removal direction safer ("ta bort checkout-sektionen" no longer tombstones
 * payments). Branding nouns (logo/logga/favicon) included so "restore the
 * Stripe logo" / "lägg tillbaka Stripe-logotypen" is branding work, not a
 * payments re-add (Codex P1 + VADE on #497). Deliberately NOT including
 * form/formulär (contact-form's own integration vocabulary) or generic "del".
 */
const UI_CONTROL_RE =
  /(?:knapp|button|länk|\blink\b|ikon|icon|selector|dropdown|drop-?down|väljare|meny|menu|sektion|section|sidan?\b|page|block\b|rubrik|heading|färg|colou?r|tema|theme|logo|logga|favicon)/iu;

interface RemovalCapabilityEntry {
  /** Must match a capability id in `data/dossiers/_index/capability-map.json`. */
  capability: string;
  patterns: RegExp[];
  /**
   * Optional veto patterns. If any matches the message the whole entry is
   * suppressed — mirrors the veto mechanism in `follow-up-capability-vocabulary.ts`
   * so overlapping term families (e.g. newsletter "prenumeration" vs. Paddle
   * `subscriptions`) resolve to a single capability instead of double-firing.
   * Veto regexes carry only `iu` flags (no `g`) so `.test()` stays stateless.
   */
  vetoes?: RegExp[];
}

/**
 * Integration capabilities that a follow-up may explicitly shrink. Mirrors the
 * F3/integration families in the capability map; intentionally excludes visual
 * section capabilities (hero/pricing/testimonials/…) — those are layout edits,
 * not integration removals.
 */
const REMOVAL_CAPABILITY_TERMS: RemovalCapabilityEntry[] = [
  {
    // ONE-OFF payments only (stripe-checkout). After #475 split payments /
    // subscriptions, recurring terms (paddle, prenumeration, subscription
    // billing, memberships) belong to the `subscriptions` entry below — leaving
    // them here made "ta bort prenumerationsbetalningen" wrongly shrink
    // `payments` while `subscriptions` could never be removed at all (Vercel P2
    // on #475).
    capability: "payments",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:stripe|klarna|swish|paypal|adyen|mollie|braintree)(?![\p{L}\p{N}_])/iu,
      // `betalning[...]` catches Swedish compounds like "betalningsgrejjen",
      // "betalningarna", "betalningsflödet" once a removal verb is present. The
      // Unicode look-behind means it does NOT match inside "prenumerationsbetalning"
      // (preceded by a letter), so that recurring compound stays `subscriptions`.
      /(?<![\p{L}\p{N}_])betalning[\p{L}]*(?![\p{L}\p{N}_])/iu,
      // Recurring-billing terms (`subscription-billing`, `prenumerationsbetalning`)
      // were CEDED to the `subscriptions` entry below — mirrors the detection-side
      // split in `follow-up-capability-vocabulary.ts` (Vercel Agent finding #475).
      // One-off payment vocabulary only.
      /(?<![\p{L}\p{N}_])(?:payments?|checkout|kassa|kortbetalning[\p{L}]*|kortköp|kreditkort)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    // Recurring subscriptions / memberships (Paddle Billing) — INTENTIONALLY
    // separate from one-off `payments` (Stripe-checkout). Mirrors the
    // detection-side `subscriptions` split in `follow-up-capability-vocabulary.ts`
    // so "ta bort prenumerationen" / "remove subscriptions" / "ta bort Paddle"
    // shrinks the Paddle capability, not `payments`. Without this entry the
    // can-only-grow floor (`enforceFollowUpCapabilityFloor`) would re-inject the
    // capability — the same prod-bug class (chat e298da50) this module closes.
    capability: "subscriptions",
    patterns: [
      /(?<![\p{L}\p{N}_])paddle(?![\p{L}\p{N}_])/iu,
      // `prenumeration[...]` / `abonnemang[...]` catch Swedish compounds like
      // "prenumerationen", "abonnemanget" once a removal verb is present. No
      // bare English "subscribe" token — it collides with newsletter signup
      // (mirrors the detection-side note).
      /(?<![\p{L}\p{N}_])(?:prenumeration[\p{L}]*|prenumerera[\p{L}]*|abonnemang[\p{L}]*|subscription(?:s)?)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:medlemskap[\p{L}]*|membership[\p{L}]*|members?[-\s]?(?:only|area|tier))(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:(?:å|a)terkommande\s+(?:betalning[\p{L}]*|debitering[\p{L}]*)|recurring\s+(?:payments?|billing|subscription(?:s)?)|subscription[-\s]?billing|prenumerationsbetalning[\p{L}]*)(?![\p{L}\p{N}_])/iu,
    ],
    // Newsletter "prenumerera på nyhetsbrevet" and one-off payments must NOT be
    // read as a Paddle subscription removal — mirrors the detection vetoes.
    vetoes: [
      /(?<![\p{L}\p{N}_])(?:nyhetsbrev[\p{L}]*|newsletter)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:eng(?:å|a)ngs(?:betalning[\p{L}]*|k(?:ö|o)p[\p{L}]*|belopp)?|one-?time|one-?off|single\s+payment)(?![\p{L}\p{N}_])/iu,
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
  /**
   * Dossier capability ids the user EXPLICITLY re-activated this round ("lägg
   * till/tillbaka Stripe"). This is the ONLY signal allowed to clear a durable
   * removal tombstone in `mergePersistedOrchestrationSnapshots` — never the
   * derived/effective floor (which can carry a capability back in from brief,
   * file-evidence, F3-approval or inference and would silently resurrect a
   * removed integration).
   */
  readdedCapabilities: string[];
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

function verbStartPositions(text: string, re: RegExp): number[] {
  re.lastIndex = 0;
  return [...text.matchAll(re)].map((m) => m.index ?? 0);
}

/** Nearest verb position strictly BEFORE `index`, or null when none precedes. */
function nearestPreceding(positions: readonly number[], index: number): number | null {
  let best: number | null = null;
  for (const position of positions) {
    if (position < index && (best === null || position > best)) best = position;
  }
  return best;
}

function clauseAt(text: string, index: number): string {
  const separator =
    /[,;]|\n|(?<![\p{L}\p{N}_])(?:och|men|and|but)(?![\p{L}\p{N}_])/giu;
  let start = 0;
  let end = text.length;
  for (const match of text.matchAll(separator)) {
    const position = match.index ?? 0;
    if (position < index) {
      start = position + match[0].length;
      continue;
    }
    end = position;
    break;
  }
  return text.slice(start, end);
}

/**
 * Detect explicit integration-capability removals in a follow-up prompt.
 *
 * Clause-scoping (Codex P2s on #447): each integration term is attributed to
 * its NEAREST preceding verb. A term governed by an additive verb ("lägg till
 * Stripe", "använd Klarna i stället") marks the capability as replaced/added
 * — the capability is only reported removed when at least one term sits in a
 * removal clause AND no term of the same capability sits in an additive one.
 * UI-control compounds (checkout-knappen) never count as integration removal.
 *
 * @returns Empty result unless the prompt contains BOTH a removal verb and at
 *          least one integration term in removal context. The caller
 *          (orchestrate) removes the returned ids from the capability floor +
 *          dossier selection.
 */
export function detectCapabilityRemoval(message: string): CapabilityRemovalDetection {
  const trimmed = String(message ?? "").trim();
  const empty: CapabilityRemovalDetection = {
    removedCapabilities: [],
    readdedCapabilities: [],
    matchedKeywords: [],
  };
  if (!trimmed) {
    return empty;
  }
  const removalPositions = verbStartPositions(trimmed, REMOVAL_VERB_RE);
  const additivePositions = verbStartPositions(trimmed, ADDITIVE_VERB_RE);
  const readdPositions = verbStartPositions(trimmed, READD_VERB_RE);
  // Nothing to attribute without at least one removal OR additive verb. Additive
  // verbs alone still matter: an explicit re-add ("lägg tillbaka Stripe") with no
  // removal verb must surface a `readdedCapabilities` signal so a durable removal
  // tombstone can be cleared downstream.
  if (removalPositions.length === 0 && additivePositions.length === 0) {
    return empty;
  }

  const removedCapabilities: string[] = [];
  const readdedCapabilities: string[] = [];
  const matchedKeywords: string[] = [];
  for (const entry of REMOVAL_CAPABILITY_TERMS) {
    let removalMatched = false;
    let additiveMatched = false;
    let readdMatched = false;
    const entryKeywords: string[] = [];
    for (const pattern of entry.patterns) {
      const globalPattern = new RegExp(
        pattern.source,
        pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
      );
      for (const m of trimmed.matchAll(globalPattern)) {
        const matchedText = m[0];
        if (typeof matchedText !== "string" || matchedText.length === 0) continue;
        const index = m.index ?? 0;
        if (
          entry.vetoes?.some((veto) => veto.test(clauseAt(trimmed, index)))
        ) {
          continue;
        }
        // UI-control compound ("checkout-knappen", "betalningsknappen") —
        // a layout edit, never an integration removal.
        const tail = trimmed.slice(index, index + matchedText.length + 16);
        if (UI_CONTROL_RE.test(tail)) continue;
        const removalVerb = nearestPreceding(removalPositions, index);
        const additiveVerb = nearestPreceding(additivePositions, index);
        if (
          additiveVerb !== null &&
          (removalVerb === null || additiveVerb > removalVerb)
        ) {
          additiveMatched = true;
          // Re-add is a STRICTER claim than additive-veto: the governing verb
          // must be an unambiguous restore verb ("lägg tillbaka", "restore",
          // "återaktivera" — READD_VERB_RE) in a non-negated clause. Generic
          // additive language ("add/lägg till/använd ... [igen/again]") is
          // routine branding/layout phrasing and must NEVER clear a durable
          // removal tombstone (2× Bugbot HIGH on #497) — it only vetoes a
          // false removal via additiveMatched above.
          const readdVerb = nearestPreceding(readdPositions, index);
          if (
            readdVerb !== null &&
            readdVerb === additiveVerb &&
            !NEGATION_RE.test(clauseAt(trimmed, index))
          ) {
            readdMatched = true;
          }
          continue;
        }
        if (removalVerb === null) continue;
        removalMatched = true;
        entryKeywords.push(matchedText);
      }
    }
    if (removalMatched && !additiveMatched) {
      removedCapabilities.push(entry.capability);
      matchedKeywords.push(...entryKeywords);
    } else if (readdMatched) {
      // Explicit current-round re-activation ("lägg till/tillbaka Stripe",
      // "restore payments"). The only signal that clears a durable removal
      // tombstone downstream (mergePersistedOrchestrationSnapshots).
      readdedCapabilities.push(entry.capability);
    }
  }

  return {
    removedCapabilities: uniquePreservingOrder(removedCapabilities),
    readdedCapabilities: uniquePreservingOrder(readdedCapabilities),
    matchedKeywords: uniquePreservingOrder(matchedKeywords),
  };
}
