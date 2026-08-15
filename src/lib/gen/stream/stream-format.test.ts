import { describe, expect, it } from "vitest";

import { parseSSEBuffer } from "./sse-parser";
import { computeStreamPhaseTiming, createCodeGenSSEStream } from "./stream-format";

type StreamPart = {
  type: string;
  text?: string;
  textDelta?: string;
  reasoning?: string;
  reasoningDelta?: string;
  error?: unknown;
  toolName?: string;
  toolCallId?: string;
  args?: Record<string, unknown>;
  input?: unknown;
  inputText?: string;
  inputTextDelta?: string;
  finishReason?: string | null;
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

async function collectFromReadableStream(stream: ReadableStream<Uint8Array>) {
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

async function collectEvents(parts: StreamPart[], options?: { thinking?: boolean }) {
  const stream = createCodeGenSSEStream(createResult(parts), {
    meta: { chatId: "chat_test" },
    thinking: options?.thinking,
  });
  return collectFromReadableStream(stream);
}

function generationDonePayload(events: Array<{ event: string; data: unknown }>) {
  const generationDoneProgress = events.find(
    (event) =>
      event.event === "progress" &&
      typeof event.data === "object" &&
      event.data !== null &&
      (event.data as Record<string, unknown>).step === "generation" &&
      (event.data as Record<string, unknown>).phase === "done",
  );
  return generationDoneProgress?.data as Record<string, unknown> | undefined;
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

  // Prod 2026-07-28: a revoked OPENAI_API_KEY surfaced as a bare message
  // string, so nothing downstream could tell an account failure apart from a
  // model that answered nothing — and the user was charged for it.
  it("forwards the provider's verdict (code + fault) on an error part, not just a message", async () => {
    const apiError = Object.assign(new Error("Incorrect API key provided: sk-proj-***abcd"), {
      statusCode: 401,
    });

    const events = await collectEvents([
      { type: "start" },
      { type: "error", error: apiError },
      { type: "finish" },
    ]);

    const errorEvent = events.find(
      (event) =>
        event.event === "error" &&
        typeof event.data === "object" &&
        event.data !== null &&
        (event.data as Record<string, unknown>).providerFault === true,
    );

    expect(errorEvent).toBeDefined();
    const data = errorEvent?.data as Record<string, unknown>;
    expect(String(data.message)).toMatch(/Ogiltig API-nyckel/);
    expect(data.permanent).toBe(true);
    // The raw provider text echoes the key's tail — it must not reach the chat.
    expect(String(data.message)).not.toMatch(/sk-proj/);
  });

  // Codex P1 on #641: the diagnosis above is worthless if the generic
  // empty-output error follows it. The client keeps only the LAST error event
  // and throws it on the versionless `done`, so a trailing generic line
  // silently replaces "your API key is invalid" with "no text events".
  it("does not bury the provider diagnosis under the generic empty-output error", async () => {
    const apiError = Object.assign(new Error("Incorrect API key provided"), { statusCode: 401 });

    const events = await collectEvents([
      { type: "start" },
      { type: "error", error: apiError },
      { type: "finish" },
    ]);

    const errorEvents = events.filter((event) => event.event === "error");
    expect(errorEvents).toHaveLength(1);

    const last = errorEvents.at(-1)?.data as Record<string, unknown>;
    expect(String(last.message)).toMatch(/Ogiltig API-nyckel/);
    expect(String(last.message)).not.toMatch(/no text events/i);

    // The phase itself is still reported — only the competing error is gone.
    expect(
      events.some(
        (event) =>
          event.event === "progress" &&
          (event.data as Record<string, unknown>).phase === "empty-output",
      ),
    ).toBe(true);
  });

  it("still explains a genuinely silent stream when no provider error was seen", async () => {
    const events = await collectEvents([
      { type: "start" },
      { type: "reasoning-start" },
      { type: "reasoning-end" },
      { type: "finish" },
    ]);

    const errorEvents = events.filter((event) => event.event === "error");
    expect(errorEvents).toHaveLength(1);
    expect(String((errorEvents[0]?.data as Record<string, unknown>).message)).toMatch(
      /no text events/i,
    );
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

    const payload = generationDonePayload(events);
    expect(payload).toBeTruthy();
    expect(typeof payload?.durationMs).toBe("number");
    expect(typeof payload?.waitMs).toBe("number");
    expect(typeof payload?.reasoningMs).toBe("number");
    expect(typeof payload?.outputMs).toBe("number");
    expect(Number(payload?.durationMs ?? -1)).toBeGreaterThanOrEqual(0);
    expect(Number(payload?.waitMs ?? -1)).toBeGreaterThanOrEqual(0);
    expect(Number(payload?.reasoningMs ?? -1)).toBeGreaterThanOrEqual(0);
    expect(Number(payload?.outputMs ?? -1)).toBeGreaterThanOrEqual(0);
  });

  it("keeps wait + reasoning + output within a small tolerance of durationMs", async () => {
    const stream = createCodeGenSSEStream(
      {
        fullStream: (async function* () {
          yield { type: "start" };
          await new Promise((resolve) => setTimeout(resolve, 40));
          yield { type: "reasoning-start" };
          yield { type: "reasoning-delta", reasoningDelta: "plan" };
          await new Promise((resolve) => setTimeout(resolve, 40));
          yield { type: "text-start" };
          yield { type: "text-delta", textDelta: "<main>Hello</main>" };
          await new Promise((resolve) => setTimeout(resolve, 30));
          yield { type: "finish" };
        })(),
        usage: Promise.resolve({ inputTokens: 11, outputTokens: 7 }),
      },
      { meta: { chatId: "chat_test" }, thinking: true },
    );
    const events = await collectFromReadableStream(stream);
    const payload = generationDonePayload(events);
    const durationMs = Number(payload?.durationMs ?? -1);
    const waitMs = Number(payload?.waitMs ?? -1);
    const reasoningMs = Number(payload?.reasoningMs ?? -1);
    const outputMs = Number(payload?.outputMs ?? -1);
    expect(waitMs).toBeGreaterThanOrEqual(20);
    expect(reasoningMs).toBeGreaterThanOrEqual(20);
    expect(outputMs).toBeGreaterThanOrEqual(10);
    expect(Math.abs(waitMs + reasoningMs + outputMs - durationMs)).toBeLessThan(40);
  });

  it("reports reasoningMs as 0 when the stream has no reasoning tokens", async () => {
    const stream = createCodeGenSSEStream(
      {
        fullStream: (async function* () {
          yield { type: "start" };
          await new Promise((resolve) => setTimeout(resolve, 50));
          yield { type: "text-start" };
          yield { type: "text-delta", textDelta: "<main>Hello</main>" };
          await new Promise((resolve) => setTimeout(resolve, 30));
          yield { type: "finish" };
        })(),
        usage: Promise.resolve({ inputTokens: 11, outputTokens: 7 }),
      },
      { meta: { chatId: "chat_test" } },
    );
    const events = await collectFromReadableStream(stream);
    const payload = generationDonePayload(events);
    const durationMs = Number(payload?.durationMs ?? -1);
    const waitMs = Number(payload?.waitMs ?? -1);
    const reasoningMs = Number(payload?.reasoningMs ?? -1);
    const outputMs = Number(payload?.outputMs ?? -1);
    expect(reasoningMs).toBe(0);
    expect(waitMs).toBeGreaterThanOrEqual(30);
    expect(outputMs).toBeGreaterThanOrEqual(10);
    expect(Math.abs(waitMs + reasoningMs + outputMs - durationMs)).toBeLessThan(40);
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

  it("invokes onAccumulatedThinking with the joined reasoning text before stream end", async () => {
    let captured: string | null | undefined = undefined;
    let capturedBeforeDone = false;
    const stream = createCodeGenSSEStream(
      createResult([
        { type: "start" },
        { type: "reasoning-start" },
        { type: "reasoning-delta", reasoningDelta: "First, " },
        { type: "reasoning-delta", reasoningDelta: "second." },
        { type: "text-start" },
        { type: "text-delta", textDelta: "ok" },
        { type: "finish" },
      ]),
      {
        thinking: true,
        meta: { chatId: "chat_test" },
        onAccumulatedThinking: (text) => {
          captured = text;
          capturedBeforeDone = true;
        },
      },
    );

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sawDone = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSSEBuffer(buffer);
      buffer = parsed.remaining;
      for (const evt of parsed.events) {
        if (evt.event === "done") {
          sawDone = true;
          // The producer must have already invoked the callback by the
          // time consumers see `done`, otherwise downstream finalize
          // would persist `null` for thinking.
          expect(captured).toBe("First, second.");
        }
      }
    }
    expect(sawDone).toBe(true);
    expect(capturedBeforeDone).toBe(true);
    expect(captured).toBe("First, second.");
  });

  it("invokes onAccumulatedThinking with null when no reasoning was streamed", async () => {
    let captured: string | null | undefined = "untouched";
    const stream = createCodeGenSSEStream(
      createResult([
        { type: "start" },
        { type: "text-start" },
        { type: "text-delta", textDelta: "ok" },
        { type: "finish" },
      ]),
      {
        thinking: false,
        meta: { chatId: "chat_test" },
        onAccumulatedThinking: (text) => {
          captured = text;
        },
      },
    );
    const reader = stream.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
    expect(captured).toBeNull();
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

  it("surfaces a length-truncated stream as output_truncated and skips normal finalization", async () => {
    const events = await collectEvents([
      { type: "start" },
      { type: "finish", finishReason: "length" },
    ]);

    const truncationError = events.find(
      (event) =>
        event.event === "error" &&
        typeof event.data === "object" &&
        event.data !== null &&
        (event.data as Record<string, unknown>).code === "output_truncated",
    );
    expect(truncationError).toBeTruthy();
    expect((truncationError?.data as Record<string, unknown>).finishReason).toBe("length");

    const truncatedProgress = events.find(
      (event) =>
        event.event === "progress" &&
        typeof event.data === "object" &&
        event.data !== null &&
        (event.data as Record<string, unknown>).phase === "truncated-output",
    );
    expect(truncatedProgress).toBeTruthy();
    expect((truncatedProgress?.data as Record<string, unknown>).finishReason).toBe("length");

    // The truncation path returns early: no normal success/done finalization.
    expect(events.some((event) => event.event === "done")).toBe(false);
    expect(
      events.some(
        (event) =>
          event.event === "progress" &&
          typeof event.data === "object" &&
          event.data !== null &&
          (event.data as Record<string, unknown>).phase === "done",
      ),
    ).toBe(false);
  });

  it("runs the normal success path for a non-truncated stream (no false-positive output_truncated)", async () => {
    const events = await collectEvents([
      { type: "start" },
      { type: "text-start" },
      { type: "text-delta", textDelta: "<main>Hello</main>" },
      { type: "finish", finishReason: "stop" },
    ]);

    expect(
      events.some(
        (event) =>
          event.event === "progress" &&
          typeof event.data === "object" &&
          event.data !== null &&
          (event.data as Record<string, unknown>).step === "generation" &&
          (event.data as Record<string, unknown>).phase === "done",
      ),
    ).toBe(true);
    expect(events.at(-1)?.event).toBe("done");

    expect(
      events.some(
        (event) =>
          event.event === "error" &&
          typeof event.data === "object" &&
          event.data !== null &&
          (event.data as Record<string, unknown>).code === "output_truncated",
      ),
    ).toBe(false);
    expect(
      events.some(
        (event) =>
          event.event === "progress" &&
          typeof event.data === "object" &&
          event.data !== null &&
          (event.data as Record<string, unknown>).phase === "truncated-output",
      ),
    ).toBe(false);
  });

  it("prefers the truncation path when a stream has content but finishReason=length", async () => {
    const events = await collectEvents([
      { type: "start" },
      { type: "text-start" },
      { type: "text-delta", textDelta: "<main>partial output" },
      { type: "finish", finishReason: "length" },
    ]);

    const truncationError = events.find(
      (event) =>
        event.event === "error" &&
        typeof event.data === "object" &&
        event.data !== null &&
        (event.data as Record<string, unknown>).code === "output_truncated",
    );
    expect(truncationError).toBeTruthy();
    expect((truncationError?.data as Record<string, unknown>).finishReason).toBe("length");
    expect(events.some((event) => event.event === "done")).toBe(false);
  });
});

describe("computeStreamPhaseTiming", () => {
  it("assigns the long gap before first token to waitMs so phases sum to duration", () => {
    // Prod 2026-08-14: 337 s stream reported as reasoning 0.3s + output 0.4s.
    const timing = computeStreamPhaseTiming({
      streamStartedAt: 0,
      firstReasoningTokenAt: 336_300,
      firstContentTokenAt: 336_600,
      streamEndedAt: 337_000,
    });
    expect(timing).toEqual({
      waitMs: 336_300,
      reasoningMs: 300,
      outputMs: 400,
      durationMs: 337_000,
    });
    expect(timing.waitMs + timing.reasoningMs + timing.outputMs).toBe(timing.durationMs);
    // The old two-phase calculator would have reported 700 ms of 337 s.
    expect(timing.reasoningMs + timing.outputMs).toBe(700);
    expect(timing.waitMs).toBeGreaterThan(timing.reasoningMs + timing.outputMs);
  });

  it("keeps reasoningMs at 0 when thinking produced no reasoning tokens", () => {
    const timing = computeStreamPhaseTiming({
      streamStartedAt: 0,
      firstReasoningTokenAt: null,
      firstContentTokenAt: 50_000,
      streamEndedAt: 80_000,
    });
    expect(timing.reasoningMs).toBe(0);
    expect(timing.waitMs).toBe(50_000);
    expect(timing.outputMs).toBe(30_000);
    expect(timing.waitMs + timing.reasoningMs + timing.outputMs).toBe(timing.durationMs);
  });

  it("gives the whole stream to waitMs when no tokens arrived", () => {
    const timing = computeStreamPhaseTiming({
      streamStartedAt: 1_000,
      firstReasoningTokenAt: null,
      firstContentTokenAt: null,
      streamEndedAt: 6_000,
    });
    expect(timing).toEqual({
      waitMs: 5_000,
      reasoningMs: 0,
      outputMs: 0,
      durationMs: 5_000,
    });
  });

  it("counts leftover stream as reasoning when content never started", () => {
    const timing = computeStreamPhaseTiming({
      streamStartedAt: 0,
      firstReasoningTokenAt: 1_000,
      firstContentTokenAt: null,
      streamEndedAt: 10_000,
    });
    expect(timing).toEqual({
      waitMs: 1_000,
      reasoningMs: 9_000,
      outputMs: 0,
      durationMs: 10_000,
    });
  });
});
