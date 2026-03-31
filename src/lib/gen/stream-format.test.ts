import { describe, expect, it } from "vitest";

import { parseSSEBuffer } from "./route-helpers";
import { createCodeGenSSEStream } from "./stream-format";

type StreamPart = {
  type: string;
  text?: string;
  textDelta?: string;
  reasoning?: string;
  reasoningDelta?: string;
  toolName?: string;
  toolCallId?: string;
  args?: Record<string, unknown>;
  input?: unknown;
  inputText?: string;
  inputTextDelta?: string;
};

function createResult(parts: StreamPart[]) {
  return {
    fullStream: (async function* () {
      for (const part of parts) {
        yield part;
      }
    })(),
    usage: Promise.resolve({ inputTokens: 11, outputTokens: 7 }),
  };
}

async function collectEvents(parts: StreamPart[]) {
  const stream = createCodeGenSSEStream(createResult(parts), {
    meta: { chatId: "chat_test" },
  });
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: Array<{ event: string; data: unknown }> = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSSEBuffer(buffer);
    events.push(...parsed.events);
    buffer = parsed.remaining;
  }

  if (buffer.trim()) {
    const parsed = parseSSEBuffer(`${buffer}\n`);
    events.push(...parsed.events);
  }

  return events;
}

describe("createCodeGenSSEStream", () => {
  it("rebuilds streamed tool input into a tool-call event", async () => {
    const events = await collectEvents([
      {
        type: "tool-input-start",
        toolName: "suggestIntegration",
        toolCallId: "tool-1",
      },
      {
        type: "tool-input-delta",
        toolName: "suggestIntegration",
        toolCallId: "tool-1",
        inputTextDelta: '{"name":"Supabase","provider":"supabase",',
      },
      {
        type: "tool-input-delta",
        toolName: "suggestIntegration",
        toolCallId: "tool-1",
        inputTextDelta:
          '"envVars":["SUPABASE_URL","SUPABASE_ANON_KEY"],"reason":"Store leads"}',
      },
      {
        type: "tool-call",
        toolName: "suggestIntegration",
        toolCallId: "tool-1",
      },
    ]);

    const toolEvent = events.find((event) => event.event === "tool-call");
    expect(toolEvent).toBeTruthy();
    expect(toolEvent?.data).toEqual({
      toolName: "suggestIntegration",
      toolCallId: "tool-1",
      args: {
        name: "Supabase",
        provider: "supabase",
        envVars: ["SUPABASE_URL", "SUPABASE_ANON_KEY"],
        reason: "Store leads",
      },
    });
  });

  it("flushes buffered tool input even if the tool-call event never arrives", async () => {
    const events = await collectEvents([
      {
        type: "tool-input-start",
        toolName: "requestEnvVar",
        toolCallId: "tool-2",
      },
      {
        type: "tool-input-delta",
        toolName: "requestEnvVar",
        toolCallId: "tool-2",
        inputTextDelta: '{"key":"SUPABASE_SERVICE_ROLE_KEY","description":"Admin writes"}',
      },
    ]);

    const toolEvent = events.find((event) => event.event === "tool-call");
    expect(toolEvent?.data).toEqual({
      toolName: "requestEnvVar",
      toolCallId: "tool-2",
      args: {
        key: "SUPABASE_SERVICE_ROLE_KEY",
        description: "Admin writes",
      },
    });

    const doneEvent = events.at(-1);
    expect(doneEvent?.event).toBe("done");
  });

  it("emits progress and an explicit silent-output error when no text events arrive", async () => {
    const events = await collectEvents([
      { type: "start" },
      { type: "reasoning-start" },
      { type: "reasoning-end" },
      { type: "finish" },
    ]);

    expect(
      events.some(
        (event) =>
          event.event === "progress" &&
          typeof event.data === "object" &&
          event.data !== null &&
          (event.data as Record<string, unknown>).step === "generation" &&
          (event.data as Record<string, unknown>).phase === "start",
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.event === "progress" &&
          typeof event.data === "object" &&
          event.data !== null &&
          (event.data as Record<string, unknown>).phase === "empty-output",
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.event === "error" &&
          typeof event.data === "object" &&
          event.data !== null &&
          String((event.data as Record<string, unknown>).message).includes("no text events"),
      ),
    ).toBe(true);
    expect(events.at(-1)?.event).toBe("done");
  });
});
