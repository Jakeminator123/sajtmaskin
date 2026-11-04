/**
 * OpenClaw debug-mode "armed autonomy" mandate (Mode A).
 *
 * Core principle: OpenClaw reasons first and NEVER drives the builder unprompted.
 * Autonomy is unlocked only by an explicit *arming* directive from the user
 * ("granska nästa meddelande jag skapar" / "gör 5 follow-ups och buggranska").
 * That creates a bounded mandate: OpenClaw may then fill the builder prompt and
 * click send for at most `remaining` steps, one at a time, until the count is
 * exhausted or the user says "stopp".
 *
 * This module is pure (no DOM, no React) so the handshake + counter are
 * unit-testable. The client store holds the live mandate; the UI consumes a
 * step per auto-send.
 */

import { uWord, uWordRegex } from "@/lib/utils/unicode-word-boundary";

export type ArmedMandateMode = "review_next" | "followups";

export interface ArmedMandate {
  mode: ArmedMandateMode;
  /** How many more auto-sends the mandate still authorizes. */
  remaining: number;
  /** The user's arming sentence (verbatim-ish), for display + audit. */
  reason: string;
  createdAt: number;
}

export interface ArmingDirective {
  mode: ArmedMandateMode;
  count: number;
  reason: string;
}

/** Default number of follow-ups when the user arms without an explicit count. */
export const DEFAULT_FOLLOWUP_COUNT = 5;

/** Hard ceiling on a single mandate, regardless of what the user asks for. */
export const MAX_FOLLOWUP_COUNT = 20;

const FOLLOWUP_RE = uWordRegex(String.raw`follow[\s-]?ups?|följ\s*upp`);
// Greetings, interjections and polite openers that may precede a review
// directive ("Hej, kan du granska nästa bygge?", "Bra. Kolla nästa version").
const DIRECTIVE_LEAD = String.raw`(?:(?:hej|hallå|halla|hi|hello|hey|ok|okej|okay|bra|snälla|snalla|please|kan\s+du|vill\s+du|kan\s+ni)(?:[,.!]\s*|\s+))*`;
// What a review-next directive reviews. "Kolla nästa lediga tid" is a booking
// feature, not a request to review the next version.
const REVIEW_NEXT_OBJECT = String.raw`(?:chatt)?meddelande[nt]?|version(?:en)?|bygg(?:e|et|tur|turen)|ändring(?:en)?|steg(?:et)?|follow[\s-]?up|prompt(?:en)?|svar(?:et)?|generering(?:en)?`;
// The directive must open the message (after that lead), in both forms:
// "granska … nästa version" and "nästa meddelande …". A build order that
// merely mentions them ("Bygg en bokningssida där kunden kan kolla nästa
// lediga tid", "Skapa en banner som visar nästa meddelande") is not arming.
const REVIEW_NEXT_RE = new RegExp(
  String.raw`^${DIRECTIVE_LEAD}(?:${uWord(String.raw`granska|buggranska|kolla|ta\s+notis|notera`)}[^.!?]*${uWord(String.raw`n(?:ä|a)sta\s+(?:${REVIEW_NEXT_OBJECT})`)}|${uWord("n(ä|a)sta")}\s+${uWord("(chatt)?meddelande")})`,
  "iu",
);
const byLengthDesc = (words: readonly string[]) => [...words].sort((a, b) => b.length - a.length).join("|");
// Negative, neutral and polite openers never hide a stop: "Nej, stopp!",
// "Nej men sluta!", "Snälla, sluta!", "Vänta, stopp!", "Jag sa stopp!".
const STOP_LEAD_WORDS = [
  "nej", "nä", "näe", "nämen", "nope", "no", "vänta", "vanta", "wait", "hey", "hej", "hallå", "halla",
  "oj", "men", "snälla", "snalla", "please", "jag sa", "i said",
] as const;
// Affirmative openers usually answer the builder's question ("Ja, avsluta
// det", "Okej, avsluta det"). Routing therefore never reads them as a stop of
// the agent; only the broad check that disarms an existing mandate strips them.
const STOP_AFFIRMATIVE_WORDS = ["ja", "jo", "ok", "okej", "okay"] as const;
const leadPattern = (words: readonly string[]) =>
  new RegExp(String.raw`^(?:(?:${byLengthDesc(words)})(?:[,!]\s*|\s+))+`, "iu");
