import { afterEach, describe, expect, it, vi } from "vitest";

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
  clearSandboxSessionAsync,
  getActiveSandboxSessionAsync,
  resetSandboxSessionStoreForTests,
  touchSandboxSessionAsync,
} from "./session-store";

afterEach(() => {
  resetSandboxSessionStoreForTests();
  fakeStore.clear();
});

describe("sandbox-session-store async + Redis", () => {
  it("getActiveSandboxSessionAsync reads from Redis after in-memory store was cleared", async () => {
    await touchSandboxSessionAsync({
      chatId: "c-r1",
      sandboxId: "sb-1",
      sandboxUrl: "https://preview.vercel.run",
      versionId: "ver-a",
      now: 5_000,
    });
    resetSandboxSessionStoreForTests();
    const entry = await getActiveSandboxSessionAsync("c-r1", { now: 6_000 });
    expect(entry).not.toBeNull();
    expect(entry?.sandboxId).toBe("sb-1");
    expect(entry?.versionId).toBe("ver-a");
  });

  it("clearSandboxSessionAsync removes Redis entry", async () => {
    await touchSandboxSessionAsync({
      chatId: "c-r2",
      sandboxId: "sb-2",
      sandboxUrl: "https://x.run",
      now: 0,
    });
    await clearSandboxSessionAsync("c-r2");
    const entry = await getActiveSandboxSessionAsync("c-r2", { now: 0 });
    expect(entry).toBeNull();
  });
});
