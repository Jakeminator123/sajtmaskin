/**
 * Compose the final engine system prompt: static Core Rules + separator +
 * request-specific dynamic context.
 *
 * Extracted from `src/lib/gen/system-prompt.ts` 2026-04-21.
 */

let _cachedStaticCore: string | null = null;

export function loadStaticCoreSync(): string {
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
