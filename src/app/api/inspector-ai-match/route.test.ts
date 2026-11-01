import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());
const chatCreate = vi.hoisted(() => vi.fn());
vi.mock("openai", () => ({
  default: class { chat = { completions: { create: chatCreate } }; },
}));
vi.mock("@/lib/builder/inspector-feature", () => ({
  isBuilderInspectorEnabled: () => true,
  getBuilderInspectorDisabledMessage: () => "Avstängd",
}));
vi.mock("@/lib/billing/model-cost", () => ({ calculateModelCost: () => null }));

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

const { POST, maxDuration } = await import("./route");

describe("POST /api/inspector-ai-match", () => {
  it("bounds provider waiting and forwards request cancellation", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    chatCreate.mockResolvedValue({ choices: [{ message: { content: '{"tag":"button"}' } }] });
    const request = new Request("http://localhost/api/inspector-ai-match", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ xPercent: 12, yPercent: 34, viewportWidth: 1280, viewportHeight: 720,
        files: [{ name: "app/page.tsx", content: "export default function Page(){ return <button>Hej</button> }" }],
      }),
    });
    try {
      expect((await POST(request)).status).toBe(200);
      expect(chatCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: "gpt-6.1-sol", max_completion_tokens: 8192 }),
        { signal: request.signal, timeout: 30000, maxRetries: 0 },
      );
      expect(getCurrentUser).toHaveBeenCalledTimes(1);
      expect(maxDuration).toBe(45);
    } finally { vi.unstubAllEnvs(); }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue(null);
  });

  it("requires a logged-in user before AI matching", async () => {
    const res = await POST(new Request("http://localhost/api/inspector-ai-match", { method: "POST" }));

    expect(res.status).toBe(401);
  });

  it("rejects a spoofed x-session-id without a user", async () => {
    const res = await POST(
      new Request("http://localhost/api/inspector-ai-match", {
        method: "POST",
        headers: { "x-session-id": "anything" },
      }),
    );

    expect(res.status).toBe(401);
    expect(getCurrentUser).toHaveBeenCalled();
  });

  it("does not expose provider failures", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    chatCreate.mockRejectedValue(new Error("provider key secret"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const request = new Request("http://localhost/api/inspector-ai-match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        xPercent: 12,
        yPercent: 34,
        viewportWidth: 1280,
        viewportHeight: 720,
        files: [{ name: "app/page.tsx", content: "export default function Page(){}" }],
      }),
    });

    try {
      const res = await POST(request);
      expect(res.status).toBe(502);
      await expect(res.json()).resolves.toEqual({
        success: false,
        error: "AI-matchning misslyckades",
      });
      expect(error).toHaveBeenCalledWith(
        "[API/inspector-ai-match] Provider request failed:",
        expect.any(Error),
      );
    } finally {
      error.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it("rejects malformed files before calling the provider", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    const request = new Request("http://localhost/api/inspector-ai-match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        xPercent: 12,
        yPercent: 34,
        viewportWidth: 1280,
        viewportHeight: 720,
        files: [{ name: 123, content: "export default function Page(){}" }],
      }),
    });

    try {
      expect((await POST(request)).status).toBe(400);
      expect(chatCreate).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rejects click coordinates outside the preview", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    const request = new Request("http://localhost/api/inspector-ai-match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        xPercent: 101,
        yPercent: 34,
        viewportWidth: 1280,
        viewportHeight: 720,
        files: [{ name: "app/page.tsx", content: "export default function Page(){}" }],
      }),
    });

    try {
      expect((await POST(request)).status).toBe(400);
      expect(chatCreate).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

