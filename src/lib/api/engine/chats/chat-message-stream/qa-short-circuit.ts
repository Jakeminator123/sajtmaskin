/**
 * QA short-circuit for follow-up requests classified as `qa-or-score`:
 * answers the user's question with a small direct LLM call instead of a
 * full codegen round. Extracted from `chat-message-stream-post.ts`.
 *
 * Empty text and provider failures record one usage row and throw;
 * they never become a codegen prompt.
 */
import { generateText } from "ai";
import { createDirectModel } from "@/lib/builder/direct-model";
import { getWorkloadDefaultModelFromManifest } from "@/lib/ai-models/load-manifest";
import { workloadOpenAIProviderOptions } from "@/lib/ai-models/workload-reasoning";
import {
  aliasRetiredModelId,
  canonicalModelIdToOwnModelId,
  DEFAULT_MODEL_ID,
} from "@/lib/models/catalog";
import { recordLlmUsage } from "@/lib/observability/llm-usage";
import { formatSSEEvent } from "@/lib/streaming";

const QA_SHORT_CIRCUIT_WORKLOAD = "qa_short_circuit";

export async function generateQaShortCircuitText(params: {
  optimizedMessage: string;
  signal: AbortSignal;
}): Promise<string> {
  const startedAt = Date.now();
  const modelId = aliasRetiredModelId(
    getWorkloadDefaultModelFromManifest(QA_SHORT_CIRCUIT_WORKLOAD) ??
      canonicalModelIdToOwnModelId(DEFAULT_MODEL_ID),
  );
  let usageRecorded = false;
  try {
    const result = await generateText({
      model: createDirectModel(modelId),
      abortSignal: params.signal,
      // Reasoning shares the output budget; leave room for the visible answer.
      maxOutputTokens: 8192,
      ...workloadOpenAIProviderOptions(QA_SHORT_CIRCUIT_WORKLOAD, modelId),
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

