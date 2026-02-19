export interface StreamEvent {
  type:
    | "thinking"
    | "content"
    | "parts"
    | "integration"
    | "done"
    | "error"
    | "chatId"
    | "projectId";
  data: unknown;
}

export function createSSEHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}

export function formatSSEEvent(event: string, data: unknown): string {
  const jsonData = JSON.stringify(data ?? null);
  return `event: ${event}\ndata: ${jsonData}\n\n`;
}
