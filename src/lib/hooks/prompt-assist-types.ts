import type { ThemeColors } from "@/lib/builder/theme-presets";
import type { BuildIntent } from "@/lib/builder/build-intent";

export const PROMPT_ASSIST_MODES = ["rewrite", "polish"] as const;
export type PromptAssistMode = (typeof PROMPT_ASSIST_MODES)[number];

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
  /**
   * P22: chat id för follow-up-detektion. När satt + `forceDeepBrief` kastar
   * `useInitBrief` — Deep Brief ska bara köras vid init (innan chatten finns).
   */
  chatId?: string | null;
};
