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

async function collectEvents(parts: StreamPart[], options?: { thinking?: boolean }) {
  const stream = createCodeGenSSEStream(createResult(parts), {
    meta: { chatId: "chat_test" },
    thinking: options?.thinking,
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
  it("propagates consumer cancellation through abort controller", async () => {
    const abortController = new AbortController();
    const stream = createCodeGenSSEStream(createResult([{ type: "start" }]), {
      abortController,
    });

    const reader = stream.getReader();
    await reader.cancel("test-cancel");

    expect(abortController.signal.aborted).toBe(true);
  });

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

  it("uses monotonic fallback keys for tool calls without toolCallId", async () => {
    const events = await collectEvents([
      {
        type: "tool-input-start",
        toolName: "requestEnvVar",
      },
      {
        type: "tool-input-delta",
        toolName: "requestEnvVar",
        inputTextDelta: '{"key":"FIRST"}',
      },
      {
        type: "tool-call",
        toolName: "requestEnvVar",
      },
      {
        type: "tool-input-start",
        toolName: "requestEnvVar",
      },
      {
        type: "tool-input-delta",
        toolName: "requestEnvVar",
        inputTextDelta: '{"key":"SECOND"}',
      },
      {
        type: "tool-call",
        toolName: "requestEnvVar",
      },
    ]);

    const toolEvents = events.filter((event) => event.event === "tool-call");
    expect(toolEvents).toHaveLength(2);
    expect(toolEvents[0]?.data).toEqual({
      toolName: "requestEnvVar",
      toolCallId: "tool:requestEnvVar:1",
      args: {
        key: "FIRST",
      },
    });
    expect(toolEvents[1]?.data).toEqual({
      toolName: "requestEnvVar",
      toolCallId: "tool:requestEnvVar:2",
      args: {
        key: "SECOND",
      },
    });
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

  it("emits generation done progress with stream timing metrics", async () => {
    const events = await collectEvents([
      { type: "start" },
      { type: "reasoning-start" },
      { type: "reasoning-delta", reasoningDelta: "thinking..." },
      { type: "text-start" },
      { type: "text-delta", textDelta: "<main>Hello</main>" },
      { type: "finish" },
    ]);

    const generationDoneProgress = events.find(
      (event) =>
        event.event === "progress" &&
        typeof event.data === "object" &&
        event.data !== null &&
        (event.data as Record<string, unknown>).step === "generation" &&
        (event.data as Record<string, unknown>).phase === "done",
    );
    expect(generationDoneProgress).toBeTruthy();
    const payload = generationDoneProgress?.data as Record<string, unknown> | undefined;
    expect(typeof payload?.durationMs).toBe("number");
    expect(typeof payload?.reasoningMs).toBe("number");
    expect(typeof payload?.outputMs).toBe("number");
    expect(Number(payload?.durationMs ?? -1)).toBeGreaterThanOrEqual(0);
    expect(Number(payload?.reasoningMs ?? -1)).toBeGreaterThanOrEqual(0);
    expect(Number(payload?.outputMs ?? -1)).toBeGreaterThanOrEqual(0);
  });

  it("strips leaked leading thinking blocks when thinking is disabled", async () => {
    const events = await collectEvents(
      [
        { type: "start" },
        { type: "text-start" },
        { type: "text-delta", textDelta: "<Thinking>\nprivate chain" },
        {
          type: "text-delta",
          textDelta: " details</Thinking>\n```tsx file=\"app/page.tsx\"\nexport default function Page() { return null; }\n```",
        },
        { type: "finish" },
      ],
      { thinking: false },
    );

    const contentText = events
      .filter((event) => event.event === "content")
      .map((event) =>
        typeof event.data === "object" && event.data !== null
          ? String((event.data as Record<string, unknown>).text ?? "")
          : "",
      )
      .join("");

    expect(contentText).not.toContain("<Thinking>");
    expect(contentText).not.toContain("private chain");
    expect(contentText).toContain("```tsx file=\"app/page.tsx\"");
  });

  it("keeps leading thinking-tagged text when thinking is enabled", async () => {
    const events = await collectEvents(
      [
        { type: "start" },
        { type: "text-start" },
        {
          type: "text-delta",
          textDelta: "<Thinking>\nprivate chain</Thinking>\nVisible output",
        },
        { type: "finish" },
      ],
      { thinking: true },
    );

    const contentText = events
      .filter((event) => event.event === "content")
      .map((event) =>
        typeof event.data === "object" && event.data !== null
          ? String((event.data as Record<string, unknown>).text ?? "")
          : "",
      )
      .join("");

    expect(contentText).toContain("<Thinking>");
    expect(contentText).toContain("Visible output");
  });
});
