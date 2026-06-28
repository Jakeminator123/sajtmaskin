/**
 * OpenClaw review-intent tuning (Fas 3).
 *
 * The OpenClaw gateway answers both quick chat and bug/review questions with the
 * same single agent model. For review/bug intent we want it to reason harder.
 * The safe, reversible lever is the OpenAI-compatible `reasoning_effort` request
 * field, which codex-class models honor. It is sent ONLY on review intent.
 *
 * Controlled via `OPENCLAW_REVIEW_REASONING_EFFORT`:
 *   - unset            -> "high" (review reasons more by default)
 *   - minimal|low|medium|high -> that effort
 *   - off|none|false|0|"" -> null (do not send the field; e.g. if a gateway
 *     ever rejects it, this disables the behavior without a code change)
 */

export type OpenClawReasoningEffort = "minimal" | "low" | "medium" | "high";

const ALLOWED: readonly OpenClawReasoningEffort[] = [
  "minimal",
  "low",
  "medium",
  "high",
];

const DISABLED_VALUES = new Set(["off", "none", "false", "0", ""]);

const DEFAULT_REVIEW_EFFORT: OpenClawReasoningEffort = "high";

/**
 * Resolve the reasoning effort to send on review intent. Pure + total so it is
 * unit-testable; the route passes `process.env.OPENCLAW_REVIEW_REASONING_EFFORT`.
 */
export function resolveReviewReasoningEffort(
  raw: string | undefined | null,
): OpenClawReasoningEffort | null {
  if (raw == null) return DEFAULT_REVIEW_EFFORT;
  const value = raw.trim().toLowerCase();
  if (DISABLED_VALUES.has(value)) return null;
  if ((ALLOWED as readonly string[]).includes(value)) {
    return value as OpenClawReasoningEffort;
  }
  // Unknown value -> safe default rather than silently sending nothing.
  return DEFAULT_REVIEW_EFFORT;
}
