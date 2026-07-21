/**
 * QA short-circuit for follow-up requests classified as `qa-or-score`:
 * answers the user's question with a small direct LLM call instead of a
 * full codegen round. Extracted verbatim from `chat-message-stream-post.ts`.
 */
import { generateText } from "ai";
import { createDirectModel } from "@/lib/builder/direct-model";
import {
  canonicalModelIdToOwnModelId,
  DEFAULT_MODEL_ID,
} from "@/lib/models/catalog";
import { formatSSEEvent } from "@/lib/streaming";

const QA_SHORTCIRCUIT_MODEL = canonicalModelIdToOwnModelId(DEFAULT_MODEL_ID);

export async function generateQaShortCircuitText(params: {
  optimizedMessage: string;
  signal: AbortSignal;
}): Promise<string> {
  const result = await generateText({
    model: createDirectModel(QA_SHORTCIRCUIT_MODEL),
    abortSignal: params.signal,
    prompt:
      "Användaren har ställt en fråga om sin sajt. Svara koncist (max 4 meningar) baserat på följande kontext:\n\n" +
      params.optimizedMessage,
  });
  return result.text.trim();
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