const onlyPattern = (words: readonly string[]) =>
  new RegExp(String.raw`^(?:${byLengthDesc(words)})[,!\s]*$`, "iu");
const STOP_LEAD_RE = leadPattern(STOP_LEAD_WORDS);
const STOP_ANY_LEAD_RE = leadPattern([...STOP_LEAD_WORDS, ...STOP_AFFIRMATIVE_WORDS]);
const STOP_INTERJECTION_ONLY_RE = onlyPattern(STOP_LEAD_WORDS);
const STOP_AFFIRMATIVE_ONLY_RE = onlyPattern(STOP_AFFIRMATIVE_WORDS);
// "Stoppa nu, eller vänta?" asks about stopping; it is not a stop.
const STOP_ALTERNATIVE_RE = /^(?:eller|or)(?:\s|$)/iu;
const STOP_WORD = "stopp|stoppa|sluta|avbryt|avsluta|stop|halt";
// A stop must address the current work. Questions/quoted mentions and orders
// about other objects ("stoppa buggar") do not revoke an existing mandate.
const STOP_TARGET = String.raw`(?:med\s+)?(?:(?:dina|alla|pågående|aktuella|den\s+här|den\s+där)\s+)?(?:autonomin|mandatet|körningen|bygget|byggandet|arbetet|allt|det(?:\s+(?:här|där|du\s+gör))?|it|this|that|follow[\s-]?ups?|generera|generering(?:en)?|bygga|svara|generating|generation|building|running)`;
// Polite request forms, also as questions: "Kan ni stoppa?", "Could you stop?".
const STOP_POLITE_PREFIX = String.raw`(?:(?:snälla|snalla|please)[,\s]+|(?:kan|vill)\s+(?:du|ni)\s+(?:(?:snälla|please)\s+)?|skulle\s+(?:du|ni)\s+kunna\s+|(?:could|can|would|will)\s+you\s+(?:please\s+)?)?`;
const STOP_COMMAND_RE = new RegExp(
  String.raw`^${STOP_POLITE_PREFIX}(?:${uWord(STOP_WORD)}[,!\s]+)*${uWord(STOP_WORD)}(?:\s+${STOP_TARGET})?(?:\s+efter\s+(?:detta|det\s+här)\s+steg)?(?:[,\s]+(?:nu|now|direkt|omedelbart|please|tack))*[,.!?…。！？]*$`,
  "iu",
);
const STOP_NEGATION_RE = uWordRegex(String.raw`inte|aldrig|ej|don't|don’t|do\s+not|never|no`);
const COUNT_RE = /(\d{1,2})/;
// An explicit imperative is required to arm — a bare noun like "follow-ups" or a
// question ("kan du förklara follow-ups?") must NOT authorize auto-sends.
const ARM_VERB_RE = uWordRegex("gör|göra|kör|skapa|starta|påbörja|utför|generera|do|run|create|start|launch");
const REVIEW_VERB_RE = uWordRegex(String.raw`granska|buggranska|notera|ta\s+notis|kolla|felsök|debugga`);
// Negation/abstention must never arm ("gör inga follow-ups", "inte nu").
const NEGATION_RE = uWordRegex(String.raw`inga|inte|ingen|aldrig|undvik|sluta|no|don['’]?t|do\s+not`);

function clampFollowupCount(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_FOLLOWUP_COUNT;
  return Math.min(Math.max(Math.trunc(raw), 1), MAX_FOLLOWUP_COUNT);
}

/**
 * Detect an arming directive in a user message. Returns null when the text is
 * not an explicit arming instruction (the common case — OpenClaw stays passive).
 */
