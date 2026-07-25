/**
 * Tokenloggning från intent-klassificeraren.
 *
 * Invarianten är densamma som för codegen och verifier: ett API-anrop ger EXAKT
 * en `llm_usage`-rad — även när efterbehandlingen kastar efter att den lyckade
 * raden redan skrivits, och även när själva anropet faller.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const recordLlmUsage = vi.hoisted(() => vi.fn());
const generateObject = vi.hoisted(() => vi.fn());

vi.mock("@/lib/observability/llm-usage", () => ({ recordLlmUsage }));
vi.mock("ai", () => ({ generateObject }));
vi.mock("@/lib/builder/direct-model", () => ({ createDirectModel: () => "model" }));
vi.mock("@/lib/ai-models/load-manifest", () => ({
  getWorkloadDefaultModelFromManifest: () => "openai/gpt-5-mini",
}));

const { llmClassifyFollowUpIntent } = await import("./follow-up-intent-llm-classifier");

describe("klassificerarens tokenloggning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loggar en rad för ett lyckat anrop", async () => {
    generateObject.mockResolvedValue({
      object: { intent: "neutral" },
      usage: { inputTokens: 120, outputTokens: 4 },
    });
    await expect(llmClassifyFollowUpIntent("gör hero ljusare")).resolves.toBe("neutral");
    expect(recordLlmUsage).toHaveBeenCalledTimes(1);
    expect(recordLlmUsage.mock.calls[0][0]).toMatchObject({
      phase: "classifier",
      workload: "match_classifier",
      usage: { inputTokens: 120, outputTokens: 4 },
    });
  });

  it("skriver INTE en andra rad när etikettvalideringen kastar", async () => {
    generateObject.mockResolvedValue({
      object: { intent: "inte-en-giltig-etikett" },
      usage: { inputTokens: 120, outputTokens: 4 },
    });
    await expect(llmClassifyFollowUpIntent("gör hero ljusare")).rejects.toThrow();
    expect(recordLlmUsage).toHaveBeenCalledTimes(1);
    // Raden är den lyckade med verklig volym — inte en påhittad felrad.
    expect(recordLlmUsage.mock.calls[0][0]).toMatchObject({ usage: { inputTokens: 120 } });
  });

  it("loggar ett misslyckat anrop med usage från felet när den finns", async () => {
    const err = Object.assign(new Error("kunde inte tolka"), {
      name: "NoObjectGeneratedError",
      usage: { inputTokens: 90, outputTokens: 0 },
    });
    generateObject.mockRejectedValue(err);
    await expect(llmClassifyFollowUpIntent("gör hero ljusare")).rejects.toThrow();
    expect(recordLlmUsage).toHaveBeenCalledTimes(1);
    expect(recordLlmUsage.mock.calls[0][0]).toMatchObject({
      ok: false,
      errorCode: "NoObjectGeneratedError",
      usage: { inputTokens: 90 },
    });
  });
});
