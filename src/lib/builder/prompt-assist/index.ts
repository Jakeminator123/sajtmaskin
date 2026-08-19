/**
 * Public API of `@/lib/builder/prompt-assist`.
 *
 * Deep Brief model routing lives in `models.ts`. `formatPrompt` is used by
 * the prompt-wizard only. The old client-side instruction addendum is gone —
 * server `guidance-resolvers.ts` owns that prompt text.
 */

export type { PromptAssistProvider } from "./models";
export {
  ASSIST_MODELS,
  ANTHROPIC_ASSIST_MODELS,
  isAnthropicAssistModel,
  isOpenAIAssistModel,
  isPromptAssistModelAllowed,
  isPromptAssistOff,
  normalizeAssistModel,
  resolvePromptAssistProvider,
} from "./models";

export { formatPrompt } from "./formatters";
