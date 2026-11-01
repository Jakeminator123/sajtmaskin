import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());
const generateText = vi.hoisted(() => vi.fn());
const withRateLimit = vi.hoisted(() =>
  vi.fn((_req: Request, _bucket: string, handler: () => Promise<Response>) => handler()),
);

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit,
}));

vi.mock("@/lib/builder/direct-model", () => ({
  createDirectModel: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText,
}));

import { isAllowedPresentationFrame, POST } from "./route";

describe("isAllowedPresentationFrame", () => {
  it("accepts compact data URLs and rejects remote URLs", () => {
    expect(isAllowedPresentationFrame("data:image/png;base64,AAAA")).toBe(true);
    expect(isAllowedPresentationFrame("https://evil.example/frame.png")).toBe(false);
    expect(isAllowedPresentationFrame("http://169.254.169.254/latest/meta-data")).toBe(false);
  });
});

describe("POST /api/analyze-presentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue(null);
    withRateLimit.mockImplementation(
      (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires a logged-in user before calling the vision model", async () => {
    const res = await POST(
      new Request("http://localhost/api/analyze-presentation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: "Hej och välkommen till vår presentation av företaget",
          frames: ["https://evil.example/x.png"],
        }),
      }),
    );

    expect(res.status).toBe(401);
    expect(withRateLimit).not.toHaveBeenCalled();
  });

  it("returns 429 when the presentation bucket is exhausted", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    withRateLimit.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 }),
    );

    const res = await POST(
      new Request("http://localhost/api/analyze-presentation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: "Hej och välkommen till vår presentation av företaget",
        }),
      }),
    );

    expect(res.status).toBe(429);
    expect(withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      "analyze:presentation",
      expect.any(Function),
      { userId: "user_1" },
    );
  });

  it("rejects remote frame URLs after login", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });

    const res = await POST(
      new Request("http://localhost/api/analyze-presentation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: "Hej och välkommen till vår presentation av företaget",
          frames: ["https://evil.example/x.png"],
        }),
      }),
    );

    expect(res.status).toBe(400);
  });

  it("rejects oversized company context before calling a model", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });

    const res = await POST(
      new Request("http://localhost/api/analyze-presentation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: "Hej och välkommen till vår presentation av företaget",
          companyName: "x".repeat(301),
        }),
      }),
    );

    expect(res.status).toBe(400);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("does not expose provider failures", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    generateText.mockRejectedValue(new Error("provider secret response"));
    vi.stubEnv("OPENAI_API_KEY", "");

    const res = await POST(
      new Request("http://localhost/api/analyze-presentation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: "En tillräckligt lång presentation för analys" }),
      }),
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Presentation analysis failed" });
  });
});
