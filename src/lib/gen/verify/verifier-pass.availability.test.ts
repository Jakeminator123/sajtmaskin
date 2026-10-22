import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateObject = vi.hoisted(() => vi.fn());
const recordLlmUsage = vi.hoisted(() => vi.fn());
const phaseRoutingOverride = vi.hoisted(() => ({
  modelId: null as string | null,
  thinking: null as boolean | null,
  reasoningEffort: null as "none" | "low" | "medium" | "high" | "xhigh" | "max" | null,
}));

vi.mock("ai", () => ({ generateObject }));
vi.mock("@/lib/observability/llm-usage", () => ({ recordLlmUsage }));
vi.mock("@/lib/gen/models", () => ({
  getOpenAIModel: vi.fn((id: string) => id),
  isAnthropicModel: vi.fn(() => false),
}));
vi.mock("@/lib/models/phase-routing", async () => {
  const actual = await vi.importActual<typeof import("@/lib/models/phase-routing")>(
    "@/lib/models/phase-routing",
  );
  return {
    ...actual,
    resolvePhaseModel: (...args: Parameters<typeof actual.resolvePhaseModel>) => {
      const resolved = actual.resolvePhaseModel(...args);
      if (!phaseRoutingOverride.modelId || args[1] !== "verifier") return resolved;
      return { ...resolved, modelId: phaseRoutingOverride.modelId as typeof resolved.modelId };
    },
    resolvePhaseThinking: (...args: Parameters<typeof actual.resolvePhaseThinking>) => {
      const resolved = actual.resolvePhaseThinking(...args);
      if (!phaseRoutingOverride.reasoningEffort || args[1] !== "verifier") return resolved;
      return {
        ...resolved,
        thinking: phaseRoutingOverride.thinking ?? resolved.thinking,
        reasoningEffort: phaseRoutingOverride.reasoningEffort,
      };
    },
  };
});

import { runVerifierPass } from "./verifier-pass";

function pageProject(body: string): string {
  return `\`\`\`tsx file="app/page.tsx"\n${body}\n\`\`\``;
}

const CLEAN_PAGE = pageProject(
  `export default function Page() {\n  return <main><h1>Hej</h1></main>;\n}`,
);

describe("runVerifierPass LLM availability receipt", () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousVerifier = process.env.SAJTMASKIN_VERIFIER_PASS;

  beforeEach(() => {
    generateObject.mockReset();
    recordLlmUsage.mockReset();
    phaseRoutingOverride.modelId = null;
    phaseRoutingOverride.thinking = null;
    phaseRoutingOverride.reasoningEffort = null;
    process.env.OPENAI_API_KEY = "sk-test-verifier-availability";
    delete process.env.SAJTMASKIN_VERIFIER_PASS;
  });

  afterEach(() => {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    if (previousVerifier === undefined) delete process.env.SAJTMASKIN_VERIFIER_PASS;
    else process.env.SAJTMASKIN_VERIFIER_PASS = previousVerifier;
  });

  it("marks a completed LLM review as completed even when it found nothing", async () => {
    generateObject.mockResolvedValueOnce({
      object: { blocking: [], quality: [] },
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const result = await runVerifierPass(CLEAN_PAGE, { resolvedTier: "pro" });

    expect(result.llmAvailability).toBe("completed");
    expect(result.blocking).toEqual([]);
  });

  it("does not treat a provider/timeout failure as a clean LLM review", async () => {
    generateObject.mockRejectedValueOnce(new Error("timeout / provider error"));

    const result = await runVerifierPass(CLEAN_PAGE, { resolvedTier: "pro" });

    expect(result.llmAvailability).toBe("unavailable");
    expect(result.blocking).toEqual([]);
    expect(result.quality).toEqual([]);
  });

  it("aliases gpt-5.3-codex, clamps none to low, and logs gpt-6.1-sol", async () => {
    phaseRoutingOverride.modelId = "gpt-5.3-codex";
    phaseRoutingOverride.thinking = false;
    phaseRoutingOverride.reasoningEffort = "none";
    generateObject.mockResolvedValueOnce({
      object: { blocking: [], quality: [] },
      usage: { inputTokens: 2, outputTokens: 3 },
    });

    const result = await runVerifierPass(CLEAN_PAGE, { resolvedTier: "pro" });

    expect(result.llmAvailability).toBe("completed");
    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: { openai: { reasoningEffort: "low" } },
      }),
    );
    expect(recordLlmUsage).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "verifier", model: "gpt-6.1-sol" }),
    );
  });

  it("skips the LLM review when the verifier kill-switch is off", async () => {
    process.env.SAJTMASKIN_VERIFIER_PASS = "0";

    const result = await runVerifierPass(CLEAN_PAGE, { resolvedTier: "pro" });

    expect(result.llmAvailability).toBe("skipped");
    expect(generateObject).not.toHaveBeenCalled();
  });
});
