import { streamText, type ModelMessage, type ToolSet } from "ai";

import { ENGINE_MAX_OUTPUT_TOKENS } from "./defaults";
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
    chatHistory,
    thinking = true,
    maxTokens,
    abortSignal,
    tools,
    maxSteps,
    referenceAttachments,
  } = options;

  const model = getOpenAIModel(modelId ?? DEFAULT_MODEL);

  const messages = [
    ...(chatHistory ?? []),
    { role: "user" as const, content: buildUserPromptContent(prompt, referenceAttachments) },
  ];

  const result = streamText({
    model,
    system: systemPrompt,
    messages: messages as ModelMessage[],
    maxOutputTokens: maxTokens ?? ENGINE_MAX_OUTPUT_TOKENS,
    abortSignal,
    ...(tools ? { tools, maxSteps: maxSteps ?? 2 } : {}),
  });

  return createCodeGenSSEStream(result, { thinking, meta });
}
