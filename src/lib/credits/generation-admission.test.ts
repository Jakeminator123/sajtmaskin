import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prepareCredits = vi.hoisted(() => vi.fn());
const getRedis = vi.hoisted(() => vi.fn());
vi.mock("./server", () => ({ prepareCredits }));
vi.mock("@/lib/data/redis", () => ({ getRedis }));
vi.mock("@/lib/config", () => ({ REDIS_KEY_PREFIX: "test:" }));

import { prepareGenerationCredits } from "./generation-admission";
import {
  acquireUserGenerationLock,
  releaseChatGenerationLock,
  resetChatGenerationLocksForTests,
} from "@/lib/gen/stream/generation-lock";

function eligible() {
  return { ok: true, user: { id: "user-1" }, cost: 10, usingFreeGeneration: true };
}
const request = (signal?: AbortSignal) => new Request("https://example.test", { signal });
const admit = (req = request(), action: "prompt.create" | "prompt.refine" = "prompt.create") =>
  prepareGenerationCredits(req, action, {}, { allowFreeGeneration: true });

beforeEach(() => {
  vi.clearAllMocks();
  getRedis.mockReturnValue(null);
  prepareCredits.mockResolvedValue(eligible());
  resetChatGenerationLocksForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetChatGenerationLocksForTests();
});

describe("account generation admission", () => {
  it("admits only one simultaneous create/follow-up for the same account", async () => {
    const results = await Promise.all([admit(), admit(request(), "prompt.refine")]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const denied = results.find((result) => !result.ok);
    expect(denied && !denied.ok && denied.response.status).toBe(409);
    // Both initial reads pass; only the lease holder reaches the fresh read.
    expect(prepareCredits).toHaveBeenCalledTimes(3);
  });

  it("denies entitlement or balance consumed between the initial read and acquisition", async () => {
    prepareCredits.mockResolvedValueOnce(eligible()).mockResolvedValueOnce({
      ok: false, cost: 10, response: new Response(null, { status: 402 }),
    });
    const result = await admit();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(402);
    expect(prepareCredits).toHaveBeenCalledTimes(2);
    expect(await acquireUserGenerationLock("user-1")).toMatchObject({ status: "acquired" });
  });

  it("cleans up admission if the fresh account read throws", async () => {
    prepareCredits.mockResolvedValueOnce(eligible()).mockRejectedValueOnce(new Error("db down"));
    await expect(admit()).rejects.toThrow("db down");
    expect(await acquireUserGenerationLock("user-1")).toMatchObject({ status: "acquired" });
  });

  it("requires durable Redis in production and rejects Redis errors", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const missing = await admit();
    expect(!missing.ok && missing.response.status).toBe(503);
    getRedis.mockReturnValue({ set: vi.fn().mockRejectedValue(new Error("redis down")) });
    const failed = await admit();
    expect(!failed.ok && failed.response.status).toBe(503);
    expect(prepareCredits).toHaveBeenCalledTimes(2); // no second read or admitted work
  });

  it("does not acquire a lease for a denied preliminary credit check", async () => {
    prepareCredits.mockResolvedValueOnce({
      ok: false, cost: 10, response: new Response(null, { status: 401 }),
    });
    expect((await admit()).ok).toBe(false);
    expect(await acquireUserGenerationLock("user-1")).toMatchObject({ status: "acquired" });
  });

  it("releases admission when the request aborts during the fresh read", async () => {
    const controller = new AbortController();
    prepareCredits.mockResolvedValueOnce(eligible()).mockImplementationOnce(async () => {
      controller.abort();
      return eligible();
    });
    const result = await admit(request(controller.signal));
    expect(!result.ok && result.response.status).toBe(499);
    expect(await acquireUserGenerationLock("user-1")).toMatchObject({ status: "acquired" });
  });

  it("rechecks the next request after a prior generation has settled and released", async () => {
    const first = await admit();
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await releaseChatGenerationLock(first.generationLock);
    prepareCredits.mockResolvedValue({
      ok: false, cost: 10, response: new Response(null, { status: 402 }),
    });
    const second = await admit(request(), "prompt.refine");
    expect(!second.ok && second.response.status).toBe(402);
  });
});
