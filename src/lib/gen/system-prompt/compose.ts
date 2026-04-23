/**
 * PUBLIC API — composeEngineSystemPrompt(), getSystemPromptLengths().
 *
 * The canonical generation path is:
 *   1. `prepareGenerationContext()` (orchestrate.ts) builds a `BuildSpec`,
 *      resolves scaffold/variant/route/contracts, then calls
 *      `buildDynamicContext()` with the full input set.
 *   2. `composeEngineSystemPrompt(dynamicContext)` glues the static Core
 *      Rules (`config/prompt-core/*.md`) onto the dynamic context to produce
 *      the single system message sent to the LLM.
 *
 * The legacy `buildSystemPrompt(options)` shortcut was removed in favor of
 * this two-step path because its options type kept drifting from
 * `DynamicContextOptions` and silently producing thinner prompts in eval.
 *
 * Split out of `system-prompt.ts` (OMTAG-03 wave-rest) — no behavior change.
 */

// ═══════════════════════════════════════════════════════════════════════════
// STATIC CORE — config manifest + fragments (see static-core-loader.ts)
// Loaded via require() to keep node:fs out of Turbopack's static analysis
// while remaining available at server runtime.
// ═══════════════════════════════════════════════════════════════════════════

let _cachedStaticCore: string | null = null;
function loadStaticCoreSync(): string {
  if (_cachedStaticCore !== null) return _cachedStaticCore;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getStaticCoreFromWorkspace } = require("../static-core-loader") as typeof import("../static-core-loader");
  _cachedStaticCore = getStaticCoreFromWorkspace();
  return _cachedStaticCore;
}

/** Between static core (config/prompt-core) and buildDynamicContext output. */
export const SYSTEM_PROMPT_SEPARATOR = "\n\n---\n\n# Request-Specific Context\n\n";

/** Compose static codegen core + dynamic context without re-running retrieval. */
export function composeEngineSystemPrompt(dynamicContextText: string): string {
  return `${loadStaticCoreSync()}${SYSTEM_PROMPT_SEPARATOR}${dynamicContextText}`;
}

/**
 * Returns character counts for prompt-cache monitoring.
 * Use after `composeEngineSystemPrompt()` to log total, static, and dynamic lengths.
 */
export function getSystemPromptLengths(fullPrompt: string): {
  total: number;
  static: number;
  dynamic: number;
} {
  const total = fullPrompt.length;
  const sepIdx = fullPrompt.indexOf(SYSTEM_PROMPT_SEPARATOR);
  if (sepIdx === -1) {
    return { total, static: total, dynamic: 0 };
  }
  const staticLen = sepIdx;
  const dynamicLen = total - staticLen - SYSTEM_PROMPT_SEPARATOR.length;
  return {
    total,
    static: staticLen,
    dynamic: Math.max(0, dynamicLen),
  };
}
