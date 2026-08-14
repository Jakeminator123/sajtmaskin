/**
 * P32 Fas A — regex-first request taxonomy for follow-ups.
 * Does not alter BuildSpec yet; callers log for baseline telemetry.
 *
 * `questionShape` is measurement-only. It must never drive a short-circuit
 * or refuse a build: a missed footer request is worse than an extra
 * generation. Only `kind === "qa-or-score"` may skip codegen, and that
 * gate stays the existing conservative regex (QA hint + `?`, no change verb).
 */

export type RequestKindClass =
  | "qa-or-score"
  | "external-fetch"
  | "multi-change"
  | "micro-edit"
  | "local-layout"
  | "page-addition"
  | "redesign"
  | "integration"
  | "unclassified";

export type RequestKindSource = "regex";

export type RequestKindQuestionShape =
  | "qa-or-score"
  | "qa-hint-no-mark"
  | "qa-hint-blocked-by-verb"
  | "none";

export type RequestKindSignals = {
  hasQaHint: boolean;
  hasQuestionMark: boolean;
  hasChangeVerb: boolean;
  hasScoreHint: boolean;
};

export type ClassifyRequestKindResult = {
  kind: RequestKindClass;
  source: RequestKindSource;
  signals: RequestKindSignals;
  questionShape: RequestKindQuestionShape;
};

const EMPTY_SIGNALS: RequestKindSignals = {
  hasQaHint: false,
  hasQuestionMark: false,
  hasChangeVerb: false,
  hasScoreHint: false,
};

const URL_IN_TEXT = /https?:\/\/[^\s<>"')]+/i;

const INTEGRATION_VERB = /\b(koppla|kopplar|integrera|integrerar|sätt\s+upp|installera|anslut|ansluta|enable|setup|set\s+up)\b/i;
const INTEGRATION_PROVIDER = /\b(stripe|supabase|clerk|auth0|firebase|sanity|contentful|shopify|woocommerce|paypal|twilio|sendgrid|resend|mongodb|neon|planetscale|vercel\s+kv|upstash|sentry|segment|mixpanel|plausible|google\s+analytics|ga4)\b/i;

const REDESIGN_STRONG = [
  /\b(redesign|rebrand|restyle|start over|from scratch)\b/i,
  /\b(gör om från grunden|helt ny riktning|helt annan stil|byt stil helt|ny\s+design|total\s+ombyggnad)\b/i,
  /\bfull(?:\s+|-)?redesign\b/i,
  /\b(website|sajt|site)\s+from\s+scratch\b/i,
] as const;

const EXTERNAL_FETCH_PHRASE = /\b(hämta\s+(?:från|ifrån)|ta\s+(?:från|ifrån)|kopiera\s+från|importera\s+från|scrap(?:e|ing)|palette\s+from|färgtema\s+från|logo(?:typ)?\s+från|bild(?:er)?\s+från|fetch\s+from|pull\s+from)\b/i;

// Unicode-aware boundaries — matches the same fix used for CHANGE_VERB below.
// Plain `\b` does not fire next to Swedish letters (ä/ö/å are non-word in the
// default ASCII regex tables), so `\bändra\b` failed to match prompts like
// "Ändra färg och flytta knappen", silently downgrading multi-change to
// unclassified.
const MULTI_CHANGE = [
  // "trea" var en typo: det svenska räkneordet "tre" matchade aldrig så
  // "tre ändringar" / "tre saker" tappades silent till local-layout.
  /(?<![\p{L}\p{N}_])(?:två|tre|fyra|fem|2|3|4|5)\s+(?:olika\s+)?(?:saker|ändringar|ändring|tasks|things)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])gör\s+(?:båda|alla|två)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:både|samt|och\s+också|plus|\+)(?![\p{L}\p{N}_]).*(?<![\p{L}\p{N}_])(?:ändra|byt|lägg|uppdatera|skapa|ta\s+bort|flytta)(?![\p{L}\p{N}_])/isu,
  /(?<![\p{L}\p{N}_])(?:ändra|byt|lägg|uppdatera|skapa|flytta)(?![\p{L}\p{N}_]).*(?<![\p{L}\p{N}_])och(?![\p{L}\p{N}_]).*(?<![\p{L}\p{N}_])(?:ändra|byt|lägg|uppdatera|skapa|flytta)(?![\p{L}\p{N}_])/isu,
] as const;

