import { describe, expect, it } from "vitest";

import { parseSSEBuffer } from "./route-helpers";
import { createCodeGenSSEStream } from "./stream-format";

type StreamPart = {
  type: string;
  text?: string;
  textDelta?: string;
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
});
