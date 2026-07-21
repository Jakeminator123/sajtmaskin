/**
 * F3 close-out SSE streams. Extracted verbatim from
 * `chat-message-stream-post.ts`.
 */
import { previewUrlField } from "@/lib/api/preview-url-contract";
import { F3_REJECT_ACK_REASON } from "@/lib/gen/stream/f3-continuation";
import { formatSSEEvent } from "@/lib/streaming";

/**
 * Calm F3 reject close-out (P2 F3-loop, åtgärd 4): short confirmation +
 * `done` with a dedicated reason so the client renders a normal assistant
 * message instead of the "generation ended without version" failure path.
 * No own-engine generation runs — the observed reject flow produced a
 * fully silent generation (`toolCalls: []`, no text) and then re-asked
 * the same question.
 */
export function buildF3RejectAckStream(params: {
  chatId: string;
  text: string;
  /** `done.reason` — defaults to the calm reject ack; the nothing-to-build
   * honest close (fix 5b) reuses the same stream shape with its own reason. */
  reason?: string;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(formatSSEEvent("chatId", { id: params.chatId })));
      controller.enqueue(encoder.encode(formatSSEEvent("content", { text: params.text })));
      controller.enqueue(
        encoder.encode(
          formatSSEEvent("done", {
            chatId: params.chatId,
            versionId: null,
            messageId: null,
            ...previewUrlField(null),
            awaitingInput: false,
            reason: params.reason ?? F3_REJECT_ACK_REASON,
          }),
        ),
      );
      controller.close();
    },
  });
}
