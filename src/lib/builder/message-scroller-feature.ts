import { isAffirmativeEnvValue, sanitizeEnvString } from "@/lib/env-affirmative";

/**
 * Feature flag for the shadcn MessageScroller-based builder chat scroll.
 *
 * When enabled, `src/components/ai-elements/conversation.tsx` renders on top of
 * the `@shadcn/react` MessageScroller primitive (streaming without jump, turn
 * anchoring at user messages, preserved read position on history load,
 * scroll-to-bottom). When disabled it falls back to the previous simple
 * overflow-scroll implementation.
 *
 * Additive + reversible: default ON, but a single env value flips it back to the
 * legacy behavior in any environment. Mirrors `inspector-feature.ts`.
 */

const DISABLED_VALUES = new Set(["0", "false", "no", "n", "off"]);

function parseOptionalScrollerFlag(value: string | undefined): boolean | null {
  const normalized = sanitizeEnvString(value)?.toLowerCase();
  if (!normalized) return null;
  if (isAffirmativeEnvValue(normalized)) return true;
  if (DISABLED_VALUES.has(normalized)) return false;
  return null;
}

/**
 * Resolve the flag. Precedence: public (client-inlined) flag first, then the
 * server flag, else default ON.
 */
export function isMessageScrollerEnabled(): boolean {
  const publicFlag = parseOptionalScrollerFlag(
    process.env.NEXT_PUBLIC_SAJTMASKIN_MESSAGE_SCROLLER,
  );
  if (publicFlag !== null) return publicFlag;

  const serverFlag = parseOptionalScrollerFlag(
    process.env.SAJTMASKIN_MESSAGE_SCROLLER,
  );
  if (serverFlag !== null) return serverFlag;

  return true;
}
