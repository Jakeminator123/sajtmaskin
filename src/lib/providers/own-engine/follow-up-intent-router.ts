/**
 * Backoffice 2.0 fas 6 — matchStrategy router for follow-up intent.
 *
 * Thin async wrapper around the deterministic {@link classifyFollowUpIntent}.
 * It reads `getMatchStrategy("followUpIntent")` from the manifest and, ONLY
 * when that is `"small-llm"`, attempts the small-LLM classifier. Any failure
 * (or any other strategy) falls through to the existing deterministic
 * keyword/regex classifier, which is the current default — so this is a strict
 * no-op until the manifest is explicitly flipped to `small-llm`.
 *
 * The deterministic classifier lives in `follow-up-clarification.ts` and is
 * intentionally left untouched (sync, pure, fully regression-tested). This file
 * is the only place that imports the AI SDK for this matching point.
 */
import { getMatchStrategy } from "@/lib/ai-models/load-manifest";
import { debugLog } from "@/lib/utils/debug";
import { type FollowUpIntentMode } from "@/lib/gen/follow-up-intent-types";
import { classifyFollowUpIntent } from "./follow-up-clarification";
import { llmClassifyFollowUpIntent } from "./follow-up-intent-llm-classifier";

/**
 * Strategy-aware follow-up intent classification.
 *
 * - `keyword` (default): returns `classifyFollowUpIntent(message)` unchanged,
 *   never calling the LLM.
 * - `small-llm`: tries the small-LLM classifier; on ANY error/timeout falls
 *   back to the deterministic result (fail-safe).
 * - any other value: also falls back to the deterministic result.
 */
export async function classifyFollowUpIntentWithStrategy(
  message: string,
): Promise<FollowUpIntentMode> {
  const strategy = getMatchStrategy("followUpIntent");

  if (strategy === "small-llm") {
    try {
      const llmResult = await llmClassifyFollowUpIntent(message);
      debugLog("AI", "match:followUpIntent strategy=small-llm", {
        result: llmResult,
      });
      return llmResult;
    } catch (err) {
      debugLog("AI", "match:followUpIntent small-llm failed → keyword fallback", {
        error: err instanceof Error ? err.message : String(err),
      });
      // fall through to deterministic
    }
  }

  const deterministic = classifyFollowUpIntent(message);
  // Trace non-default strategies so an enabled point is attributable in logs.
  // Skipped for the default "keyword" path to keep the hot path silent.
  if (strategy !== "keyword") {
    debugLog("AI", "match:followUpIntent deterministic result", {
      strategy,
      result: deterministic,
    });
  }
  return deterministic;
}
