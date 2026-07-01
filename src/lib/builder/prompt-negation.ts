const NEGATION_TERM_RE =
  /(?<![\p{L}\p{N}_])(?:lägg\s+inte\s+till|lägg\s+inte|inte|ingen|inget|utan|undvik|do\s+not|don't|dont|no|without|avoid|not)(?![\p{L}\p{N}_])/giu;

const REDESIGN_TERMS: RegExp[] = [
  /(?<![\p{L}\p{N}_])(?:redesign|omdesign|gör\s+om|designa\s+om|ny\s+design|redesigna)(?![\p{L}\p{N}_])/iu,
];

const AUTH_TERMS: RegExp[] = [
  /(?<![\p{L}\p{N}_])(?:auth|inloggning|logga\s+in|login|sign[-\s]?in|sign[-\s]?up|nextauth|auth\.js|clerk|lösenord|password)(?![\p{L}\p{N}_])/iu,
];

const PAYMENT_TERMS: RegExp[] = [
  /(?<![\p{L}\p{N}_])(?:betalning|betalningar|payment|payments|stripe|checkout|kassa|kortbetalning|subscription|billing)(?![\p{L}\p{N}_])/iu,
];

const ECOMMERCE_TERMS: RegExp[] = [
  /(?<![\p{L}\p{N}_])(?:webshop|webbshop|e-handel|ehandel|ecommerce|e-commerce|varukorg|kundvagn|cart|checkout|kassa|storefront|butik|shop|nätbutik|näthandel|online\s+store|online\s+shop)(?![\p{L}\p{N}_])/iu,
];

const BACKEND_TERMS: RegExp[] = [
  /(?<![\p{L}\p{N}_])(?:backend|api[-\s]?routes?|api|server|databas|database|sqlite|postgres|prisma|drizzle|persist(?:ed|ence)?|externa\s+tjänster|external\s+services)(?![\p{L}\p{N}_])/iu,
];

const INTEGRATION_TERMS: RegExp[] = [
  /(?<![\p{L}\p{N}_])(?:integration(?:er)?|integrations?|externa\s+tjänster|external\s+services|backend|api[-\s]?routes?|api)(?![\p{L}\p{N}_])/iu,
];

const NEGATED_CAPABILITY_TERMS: Record<string, RegExp[]> = {
  auth: AUTH_TERMS,
  payments: PAYMENT_TERMS,
  "contact-form": BACKEND_TERMS,
  "newsletter-subscribe": BACKEND_TERMS,
  analytics: INTEGRATION_TERMS,
  "error-tracking": INTEGRATION_TERMS,
};

function negatedWindows(prompt: string): string[] {
  const text = String(prompt ?? "");
  return [...text.matchAll(NEGATION_TERM_RE)]
    .map((match) => text.slice(match.index ?? 0, (match.index ?? 0) + 140))
    .filter(Boolean);
}

export function hasNegatedTerms(prompt: string, terms: RegExp[]): boolean {
  const windows = negatedWindows(prompt);
  if (windows.length === 0) return false;
  return windows.some((window) => terms.some((term) => term.test(window)));
}

export function hasNegatedRedesignIntent(prompt: string): boolean {
  return hasNegatedTerms(prompt, REDESIGN_TERMS);
}

export function hasNegatedAuthIntent(prompt: string): boolean {
  return hasNegatedTerms(prompt, AUTH_TERMS);
}

export function hasNegatedPaymentIntent(prompt: string): boolean {
  return hasNegatedTerms(prompt, PAYMENT_TERMS);
}

export function hasNegatedEcommerceIntent(prompt: string): boolean {
  return hasNegatedTerms(prompt, ECOMMERCE_TERMS);
}

export function hasNegatedBackendIntent(prompt: string): boolean {
  return hasNegatedTerms(prompt, BACKEND_TERMS);
}

export function hasNegatedIntegrationIntent(prompt: string): boolean {
  return hasNegatedTerms(prompt, INTEGRATION_TERMS);
}

export function isCapabilityNegated(prompt: string, capability: string): boolean {
  const terms = NEGATED_CAPABILITY_TERMS[capability];
  return Boolean(terms && hasNegatedTerms(prompt, terms));
}

export function isVisualOnlyFollowUpPrompt(prompt: string): boolean {
  const text = String(prompt ?? "");
  const hasVisual3d =
    /(?<![\p{L}\p{N}_])(?:3d|three\.?js|r3f|react-three|webgl|mesh|anka|duck|figur|figure)(?![\p{L}\p{N}_])/iu.test(text);
  if (!hasVisual3d) return false;
  return (
    hasNegatedBackendIntent(text) ||
    hasNegatedAuthIntent(text) ||
    hasNegatedPaymentIntent(text) ||
    hasNegatedIntegrationIntent(text)
  );
}
