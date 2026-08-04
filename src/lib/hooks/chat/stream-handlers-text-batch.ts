import type { SetMessages } from "./types";

/**
 * rAF-batched streaming-text flush (content/thinking).
 * Accumulation stays synchronous (merge, stats and progressive-preview
 * detection unchanged); only the React `setMessages` for the growing text
 * is coalesced to ~1 frame. Any NON-text event flushes first and the
 * `finally` flushes the tail, so ordering/precedence vs the done/parts/error
 * handlers is identical to the pre-batch (synchronous) behavior.
 */
export function createStreamingTextBatcher(params: {
  setMessages: SetMessages;
  assistantMessageId: string;
  getAccumulatedContent: () => string;
  getAccumulatedThinking: () => string;
}) {
  const { setMessages, assistantMessageId, getAccumulatedContent, getAccumulatedThinking } =
    params;

  let pendingContentFlush = false;
  let pendingThinkingFlush = false;
  let streamingTextFrame: number | null = null;

  const scheduleStreamingTextFrame =
    typeof requestAnimationFrame === "function"
      ? (cb: () => void): number => requestAnimationFrame(cb)
      : (cb: () => void): number => setTimeout(cb, 16) as unknown as number;
  const cancelStreamingTextFrame =
    typeof cancelAnimationFrame === "function"
      ? (handle: number): void => cancelAnimationFrame(handle)
      : (handle: number): void =>
          clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);

  const applyStreamingText = () => {
    streamingTextFrame = null;
    const flushContent = pendingContentFlush;
    const flushThinking = pendingThinkingFlush;
    pendingContentFlush = false;
    pendingThinkingFlush = false;
    if (!flushContent && !flushThinking) return;
    const accumulatedContent = getAccumulatedContent();
    const accumulatedThinking = getAccumulatedThinking();
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantMessageId
          ? {
              ...m,
              ...(flushContent ? { content: accumulatedContent } : {}),
              ...(flushThinking ? { thinking: accumulatedThinking } : {}),
              isStreaming: true,
            }
          : m,
      ),
    );
  };

  const requestStreamingTextFlush = (kind: "content" | "thinking") => {
    if (kind === "content") pendingContentFlush = true;
    else pendingThinkingFlush = true;
    if (streamingTextFrame === null) {
      streamingTextFrame = scheduleStreamingTextFrame(applyStreamingText);
    }
  };

  const flushStreamingTextNow = () => {
    if (streamingTextFrame !== null) {
      cancelStreamingTextFrame(streamingTextFrame);
      streamingTextFrame = null;
    }
    applyStreamingText();
  };

  return { requestStreamingTextFlush, flushStreamingTextNow };
}
