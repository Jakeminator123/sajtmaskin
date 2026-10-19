/**
 * Bounded QA call: workload model, effort, token cap, no retries, and one
 * usage row. No live provider.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalModelIdToOwnModelId, DEFAULT_MODEL_ID } from "@/lib/models/catalog";

const generateText = vi.hoisted(() => vi.fn());
const createDirectModel = vi.hoisted(() => vi.fn((modelId: string) => ({ modelId })));
const recordLlmUsage = vi.hoisted(() => vi.fn());
const getWorkloadDefaultModelFromManifest = vi.hoisted(() => vi.fn());
const workloadOpenAIProviderOptions = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({ generateText }));
vi.mock("@/lib/builder/direct-model", () => ({ createDirectModel }));
vi.mock("@/lib/observability/llm-usage", () => ({ recordLlmUsage }));
vi.mock("@/lib/ai-models/load-manifest", () => ({ getWorkloadDefaultModelFromManifest }));
vi.mock("@/lib/ai-models/workload-reasoning", () => ({ workloadOpenAIProviderOptions }));

import { generateQaShortCircuitText } from "./qa-short-circuit";

const SOL_MODEL = "openai/gpt-6.1-sol";
const tokenUsage = {
  inputTokens: 20,
  outputTokens: 5,
  inputTokenDetails: { cacheReadTokens: 8, cacheWriteTokens: 2 },
  outputTokenDetails: { reasoningTokens: 11 },
};

function installWorkload(modelId: string | undefined) {
  getWorkloadDefaultModelFromManifest.mockReturnValue(modelId);
  workloadOpenAIProviderOptions.mockReturnValue({
    providerOptions: { openai: { reasoningEffort: "medium" } },
  });
}

describe("generateQaShortCircuitText", () => {
  const signal = new AbortController().signal;

  beforeEach(() => {
    vi.clearAllMocks();
    installWorkload(SOL_MODEL);
  });

  it("sends the workload model, effort, cap, and the original abort signal", async () => {
    generateText.mockResolvedValue({ text: "Kort svar.", usage: tokenUsage });

    await expect(
      generateQaShortCircuitText({ optimizedMessage: "Hur är färgen?", signal }),
    ).resolves.toBe("Kort svar.");

    expect(getWorkloadDefaultModelFromManifest).toHaveBeenCalledWith("qa_short_circuit");
    expect(workloadOpenAIProviderOptions).toHaveBeenCalledWith("qa_short_circuit", SOL_MODEL);
    expect(createDirectModel).toHaveBeenCalledWith(SOL_MODEL);
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(generateText.mock.calls[0][0]).toMatchObject({
      model: { modelId: SOL_MODEL },
      abortSignal: signal,
      maxOutputTokens: 8192,
      maxRetries: 0,
      providerOptions: { openai: { reasoningEffort: "medium" } },
    });
    expect(generateText.mock.calls[0][0].prompt).toContain("Hur är färgen?");
    expect(generateText.mock.calls[0][0].abortSignal).toBe(signal);
    expect(recordLlmUsage).toHaveBeenCalledTimes(1);
    expect(recordLlmUsage.mock.calls[0][0].usage).toBe(tokenUsage);
    expect(recordLlmUsage.mock.calls[0][0].ok).toBeUndefined();
    expect(recordLlmUsage.mock.calls[0][0]).toMatchObject({
      phase: "qa",
      workload: "qa_short_circuit",
      model: SOL_MODEL,
      meta: {
        requestedModel: SOL_MODEL,
        effectiveModel: SOL_MODEL,
        effort: "medium",
        maxOutputTokens: 8192,
        maxRetries: 0,
      },
    });
    expect(JSON.stringify(recordLlmUsage.mock.calls[0][0].meta)).not.toContain("Hur är färgen?");
  });

  it("falls back to the canonical default model when the workload has none", async () => {
    const fallback = canonicalModelIdToOwnModelId(DEFAULT_MODEL_ID);
    installWorkload(undefined);
    generateText.mockResolvedValue({ text: "Svar.", usage: tokenUsage });

    await generateQaShortCircuitText({ optimizedMessage: "Vad visar poängen?", signal });

    expect(workloadOpenAIProviderOptions).toHaveBeenCalledWith("qa_short_circuit", fallback);
    expect(createDirectModel).toHaveBeenCalledWith(fallback);
    expect(recordLlmUsage).toHaveBeenCalledTimes(1);
    expect(recordLlmUsage.mock.calls[0][0].meta).toMatchObject({
      requestedModel: fallback,
      effectiveModel: fallback,
      effort: "medium",
      maxOutputTokens: 8192,
      maxRetries: 0,
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
      model: SOL_MODEL,
    });
  });

  it("records provider usage once when the call rejects with a response", async () => {
    const err = Object.assign(new Error("rejected"), {
      name: "AI_APICallError",
      usage: tokenUsage,
    });
    generateText.mockRejectedValue(err);

    await expect(
      generateQaShortCircuitText({ optimizedMessage: "Vad visar poängen?", signal }),
    ).rejects.toBe(err);

    expect(recordLlmUsage).toHaveBeenCalledTimes(1);
    expect(recordLlmUsage.mock.calls[0][0].usage).toBe(tokenUsage);
    expect(recordLlmUsage.mock.calls[0][0]).toMatchObject({
      ok: false,
      errorCode: "AI_APICallError",
    });
    expect(JSON.stringify(recordLlmUsage.mock.calls[0][0].meta)).not.toContain("Vad visar poängen?");
  });

  it("records unknown usage once when the failure has no response", async () => {
    const abort = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    generateText.mockRejectedValue(abort);

    await expect(
      generateQaShortCircuitText({ optimizedMessage: "Vad visar poängen?", signal }),
    ).rejects.toBe(abort);

    expect(recordLlmUsage).toHaveBeenCalledTimes(1);
    expect(recordLlmUsage.mock.calls[0][0].usage).toBeUndefined();
    expect(recordLlmUsage.mock.calls[0][0]).toMatchObject({
      ok: false,
      errorCode: "AbortError",
      meta: {
        requestedModel: SOL_MODEL,
        effectiveModel: SOL_MODEL,
        effort: "medium",
        maxOutputTokens: 8192,
        maxRetries: 0,
      },
    });
  });
});
