import { streamText, type ModelMessage, type ToolSet } from "ai";

import { ENGINE_MAX_OUTPUT_TOKENS } from "./defaults";
import { getDefaultThinkingEnabled } from "./default-thinking";
import { getOpenAIModel, DEFAULT_MODEL, isAnthropicModel } from "./models";
import {
  buildUserPromptContent,
  type RequestAttachment,
} from "./request-metadata";
import { createCodeGenSSEStream, type StreamMeta } from "./stream/stream-format";
import {
  assertSystemPromptShape,
  logAndMaybeThrowOnSystemPromptAssert,
} from "./system-prompt-assert";

export type { StreamMeta };
export type ReasoningEffort = "none" | "low" | "medium" | "high";
type JsonValue = null | string | number | boolean | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue | undefined };
type ProviderOptionsRecord = Record<string, JsonObject>;

export function toAnthropicEffort(
  effort: ReasoningEffort,
): "low" | "medium" | "high" {
  switch (effort) {
    case "none":
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
    default:
      return "high";
  }
}

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
  /**
   * Invoked once the underlying SSE stream completes (success, abort,
   * or error) with the concatenated reasoning emitted by the model
   * during the run. Callers wire this into the finalize step so the
   * chain-of-thought is persisted alongside the assistant message.
   */
  onAccumulatedThinking?: (thinkingText: string | null) => void;
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
  const defaultThinkingEnabled = getDefaultThinkingEnabled();
  const {
    prompt,
    systemPrompt,
    model: modelId,
    chatHistory,
    thinking,
    reasoningEffort = "high",
    maxTokens,
    abortSignal,
    tools,
    maxSteps,
    referenceAttachments,
    onAccumulatedThinking,
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

  let providerOptions: ProviderOptionsRecord | undefined;
  if (anthropic) {
    // Anthropic `effort` applies even without extended thinking, and for
    // Opus 4.8 an omitted effort defaults to `high`. The fixer/verifier phases
    // run with thinking:false to stay cheap/fast, so we must still pass `effort`
    // explicitly (with thinking disabled) — otherwise those calls silently run
    // at high effort/latency instead of the configured tier. (Codex P2, #283.)
    providerOptions = {
      anthropic: {
        thinking: resolvedThinking
          ? { type: "adaptive" as const }
          : { type: "disabled" as const },
        effort: toAnthropicEffort(reasoningEffort),
      },
    };
  } else if (resolvedThinking) {
    providerOptions = {
      openai: { reasoningEffort },
    };
  }

  // Pre-LLM systemprompt assertion — catches JSON-double-encoded leakage,
  // missing separator, unbalanced fences, etc. before we burn tokens on
  // a poisoned prompt. Soft by default (warns); set
  // `SAJTMASKIN_STRICT_SYSTEM_PROMPT_ASSERT=1` to fail loud.
  logAndMaybeThrowOnSystemPromptAssert(
    assertSystemPromptShape(systemPrompt),
    { chatId: meta?.chatId, phase: "engine.generateCode" },
  );

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
    onAccumulatedThinking,
  });
}

export interface PipelineOptions {
  prompt: string;
  systemPrompt: string;
  model?: string;
  chatHistory?: GenerateOptions["chatHistory"];
  thinking?: boolean;
  reasoningEffort?: ReasoningEffort;
  maxTokens?: number;
  abortSignal?: AbortSignal;
  tools?: ToolSet;
  maxSteps?: number;
  referenceAttachments?: GenerateOptions["referenceAttachments"];
  meta?: StreamMeta;
  onAccumulatedThinking?: GenerateOptions["onAccumulatedThinking"];
}

export function createGenerationPipeline(
  options: PipelineOptions,
): ReadableStream<Uint8Array> {
  return generateCode(
    {
      prompt: options.prompt,
      systemPrompt: options.systemPrompt,
      model: options.model,
      chatHistory: options.chatHistory,
      thinking: options.thinking,
      reasoningEffort: options.reasoningEffort,
      maxTokens: options.maxTokens,
      abortSignal: options.abortSignal,
      tools: options.tools,
      maxSteps: options.maxSteps,
      referenceAttachments: options.referenceAttachments,
      onAccumulatedThinking: options.onAccumulatedThinking,
    },
    options.meta,
  );
}
