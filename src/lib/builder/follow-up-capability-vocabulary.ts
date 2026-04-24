/**
 * Capability vocabulary for follow-up detection.
 *
 * Source-of-truth for the set of capability ids: `data/dossiers/_index/capability-map.json`
 * (16 capabilities). The keys here MUST match those ids verbatim — they are
 * forwarded to `selectDossiersForRequest` which looks dossiers up by capability.
 *
 * Every pattern uses Unicode-aware look-arounds rather than ASCII `\b`, so
 * Swedish words with `å/ä/ö` boundary correctly. Mirrors the convention in
 * `capability-inference.ts` and `follow-up-clarification.ts`.
 *
 * **Curation rules:**
 *  - Patterns must be high-precision. False positives (e.g. matching the
 *    word "auth" inside "author") would cause stray dossier injections on
 *    every follow-up that mentions a hospitality / editorial noun.
 *  - When two capabilities can match the same phrase, the more specific one
 *    is listed first in the array. `detectFollowUpCapabilities` keeps the
 *    first tier per capability and returns capabilities in this order.
 *  - `vetoes`: optional patterns that suppress the match. Used to undo
 *    accidental hits when the prompt clearly belongs to a different domain
 *    (e.g. `payments` vetoes generic "betala räkningen" without a card
 *    instrument noun).
 */

export interface CapabilityVocabularyEntry {
  /** Must match a capability id in `data/dossiers/_index/capability-map.json`. */
  capability: string;
  /** At least one pattern must match the message for the capability to detect. */
  patterns: RegExp[];
  /** Optional veto patterns; if any matches, the capability is suppressed. */
  vetoes?: RegExp[];
}

export const CAPABILITY_VOCABULARY: CapabilityVocabularyEntry[] = [
  {
    capability: "visual-3d",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:3d|tre\s+dimension(?:er|ell)?|three\.?js|@?react-three(?:\/(?:fiber|drei|rapier))?|webgl|r3f)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])3d-?[\p{L}\p{N}_]+/iu,
      /(?<![\p{L}\p{N}_])(?:interaktiv\s+canvas|3d-?canvas|3d-?scen|3d-?objekt|3d-?modell|3d-?animation)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:gltf|glb|usegltf|use-gltf)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "parallax-pointer",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:pointer-?parallax|mus-?parallax|mouse-?parallax|cursor-?parallax)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:följer\s+(?:musen|muspekaren|cursor|pointer)|hover-?tilt|tilt-?card)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "parallax-scroll",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:scroll-?parallax|scroll-?driven|sticky-?parallax|pinned-?(?:section|parallax))(?![\p{L}\p{N}_])/iu,
      // Generic "parallax" without explicit pointer/scroll cue → defaults
      // to scroll-parallax. Pointer keyword comes first in vocabulary so
      // pointer-specific phrases are detected first; this fallback only
      // fires on the bare word.
      /(?<![\p{L}\p{N}_])(?:parallax|paralaks|parallax-?effekt|parallax-?header)(?![\p{L}\p{N}_])/iu,
    ],
    // If the prompt names a pointer/mouse/cursor variant the user wants
    // pointer-parallax — emitting both would lead to two dossiers being
    // injected and a noisier capability-pack. Veto suppresses the generic
    // scroll fallback in those cases.
    vetoes: [
      /(?<![\p{L}\p{N}_])(?:pointer-?parallax|mus-?parallax|mouse-?parallax|cursor-?parallax)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:följer\s+(?:musen|muspekaren|cursor|pointer)|hover-?tilt|tilt-?card)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "payments",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:stripe(?:-?betalning|-?checkout)?|klarna|swish|paypal|adyen|mollie|braintree)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:checkout|kassa|kortbetalning|kortköp|kortbetala|kreditkort)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:betalningsfl(?:ö|o)de|betalningsl(?:ö|o)sning|payment[-\s]?flow|checkout[-\s]?flow|subscription[-\s]?billing|recurring[-\s]?billing|prenumerationsbetalning)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])betala\s+med\s+(?:kort|kreditkort|swish|klarna|stripe|paypal|visa|mastercard|apple\s*pay|google\s*pay)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])k(?:ö|o)p(?:a)?\s+med\s+(?:kort|kreditkort|stripe|klarna|swish|checkout)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "auth",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:auth|inloggning|registrera\s+konto|logga\s+in|sign[-\s]?in|sign[-\s]?up|register|clerk|next-?auth|auth\.js)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:lösenord|password|forgot[-\s]?password|reset[-\s]?password|återställ\s+lösenord)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:oauth|jwt|magic\s+link|session\.(?:store|cookie|token))(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "ai-chat",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:ai-?chatt|ai-?chat|chattbot|chatbot|ai-?assistent|ai-?bot|llm-?chat|chat[-\s]?ui|chat[-\s]?widget)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:openai\s+chat|gpt-?chat|claude-?chat|chatgpt-?widget)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "contact-form",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:kontaktform(?:ulär)?|contact[-\s]?form|kontaktsida\s+med\s+formulär|skicka\s+e-?post|skicka\s+mail|email[-\s]?form|resend)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "newsletter-subscribe",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:nyhetsbrev|newsletter|prenumerera\s+på\s+nyhetsbrev|subscribe[-\s]?form|email[-\s]?signup|mailchimp|brevo|mailerlite)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "analytics",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:analytics|webbanalys|webb-?analys|plausible|vercel[-\s]?analytics|google[-\s]?analytics|posthog|mixpanel|fathom)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:spåra\s+besökare|track[-\s]?visitors|page[-\s]?views|sidvisningar)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "error-tracking",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:sentry|error[-\s]?tracking|fel-?spårning|crash[-\s]?reporting|bug[-\s]?reporting|datadog|bugsnag|rollbar)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "carousel",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:carousel|karusell|slider|slideshow|bildspel|hero[-\s]?slider|image[-\s]?gallery|product[-\s]?gallery|embla)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "command-search",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:command[-\s]?palette|kommandopalett|cmd[-\s]?k|cmdk|spotlight[-\s]?search|sökpalett|quick[-\s]?search|command[-\s]?menu)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "faq-section",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:faq|faq-?sektion|faq-?accordion|vanliga\s+frågor|frågor\s+och\s+svar|q\s*&\s*a)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "marquee",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:marquee|löpande\s+text|löptext|ticker|logo[-\s]?marquee|brand[-\s]?marquee|scrolling[-\s]?logos)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "pricing-section",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:pricing[-\s]?section|pristabell|prisplan|prisplaner|pris-?sektion|prissektion|pricing[-\s]?table|pricing[-\s]?tier|tier[-\s]?table|prisniv(?:å|aer))(?![\p{L}\p{N}_])/iu,
    ],
    // "pris" alone is too broad ("priserna i menyn") — pristabell/prisplan
    // forms above are explicit enough that we don't need a veto.
  },
  {
    capability: "testimonials-section",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:testimonials?|testimonials[-\s]?section|testimonial[-\s]?grid|kundomdömen|kundutlåtanden|recensioner-?sektion|kundröster|reviews[-\s]?section)(?![\p{L}\p{N}_])/iu,
    ],
  },
];
