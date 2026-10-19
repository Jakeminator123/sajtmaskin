/**
 * QA short-circuit for follow-up requests classified as `qa-or-score`:
 * answers the user's question with a small direct LLM call instead of a
 * full codegen round. Extracted from `chat-message-stream-post.ts`.
 *
 * Model and effort come from the `qa_short_circuit` workload when the
 * manifest defines it. Empty text and provider failures record one usage
 * row and throw; they never become a codegen prompt.
 */
import { generateText } from "ai";
import { getWorkloadDefaultModelFromManifest } from "@/lib/ai-models/load-manifest";
import { workloadOpenAIProviderOptions } from "@/lib/ai-models/workload-reasoning";
import { createDirectModel } from "@/lib/builder/direct-model";
import {
  canonicalModelIdToOwnModelId,
  DEFAULT_MODEL_ID,
} from "@/lib/models/catalog";
import { recordLlmUsage } from "@/lib/observability/llm-usage";
import { formatSSEEvent } from "@/lib/streaming";

const QA_SHORT_CIRCUIT_WORKLOAD = "qa_short_circuit";
const QA_MAX_OUTPUT_TOKENS = 8192;
const QA_MAX_RETRIES = 0;

export async function generateQaShortCircuitText(params: {
  optimizedMessage: string;
  signal: AbortSignal;
}): Promise<string> {
  const startedAt = Date.now();
  const modelId =
    getWorkloadDefaultModelFromManifest(QA_SHORT_CIRCUIT_WORKLOAD) ??
    canonicalModelIdToOwnModelId(DEFAULT_MODEL_ID);
  const openAIOptions = workloadOpenAIProviderOptions(QA_SHORT_CIRCUIT_WORKLOAD, modelId);
  const effort = openAIOptions.providerOptions?.openai.reasoningEffort ?? null;
  const meta = {
    requestedModel: modelId,
    effectiveModel: modelId,
    effort,
    maxOutputTokens: QA_MAX_OUTPUT_TOKENS,
    maxRetries: QA_MAX_RETRIES,
  };
  let usageRecorded = false;
  try {
    const result = await generateText({
      model: createDirectModel(modelId),
      ...openAIOptions,
      abortSignal: params.signal,
      maxOutputTokens: QA_MAX_OUTPUT_TOKENS,
      maxRetries: QA_MAX_RETRIES,
      prompt:
        "Användaren har ställt en fråga om sin sajt. Svara koncist (max 4 meningar) baserat på följande kontext:\n\n" +
        params.optimizedMessage,
    });
    const text = typeof result.text === "string" ? result.text.trim() : "";
    if (!text) {
      recordLlmUsage({
        phase: "qa",
        workload: QA_SHORT_CIRCUIT_WORKLOAD,
        model: modelId,
        usage: result.usage,
        durationMs: Date.now() - startedAt,
        ok: false,
        errorCode: "empty_qa_text",
        meta,
      });
      usageRecorded = true;
      throw new Error("QA short-circuit returned empty text");
    }
    recordLlmUsage({
      phase: "qa",
      workload: QA_SHORT_CIRCUIT_WORKLOAD,
      model: modelId,
      usage: result.usage,
      durationMs: Date.now() - startedAt,
      meta,
    });
    usageRecorded = true;
    return text;
  } catch (err) {
    if (!usageRecorded) {
      const errorObject =
        err && typeof err === "object" ? (err as { usage?: unknown; name?: unknown }) : null;
      recordLlmUsage({
        phase: "qa",
        workload: QA_SHORT_CIRCUIT_WORKLOAD,
        model: modelId,
        usage: errorObject && "usage" in errorObject ? errorObject.usage : undefined,
        durationMs: Date.now() - startedAt,
        ok: false,
        errorCode:
          errorObject && typeof errorObject.name === "string" && errorObject.name
            ? errorObject.name
            : "qa_failed",
        meta,
      });
    }
    throw err;
  }
}

export function buildQaShortCircuitStream(params: {
  chatId: string;
  text: string;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(formatSSEEvent("chatId", { id: params.chatId })));
      controller.enqueue(encoder.encode(formatSSEEvent("content", { text: params.text })));
      controller.enqueue(
        encoder.encode(formatSSEEvent("done", { chatId: params.chatId, versionId: null })),
      );
      controller.close();
    },
  });
}
