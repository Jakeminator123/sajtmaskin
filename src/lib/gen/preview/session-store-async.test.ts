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
      sandboxId: "sb-1",
      sandboxUrl: "https://preview.vercel.run",
      versionId: "ver-a",
      now: 5_000,
    });
    resetPreviewSessionStoreForTests();
    const entry = await getActivePreviewSessionAsync("c-r1", { now: 6_000 });
    expect(entry).not.toBeNull();
    expect(entry?.sandboxId).toBe("sb-1");
    expect(entry?.versionId).toBe("ver-a");
  });

  it("clearPreviewSessionAsync removes Redis entry", async () => {
    await touchPreviewSessionAsync({
      chatId: "c-r2",
      sandboxId: "sb-2",
      sandboxUrl: "https://x.run",
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
    expect(entry?.sandboxId).toBe("legacy-sb-1");
    expect(entry?.versionId).toBe("v-legacy");
  });
});
