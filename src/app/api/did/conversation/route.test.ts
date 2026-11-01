import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({ SECRETS: { emailFrom: "test@example.com" } }));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_request: Request, _key: string, handler: () => unknown) => handler(),
}));
vi.mock("@/lib/utils/debug", () => ({ debugLog: vi.fn(), errorLog: vi.fn() }));

import { POST } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST D-ID conversation", () => {
  it("bounds webhook transcript length", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const response = await POST(
      new Request("http://localhost/api/did/conversation", {
        method: "POST",
        body: JSON.stringify({
          event_type: "conversation.done",
          chat_history: {
            messages: Array.from({ length: 50 }, () => ({
              role: "user",
              content: "x".repeat(8_000),
            })),
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(info).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ messageLength: 12_000 }),
    );
  });

  it("does not process more than 50 webhook messages", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const response = await POST(
      new Request("http://localhost/api/did/conversation", {
        method: "POST",
        body: JSON.stringify({
          event_type: "conversation.done",
          chat_history: {
            messages: Array.from({ length: 51 }, () => ({ role: "user", content: "hello" })),
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const logged = info.mock.calls[0]?.[1] as { messageLength?: number } | undefined;
    expect(logged?.messageLength).toBeLessThan(500);
  });
});
