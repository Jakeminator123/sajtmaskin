import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const secrets = vi.hoisted(() => ({ emailFrom: "test@example.com", didConversationWebhookSecret: "webhook-test-secret" }));
const send = vi.hoisted(() => vi.fn(async () => ({ error: null })));
const withRateLimit = vi.hoisted(() => vi.fn((_request: Request, _key: string, handler: () => unknown) => handler()));
vi.mock("@/lib/config", () => ({ SECRETS: secrets }));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit,
}));
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
vi.mock("@/lib/utils/debug", () => ({ debugLog: vi.fn(), errorLog: vi.fn() }));

import { POST } from "./route";

beforeEach(() => {
  secrets.didConversationWebhookSecret = "webhook-test-secret";
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST D-ID conversation", () => {
  it("fails closed before reading JSON or contacting Resend when authentication is unavailable", async () => {
    secrets.didConversationWebhookSecret = "";
    const request = new Request("http://localhost/api/did/conversation", { method: "POST", body: "{}" });
    const json = vi.spyOn(request, "json");
    const response = await POST(request);
    expect(response.status).toBe(503);
    expect(json).not.toHaveBeenCalled();
    expect(withRateLimit).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it.each([undefined, "Bearer wrong", "Basic webhook-test-secret", "Bearer webhook-test-secret-extra"])(
    "rejects missing or invalid bearer authorization: %s", async authorization => {
      vi.stubEnv("RESEND_API_KEY", "resend-test-key");
      const request = new Request("http://localhost/api/did/conversation", {
        method: "POST", body: JSON.stringify({ message: "A real lead" }),
        headers: authorization ? { authorization } : {},
      });
      const json = vi.spyOn(request, "json");
      expect((await POST(request)).status).toBe(401);
      expect(json).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    },
  );

  it.each(["{", "{}", "null", "[]", '{"message":"  "}', '{"message":5}', '{"chat_history":{"messages":[]}}'])(
    "rejects malformed/empty conversations before mail: %s", async body => {
      vi.stubEnv("RESEND_API_KEY", "resend-test-key");
      const response = await POST(new Request("http://localhost/api/did/conversation", {
        method: "POST", body, headers: { authorization: "Bearer webhook-test-secret" },
      }));
      expect(response.status).toBe(400);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("sends authenticated meaningful leads through the existing contact quota", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-test-key");
    const response = await POST(new Request("http://localhost/api/did/conversation", {
      method: "POST", body: JSON.stringify({ message: "Help with my website", email: "lead@example.com" }),
      headers: { authorization: "Bearer webhook-test-secret" },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, emailSent: true });
    expect(withRateLimit).toHaveBeenCalledWith(expect.any(Request), "contact:submit", expect.any(Function));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: ["hej@sajtmaskin.se", "erik@sajtstudio.se"], replyTo: "lead@example.com" }));
  });

  it("does not send mail when the contact quota rejects an authenticated lead", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-test-key");
    withRateLimit.mockImplementationOnce(() => Response.json({ error: "Too many requests" }, { status: 429 }));
    const response = await POST(new Request("http://localhost/api/did/conversation", {
      method: "POST", body: JSON.stringify({ message: "Help with my website" }),
      headers: { authorization: "Bearer webhook-test-secret" },
    }));
    expect(response.status).toBe(429);
    expect(send).not.toHaveBeenCalled();
  });

  it("bounds webhook transcript length", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const response = await POST(
      new Request("http://localhost/api/did/conversation", {
        method: "POST",
        headers: { authorization: "Bearer webhook-test-secret" },
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
        headers: { authorization: "Bearer webhook-test-secret" },
        body: JSON.stringify({
          event_type: "conversation.done",
          chat_history: {
            messages: Array.from({ length: 51 }, () => ({ role: "user", content: "hello" })),
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(info).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