export function parseArmingDirective(text: string): ArmingDirective | null {
  if (typeof text !== "string") return null;
  const trimmed = text.normalize("NFC").trim();
  if (!trimmed) return null;
  // A stop or any negation/abstention is never an arming directive.
  if (parseStopDirective(trimmed)) return null;
  if (NEGATION_RE.test(trimmed)) return null;
  const reason = trimmed.slice(0, 400);

  // Follow-up mandate requires BOTH a follow-up reference AND an explicit
  // imperative/review verb — "gör 5 follow-ups och buggranska", not a bare
  // "follow-ups" or "kan du förklara follow-ups?".
  if (FOLLOWUP_RE.test(trimmed) && (ARM_VERB_RE.test(trimmed) || REVIEW_VERB_RE.test(trimmed))) {
    const match = trimmed.match(COUNT_RE);
    const count = match ? clampFollowupCount(Number(match[1])) : DEFAULT_FOLLOWUP_COUNT;
    return { mode: "followups", count, reason };
  }

  // "granska nästa meddelande jag skapar och ta notis om allt" — require an
  // explicit review/arming verb so a bare "nästa meddelande" mention (e.g. an
  // innocent question) can't false-arm autonomy (Bugbot), mirroring the
  // follow-up path's imperative requirement.
  if (
    REVIEW_NEXT_RE.test(trimmed) &&
    (REVIEW_VERB_RE.test(trimmed) || ARM_VERB_RE.test(trimmed))
  ) {
    return { mode: "review_next", count: 1, reason };
  }

  return null;
}

/**
 * `any` disarms an existing mandate: every sentence may carry the stop ("Det
 * blev fel. Sluta!", "Ja, stoppa!"). A false positive there only ends
 * autonomy, which is the safe direction.
 *
 * `leading` decides routing: only the first substantive sentence counts. A
 * build order that names a button ("Lägg till knappar. Avbryt, Spara och
 * Skicka.") still reaches the build engine, and an affirmative answer to the
 * builder ("Ja, avsluta det", "Okej. Avsluta det.") stays with the builder.
 */
export type StopDirectiveScope = "any" | "leading";

/** True when the user message is an explicit stop/abort of the mandate. */
export function parseStopDirective(text: string, scope: StopDirectiveScope = "any"): boolean {
  if (typeof text !== "string") return false;
  for (const raw of text.normalize("NFC").trim().split(/[.!](?:\s+|$)|[。！]/u)) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (scope === "any") {
      if (isStopSentence(sentence.replace(STOP_ANY_LEAD_RE, ""))) return true;
      continue;
    }
    if (STOP_AFFIRMATIVE_ONLY_RE.test(sentence)) return false; // "Okej. Avsluta det."
    if (STOP_INTERJECTION_ONLY_RE.test(sentence)) continue; // "Nej. Stopp!"
    return isStopSentence(sentence.replace(STOP_LEAD_RE, ""));
  }
  return false;
}

/**
 * Only a sentence's first clause counts ("Stopp, det räcker", "Stoppa nu, jag
 * vill ändra rubriken"). Target and negation checks stay scoped to that
 * clause, so a later explanation ("Gör inte fler ändringar") cannot hide the
 * stop.
 */
function isStopSentence(body: string): boolean {
  const firstClause = body.split(/,\s*|\s[-–—]\s/u, 1)[0];
  if (STOP_NEGATION_RE.test(firstClause) || !STOP_COMMAND_RE.test(firstClause)) return false;
  const rest = body.slice(firstClause.length).replace(/^(?:,\s*|\s[-–—]\s)/u, "");
  return !STOP_ALTERNATIVE_RE.test(rest);
}

/** Build a fresh mandate from an arming directive. */
export function createArmedMandate(
  directive: ArmingDirective,
  now: number = Date.now(),
): ArmedMandate {
  return {
    mode: directive.mode,
    remaining: clampFollowupCount(directive.count),
    reason: directive.reason,
    createdAt: now,
  };
}

/** True when the mandate still authorizes at least one auto-send. */
export function isMandateActive(mandate: ArmedMandate | null | undefined): boolean {
  return Boolean(mandate && mandate.remaining > 0);
}

/**
 * Consume one auto-send step. Returns the next mandate, or null when the mandate
 * is now exhausted (so the caller clears it and OpenClaw goes passive again).
 */
export function consumeMandateStep(
  mandate: ArmedMandate | null | undefined,
): ArmedMandate | null {
  if (!mandate) return null;
  const remaining = mandate.remaining - 1;
  if (remaining <= 0) return null;
  return { ...mandate, remaining };
}

/** Short human label for the mandate state (UI/status). */
export function describeMandate(mandate: ArmedMandate | null | undefined): string {
  if (!isMandateActive(mandate)) return "Ingen aktiv autonomi";
  const m = mandate as ArmedMandate;
  return m.mode === "review_next"
    ? "Armerad: granskar nästa meddelande du skickar"
    : `Armerad: ${m.remaining} follow-up(s) kvar`;
}
