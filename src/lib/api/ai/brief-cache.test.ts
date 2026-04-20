import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fakeStore, redisStub, controls } = vi.hoisted(() => {
  const fakeStore = new Map<string, string>();
  const controls = {
    throwOnGet: false,
    throwOnSetex: false,
  };
  return {
    fakeStore,
    controls,
    redisStub: {
      get: vi.fn(async (k: string) => {
        if (controls.throwOnGet) throw new Error("redis-get-boom");
        return fakeStore.get(k) ?? null;
      }),
      setex: vi.fn(async (k: string, _ttl: number, v: string) => {
        if (controls.throwOnSetex) throw new Error("redis-setex-boom");
        fakeStore.set(k, v);
      }),
    },
  };
});

const { featuresMock } = vi.hoisted(() => ({
  featuresMock: { useRedisCache: true },
}));

vi.mock("@/lib/data/redis", () => ({
  getRedis: () => redisStub,
}));

vi.mock("@/lib/config", () => ({
  FEATURES: featuresMock,
  REDIS_KEY_PREFIX: "test:",
}));

vi.mock("@/lib/logging/devLog", () => ({
  devLogAppend: vi.fn(),
}));

import {
  BRIEF_CACHE_TTL_SECONDS,
  buildBriefCacheKey,
  readBriefCache,
  writeBriefCache,
} from "./brief-cache";
import { devLogAppend } from "@/lib/logging/devLog";

const devLogAppendMock = devLogAppend as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  fakeStore.clear();
  controls.throwOnGet = false;
  controls.throwOnSetex = false;
  redisStub.get.mockClear();
  redisStub.setex.mockClear();
  devLogAppendMock.mockClear();
  featuresMock.useRedisCache = true;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("brief-cache key generation", () => {
  it("produces identical keys for the same inputs regardless of extras key order", () => {
    const a = buildBriefCacheKey({
      chatId: "c1",
      prompt: "  build me a portfolio  ",
      modelId: "openai/gpt-5.4",
      extraInputsForHash: { temperature: 0.7, imageGenerations: true, maxTokens: 4000 },
    });
    const b = buildBriefCacheKey({
      chatId: "c1",
      prompt: "build me a portfolio",
      modelId: "openai/gpt-5.4",
      extraInputsForHash: { maxTokens: 4000, imageGenerations: true, temperature: 0.7 },
    });
    expect(a.promptHash).toBe(b.promptHash);
    expect(a.promptHash).toHaveLength(24);
    expect(a).toEqual(b);
  });

  it("treats different model ids as distinct keys", () => {
    const base = {
      chatId: "c1",
      prompt: "site about cats",
      extraInputsForHash: { imageGenerations: true },
    };
    const a = buildBriefCacheKey({ ...base, modelId: "openai/gpt-5.4" });
    const b = buildBriefCacheKey({ ...base, modelId: "anthropic/claude-4-5" });
    expect(a.modelId).not.toBe(b.modelId);
    // promptHash itself is identical (model isn't part of the hash) but the
    // composite Redis key carries modelId, so reads/writes don't collide.
    expect(a.promptHash).toBe(b.promptHash);
  });

  it("defaults chatId to null when omitted", () => {
    const k = buildBriefCacheKey({
      prompt: "anon prompt",
      modelId: "openai/gpt-5.4",
    });
    expect(k.chatId).toBeNull();
  });
});

describe("brief-cache read/write", () => {
  it("writes then reads a cached brief", async () => {
    const key = buildBriefCacheKey({
      chatId: "c1",
      prompt: "hello",
      modelId: "openai/gpt-5.4",
    });
    await writeBriefCache(key, { brief: { ok: true }, briefQuality: "full", provider: "openai" });
    expect(redisStub.setex).toHaveBeenCalledTimes(1);
    const [redisKey, ttl, raw] = redisStub.setex.mock.calls[0];
    expect(typeof redisKey).toBe("string");
    expect(redisKey).toContain("test:brief:v1:openai/gpt-5.4:c1:");
    expect(ttl).toBe(BRIEF_CACHE_TTL_SECONDS);
    expect(JSON.parse(raw as string).json).toEqual({
      brief: { ok: true },
      briefQuality: "full",
      provider: "openai",
    });

    const hit = await readBriefCache(key);
    expect(hit).not.toBeNull();
    expect(hit!.json).toEqual({ brief: { ok: true }, briefQuality: "full", provider: "openai" });
    expect(typeof hit!.cachedAt).toBe("number");
  });

  it("returns null on a cache miss", async () => {
    const key = buildBriefCacheKey({
      chatId: null,
      prompt: "never written",
      modelId: "openai/gpt-5.4",
    });
    expect(await readBriefCache(key)).toBeNull();
  });

  it("swallows Redis read errors and logs them via devLogAppend", async () => {
    const key = buildBriefCacheKey({
      chatId: null,
      prompt: "boom",
      modelId: "openai/gpt-5.4",
    });
    controls.throwOnGet = true;
    const result = await readBriefCache(key);
    expect(result).toBeNull();
    expect(devLogAppendMock).toHaveBeenCalledWith(
      "latest",
      expect.objectContaining({ type: "brief-cache.read.error" }),
    );
  });

  it("swallows Redis write errors and logs them", async () => {
    const key = buildBriefCacheKey({
      chatId: "c2",
      prompt: "write boom",
      modelId: "openai/gpt-5.4",
    });
    controls.throwOnSetex = true;
    await writeBriefCache(key, { brief: { ok: true } });
    expect(devLogAppendMock).toHaveBeenCalledWith(
      "latest",
      expect.objectContaining({ type: "brief-cache.write.error" }),
    );
  });

  it("no-ops reads/writes when useRedisCache is false", async () => {
    featuresMock.useRedisCache = false;
    const key = buildBriefCacheKey({
      chatId: "c3",
      prompt: "skip",
      modelId: "openai/gpt-5.4",
    });
    await writeBriefCache(key, { brief: { ok: true } });
    const result = await readBriefCache(key);
    expect(result).toBeNull();
    expect(redisStub.get).not.toHaveBeenCalled();
    expect(redisStub.setex).not.toHaveBeenCalled();
  });
});
