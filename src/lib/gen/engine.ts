import { streamText, type ModelMessage, type ToolSet } from "ai";

import { resolveBuildMaxOutputTokens } from "./defaults";
import { buildOpenAIReasoningProviderOptions } from "./openai-reasoning";
import { getOpenAIModel, DEFAULT_MODEL } from "./models";
import {
  buildUserPromptContent,
  type RequestAttachment,
} from "./request-metadata";
import { createCodeGenSSEStream, type StreamMeta } from "./stream-format";

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

  const resolvedModelId = modelId ?? DEFAULT_MODEL;
  const model = getOpenAIModel(resolvedModelId);

  const messages = [
    ...(chatHistory ?? []),
    { role: "user" as const, content: buildUserPromptContent(prompt, referenceAttachments) },
  ];

  const reasoningOpts = buildOpenAIReasoningProviderOptions(
    resolvedModelId,
    modelTier,
    thinking,
  );

  const result = streamText({
    model,
    system: systemPrompt,
    messages: messages as ModelMessage[],
    maxOutputTokens: maxTokens ?? resolveBuildMaxOutputTokens(modelTier),
    abortSignal,
    ...reasoningOpts,
    ...(tools ? { tools, maxSteps: maxSteps ?? 2 } : {}),
  });

  return createCodeGenSSEStream(result, { thinking, meta });
}
