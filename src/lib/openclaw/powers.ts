/**
 * OpenClaw "extra befogenheter" — the user-visible opt-in that sits ON TOP of
 * the `OC_EDIT` env gate.
 *
 * ## Why a second gate at all
 *
 * `OC_EDIT` is an operator switch: it is either on for a whole deployment or
 * off. In production it is ON, which means armed autonomy and quick edits are
 * permanently available with nothing in the chat that says so and no way for
 * the user to decline. This module adds the missing half: the user must press
 * a button in the OpenClaw chat AND tick the specific power before anything
 * beyond the ordinary guide behaviour happens.
 *
 * ## The gate is an AND, and the client half can only narrow
 *
 * A power is live only when `OC_EDIT` is on **and** the master toggle is
 * pressed **and** that power is ticked. The client sends its granted list to
 * the server, but the list carries **no authority** — the server ANDs it with
 * `OPENCLAW.editEnabled`, so a forged list can at most re-request something the
 * deployment already allows, and an absent list can only take powers away.
 * Same trust model as the prepared-prompt tag (see `prepared-prompt.ts`).
 *
 * With every power off, the resolved flags are identical to an `OC_EDIT=false`
 * deployment — that equivalence is what keeps "knappen av = precis som idag"
 * true rather than merely intended, and it is what the tests assert.
 */

/** Canonical power ids. The menu is derived from this list, never hardcoded. */
export const OPENCLAW_POWER_IDS = ["armed_autonomy", "quick_edit"] as const;

export type OpenClawPowerId = (typeof OPENCLAW_POWER_IDS)[number];

/** Swedish menu copy. Kept next to the ids so a new power cannot ship unlabelled. */
export const OPENCLAW_POWER_META: Record<
  OpenClawPowerId,
  { label: string; description: string }
> = {
  armed_autonomy: {
    label: "Armerad autonomi",
    description: "Får fylla builder-prompten och skicka den åt dig, efter att du armerat.",
  },
  quick_edit: {
    label: "Snabbändringar",
    description: "Får föreslå exakta småändringar i sajtens filer. Du godkänner varje förslag.",
  },
};

export interface OpenClawPowersInput {
  /** Server-reported `OC_EDIT` (client side: the store's `editEnabled`). */
  editEnabled: boolean;
  /** The chat's master toggle — the button must be pressed. */
  powersOn: boolean;
  /** Powers the user ticked in the menu. */
  granted: readonly OpenClawPowerId[] | null | undefined;
}

export interface OpenClawPowers {
  /** Arming directives, `submit:true` auto-send and the continuation loop. */
  armedAutonomy: boolean;
  /** `apply_quick_edit` approval cards (still one manual click per change). */
  quickEdit: boolean;
  /**
   * True when at least one power is live. Gates everything that is merely a
   * consequence of edit mode rather than a power of its own: the bounded edit
   * code context and the prepared-prompt fast lane.
   */
  any: boolean;
}

/** All powers off — the `OC_EDIT=false` shape, reused so it cannot drift. */
const NO_POWERS: OpenClawPowers = { armedAutonomy: false, quickEdit: false, any: false };

/**
 * Resolve the effective powers for a turn. The single place the AND lives;
 * every caller (client gates and the chat route alike) goes through it.
 */
export function resolveOpenClawPowers(input: OpenClawPowersInput): OpenClawPowers {
  if (!input.editEnabled || !input.powersOn) return NO_POWERS;
  const granted = Array.isArray(input.granted) ? input.granted : [];
  const armedAutonomy = granted.includes("armed_autonomy");
  const quickEdit = granted.includes("quick_edit");
  return { armedAutonomy, quickEdit, any: armedAutonomy || quickEdit };
}

/**
 * The live powers as ids — what the client sends to the chat route so the
 * server can narrow the edit system prompt to exactly what the user granted.
 */
export function activeOpenClawPowerIds(input: OpenClawPowersInput): OpenClawPowerId[] {
  if (!resolveOpenClawPowers(input).any) return [];
  return sanitizeOpenClawPowerIds(input.granted);
}

/**
 * Server-side resolve from a raw request body. The client has already applied
 * its own gates, so a power that arrives here was asked for — but asking is not
 * granting: the env gate is re-applied, which is what makes the list unable to
 * widen anything.
 */
export function resolveOpenClawPowersFromRequest(input: {
  editEnabled: boolean;
  requested: unknown;
}): OpenClawPowers {
  const granted = sanitizeOpenClawPowerIds(input.requested);
  return resolveOpenClawPowers({
    editEnabled: input.editEnabled,
    powersOn: granted.length > 0,
    granted,
  });
}

export function isOpenClawPowerId(value: unknown): value is OpenClawPowerId {
  return (
    typeof value === "string" && (OPENCLAW_POWER_IDS as readonly string[]).includes(value)
  );
}

/**
 * Parse a client-supplied `powers` list. Unknown entries and duplicates are
 * dropped rather than rejected: the list only ever narrows what `OC_EDIT`
 * already allows, so a malformed body should degrade to "fewer powers", never
 * to a failed chat turn.
 */
export function sanitizeOpenClawPowerIds(raw: unknown): OpenClawPowerId[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<OpenClawPowerId>();
  for (const entry of raw) {
    if (isOpenClawPowerId(entry)) seen.add(entry);
  }
  return OPENCLAW_POWER_IDS.filter((id) => seen.has(id));
}

/** Tick/untick one power, keeping the canonical order. */
export function toggleOpenClawPower(
  granted: readonly OpenClawPowerId[],
  id: OpenClawPowerId,
): OpenClawPowerId[] {
  const next = new Set(granted);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return OPENCLAW_POWER_IDS.filter((candidate) => next.has(candidate));
}
