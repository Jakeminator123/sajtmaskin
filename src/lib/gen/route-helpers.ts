import {
  createBuilderStreamEvent,
  isBuilderStreamEventName,
  type BuilderStreamEvent,
} from "@/lib/gen/stream/builder-stream-contract";
import type { SuspenseRule, StreamContext } from "@/lib/gen/suspense/transform";
import { createDefaultRules } from "@/lib/gen/suspense/default-rules";

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

export type EngineSSEEvent = BuilderStreamEvent;

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
      if (isBuilderStreamEventName(currentEvent)) {
        events.push(createBuilderStreamEvent(currentEvent, data));
      }
    } catch {
      if (isBuilderStreamEventName(currentEvent)) {
        events.push(createBuilderStreamEvent(currentEvent, rawData));
      }
    }
    currentEvent = "";
  }

  return { events, remaining };
}
