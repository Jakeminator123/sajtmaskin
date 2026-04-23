/**
 * Barrel re-exports — public API of `@/lib/builder/prompt-assist`.
 *
 * Split out of the pre-OMTAG-03 monolith `promptAssist.ts`. The directory
 * name is now kebab-case (`prompt-assist/`) matching the repo-wide
 * filename convention — see \`.cursor/rules/workflow.mdc\`. All consumer
 * imports were updated in the same commit as this barrel.
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

export {
  buildDynamicInstructionAddendumFromBrief,
  buildDynamicInstructionAddendumFromPrompt,
} from "./runner";
