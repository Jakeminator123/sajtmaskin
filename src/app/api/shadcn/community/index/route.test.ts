import { describe, expect, it, vi } from "vitest";

const queryCommunityRegistryIndex = vi.hoisted(() => vi.fn());
vi.mock("@/lib/bot-protection", () => ({ requireNotBot: () => null }));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));
vi.mock("@/lib/shadcn/community-registry-index", () => ({
  capCommunityIndexNames: (names?: string[]) => names,
  queryCommunityRegistryIndex,
  SHADCNBLOCKS_NAMESPACE: "@shadcnblocks",
}));

const { GET } = await import("./route");

describe("GET /api/shadcn/community/index", () => {
  it("rejects oversized query values before index work", async () => {
    const res = await GET(
      new Request(`http://localhost/api/shadcn/community/index?q=${"x".repeat(257)}`),
    );

    expect(res.status).toBe(400);
    expect(queryCommunityRegistryIndex).not.toHaveBeenCalled();
  });

  it("does not expose upstream failures", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    queryCommunityRegistryIndex.mockRejectedValue(new Error("community token secret"));

    const res = await GET(new Request("http://localhost/api/shadcn/community/index"));

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "Community registry index failed" });
    error.mockRestore();
  });
});
