import type { ThemeColors } from "@/lib/builder/theme-presets";
import type { BuildIntent } from "@/lib/builder/build-intent";

export type PromptAssistConfig = {
  model: string;
  deep: boolean;
  imageGenerations: boolean;
  buildIntent?: BuildIntent;
  themeColors?: ThemeColors | null;
};

export type InitBriefOptions = {
  forceDeepBrief?: boolean;
  modelOverride?: string;
  /**
   * P22: chat id för follow-up-detektion. När satt + `forceDeepBrief` kastar
   * `useInitBrief` — Deep Brief ska bara köras vid init (innan chatten finns).
   */
  chatId?: string | null;
};
