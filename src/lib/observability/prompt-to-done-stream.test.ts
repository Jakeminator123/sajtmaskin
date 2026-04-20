import { beforeEach, describe, expect, it } from "vitest";
import { formatSSEEvent } from "@/lib/streaming";
import {
  getPrometheusMetrics,
  resetMetricsForTest,
} from "./metrics";
import { wrapStreamForPromptToDoneMetric } from "./prompt-to-done-stream";

function sseSource(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[i]));
      i += 1;
    },
  });
}

function erroringSource(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new Error("boom"));
    },
  });
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

/** Flush microtasks so the wrapper's `pipeTo` settles before assertions. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("observability/prompt-to-done-stream", () => {
  beforeEach(() => {
    resetMetricsForTest();
  });

  it("forwards bytes unchanged and records `done` when a done frame flows through", async () => {
    const source = sseSource([
      formatSSEEvent("chatId", { id: "c1" }),
      formatSSEEvent("progress", { step: "generation" }),
      formatSSEEvent("done", { chatId: "c1", versionId: "v1" }),
    ]);
    const wrapped = wrapStreamForPromptToDoneMetric(source, {
      kind: "init",
      promptStartedAt: Date.now() - 1234,
    });
    const text = await drain(wrapped);
    await settle();

    expect(text).toContain("event: chatId");
    expect(text).toContain("event: done");
    expect(text).toContain('"versionId":"v1"');

    const promMetrics = await getPrometheusMetrics();
    expect(promMetrics).toMatch(
      /sajtmaskin_prompt_to_done_ms_count\{[^}]*outcome="done"[^}]*kind="init"[^}]*\}\s+1/,
    );
  });

  it("detects `done` even when the SSE frame-header spans a chunk boundary", async () => {
    const full = formatSSEEvent("done", { chatId: "c1" });
    const splitAt = "event: do".length;
    const source = sseSource([full.slice(0, splitAt), full.slice(splitAt)]);

    const wrapped = wrapStreamForPromptToDoneMetric(source, {
      kind: "followup",
      promptStartedAt: Date.now() - 500,
    });
    await drain(wrapped);
    await settle();

    const promMetrics = await getPrometheusMetrics();
    expect(promMetrics).toMatch(
      /sajtmaskin_prompt_to_done_ms_count\{[^}]*outcome="done"[^}]*kind="followup"[^}]*\}\s+1/,
    );
  });

  it("records `failed` when the source stream closes without a done frame", async () => {
    const source = sseSource([formatSSEEvent("error", { message: "oops" })]);
    const wrapped = wrapStreamForPromptToDoneMetric(source, {
      kind: "init",
      promptStartedAt: Date.now() - 10,
    });
    await drain(wrapped);
    await settle();

    const promMetrics = await getPrometheusMetrics();
    expect(promMetrics).toMatch(
      /sajtmaskin_prompt_to_done_ms_count\{[^}]*outcome="failed"[^}]*kind="init"[^}]*\}\s+1/,
    );
  });

  it("records `failed` when the source errors", async () => {
    const wrapped = wrapStreamForPromptToDoneMetric(erroringSource(), {
      kind: "init",
      promptStartedAt: Date.now(),
    });
    // Draining a wrapped errored stream will itself reject; swallow.
    await drain(wrapped).catch(() => undefined);
    await settle();

    const promMetrics = await getPrometheusMetrics();
    expect(promMetrics).toMatch(
      /sajtmaskin_prompt_to_done_ms_count\{[^}]*outcome="failed"[^}]*kind="init"[^}]*\}\s+1/,
    );
  });

  it("records `aborted` when the request signal is aborted and no done seen", async () => {
    const controller = new AbortController();
    controller.abort();
    const wrapped = wrapStreamForPromptToDoneMetric(erroringSource(), {
      kind: "followup",
      promptStartedAt: Date.now(),
      signal: controller.signal,
    });
    await drain(wrapped).catch(() => undefined);
    await settle();

    const promMetrics = await getPrometheusMetrics();
    expect(promMetrics).toMatch(
      /sajtmaskin_prompt_to_done_ms_count\{[^}]*outcome="aborted"[^}]*kind="followup"[^}]*\}\s+1/,
    );
  });

  it("records exactly once per stream even across flush + pipe settle", async () => {
    const source = sseSource([formatSSEEvent("done", { chatId: "c1" })]);
    const wrapped = wrapStreamForPromptToDoneMetric(source, {
      kind: "init",
      promptStartedAt: Date.now(),
    });
    await drain(wrapped);
    await settle();

    const promMetrics = await getPrometheusMetrics();
    const match = promMetrics.match(
      /sajtmaskin_prompt_to_done_ms_count\{[^}]*outcome="done"[^}]*kind="init"[^}]*\}\s+(\d+)/,
    );
    expect(match?.[1]).toBe("1");
  });
});
