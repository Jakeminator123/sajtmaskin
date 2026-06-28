/**
 * OpenClaw review-intent tuning (Fas 3).
 *
 * The OpenClaw gateway answers both quick chat and bug/review questions with the
 * same single agent model. For review/bug intent we want it to reason harder.
 * The safe, reversible lever is the OpenAI-compatible `reasoning_effort` request
 * field, which codex-class models honor. It is sent ONLY on review intent.
 *
 * Model note: the gateway should run a current model (recommended
 * `openai/gpt-5.5`). GPT-5.5 supports `xhigh` and defaults to `medium`; the
 * deprecated `gpt-5.3-codex` is being retired. `xhigh` is reserved for the
 * hardest async agentic work (debug-mode bug-hunt).
 *
 * Controlled via `OPENCLAW_REVIEW_REASONING_EFFORT`:
 *   - unset            -> default effort ("high" for review, "xhigh" for debug)
 *   - minimal|low|medium|high|xhigh -> that effort
 *   - off|none|false|0|"" -> null (do not send the field; e.g. if a gateway
 *     ever rejects it, this disables the behavior without a code change)
 */

export type OpenClawReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

const ALLOWED: readonly OpenClawReasoningEffort[] = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

const DISABLED_VALUES = new Set(["off", "none", "false", "0", ""]);

const DEFAULT_REVIEW_EFFORT: OpenClawReasoningEffort = "high";

/** Debug-mode bug-hunt reasons harder by default than ordinary review. */
export const DEFAULT_DEBUG_EFFORT: OpenClawReasoningEffort = "xhigh";

export interface ResolveReasoningEffortOptions {
  /** Default effort to use when `raw` is unset or unrecognized. Lets debug
   * intent reason harder (xhigh) than ordinary review (high) without changing
   * the disable semantics. */
  defaultEffort?: OpenClawReasoningEffort;
}

/**
 * Resolve the reasoning effort to send on review/debug intent. Pure + total so
 * it is unit-testable; the route passes `process.env.OPENCLAW_REVIEW_REASONING_EFFORT`.
 * An explicit env value always wins over `defaultEffort`; only the
 * disable tokens (off/none/false/0/"") suppress the field entirely.
 */
export function resolveReviewReasoningEffort(
  raw: string | undefined | null,
  options?: ResolveReasoningEffortOptions,
): OpenClawReasoningEffort | null {
  const fallback = options?.defaultEffort ?? DEFAULT_REVIEW_EFFORT;
  if (raw == null) return fallback;
  const value = raw.trim().toLowerCase();
  if (DISABLED_VALUES.has(value)) return null;
  if ((ALLOWED as readonly string[]).includes(value)) {
    return value as OpenClawReasoningEffort;
  }
  // Unknown value -> safe default rather than silently sending nothing.
  return fallback;
}
