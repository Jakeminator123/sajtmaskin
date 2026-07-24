import { describe, expect, it } from "vitest";

import {
  describeGatewayError,
  formatGatewayError,
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

  it("omits the detail block when upstream said nothing", () => {
    const description = describeGatewayError({ error: { type: "server_error" } });

    expect(description).not.toBeNull();
    expect(formatGatewayError(description!)).toBe(description!.message);
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
});