// Unicode-aware (ASCII \b misses Swedish letters like ä/ö/å at token edges).
// Includes inflected verbs (lägg/lägga/lägger, skapa/skapar/skapade, …) so
// `looksLikeQaOrScore` correctly rules out edit-disguised-as-question prompts
// like "Var ska jag lägga knappen?".
const CHANGE_VERB =
  /(?<![\p{L}\p{N}_])(?:ändra|ändrar|ändring|byt|byter|byta|lägg(?:a|er)?|lägg\s+till|skapa(?:r|de|t)?|ta\s+bort|flytta(?:r|de|t)?|uppdatera(?:r|de|t)?|fixa(?:r|de|t)?|implementera(?:r|de|t)?)(?![\p{L}\p{N}_])/iu;

// Tighter QA hints: drop bare `var` (very common in unrelated edit prompts
// like "Var ska jag lägga knappen?") — keep the multi-word forms.
const QA_HINT =
  /(?<![\p{L}\p{N}_])(?:vad|varför|hur|när|vilken|vilket|vilka|förklara|menar\s+du|can\s+you\s+explain|what\s+is|how\s+do|why\s+does|where\s+is)(?![\p{L}\p{N}_])/iu;
const SCORE_HINT = /\b(betyg|poäng|score|rate|rating|bedöm|utvärder|grade)\b/i;
const QUESTION_MARK = /\?/;

// Page-addition: explicit phrases only. Earlier the alternation included a
// loose `\/[a-z0-9-]+\s*(?:sida|page)?` branch which fired on any path mention
// (e.g. "ändra något i /api/foo"). The optional sida|page made it match every
// path. Removed; the phrase-based alternates cover real "add page" intent.
const PAGE_ADDITION = /\b(ny\s+sida|ny\s+route|nytt\s+underlag|lägg\s+till\s+(?:en\s+)?sida|skapa\s+(?:en\s+)?sida|add\s+(?:a\s+)?page|new\s+route)\b/i;

const LOCAL_LAYOUT = /\b(flytta|reorder|omordna|lägg\s+(?:en\s+)?(?:cta|knapp|sektion)|sätt\s+(?:en\s+)?(?:cta|knapp)\s+i|before|after|ovanför|under|före|efter)\b/i;

// Unicode-aware: ASCII \b never matches between Swedish letters (ä/ö/å are
// non-word), so `\bfärg\b` failed to match `färg` inside compounds like
// `primärfärg`. Use \p{L}-based look-arounds.
const MICRO_KEYWORD =
  /(?<![\p{L}\p{N}_])(?:färg|rgb|oklch|hex|copy|rubrik|h1|h2|paragraph|texten|font|typografi)(?![\p{L}\p{N}_])/iu;
const MICRO_HEX = /#[0-9a-f]{3,8}\b/i;

function hasRedesignSignal(message: string): boolean {
  if (REDESIGN_STRONG.some((re) => re.test(message))) return true;
  const verb = /(?<![\p{L}\p{N}_])(?:byt|ändra|gör\s+om|ny|nytt|nya)(?![\p{L}\p{N}_])/iu.test(
    message,
  );
  const noun = /(?<![\p{L}\p{N}_])(?:färg|tema|bakgrund|stil|look|design)(?![\p{L}\p{N}_])/iu.test(
    message,
  );
  return verb && noun && /\b(helt|hela|om|total|full)\b/i.test(message);
}

function looksLikeMultiChange(message: string): boolean {
  if (MULTI_CHANGE.some((re) => re.test(message))) return true;
  const matches = message.match(/\b(och|plus|\+|samt)\b/gi);
  if (matches && matches.length >= 2 && CHANGE_VERB.test(message)) return true;
  return false;
}

