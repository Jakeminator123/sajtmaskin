import { beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalModelIdToOwnModelId, DEFAULT_MODEL_ID } from "@/lib/models/catalog";

const generateText = vi.hoisted(() => vi.fn());
const createDirectModel = vi.hoisted(() => vi.fn((modelId: string) => ({ modelId })));
const recordLlmUsage = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({ generateText }));
vi.mock("@/lib/builder/direct-model", () => ({ createDirectModel }));
vi.mock("@/lib/observability/llm-usage", () => ({ recordLlmUsage }));

import { generateQaShortCircuitText } from "./qa-short-circuit";

const modelId = canonicalModelIdToOwnModelId(DEFAULT_MODEL_ID);
const tokenUsage = {
  inputTokens: 20,
  outputTokens: 5,
  inputTokenDetails: { cacheReadTokens: 8, cacheWriteTokens: 2 },
  outputTokenDetails: { reasoningTokens: 3 },
};

describe("generateQaShortCircuitText", () => {
  const signal = new AbortController().signal;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the canonical model and original abort signal and records usage once", async () => {
    generateText.mockResolvedValue({ text: "  Kort svar.  ", usage: tokenUsage });

    await expect(
      generateQaShortCircuitText({ optimizedMessage: "Hur är färgen?", signal }),
    ).resolves.toBe("Kort svar.");

    expect(createDirectModel).toHaveBeenCalledWith(modelId);
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(generateText.mock.calls[0][0]).toMatchObject({
      model: { modelId },
      abortSignal: signal,
    });
    expect(generateText.mock.calls[0][0].abortSignal).toBe(signal);
    expect(recordLlmUsage).toHaveBeenCalledTimes(1);
    expect(recordLlmUsage.mock.calls[0][0].usage).toBe(tokenUsage);
    expect(recordLlmUsage.mock.calls[0][0].ok).toBeUndefined();
    expect(recordLlmUsage.mock.calls[0][0]).toMatchObject({
      phase: "qa",
      workload: "qa_short_circuit",
      model: modelId,
    });
  });

  it("records one failed row with the real usage when the answer is empty", async () => {
    generateText.mockResolvedValue({ text: "  \n", usage: tokenUsage });

    await expect(
      generateQaShortCircuitText({ optimizedMessage: "Vad visar poängen?", signal }),
    ).rejects.toThrow(/empty text/);

    expect(recordLlmUsage).toHaveBeenCalledTimes(1);
    expect(recordLlmUsage.mock.calls[0][0].usage).toBe(tokenUsage);
    expect(recordLlmUsage.mock.calls[0][0]).toMatchObject({
      ok: false,
      errorCode: "empty_qa_text",
      model: modelId,
    });
  });

  it("records provider usage once when the call rejects with a response", async () => {
    const error = Object.assign(new Error("rejected"), {
      name: "AI_APICallError",
      usage: tokenUsage,
    });
    generateText.mockRejectedValue(error);

    await expect(
      generateQaShortCircuitText({ optimizedMessage: "Vad visar poängen?", signal }),
    ).rejects.toBe(error);

    expect(recordLlmUsage).toHaveBeenCalledTimes(1);
    expect(recordLlmUsage.mock.calls[0][0].usage).toBe(tokenUsage);
    expect(recordLlmUsage.mock.calls[0][0]).toMatchObject({
      ok: false,
      errorCode: "AI_APICallError",
    });
  });

  it("records unknown usage once when the failure has no response", async () => {
    const error = new DOMException("The operation was aborted", "AbortError");
    generateText.mockRejectedValue(error);

    await expect(
      generateQaShortCircuitText({ optimizedMessage: "Vad visar poängen?", signal }),
    ).rejects.toBe(error);

    expect(recordLlmUsage).toHaveBeenCalledTimes(1);
    expect(recordLlmUsage.mock.calls[0][0].usage).toBeUndefined();
    expect(recordLlmUsage.mock.calls[0][0]).toMatchObject({
      ok: false,
      errorCode: "AbortError",
    });
  });
});
