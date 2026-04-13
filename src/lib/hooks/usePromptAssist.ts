import { usePromptRewrite } from "./usePromptRewrite";
import { useInitBrief } from "./useInitBrief";
import type { ThemeColors } from "@/lib/builder/theme-presets";
import type { BuildIntent } from "@/lib/builder/build-intent";

export type {
  PromptAssistOptions,
  PromptRewriteOptions,
  InitBriefOptions,
  PromptAssistConfig,
} from "./prompt-assist-types";

type UsePromptAssistParams = {
  model: string;
  deep: boolean;
  imageGenerations: boolean;
  codeContext?: string | null;
  buildIntent?: BuildIntent;
  themeColors?: ThemeColors | null;
};

/** @deprecated Use `usePromptRewrite` and `useInitBrief` directly. */
export function usePromptAssist(params: UsePromptAssistParams) {
  const { maybeEnhanceInitialPrompt } = usePromptRewrite(params);
  const { generateDynamicInstructions } = useInitBrief(params);
  return { maybeEnhanceInitialPrompt, generateDynamicInstructions };
}
