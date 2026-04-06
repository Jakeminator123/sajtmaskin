import { streamText, type ModelMessage, type ToolSet } from "ai";

import { ENGINE_MAX_OUTPUT_TOKENS } from "./defaults";
import { getOpenAIModel, DEFAULT_MODEL, isAnthropicModel } from "./models";
import {
  buildUserPromptContent,
  type RequestAttachment,
} from "./request-metadata";
import { createCodeGenSSEStream, type StreamMeta } from "./stream-format";

export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

export interface GenerateOptions {
  prompt: string;
  systemPrompt: string;
  model?: string;
  chatHistory?: ModelMessage[];
  thinking?: boolean;
  reasoningEffort?: ReasoningEffort;
  maxTokens?: number;
  abortSignal?: AbortSignal;
  tools?: ToolSet;
  maxSteps?: number;
  referenceAttachments?: RequestAttachment[];
}

/**
 * Generates code from a prompt using AI SDK wrappers over direct
 * OpenAI/Anthropic provider calls.
 *
 * After this stream completes, `finalizeAndSaveVersion` runs the ordered
 * post-stream phases in `finalize-pipeline-contract.ts` (autofix → URLs →
 * images → syntax validate/fix → optional verifier LLM → merge/preflight/persist).
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
  const defaultThinkingEnabled = process.env.SAJTMASKIN_SHOW_THINKING === "true";
  const {
    prompt,
    systemPrompt,
    model: modelId,
    chatHistory,
    thinking,
    reasoningEffort = "medium",
    maxTokens,
    abortSignal,
    tools,
    maxSteps,
    referenceAttachments,
  } = options;
  const resolvedThinking = thinking ?? defaultThinkingEnabled;

  const model = getOpenAIModel(modelId ?? DEFAULT_MODEL);

  const messages = [
    ...(chatHistory ?? []),
    { role: "user" as const, content: buildUserPromptContent(prompt, referenceAttachments) },
  ];

  const resolvedId = modelId ?? DEFAULT_MODEL;
  const anthropic = isAnthropicModel(resolvedId);
  const internalAbortController = abortSignal ? null : new AbortController();
  const resolvedAbortSignal = abortSignal ?? internalAbortController!.signal;

  const providerOptions =
    resolvedThinking && !anthropic
      ? { openai: { reasoningEffort } }
      : undefined;

  const result = streamText({
    model,
    system: systemPrompt,
    messages: messages as ModelMessage[],
    maxOutputTokens: maxTokens ?? ENGINE_MAX_OUTPUT_TOKENS,
    abortSignal: resolvedAbortSignal,
    ...(tools ? { tools, maxSteps: maxSteps ?? 4 } : {}),
    ...(providerOptions ? { providerOptions } : {}),
  });

  return createCodeGenSSEStream(result, {
    thinking: resolvedThinking,
    meta,
    abortController: internalAbortController ?? undefined,
  });
}
