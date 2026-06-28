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

const FOLLOWUP_RE = /follow[\s-]?ups?|följ\s*upp/i;
const REVIEW_NEXT_RE =
  /(granska|buggranska|kolla|ta\s+notis|notera)[^.!?]*\bn(ä|a)sta\b|\bn(ä|a)sta\s+(chatt)?meddelande/i;
const STOP_RE = /\b(stopp|stoppa|sluta|avbryt|avsluta|stop|halt)\b/i;
const COUNT_RE = /(\d{1,2})/;
// An explicit imperative is required to arm — a bare noun like "follow-ups" or a
// question ("kan du förklara follow-ups?") must NOT authorize auto-sends.
const ARM_VERB_RE =
  /\b(gör|göra|kör|skapa|starta|påbörja|utför|generera|do|run|create|start|launch)\b/i;
const REVIEW_VERB_RE = /\b(granska|buggranska|notera|ta\s+notis|kolla|felsök|debugga)\b/i;
// Negation/abstention must never arm ("gör inga follow-ups", "inte nu").
const NEGATION_RE = /\b(inga|inte|ingen|aldrig|undvik|sluta|no|don'?t|do not)\b/i;

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
  const trimmed = text.trim();
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

/** True when the user message is an explicit stop/abort of the mandate. */
export function parseStopDirective(text: string): boolean {
  if (typeof text !== "string") return false;
  return STOP_RE.test(text);
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
    ? "Armerad: granskar nästa svar"
    : `Armerad: ${m.remaining} follow-up(s) kvar`;
}
