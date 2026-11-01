import { beforeEach, describe, expect, it, vi } from "vitest";

const searchTemplates = vi.hoisted(() => vi.fn());

vi.mock("@/lib/templates/template-search", () => ({ searchTemplates }));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

const { POST } = await import("./route");

function request(body: string): Request {
  return new Request("http://localhost/api/templates/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("POST /api/templates/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchTemplates.mockResolvedValue([]);
  });

  it.each([
    ["invalid JSON", "not-json"],
    ["null", "null"],
    ["array", "[]"],
    ["object query", '{"query":{}}'],
    ["object topK", '{"query":"portfolio","topK":{}}'],
  ])("rejects %s before search", async (_label, body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    expect(searchTemplates).not.toHaveBeenCalled();
  });

  it("normalizes query and bounds topK", async () => {
    const response = await POST(request('{"query":" portfolio ","topK":999}'));

    expect(response.status).toBe(200);
    expect(searchTemplates).toHaveBeenCalledWith("portfolio", 20);
  });

  it("does not expose search errors", async () => {
    searchTemplates.mockRejectedValue(new Error("secret vector endpoint"));

    const response = await POST(request('{"query":"portfolio"}'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ success: false, error: "Internal server error" });
    expect(JSON.stringify(body)).not.toContain("vector");
  });
});
