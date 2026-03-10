import { createSSEHeaders } from "@/lib/streaming";
import type { SuspenseRule, StreamContext } from "@/lib/gen/suspense";
import { createDefaultRules } from "@/lib/gen/suspense";

// ---------------------------------------------------------------------------
// SSE Response builder
// ---------------------------------------------------------------------------

export function buildSseResponse(
  stream: ReadableStream<Uint8Array>,
  sessionCookie?: string,
): Response {
  const headers = new Headers(createSSEHeaders());
  if (sessionCookie) {
    headers.set("Set-Cookie", sessionCookie);
  }
  return new Response(stream, { headers });
}

// ---------------------------------------------------------------------------
// Request parser
// ---------------------------------------------------------------------------

export interface ParsedGenerationRequest {
  message: string;
  attachments?: Array<{ url: string }>;
  system?: string;
  projectId?: string;
  modelId?: string;
  thinking?: boolean;
  imageGenerations?: boolean;
  chatPrivacy?: string;
  designSystemId?: string;
  meta?: Record<string, unknown>;
}

export function parseGenerationRequest(
  body: Record<string, unknown>,
): ParsedGenerationRequest {
  return {
    message: typeof body.message === "string" ? body.message : "",
    attachments: Array.isArray(body.attachments)
      ? (body.attachments as Array<{ url: string }>)
      : undefined,
    system: typeof body.system === "string" ? body.system : undefined,
    projectId: typeof body.projectId === "string" ? body.projectId : undefined,
    modelId: typeof body.modelId === "string" ? body.modelId : undefined,
    thinking: typeof body.thinking === "boolean" ? body.thinking : undefined,
    imageGenerations:
      typeof body.imageGenerations === "boolean"
        ? body.imageGenerations
        : undefined,
    chatPrivacy:
      typeof body.chatPrivacy === "string" ? body.chatPrivacy : undefined,
    designSystemId:
      typeof body.designSystemId === "string"
        ? body.designSystemId
        : undefined,
    meta:
      typeof body.meta === "object" && body.meta !== null
        ? (body.meta as Record<string, unknown>)
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// Line-level suspense processor
// ---------------------------------------------------------------------------

/**
 * Buffers text at the line level and applies suspense rules to complete lines.
 * Partial lines are held in an internal buffer until a newline arrives.
 */
export class SuspenseLineProcessor {
  private buffer = "";
  private rules: SuspenseRule[];
  private context: StreamContext;

  constructor(rules?: SuspenseRule[], context?: StreamContext) {
    this.rules = rules ?? createDefaultRules();
    this.context = context ?? {};
  }

  process(text: string): string {
    this.buffer += text;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    let result = "";
    for (const line of lines) {
      result += this.applyRules(line) + "\n";
    }
    return result;
  }

  flush(): string {
    if (!this.buffer) return "";
    const processed = this.applyRules(this.buffer);
    this.buffer = "";
    return processed;
  }

  private applyRules(line: string): string {
    let result = line;
    for (const rule of this.rules) {
      try {
        result = rule.transform(result, this.context);
      } catch {
        // Rule failed — pass through unchanged to avoid corrupting stream.
      }
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// SSE event parser for engine output
// ---------------------------------------------------------------------------

export interface EngineSSEEvent {
  event: string;
  data: unknown;
}

/**
 * Parse SSE events from a buffer. Returns parsed events and any remaining
 * incomplete data still in the buffer.
 */
export function parseSSEBuffer(buffer: string): {
  events: EngineSSEEvent[];
  remaining: string;
} {
  const events: EngineSSEEvent[] = [];
  const lines = buffer.split("\n");
  const remaining = lines.pop() ?? "";

  let currentEvent = "";
  for (const line of lines) {
    if (line.startsWith("event:")) {
      currentEvent = line.slice(6).trim();
      continue;
    }
    if (!line.startsWith("data:")) continue;

    let rawData = line.slice(5);
    if (rawData.startsWith(" ")) rawData = rawData.slice(1);
    if (rawData.endsWith("\r")) rawData = rawData.slice(0, -1);

    try {
      const data = JSON.parse(rawData);
      events.push({ event: currentEvent, data });
    } catch {
      events.push({ event: currentEvent, data: rawData });
    }
    currentEvent = "";
  }

  return { events, remaining };
}

// ---------------------------------------------------------------------------
// Re-export formatSSEEvent for convenience
// ---------------------------------------------------------------------------

export { formatSSEEvent } from "@/lib/streaming";
