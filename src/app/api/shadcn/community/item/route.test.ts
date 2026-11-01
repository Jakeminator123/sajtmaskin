import { beforeEach, describe, expect, it, vi } from "vitest";

const getRequestUserId = vi.hoisted(() => vi.fn());
vi.mock("@/lib/bot-protection", () => ({ requireNotBot: () => null }));
vi.mock("@/lib/tenant", () => ({ getRequestUserId }));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));
vi.mock("@/lib/shadcn/community-registry-fetch", () => ({
  buildCommunityRegistryRequest: (url: string) => ({ url, init: {} }),
}));
vi.mock("@/lib/shadcn/registry-service", () => ({ isUsableRegistryItem: () => true }));

const { GET } = await import("./route");

describe("GET /api/shadcn/community/item", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getRequestUserId.mockResolvedValue("user_1");
  });

  it("does not expose fetch failures", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5"));

    const res = await GET(
      new Request("http://localhost/api/shadcn/community/item?name=hero1"),
    );

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "Community registry fetch failed" });
    error.mockRestore();
  });

  it("rejects an oversized item name before fetching", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await GET(
      new Request(`http://localhost/api/shadcn/community/item?name=${"x".repeat(201)}`),
    );

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
