import { createXai } from "@ai-sdk/xai";

export const modelIds = ["grok-2-1212", "grok-2-vision-1212", "grok-beta"] as const;
export type ModelID = (typeof modelIds)[number];

const xai = createXai({
  apiKey: process.env.XAI_API_KEY,
});

export const defaultModel: ModelID = "grok-2-1212";

export function getLanguageModel(modelId: ModelID = defaultModel) {
  return xai(modelId);
}
