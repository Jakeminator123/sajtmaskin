export interface StreamEvent {
  type: "thinking" | "content" | "file" | "done" | "error";
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
  const jsonData = typeof data === "string" ? data : JSON.stringify(data);
  return `event: ${event}\ndata: ${jsonData}\n\n`;
}
