import { streamText, type ModelMessage } from "ai";

import { getOpenAIModel, DEFAULT_MODEL } from "./models";
import { createCodeGenSSEStream, type StreamMeta } from "./stream-format";

export interface GenerateOptions {
  prompt: string;
  systemPrompt: string;
  model?: string;
  chatHistory?: ModelMessage[];
  thinking?: boolean;
  maxTokens?: number;
  abortSignal?: AbortSignal;
}

const DEFAULT_MAX_TOKENS = 16_384;

/**
 * Generates code from a prompt using AI SDK + OpenAI.
 *
 * Returns a ReadableStream of SSE events:
 *  `meta`     — chat/version metadata
 *  `thinking` — model reasoning (when thinking=true)
 *  `content`  — generated code/text
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
  } = options;

  const model = getOpenAIModel(modelId ?? DEFAULT_MODEL);

  const messages: ModelMessage[] = [
    ...(chatHistory ?? []),
    { role: "user", content: prompt },
  ];

  const result = streamText({
    model,
    system: systemPrompt,
    messages,
    maxOutputTokens: maxTokens ?? DEFAULT_MAX_TOKENS,
    abortSignal,
  });

  return createCodeGenSSEStream(result, { thinking, meta });
}
