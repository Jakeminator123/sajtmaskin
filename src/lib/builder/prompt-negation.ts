// `inte bara` / `not just|only` are emphasis ("inte bara designen, gör om från
// grunden"), not preservation — they must not open a negation window (Codex P2
// on #447).
const NEGATION_TERM_RE =
  /(?<![\p{L}\p{N}_])(?:lägg\s+inte\s+till|lägg\s+inte|inte(?!\s+bara)|ingen|inget|utan|undvik|do\s+not|don't|dont|no|without|avoid|not(?!\s+(?:just|only)))(?![\p{L}\p{N}_])/giu;

const REDESIGN_TERMS: RegExp[] = [
  /(?<![\p{L}\p{N}_])(?:redesign|omdesign|gör\s+om|designa\s+om|ny\s+design|redesigna)(?![\p{L}\p{N}_])/iu,
  // Bugg A / A2: plain `design`/`utseende`/`layout` targets so a negation such
  // as "Rör inte designen", "ändra inte utseendet" or "do not change the
  // design" actually suppresses redesign classification. Without these a
  // bugfix prompt that happened to pair a redesign verb+noun ("byt … designen")
  // was misclassified as clear-redesign and got the aggressive redesign lines
  // injected even though the user explicitly asked us to leave the design
  // alone. Only fires inside a negation window (see `negatedWindows`), so a
  // genuine "gör om designen" (no negation) still classifies as a redesign.
  /(?<![\p{L}\p{N}_])(?:design(?:en|erna|s)?|utseende(?:t|n|na)?|layout(?:en|er|erna|s)?)(?![\p{L}\p{N}_])/iu,
];

const AUTH_TERMS: RegExp[] = [
  /(?<![\p{L}\p{N}_])(?:auth|inloggning|logga\s+in|login|sign[-\s]?in|sign[-\s]?up|nextauth|auth\.js|clerk|lösenord|password)(?![\p{L}\p{N}_])/iu,
];

const PAYMENT_TERMS: RegExp[] = [
  /(?<![\p{L}\p{N}_])(?:betalning|betalningar|payment|payments|stripe|checkout|kassa|kortbetalning|subscription|billing)(?![\p{L}\p{N}_])/iu,
];

// Deliberately excludes bare `shop`/`store`/`butik`: those match inside
// unrelated compounds (e.g. "coffee shop") within a negation window and would
// wrongly suppress a genuine webshop request elsewhere in the same prompt.
// Mirror the unambiguous `strongEcommerceIntent` set in capability-inference.ts.
const ECOMMERCE_TERMS: RegExp[] = [
  /(?<![\p{L}\p{N}_])(?:webshop|webbshop|e-handel|ehandel|ecommerce|e-commerce|varukorg|kundvagn|cart|checkout|kassa|storefront|nätbutik|näthandel|online\s+store|online\s+shop)(?![\p{L}\p{N}_])/iu,
];

const BACKEND_TERMS: RegExp[] = [
  /(?<![\p{L}\p{N}_])(?:backend|api[-\s]?routes?|api|server|databas|database|sqlite|postgres|prisma|drizzle|persist(?:ed|ence)?|externa\s+tjänster|external\s+services)(?![\p{L}\p{N}_])/iu,
];

const INTEGRATION_TERMS: RegExp[] = [
  /(?<![\p{L}\p{N}_])(?:integration(?:er)?|integrations?|externa\s+tjänster|external\s+services|backend|api[-\s]?routes?|api)(?![\p{L}\p{N}_])/iu,
];

// Narrow on purpose (Bugbot, dossier wave 2): only GENERIC database/backend
// nouns — no provider names. "använd mongodb, inte postgres" negates a
// provider choice, not the database capability itself; provider preference is
// resolved later by relevanceKeywords in select.ts. Only "utan databas /
// no database / utan backend" should suppress the capability.
const DATABASE_TERMS: RegExp[] = [
  /(?<![\p{L}\p{N}_])(?:databas(?:en|er|erna)?|databases?|datalager|backend|persist(?:ed|ence)?)(?![\p{L}\p{N}_])/iu,
];

const NEGATED_CAPABILITY_TERMS: Record<string, RegExp[]> = {
  auth: AUTH_TERMS,
  // Dossier wave 3: "lägg inte till (supabase-)inloggning" must suppress the
  // Supabase capability the same way it suppresses generic auth.
  "supabase-auth": AUTH_TERMS,
  payments: PAYMENT_TERMS,
  // (`subscriptions` and `error-tracking` left the map 2026-08-06 with their
  // parked dossiers — capabilities that no longer exist cannot be nominated,
  // so there is nothing for a negation to suppress.)
  "contact-form": BACKEND_TERMS,
  "newsletter-subscribe": BACKEND_TERMS,
  // Dossier wave 2: "utan databas/backend" suppresses the capability, but a
  // negated PROVIDER ("inte postgres") must not — see DATABASE_TERMS.
  database: DATABASE_TERMS,
  // (`cms` left the map 2026-09-02 with the parked sanity-cms dossier.)
  analytics: INTEGRATION_TERMS,
};

/**
 * Klausulgräns för ett negationsfönster (Codex P2 på #592): negationens
 * räckvidd slutar vid meningsslut, vid adversativt "men"/"but", eller vid ett
 * komma som inleder en NY imperativ-sats ("no auth, add a map" /
 * "lägg inte till auth, lägg till postgres"). Ett komma som bara fortsätter
 * en negerad substantivlista ("lägg inte till backend, auth eller betalning")
 * avslutar INTE fönstret — därav verb-kravet efter kommat.
 */
const CLAUSE_BOUNDARY_RE =
  /[.;!?\n]|,\s*(?:och\s+|and\s+|sedan\s+|sen\s+|then\s+)?(?:lägg|skapa|bygg|gör|använd|visa|byt|ta\s+bort|add|create|build|make|use|show|include|inkludera|implementera|implement|remove)(?![\p{L}\p{N}_])|\s(?:men|but)(?![\p{L}\p{N}_])/iu;

const NEGATION_WINDOW_MAX_CHARS = 140;

function negationWindowEnd(text: string, start: number): number {
  const cap = Math.min(text.length, start + NEGATION_WINDOW_MAX_CHARS);
  const boundaryIdx = text.slice(start, cap).search(CLAUSE_BOUNDARY_RE);
  return boundaryIdx === -1 ? cap : start + boundaryIdx;
}

/** Teckenintervall (start/slut) för varje negationsfönster i prompten. */
function negatedWindowRanges(prompt: string): Array<{ start: number; end: number }> {
  const text = String(prompt ?? "");
  return [...text.matchAll(NEGATION_TERM_RE)].map((match) => ({
    start: match.index ?? 0,
    end: negationWindowEnd(text, match.index ?? 0),
  }));
}

function negatedWindows(prompt: string): string[] {
  const text = String(prompt ?? "");
  return negatedWindowRanges(text)
    .map((range) => text.slice(range.start, range.end))
    .filter(Boolean);
}

export function hasNegatedTerms(prompt: string, terms: RegExp[]): boolean {
  const windows = negatedWindows(prompt);
  if (windows.length === 0) return false;
  return windows.some((window) => terms.some((term) => term.test(window)));
}

/**
 * True när `term` matchar prompten men VARJE förekomst ligger inne i ett
 * negationsfönster ("…, inte prisma" / "no postgres"). Cross-cutting-verktyget
 * för provider-negation (Codex P2 ×2 på #445):
 *
 *  - Vocabulary-VETON ska hoppas över när konkurrent-termen är negerad
 *    ("lägg till postgres, inte prisma" får inte tysta `database`).
 *  - Positiva capability-TRÄFFAR ska ignoreras när providern är negerad
 *    ("add a contact form, no postgres" får inte emitta `database`).
 *
 * En term som förekommer både negerat och icke-negerat ("använd mongodb,
 * inte postgres" för mönstret som matchar båda) räknas som positiv — minst
 * en förekomst utanför fönstren vinner.
 */
export function isTermFullyNegated(prompt: string, term: RegExp): boolean {
  const text = String(prompt ?? "");
  const windows = negatedWindowRanges(text);
  if (windows.length === 0) return false;
  const flags = term.flags.includes("g") ? term.flags : `${term.flags}g`;
  const globalTerm = new RegExp(term.source, flags);
  let sawMatch = false;
  for (const match of text.matchAll(globalTerm)) {
    sawMatch = true;
    const idx = match.index ?? 0;
    const insideWindow = windows.some((w) => idx >= w.start && idx < w.end);
    if (!insideWindow) return false;
  }
  return sawMatch;
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
