/**
 * Barrel re-exports — public API of `@/lib/gen/system-prompt`.
 *
 * Split out of the pre-OMTAG-03 monolith `system-prompt.ts`. Consumers
 * should continue to import from `@/lib/gen/system-prompt` (or
 * `./system-prompt`) unchanged — these re-exports preserve the exact
 * surface the monolith provided.
 */

export type {
  Brief,
  MediaCatalogItem,
  DesignReferenceAsset,
  DynamicContextOptions,
  DynamicContextPruning,
  DynamicContextBlockTrace,
  BuildDynamicContextResult,
} from "./types";

export { buildDynamicContext } from "./build-dynamic-context";
export { renderRecurringFailuresBlockLines } from "./recurring-failures";
export {
  SYSTEM_PROMPT_SEPARATOR,
  composeEngineSystemPrompt,
  getSystemPromptLengths,
} from "./compose";
