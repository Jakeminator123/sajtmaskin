import { beforeEach, describe, expect, it, vi } from "vitest";

const generateText = vi.hoisted(() => vi.fn());
const getRequestUserId = vi.hoisted(() => vi.fn());
const createDirectModel = vi.hoisted(() => vi.fn(() => "direct-model"));

vi.mock("ai", () => ({ generateText }));
vi.mock("@/lib/builder/direct-model", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/builder/direct-model")>();
  return { ...actual, createDirectModel };
});
vi.mock("@/lib/tenant", () => ({ getRequestUserId }));
vi.mock("@/lib/bot-protection", () => ({ requireNotBot: () => null }));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _key: string, handler: () => Promise<Response>) => handler(),
}));

import {
  PROMPT_REWRITE_MAX_CHARS,
  PROMPT_REWRITE_MAX_OUTPUT_TOKENS,
} from "@/lib/builder/prompt-assist-pre-send";
import { POST } from "./route";

function request(body: unknown): Request {
  return new Request("http://localhost/api/ai/prompt-assist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/prompt-assist", () => {
  beforeEach(() => {
    generateText.mockReset();
    getRequestUserId.mockReset();
    getRequestUserId.mockResolvedValue("user_1");
  });

  it("rejects guests", async () => {
    getRequestUserId.mockResolvedValue("guest:abc");
    const response = await POST(request({ draft: "hej" }));
    expect(response.status).toBe(401);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("rewrites the draft without sending a site brief", async () => {
    generateText.mockResolvedValue({ text: '{"text":"En café-sajt i Malmö"}' });
    const response = await POST(request({ draft: "cafe malmo" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      text: "En café-sajt i Malmö",
      model: expect.any(String),
    });
    expect(generateText).toHaveBeenCalledTimes(1);
    const arg = generateText.mock.calls[0]?.[0] as {
      messages: Array<{ content: string }>;
      maxOutputTokens?: number;
    };
    expect(arg.messages[0]?.content).toMatch(/Do not turn the draft into a spec/);
    expect(arg.maxOutputTokens).toBe(PROMPT_REWRITE_MAX_OUTPUT_TOKENS);
  });

  it("fails closed when a long or token-dense rewrite reaches the output cap", async () => {
    generateText.mockResolvedValue({
      text: '{"text":"Looks valid but may be incomplete"}',
      finishReason: "length",
    });

    const response = await POST(request({ draft: "x".repeat(8_000) }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "rewrite_output_limit" });
  });

  it("fails closed when a normally finished rewrite exceeds the character cap", async () => {
    generateText.mockResolvedValue({
      text: JSON.stringify({ text: "a".repeat(PROMPT_REWRITE_MAX_CHARS + 1) }),
      finishReason: "stop",
    });

    const response = await POST(request({ draft: "x".repeat(8_000) }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "rewrite_char_limit" });
  });
});
