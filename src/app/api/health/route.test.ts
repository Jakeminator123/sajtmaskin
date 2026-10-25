import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ping = vi.hoisted(() => vi.fn());

vi.mock("@/lib/config", () => ({
  FEATURES: {
    useRedisCache: true,
    useBuilderImageGenerations: true,
    useVercelApi: true,
    useVercelBlob: true,
  },
}));

vi.mock("@/lib/data/redis", () => ({
  getRedis: () => ({ ping }),
}));

const { GET } = await import("./route");

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ping.mockResolvedValue("PONG");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("checks Redis without writing and exposes no connection metadata", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.redis).toEqual({ status: "connected" });
    expect(JSON.stringify(body)).not.toMatch(/host|port|password|redis:\/\//i);
    expect(ping).toHaveBeenCalledOnce();
  });

  it.each([
    new Error("redis://user:secret@private-host:6379", { cause: new Error("nested-secret") }),
    "redis://user:secret@private-host:6379",
    { connection: "redis://user:secret@private-host:6379" },
  ])("masks Redis failures in both the response and server logs (%#)", async (failure) => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    ping.mockRejectedValueOnce(failure);

    const response = await GET();
    const body = await response.json();

    expect(body).toMatchObject({ redis: { status: "error" } });
    expect(JSON.stringify(body)).not.toContain("private-host");
    expect(consoleError.mock.calls).toEqual([["[API/health] Redis check failed"]]);
  });
});
