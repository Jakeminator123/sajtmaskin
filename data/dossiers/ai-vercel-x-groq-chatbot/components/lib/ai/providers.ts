import { groq } from "@ai-sdk/groq";

export const groqModels = {
  fast: "llama-3.1-8b-instant",
  balanced: "llama-3.3-70b-versatile",
} as const;

export type GroqModelId = (typeof groqModels)[keyof typeof groqModels];

export const defaultGroqModel: GroqModelId = groqModels.fast;

export function getGroqModel(modelId: GroqModelId = defaultGroqModel) {
  return groq(modelId);
}
