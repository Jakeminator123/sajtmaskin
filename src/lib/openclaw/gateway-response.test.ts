import { describe, expect, it } from "vitest";

import {
  consumeGatewayStream,
  describeGatewayError,
  extractGatewayAssistantText,
  formatOpenClawChatStreamEndLog,
  maskOpenClawLogPrefix,
  parseGatewayStream,
  type GatewayStreamEvent,
} from "./gateway-response";

/** Observed verbatim in production 2026-07-24 when the Codex quota ran out. */
const REAL_RATE_LIMIT_CHUNK = {
  error: {
    message:
      "All models failed (2): openai/gpt-5.5: You've reached your Codex subscription usage limit. OpenClaw could not determine a reset time from Codex. (rate_limit) | openai/gpt-5.4: You've reached your Codex subscription usage limit. (rate_limit)",
    type: "rate_limit_error",
  },
};

function streamOf(...lines: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  }).getReader();
}

function deltaChunk(content: string): string {
  return `data: ${JSON.stringify({
    choices: [{ index: 0, delta: { content } }],
  })}\n\n`;
}

async function collect(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<GatewayStreamEvent[]> {
  const events: GatewayStreamEvent[] = [];
  for await (const event of parseGatewayStream(reader)) {
    events.push(event);
  }
  return events;
}

async function collectWithSummary(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const events: GatewayStreamEvent[] = [];
  const summary = await consumeGatewayStream(reader, (event) => {
    events.push(event);
  });
  return { events, summary };
}

describe("describeGatewayError", () => {
  it("classifies an exhausted model chain as a rate limit", () => {
    const description = describeGatewayError(REAL_RATE_LIMIT_CHUNK);

    expect(description?.kind).toBe("rate_limit");
    expect(description?.message).toContain("slut på kapacitet");
    expect(description?.detail).toContain("All models failed (2)");
  });

  it("classifies a missing provider credential as an auth problem", () => {
    const description = describeGatewayError({
      error: { message: "No API key found for provider openai-codex" },
    });

    expect(description?.kind).toBe("auth");
    expect(description?.message).toContain("autentisera");
  });

  it("accepts a bare string error and falls back to the generic message", () => {
    const description = describeGatewayError({ error: "lane task failed" });

    expect(description?.kind).toBe("unknown");
    expect(description?.detail).toBe("lane task failed");
  });

  it("returns null for a normal completion chunk", () => {
    expect(
      describeGatewayError({ choices: [{ delta: { content: "Hej" } }] }),
    ).toBeNull();
    expect(describeGatewayError(null)).toBeNull();
    expect(describeGatewayError({ error: null })).toBeNull();
  });

  it("bounds and collapses the upstream detail", () => {
    const description = describeGatewayError({
      error: { message: `spread   over\nlines ${"x".repeat(600)}` },
    });

    expect(description?.detail).toContain("spread over lines");
    expect(description?.detail.length).toBe(400);
  });

  it("keeps upstream infrastructure out of the user-facing message", () => {
    const description = describeGatewayError(REAL_RATE_LIMIT_CHUNK);

    // `detail` is for server logs only. The message a visitor sees must not
    // name internal models or subscriptions.
    expect(description?.message).not.toMatch(/codex|gpt-5|openai/i);
    expect(description?.message).not.toContain(description!.detail);
  });

  it("still describes an error that carries only a type", () => {
    const description = describeGatewayError({ error: { type: "server_error" } });

    expect(description?.kind).toBe("unknown");
    expect(description?.detail).toBe("");
  });
});

describe("parseGatewayStream", () => {
  it("yields content deltas and stops at [DONE]", async () => {
    const events = await collect(
      streamOf(deltaChunk("Hej"), deltaChunk(" där"), "data: [DONE]\n\n"),
    );

    expect(events).toEqual([
      { type: "delta", text: "Hej" },
      { type: "delta", text: " där" },
    ]);
  });

  it("reports an error chunk instead of dropping it silently", async () => {
    const events = await collect(
      streamOf(
        `data: ${JSON.stringify({ choices: [{ delta: { role: "assistant" } }] })}\n\n`,
        `data: ${JSON.stringify(REAL_RATE_LIMIT_CHUNK)}\n\n`,
        "data: [DONE]\n\n",
      ),
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error" });
    expect(
      events[0].type === "error" ? events[0].description.kind : null,
    ).toBe("rate_limit");
  });

  it("keeps deltas that arrived before an error", async () => {
    const events = await collect(
      streamOf(deltaChunk("Halva"), `data: ${JSON.stringify(REAL_RATE_LIMIT_CHUNK)}\n\n`),
    );

    expect(events[0]).toEqual({ type: "delta", text: "Halva" });
    expect(events[1]).toMatchObject({ type: "error" });
  });

  it("skips malformed chunks and reassembles deltas split across reads", async () => {
    const chunk = deltaChunk("delad");
    const events = await collect(
      streamOf(
        "data: {not json\n\n",
        chunk.slice(0, 12),
        chunk.slice(12),
        "data: [DONE]\n\n",
      ),
    );

    expect(events).toEqual([{ type: "delta", text: "delad" }]);
  });

  it("flushes a last SSE line that has no trailing newline", async () => {
    const lastLine = `data: ${JSON.stringify({
      choices: [{ index: 0, delta: { content: "sista" } }],
    })}`;
    const { events, summary } = await collectWithSummary(streamOf(lastLine));

    expect(events).toEqual([{ type: "delta", text: "sista" }]);
    expect(summary.ended).toBe(true);
    expect(summary.leftoverChars).toBeGreaterThan(0);
    expect(summary.contentForms).toContain("delta_string");
  });

  it("accepts delta.content as an array of text parts", async () => {
    const { events, summary } = await collectWithSummary(
      streamOf(
        `data: ${JSON.stringify({
          choices: [
            {
              index: 0,
              delta: {
                content: [
                  { type: "text", text: "Hej" },
                  " där",
                ],
              },
            },
          ],
        })}\n\n`,
        "data: [DONE]\n\n",
      ),
    );

    expect(events).toEqual([{ type: "delta", text: "Hej där" }]);
    expect(summary.contentForms).toContain("delta_array");
    expect(summary.sawDoneMarker).toBe(true);
    expect(summary.ended).toBe(true);
  });

  it("accepts message.content in an SSE chunk", async () => {
    const { events, summary } = await collectWithSummary(
      streamOf(
        `data: ${JSON.stringify({
          choices: [{ index: 0, message: { role: "assistant", content: "klart" } }],
        })}\n\n`,
        "data: [DONE]\n\n",
      ),
    );

    expect(events).toEqual([{ type: "delta", text: "klart" }]);
    expect(summary.contentForms).toContain("message_string");
  });

  it("records reasoning-only chunks without yielding them as assistant text", async () => {
    const { events, summary } = await collectWithSummary(
      streamOf(
        `data: ${JSON.stringify({
          choices: [{ index: 0, delta: { reasoning_content: "tänker tyst" } }],
        })}\n\n`,
        "data: [DONE]\n\n",
      ),
    );

    expect(events).toEqual([]);
    expect(summary.contentForms).toEqual(["reasoning"]);
    expect(summary.ended).toBe(true);
  });

  it("still reports an error envelope as an error event, not an empty stream", async () => {
    const { events, summary } = await collectWithSummary(
      streamOf(`data: ${JSON.stringify(REAL_RATE_LIMIT_CHUNK)}\n\n`),
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error" });
    expect(summary.errorKind).toBe("rate_limit");
    expect(summary.contentForms).toEqual([]);
  });
});

describe("extractGatewayAssistantText", () => {
  it("reads message.content arrays the same way as did/chat", () => {
    const extracted = extractGatewayAssistantText({
      choices: [
        {
          message: {
            content: [{ type: "text", text: "Tips" }, " om heron"],
          },
        },
      ],
    });

    expect(extracted.text).toBe("Tips om heron");
    expect(extracted.forms).toEqual(["message_array"]);
  });
});

describe("formatOpenClawChatStreamEndLog", () => {
  it("names the fields that split empty, leftover, hung and aborted", () => {
    const line = formatOpenClawChatStreamEndLog({
      accumulatedChars: 0,
      visibleChars: 0,
      hasIncompleteAction: false,
      leftoverChars: 12,
      ended: true,
      sawDone: false,
      aborted: false,
      contentForms: [],
      errorKind: null,
      prefix: "",
    });

    expect(line).toContain("[openclaw/chat] stream-end");
    expect(line).toContain("accumulatedChars=0");
    expect(line).toContain("hasIncompleteAction=false");
    expect(line).toContain("leftoverChars=12");
    expect(line).toContain("ended=true");
    expect(line).toContain("sawDone=false");
    expect(line).toContain("aborted=false");
    expect(line).toContain("contentForms=none");
    expect(line).toContain("errorKind=none");
  });

  it("never logs a raw token-like run in the prefix", () => {
    const secret = `sk-${"a".repeat(40)}`;
    expect(maskOpenClawLogPrefix(`Bearer ${secret} hej`)).not.toContain(secret);
    expect(formatOpenClawChatStreamEndLog({
      accumulatedChars: 80,
      visibleChars: 80,
      hasIncompleteAction: false,
      leftoverChars: 0,
      ended: true,
      sawDone: true,
      aborted: false,
      contentForms: ["delta_string"],
      errorKind: null,
      prefix: `Authorization: Bearer ${secret}`,
    })).not.toContain(secret);
  });
});