function inspectRequestKindSignals(message: string): RequestKindSignals {
  if (!message) return EMPTY_SIGNALS;
  return {
    hasQaHint: QA_HINT.test(message),
    hasQuestionMark: QUESTION_MARK.test(message),
    hasChangeVerb: CHANGE_VERB.test(message),
    hasScoreHint: SCORE_HINT.test(message),
  };
}

function resolveQuestionShape(
  kind: RequestKindClass,
  signals: RequestKindSignals,
): RequestKindQuestionShape {
  if (kind === "qa-or-score") return "qa-or-score";
  if (signals.hasQaHint && signals.hasChangeVerb) return "qa-hint-blocked-by-verb";
  if (signals.hasQaHint && !signals.hasQuestionMark && !signals.hasChangeVerb) {
    return "qa-hint-no-mark";
  }
  return "none";
}

function withSignals(
  kind: RequestKindClass,
  signals: RequestKindSignals,
): ClassifyRequestKindResult {
  return {
    kind,
    source: "regex",
    signals,
    questionShape: resolveQuestionShape(kind, signals),
  };
}

function looksLikeQaOrScore(message: string): boolean {
  const hasQa = (QA_HINT.test(message) && QUESTION_MARK.test(message)) || SCORE_HINT.test(message);
  if (!hasQa) return false;
  if (CHANGE_VERB.test(message)) return false;
  return true;
}

/** Flat fields for `request.kind.classified` — keep init and follow-up identical. */
export function requestKindClassificationFields(
  result: ClassifyRequestKindResult,
): {
  kind: RequestKindClass;
  source: RequestKindSource;
  questionShape: RequestKindQuestionShape;
  hasQaHint: boolean;
  hasQuestionMark: boolean;
  hasChangeVerb: boolean;
  hasScoreHint: boolean;
} {
  return {
    kind: result.kind,
    source: result.source,
    questionShape: result.questionShape,
    hasQaHint: result.signals.hasQaHint,
    hasQuestionMark: result.signals.hasQuestionMark,
    hasChangeVerb: result.signals.hasChangeVerb,
    hasScoreHint: result.signals.hasScoreHint,
  };
}

function looksLikeMicroEdit(message: string): boolean {
  if (message.length > 160) return false;
  if (!MICRO_KEYWORD.test(message) && !MICRO_HEX.test(message)) return false;
  if (PAGE_ADDITION.test(message) || LOCAL_LAYOUT.test(message)) return false;
  if (INTEGRATION_PROVIDER.test(message)) return false;
  return true;
}

/**
 * Regex-only classifier. Conservative: returns `unclassified` when signals conflict or are weak.
 */
export function classifyRequestKind(message: string): ClassifyRequestKindResult {
  const trimmed = message.trim();
  const signals = inspectRequestKindSignals(trimmed);
  if (!trimmed) {
    return withSignals("unclassified", signals);
  }

  if (INTEGRATION_VERB.test(trimmed) && INTEGRATION_PROVIDER.test(trimmed)) {
    return withSignals("integration", signals);
  }
  if (INTEGRATION_PROVIDER.test(trimmed) && /\b(betalning|checkout|auth|login|databas|cms|analytics)\b/i.test(trimmed)) {
    return withSignals("integration", signals);
  }

  if (hasRedesignSignal(trimmed)) {
    return withSignals("redesign", signals);
  }

  if (URL_IN_TEXT.test(trimmed) || EXTERNAL_FETCH_PHRASE.test(trimmed)) {
    return withSignals("external-fetch", signals);
  }

  if (looksLikeMultiChange(trimmed)) {
    return withSignals("multi-change", signals);
  }

  if (looksLikeQaOrScore(trimmed)) {
    return withSignals("qa-or-score", signals);
  }

  if (PAGE_ADDITION.test(trimmed)) {
    return withSignals("page-addition", signals);
  }

  if (LOCAL_LAYOUT.test(trimmed)) {
    return withSignals("local-layout", signals);
  }

  if (looksLikeMicroEdit(trimmed)) {
    return withSignals("micro-edit", signals);
  }

  return withSignals("unclassified", signals);
}
