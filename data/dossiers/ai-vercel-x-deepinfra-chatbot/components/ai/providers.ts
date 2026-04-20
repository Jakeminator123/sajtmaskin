import { createDeepInfra } from "@ai-sdk/deepinfra";

const deepinfra = createDeepInfra({
  apiKey: process.env.DEEPINFRA_API_KEY,
});

export const modelIds = [
  "meta-llama/Meta-Llama-3.1-8B-Instruct",
  "meta-llama/Meta-Llama-3.1-70B-Instruct",
] as const;

export type modelID = (typeof modelIds)[number];

export const defaultModel: modelID = "meta-llama/Meta-Llama-3.1-8B-Instruct";

export const model = {
  languageModel: (id: modelID) => deepinfra(id),
};
