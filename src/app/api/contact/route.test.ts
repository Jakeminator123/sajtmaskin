import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_request: Request, _bucket: string, handler: () => Promise<Response>) =>
    handler(),
}));

vi.mock("@/lib/utils/debug", () => ({
  debugLog: vi.fn(),
  errorLog: vi.fn(),
}));

const { POST } = await import("./route");

function request(overrides: Record<string, unknown> = {}): Request {
  return new Request("http://localhost/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Testperson",
      email: "test@example.com",
      subject: "Fråga",
      message: "Ett giltigt meddelande",
      ...overrides,
    }),
  });
}

describe("POST /api/contact", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects an oversized body before validation", async () => {
    const req = request();
    req.headers.set("content-length", "16385");
    const res = await POST(req);

    expect(res.status).toBe(413);
  });

  it("rejects email addresses longer than the mailbox limit", async () => {
    const res = await POST(request({ email: `${"x".repeat(245)}@example.com` }));

    expect(res.status).toBe(400);
  });

  it("rejects line breaks in the provider subject header", async () => {
    const res = await POST(request({ subject: "Fråga\r\nBcc: attacker@example.com" }));

    expect(res.status).toBe(400);
  });
});
