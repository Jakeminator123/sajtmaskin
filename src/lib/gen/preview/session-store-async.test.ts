import { afterEach, describe, expect, it, vi } from "vitest";
import { REDIS_KEY_PREFIX } from "@/lib/config";

const { fakeStore, redisStub } = vi.hoisted(() => {
  const fakeStore = new Map<string, string>();
  return {
    fakeStore,
    redisStub: {
      get: async (k: string) => fakeStore.get(k) ?? null,
      setex: async (k: string, _ttl: number, v: string) => {
        fakeStore.set(k, v);
      },
      del: async (k: string) => {
        fakeStore.delete(k);
      },
    },
  };
});

vi.mock("@/lib/data/redis", () => ({
  getRedis: () => redisStub,
}));

import {
  clearPreviewSessionAsync,
  getActivePreviewSessionAsync,
  resetPreviewSessionStoreForTests,
  touchPreviewSessionAsync,
} from "./session-store";

afterEach(() => {
  resetPreviewSessionStoreForTests();
  fakeStore.clear();
});

describe("preview-session-store async + Redis", () => {
  it("getActivePreviewSessionAsync reads from Redis after in-memory store was cleared", async () => {
    await touchPreviewSessionAsync({
      chatId: "c-r1",
      previewSessionId: "ps-1",
      previewUrl: "https://preview.vercel.run",
      versionId: "ver-a",
      now: 5_000,
    });
    resetPreviewSessionStoreForTests();
    const entry = await getActivePreviewSessionAsync("c-r1", { now: 6_000 });
    expect(entry).not.toBeNull();
    expect(entry?.previewSessionId).toBe("ps-1");
    expect(entry?.versionId).toBe("ver-a");
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
    });
    expect(parsed.sandboxId).toBeUndefined();
    expect(parsed.sandboxUrl).toBeUndefined();
  });
});
