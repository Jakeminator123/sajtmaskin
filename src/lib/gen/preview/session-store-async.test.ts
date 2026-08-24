import { afterEach, describe, expect, it, vi } from "vitest";
import { REDIS_KEY_PREFIX } from "@/lib/config";

const { fakeStore, redisStub } = vi.hoisted(() => {
  const fakeStore = new Map<string, string>();
  return {
    fakeStore,
    redisStub: {
      get: async (k: string) => fakeStore.get(k) ?? null,
      setex: vi.fn(async (k: string, _ttl: number, v: string) => {
        fakeStore.set(k, v);
      }),
      del: vi.fn(async (k: string) => {
        fakeStore.delete(k);
      }),
    },
  };
});

vi.mock("@/lib/data/redis", () => ({
  getRedis: () => redisStub,
}));

import {
  clearPreviewSessionAsync,
  getActivePreviewSessionAsync,
  peekActivePreviewSessionAsync,
  resetPreviewSessionStoreForTests,
  touchPreviewSessionAsync,
} from "./session-store";

afterEach(() => {
  resetPreviewSessionStoreForTests();
  fakeStore.clear();
  redisStub.setex.mockClear();
  redisStub.del.mockClear();
});

describe("preview-session-store async + Redis", () => {
  it("getActivePreviewSessionAsync reads from Redis after in-memory store was cleared", async () => {
    await touchPreviewSessionAsync({
      chatId: "c-r1",
      previewSessionId: "ps-1",
      previewUrl: "https://preview.vercel.run",
      versionId: "ver-a",
      filesRevision: "rev-a",
      now: 5_000,
    });
    resetPreviewSessionStoreForTests();
    const entry = await getActivePreviewSessionAsync("c-r1", { now: 6_000 });
    expect(entry).not.toBeNull();
    expect(entry?.previewSessionId).toBe("ps-1");
    expect(entry?.versionId).toBe("ver-a");
    expect(entry?.filesRevision).toBe("rev-a");
  });

  it("clearPreviewSessionAsync removes Redis entry", async () => {
    await touchPreviewSessionAsync({
      chatId: "c-r2",
      previewSessionId: "ps-2",
      previewUrl: "https://x.run",
      now: 0,
    });
    await clearPreviewSessionAsync("c-r2");
    const entry = await getActivePreviewSessionAsync("c-r2", { now: 0 });
    expect(entry).toBeNull();
  });

  it("reads legacy sandbox-preview redis key when canonical key is missing", async () => {
    fakeStore.set(
      `${REDIS_KEY_PREFIX}sandbox-preview:session:c-legacy`,
      JSON.stringify({
        sandboxId: "legacy-sb-1",
        sandboxUrl: "https://legacy.vercel.run",
        versionId: "v-legacy",
        createdAt: 1000,
        lastUsedAt: 2000,
      }),
    );

    const entry = await getActivePreviewSessionAsync("c-legacy", { now: 2500 });
    expect(entry).not.toBeNull();
    expect(entry?.previewSessionId).toBe("legacy-sb-1");
    expect(entry?.versionId).toBe("v-legacy");
  });

  it("writes only canonical Redis session key and fields", async () => {
    await touchPreviewSessionAsync({
      chatId: "c-write",
      previewSessionId: "ps-write",
      previewUrl: "https://preview.example/c-write",
      versionId: "ver-write",
      filesRevision: "rev-write",
      now: 1000,
    });

    expect(fakeStore.has(`${REDIS_KEY_PREFIX}sandbox-preview:session:c-write`)).toBe(false);
    const raw = fakeStore.get(`${REDIS_KEY_PREFIX}preview-session:session:c-write`);
    expect(raw).toBeTypeOf("string");
    const parsed = JSON.parse(raw!);
    expect(parsed).toMatchObject({
      previewSessionId: "ps-write",
      previewUrl: "https://preview.example/c-write",
      versionId: "ver-write",
      filesRevision: "rev-write",
    });
    expect(parsed.sandboxId).toBeUndefined();
    expect(parsed.sandboxUrl).toBeUndefined();
  });

  it("peek returns an expired entry as absent without deleting Redis state", async () => {
    await touchPreviewSessionAsync({
      chatId: "c-peek-expired",
      previewSessionId: "ps-peek-expired",
      previewUrl: "https://preview.example/expired",
      versionId: "ver-expired",
      filesRevision: "rev-expired",
      now: 1_000,
    });
    resetPreviewSessionStoreForTests();
    redisStub.del.mockClear();

    const entry = await peekActivePreviewSessionAsync("c-peek-expired", {
      now: 1_000_000,
      idleMs: 10,
      hardCapMs: 10,
    });
    expect(entry).toBeNull();
    expect(redisStub.del).not.toHaveBeenCalled();
    expect(fakeStore.has(`${REDIS_KEY_PREFIX}preview-session:session:c-peek-expired`)).toBe(true);
  });

  it("peek does not fill the in-process cache after a Redis read", async () => {
    await touchPreviewSessionAsync({
      chatId: "c-peek-cache",
      previewSessionId: "ps-peek-cache",
      previewUrl: "https://preview.example/cache",
      versionId: "ver-cache",
      filesRevision: "rev-cache",
      now: 1_000,
    });
    resetPreviewSessionStoreForTests();
    const first = await peekActivePreviewSessionAsync("c-peek-cache", { now: 1_500 });
    expect(first?.previewSessionId).toBe("ps-peek-cache");

    fakeStore.delete(`${REDIS_KEY_PREFIX}preview-session:session:c-peek-cache`);
    const second = await peekActivePreviewSessionAsync("c-peek-cache", { now: 1_500 });
    expect(second).toBeNull();
  });
});
