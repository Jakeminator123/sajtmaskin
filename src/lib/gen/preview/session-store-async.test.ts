import { afterEach, describe, expect, it, vi } from "vitest";
import { REDIS_KEY_PREFIX } from "@/lib/config";

const { fakeStore, redisControl, redisStub } = vi.hoisted(() => {
  const fakeStore = new Map<string, string>();
  const redisControl = {
    blockedLifecycleToken: null as string | null,
    blockedVersionId: null as string | null,
    writeEntered: null as (() => void) | null,
    releaseWrite: null as Promise<void> | null,
    blockedDeleteKey: null as string | null,
    deleteEntered: null as (() => void) | null,
    releaseDelete: null as Promise<void> | null,
    evalError: null as Error | null,
  };
  const maybeBlockWrite = async (raw: string | undefined) => {
    if (!raw || (!redisControl.blockedLifecycleToken && !redisControl.blockedVersionId)) return;
    const parsed = JSON.parse(raw) as { lifecycleToken?: string; versionId?: string };
    if (
      parsed.lifecycleToken !== redisControl.blockedLifecycleToken &&
      parsed.versionId !== redisControl.blockedVersionId
    ) return;
    redisControl.writeEntered?.();
    await redisControl.releaseWrite;
  };
  return {
    fakeStore,
    redisControl,
    redisStub: {
      get: async (k: string) => fakeStore.get(k) ?? null,
      setex: async (k: string, _ttl: number, v: string) => {
        await maybeBlockWrite(v);
        fakeStore.set(k, v);
      },
      del: async (...keys: string[]) => {
        for (const key of keys) fakeStore.delete(key);
      },
      eval: async (_script: string, keyCount: number, ...args: string[]) => {
        if (redisControl.evalError) throw redisControl.evalError;
        const keys = args.slice(0, keyCount);
        if (_script.includes("SETEX")) {
          const [expectedCanonical, expectedLegacy, missing, _ttl, value] = args.slice(keyCount);
          await maybeBlockWrite(value);
          const canonical = fakeStore.get(keys[0]!) ?? missing;
          const legacy = fakeStore.get(keys[1]!) ?? missing;
          if (canonical !== expectedCanonical || legacy !== expectedLegacy) return 0;
          fakeStore.set(keys[0]!, value!);
          fakeStore.delete(keys[1]!);
          return 1;
        }
        if (redisControl.blockedDeleteKey && keys.includes(redisControl.blockedDeleteKey)) {
          redisControl.deleteEntered?.();
          await redisControl.releaseDelete;
        }
        if (_script.includes("local canonical") && keyCount === 2) {
          const [expectedCanonical, expectedLegacy, missing] = args.slice(keyCount);
          const canonical = fakeStore.get(keys[0]!) ?? missing;
          const legacy = fakeStore.get(keys[1]!) ?? missing;
          if (canonical !== expectedCanonical || legacy !== expectedLegacy) return 0;
          for (const key of keys) fakeStore.delete(key);
          return 1;
        }
        const expected = args[keyCount];
        if (!keys[0] || fakeStore.get(keys[0]) !== expected) return 0;
        for (const key of keys) fakeStore.delete(key);
        return 1;
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
  redisControl.blockedLifecycleToken = null;
  redisControl.blockedVersionId = null;
  redisControl.writeEntered = null;
  redisControl.releaseWrite = null;
  redisControl.blockedDeleteKey = null;
  redisControl.deleteEntered = null;
  redisControl.releaseDelete = null;
  redisControl.evalError = null;
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

  it("a stale conditional clear cannot delete a newer lifecycle pointer", async () => {
    await touchPreviewSessionAsync({
      chatId: "c-race",
      previewSessionId: "ps-shared",
      previewUrl: "https://x.run/c-race",
      versionId: "v-old",
      lifecycleToken: "life-old",
      now: 1_000,
    });
    await touchPreviewSessionAsync({
      chatId: "c-race",
      previewSessionId: "ps-shared",
      previewUrl: "https://x.run/c-race",
      versionId: "v-new",
      lifecycleToken: "life-new",
      allowLifecycleAdvance: true,
      now: 2_000,
    });

    const cleared = await clearPreviewSessionAsync("c-race", {
      expectedPreviewSessionId: "ps-shared",
      expectedLifecycleToken: "life-old",
    });

    expect(cleared).toBe(false);
    expect(await getActivePreviewSessionAsync("c-race", { now: 2_500 })).toMatchObject({
      previewSessionId: "ps-shared",
      versionId: "v-new",
      lifecycleToken: "life-new",
    });
  });

  it("atomically fences a delayed lifecycle write after a newer lifecycle wins", async () => {
    let releaseOldWrite!: () => void;
    let markOldWriteEntered!: () => void;
    redisControl.blockedLifecycleToken = "life-old";
    redisControl.releaseWrite = new Promise<void>((resolve) => {
      releaseOldWrite = resolve;
    });
    const oldWriteEntered = new Promise<void>((resolve) => {
      markOldWriteEntered = resolve;
    });
    redisControl.writeEntered = markOldWriteEntered;

    const oldWrite = touchPreviewSessionAsync({
      chatId: "c-write-race",
      previewSessionId: "ps-shared",
      previewUrl: "https://x.run/c-write-race",
      versionId: "v-old",
      lifecycleToken: "life-old",
      now: 1_000,
    });
    await oldWriteEntered;

    await touchPreviewSessionAsync({
      chatId: "c-write-race",
      previewSessionId: "ps-shared",
      previewUrl: "https://x.run/c-write-race",
      versionId: "v-new",
      lifecycleToken: "life-new",
      now: 2_000,
    });
    releaseOldWrite();
    await oldWrite;

    resetPreviewSessionStoreForTests();
    expect(await getActivePreviewSessionAsync("c-write-race", { now: 2_500 })).toMatchObject({
      versionId: "v-new",
      lifecycleToken: "life-new",
    });
  });

  it("retries an authoritative host receipt when a heartbeat wins the first CAS", async () => {
    await touchPreviewSessionAsync({
      chatId: "c-heartbeat-first",
      previewSessionId: "ps-shared",
      previewUrl: "https://x.run/c-heartbeat-first",
      versionId: "v-old",
      lifecycleToken: "life-current",
      now: 1_000,
    });

    let releaseAuthoritativeWrite!: () => void;
    let markAuthoritativeWriteEntered!: () => void;
    redisControl.blockedVersionId = "v-new";
    redisControl.releaseWrite = new Promise<void>((resolve) => {
      releaseAuthoritativeWrite = resolve;
    });
    const authoritativeWriteEntered = new Promise<void>((resolve) => {
      markAuthoritativeWriteEntered = resolve;
    });
    redisControl.writeEntered = markAuthoritativeWriteEntered;

    const authoritativeWrite = touchPreviewSessionAsync({
      chatId: "c-heartbeat-first",
      previewSessionId: "ps-shared",
      previewUrl: "https://x.run/c-heartbeat-first",
      versionId: "v-new",
      lifecycleToken: "life-current",
      writeIntent: "authoritative",
      now: 3_000,
    });
    await authoritativeWriteEntered;

    expect(await touchPreviewSessionAsync({
      chatId: "c-heartbeat-first",
      previewSessionId: "ps-shared",
      previewUrl: "https://x.run/c-heartbeat-first",
      versionId: "v-old",
      lifecycleToken: "life-current",
      writeIntent: "refresh",
      now: 2_000,
    })).toBe(true);
    releaseAuthoritativeWrite();

    expect(await authoritativeWrite).toBe(true);
    resetPreviewSessionStoreForTests();
    expect(await getActivePreviewSessionAsync("c-heartbeat-first", { now: 3_500 })).toMatchObject({
      versionId: "v-new",
      lifecycleToken: "life-current",
      lastUsedAt: 3_000,
    });
  });

  it("does not let a delayed heartbeat overwrite an authoritative host receipt", async () => {
    await touchPreviewSessionAsync({
      chatId: "c-authority-first",
      previewSessionId: "ps-shared",
      previewUrl: "https://x.run/c-authority-first",
      versionId: "v-old",
      lifecycleToken: "life-current",
      now: 1_000,
    });

    let releaseHeartbeat!: () => void;
    let markHeartbeatEntered!: () => void;
    redisControl.blockedVersionId = "v-old";
    redisControl.releaseWrite = new Promise<void>((resolve) => {
      releaseHeartbeat = resolve;
    });
    const heartbeatEntered = new Promise<void>((resolve) => {
      markHeartbeatEntered = resolve;
    });
    redisControl.writeEntered = markHeartbeatEntered;
    const heartbeat = touchPreviewSessionAsync({
      chatId: "c-authority-first",
      previewSessionId: "ps-shared",
      previewUrl: "https://x.run/c-authority-first",
      versionId: "v-old",
      lifecycleToken: "life-current",
      writeIntent: "refresh",
      now: 2_000,
    });
    await heartbeatEntered;

    redisControl.blockedVersionId = null;
    expect(await touchPreviewSessionAsync({
      chatId: "c-authority-first",
      previewSessionId: "ps-shared",
      previewUrl: "https://x.run/c-authority-first",
      versionId: "v-new",
      lifecycleToken: "life-current",
      writeIntent: "authoritative",
      now: 3_000,
    })).toBe(true);
    releaseHeartbeat();
    expect(await heartbeat).toBe(false);

    resetPreviewSessionStoreForTests();
    expect(await getActivePreviewSessionAsync("c-authority-first", { now: 3_500 })).toMatchObject({
      versionId: "v-new",
      lifecycleToken: "life-current",
    });
  });

  it("does not let an older start receipt overwrite a lifecycle that already advanced", async () => {
    await touchPreviewSessionAsync({
      chatId: "c-start-reordered",
      previewSessionId: "ps-shared",
      previewUrl: "https://x.run/c-start-reordered",
      versionId: "v-newer",
      lifecycleToken: "life-newer",
      mutationRevision: 3,
      now: 3_000,
    });

    expect(await touchPreviewSessionAsync({
      chatId: "c-start-reordered",
      previewSessionId: "ps-shared",
      previewUrl: "https://x.run/c-start-reordered",
      versionId: "v-older",
      lifecycleToken: "life-older",
      mutationRevision: 2,
      allowLifecycleAdvance: true,
      expectedPreviousLifecycleToken: "life-original",
      writeIntent: "authoritative",
      now: 2_000,
    })).toBe(false);

    resetPreviewSessionStoreForTests();
    expect(await getActivePreviewSessionAsync("c-start-reordered", { now: 3_500 })).toMatchObject({
      versionId: "v-newer",
      lifecycleToken: "life-newer",
      mutationRevision: 3,
    });
  });

  it("orders same-token update receipts by host mutation revision, not app arrival", async () => {
    await touchPreviewSessionAsync({
      chatId: "c-update-reordered",
      previewSessionId: "ps-shared",
      previewUrl: "https://x.run/c-update-reordered",
      versionId: "v1",
      filesRevision: "files-1",
      lifecycleToken: "life-current",
      mutationRevision: 1,
      writeIntent: "authoritative",
      now: 1_000,
    });
    expect(await touchPreviewSessionAsync({
      chatId: "c-update-reordered",
      previewSessionId: "ps-shared",
      previewUrl: "https://x.run/c-update-reordered",
      versionId: "v3",
      filesRevision: "files-3",
      lifecycleToken: "life-current",
      mutationRevision: 3,
      writeIntent: "authoritative",
      now: 3_000,
    })).toBe(true);

    expect(await touchPreviewSessionAsync({
      chatId: "c-update-reordered",
      previewSessionId: "ps-shared",
      previewUrl: "https://x.run/c-update-reordered",
      versionId: "v2",
      filesRevision: "files-2",
      lifecycleToken: "life-current",
      mutationRevision: 2,
      writeIntent: "authoritative",
      now: 2_000,
    })).toBe(false);

    resetPreviewSessionStoreForTests();
    expect(await getActivePreviewSessionAsync("c-update-reordered", { now: 3_500 })).toMatchObject({
      versionId: "v3",
      filesRevision: "files-3",
      lifecycleToken: "life-current",
      mutationRevision: 3,
    });
  });

  it("heartbeat refresh changes only lastUsedAt and cannot roll content backward", async () => {
    await touchPreviewSessionAsync({
      chatId: "c-refresh-only",
      previewSessionId: "ps-shared",
      previewUrl: "https://x.run/c-refresh-only",
      versionId: "v2",
      filesRevision: "files-2",
      lifecycleToken: "life-current",
      mutationRevision: 2,
      writeIntent: "authoritative",
      now: 2_000,
    });

    expect(await touchPreviewSessionAsync({
      chatId: "c-refresh-only",
      previewSessionId: "ps-shared",
      previewUrl: "https://stale.example",
      versionId: "v1",
      filesRevision: "files-1",
      lifecycleToken: "life-current",
      mutationRevision: 1,
      writeIntent: "refresh",
      now: 3_000,
    })).toBe(true);

    resetPreviewSessionStoreForTests();
    expect(await getActivePreviewSessionAsync("c-refresh-only", { now: 3_500 })).toMatchObject({
      previewUrl: "https://x.run/c-refresh-only",
      versionId: "v2",
      filesRevision: "files-2",
      lifecycleToken: "life-current",
      mutationRevision: 2,
      lastUsedAt: 3_000,
    });
  });

  it("a legacy clear cannot report success when canonical N+1 appears before Lua", async () => {
    const legacyKey = `${REDIS_KEY_PREFIX}sandbox-preview:session:c-legacy-delete-race`;
    const canonicalKey = `${REDIS_KEY_PREFIX}preview-session:session:c-legacy-delete-race`;
    fakeStore.set(legacyKey, JSON.stringify({
      sandboxId: "ps-shared",
      sandboxUrl: "https://x.run/c-legacy-delete-race",
      versionId: "v-old",
      createdAt: 1_000,
      lastUsedAt: 1_000,
    }));

    let releaseDelete!: () => void;
    let markDeleteEntered!: () => void;
    redisControl.blockedDeleteKey = legacyKey;
    redisControl.releaseDelete = new Promise<void>((resolve) => {
      releaseDelete = resolve;
    });
    const deleteEntered = new Promise<void>((resolve) => {
      markDeleteEntered = resolve;
    });
    redisControl.deleteEntered = markDeleteEntered;

    const clear = clearPreviewSessionAsync("c-legacy-delete-race", {
      expectedPreviewSessionId: "ps-shared",
      expectedLifecycleToken: null,
    });
    await deleteEntered;
    fakeStore.set(canonicalKey, JSON.stringify({
      previewSessionId: "ps-shared",
      previewUrl: "https://x.run/c-legacy-delete-race",
      versionId: "v-new",
      lifecycleToken: "life-new",
      createdAt: 2_000,
      lastUsedAt: 2_000,
    }));
    releaseDelete();

    expect(await clear).toBe(false);
    expect(JSON.parse(fakeStore.get(canonicalKey)!)).toMatchObject({
      versionId: "v-new",
      lifecycleToken: "life-new",
    });
  });

  it("surfaces Redis errors instead of reporting a conditional clear as superseded", async () => {
    await touchPreviewSessionAsync({
      chatId: "c-clear-error",
      previewSessionId: "ps-error",
      previewUrl: "https://x.run/c-clear-error",
      lifecycleToken: "life-error",
      now: 1_000,
    });
    redisControl.evalError = new Error("redis unavailable");

    await expect(
      clearPreviewSessionAsync("c-clear-error", {
        expectedPreviewSessionId: "ps-error",
        expectedLifecycleToken: "life-error",
      }),
    ).rejects.toThrow("redis unavailable");
  });

  it("conditional clear stays idempotent after the exact lifecycle is already gone", async () => {
    await touchPreviewSessionAsync({
      chatId: "c-idempotent",
      previewSessionId: "ps-idempotent",
      previewUrl: "https://x.run/c-idempotent",
      lifecycleToken: "life-idempotent",
      now: 1_000,
    });
    const fence = {
      expectedPreviewSessionId: "ps-idempotent",
      expectedLifecycleToken: "life-idempotent",
    };

    expect(await clearPreviewSessionAsync("c-idempotent", fence)).toBe(true);
    expect(await clearPreviewSessionAsync("c-idempotent", fence)).toBe(true);
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
    expect(entry?.mutationRevision).toBeNull();
  });

  it("writes only canonical Redis session key and fields", async () => {
    await touchPreviewSessionAsync({
      chatId: "c-write",
      previewSessionId: "ps-write",
      previewUrl: "https://preview.example/c-write",
      versionId: "ver-write",
      filesRevision: "rev-write",
      lifecycleToken: "life-write",
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
      lifecycleToken: "life-write",
    });
    expect(parsed.sandboxId).toBeUndefined();
    expect(parsed.sandboxUrl).toBeUndefined();
  });
});
