import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateObject = vi.hoisted(() => vi.fn());
const recordLlmUsage = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({ generateObject }));
vi.mock("@/lib/observability/llm-usage", () => ({ recordLlmUsage }));
vi.mock("@/lib/gen/models", () => ({
  getOpenAIModel: vi.fn((id: string) => id),
  isAnthropicModel: vi.fn(() => false),
}));

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

  it("skips the LLM review when the verifier kill-switch is off", async () => {
    process.env.SAJTMASKIN_VERIFIER_PASS = "0";

    const result = await runVerifierPass(CLEAN_PAGE, { resolvedTier: "pro" });

    expect(result.llmAvailability).toBe("skipped");
    expect(generateObject).not.toHaveBeenCalled();
  });
});
