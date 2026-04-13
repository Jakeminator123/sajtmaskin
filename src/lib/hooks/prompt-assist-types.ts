import type { ThemeColors } from "@/lib/builder/theme-presets";
import type { BuildIntent } from "@/lib/builder/build-intent";

export type PromptAssistMode = "rewrite" | "polish";

export type PromptAssistConfig = {
  model: string;
  deep: boolean;
  imageGenerations: boolean;
  buildIntent?: BuildIntent;
  themeColors?: ThemeColors | null;
};

export type PromptRewriteOptions = {
  forceShallow?: boolean;
  mode?: PromptAssistMode;
  forceEnglish?: boolean;
  modelOverride?: string;
};

export type InitBriefOptions = {
  forceShallow?: boolean;
  forceDeepBrief?: boolean;
  skipAddendum?: boolean;
  modelOverride?: string;
  onBrief?: (brief: Record<string, unknown>) => void;
};

/**
 * @deprecated Import PromptRewriteOptions or InitBriefOptions directly.
 * Kept for backward compatibility with code that used the union type.
 */
export type PromptAssistOptions = PromptRewriteOptions & InitBriefOptions;
