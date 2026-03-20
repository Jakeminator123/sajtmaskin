import { streamText, type ModelMessage, type ToolSet } from "ai";

import {
  getEngineMaxOutputTokens,
  getReasoningEffort,
} from "./defaults";
import { getOpenAIModel, DEFAULT_MODEL } from "./models";
import {
  buildUserPromptContent,
  type RequestAttachment,
} from "./request-metadata";
import { createCodeGenSSEStream, type StreamMeta } from "./stream-format";
import { debugLog } from "@/lib/utils/debug";

export interface GenerateOptions {
  prompt: string;
  systemPrompt: string;
  model?: string;
  modelTier?: string;
  chatHistory?: ModelMessage[];
  thinking?: boolean;
  maxTokens?: number;
  abortSignal?: AbortSignal;
  tools?: ToolSet;
  maxSteps?: number;
  referenceAttachments?: RequestAttachment[];
}

/**
 * Generates code from a prompt using AI SDK + OpenAI.
 *
 * Returns a ReadableStream of SSE events:
 *  `meta`     — chat/version metadata
 *  `thinking` — model reasoning (when thinking=true)
 *  `content`  — generated code/text
 *  `tool-call` — when the model invokes an agent tool
 *  `done`     — completion with token usage
 *  `error`    — if generation fails
 */
export function generateCode(
  options: GenerateOptions,
  meta?: StreamMeta,
): ReadableStream<Uint8Array> {
  const {
    prompt,
    systemPrompt,
    model: modelId,
    modelTier,
    chatHistory,
    thinking = true,
    maxTokens,
    abortSignal,
    tools,
    maxSteps,
    referenceAttachments,
  } = options;

  const model = getOpenAIModel(modelId ?? DEFAULT_MODEL);
  const resolvedMaxTokens = maxTokens ?? getEngineMaxOutputTokens(modelTier);
  const reasoningEffort = getReasoningEffort(modelTier, thinking);
  const isAnthropicModel = (modelId ?? DEFAULT_MODEL).startsWith("claude-");

  debugLog("engine", "Generation config", {
    modelId: modelId ?? DEFAULT_MODEL,
    modelTier,
    maxOutputTokens: resolvedMaxTokens,
    reasoningEffort: isAnthropicModel ? undefined : reasoningEffort,
    anthropicThinking: isAnthropicModel && thinking ? "adaptive" : undefined,
    thinking,
  });

  const messages = [
    ...(chatHistory ?? []),
    { role: "user" as const, content: buildUserPromptContent(prompt, referenceAttachments) },
  ];

  // OpenAI: reasoning effort when Thinking is on. Claude: extended thinking (adaptive) on same flag.
  // (Avoid a single ternary — TS would infer `openai?: undefined` on the Anthropic branch and reject SharedV3ProviderOptions.)
  const baseCall = {
    model,
    system: systemPrompt,
    messages: messages as ModelMessage[],
    maxOutputTokens: resolvedMaxTokens,
    abortSignal,
    ...(tools ? { tools, maxSteps: maxSteps ?? 2 } : {}),
  };

  const result = streamText(
    isAnthropicModel && thinking
      ? {
          ...baseCall,
          providerOptions: { anthropic: { thinking: { type: "adaptive" as const } } },
        }
      : !isAnthropicModel && reasoningEffort !== "none"
        ? {
            ...baseCall,
            providerOptions: { openai: { reasoningEffort } },
          }
        : baseCall,
  );

  return createCodeGenSSEStream(result, { thinking, meta });
}
