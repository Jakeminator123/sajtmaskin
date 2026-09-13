import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getRedis = vi.hoisted(() => vi.fn());
const lockConfig = vi.hoisted(() => ({ REDIS_KEY_PREFIX: "test:" }));

vi.mock("@/lib/data/redis", () => ({ getRedis }));
vi.mock("@/lib/config", () => lockConfig);

import {
  acquireChatGenerationLock,
  acquireUserGenerationLock,
  bindUserGenerationLockToResponse,
  USER_GENERATION_LOCK_TTL_SECONDS,
  bindChatGenerationLockToResponse,
  chatGenerationLockFailureResponse,
  releaseChatGenerationLock,
  resetChatGenerationLocksForTests,
  type AcquireChatGenerationLockResult,
  type ChatGenerationLock,
} from "./generation-lock";

function expectAcquired(result: AcquireChatGenerationLockResult): ChatGenerationLock {
  expect(result).toEqual(expect.objectContaining({ status: "acquired" }));
  if (result.status !== "acquired") {
    throw new Error(`expected acquired, got ${result.status}`);
  }
  return result.lock;
}

describe("chat generation lock", () => {
  beforeEach(() => {
    getRedis.mockReturnValue(null);
    resetChatGenerationLocksForTests();
  });

  afterEach(() => {
    resetChatGenerationLocksForTests();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("låter bara en lock-hållare per chat i samma process", async () => {
    const first = expectAcquired(await acquireChatGenerationLock("chat-a"));
    expect(await acquireChatGenerationLock("chat-a")).toEqual({ status: "held" });
    await releaseChatGenerationLock(first);
    expectAcquired(await acquireChatGenerationLock("chat-a"));
  });

  it("isolerar olika chattar", async () => {
    expectAcquired(await acquireChatGenerationLock("chat-a"));
    expectAcquired(await acquireChatGenerationLock("chat-b"));
  });

  it("rapporterar unavailable när Redis är konfigurerad men SET kastar", async () => {
    getRedis.mockReturnValue({
      set: vi.fn().mockRejectedValue(new Error("redis down")),
    });
    expect(await acquireChatGenerationLock("chat-redis-down")).toEqual({
      status: "unavailable",
    });
  });

  it("mappar held till 409 och unavailable till 503", async () => {
    const held = chatGenerationLockFailureResponse("held");
    expect(held.status).toBe(409);
    expect(await held.json()).toMatchObject({ reason: "generation_in_progress" });
    const unavailable = chatGenerationLockFailureResponse("unavailable");
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toMatchObject({ reason: "generation_lock_unavailable" });
    const withChat = chatGenerationLockFailureResponse("unavailable", { chatId: "chat-created" });
    expect(await withChat.json()).toMatchObject({ chatId: "chat-created" });
  });

  it("släpper JSON-svar omedelbart så nästa generation kan starta", async () => {
    const lock = expectAcquired(await acquireChatGenerationLock("chat-json"));
    const response = bindChatGenerationLockToResponse(
      new Response(JSON.stringify({ error: "nope" }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
      lock,
    );
    expect(response.status).toBe(409);
    await Promise.resolve();
    expectAcquired(await acquireChatGenerationLock("chat-json"));
  });

  it("håller locken tills SSE-bodyn stängs", async () => {
    const lock = expectAcquired(await acquireChatGenerationLock("chat-sse"));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("event: delta\ndata: x\n\n"));
        controller.close();
      },
    });
    const response = bindChatGenerationLockToResponse(
      new Response(stream, { headers: { "content-type": "text/event-stream" } }),
      lock,
    );
    expect(await acquireChatGenerationLock("chat-sse")).toEqual({ status: "held" });
    await response.text();
    await vi.waitFor(async () => {
      expectAcquired(await acquireChatGenerationLock("chat-sse"));
    });
  });

  it("resetChatGenerationLocksForTests släpper olästa SSE-lås", async () => {
    const lock = expectAcquired(await acquireChatGenerationLock("chat-unread"));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("event: delta\ndata: x\n\n"));
        controller.close();
      },
    });
    bindChatGenerationLockToResponse(
      new Response(stream, { headers: { "content-type": "text/event-stream" } }),
      lock,
    );
    expect(await acquireChatGenerationLock("chat-unread")).toEqual({ status: "held" });
    resetChatGenerationLocksForTests();
    expectAcquired(await acquireChatGenerationLock("chat-unread"));
  });
});


describe("durable account lease ownership", () => {
  beforeEach(() => { getRedis.mockReturnValue(null); resetChatGenerationLocksForTests(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); resetChatGenerationLocksForTests(); });

  it("an expired holder cannot release a replacement lease", async () => {
    vi.useFakeTimers();
    const stale = expectAcquired(await acquireUserGenerationLock("user-a"));
    vi.advanceTimersByTime(USER_GENERATION_LOCK_TTL_SECONDS * 1000 + 1);
    const current = expectAcquired(await acquireUserGenerationLock("user-a"));
    await releaseChatGenerationLock(stale);
    expect(await acquireUserGenerationLock("user-a")).toEqual({ status: "held" });
    await releaseChatGenerationLock(current);
    expectAcquired(await acquireUserGenerationLock("user-a"));
  });

  it("uses a distinct Redis account key and atomic compare-and-delete on release", async () => {
    const values = new Map<string, string>();
    const set = vi.fn(async (key: string, token: string) => {
      if (values.has(key)) return null;
      values.set(key, token);
      return "OK";
    });
    const evaluate = vi.fn(async (_script: string, _count: number, key: string, token: string) => {
      if (values.get(key) !== token) return 0;
      values.delete(key);
      return 1;
    });
    getRedis.mockReturnValue({ set, eval: evaluate });
    const first = expectAcquired(await acquireUserGenerationLock("account/a"));
    expect(set).toHaveBeenCalledWith(
      "sajtmaskin:shared-entitlement:user-generation-lock:account%2Fa", first.token, "EX", USER_GENERATION_LOCK_TTL_SECONDS, "NX",
    );
    expectAcquired(await acquireChatGenerationLock("account/a"));
    values.set("sajtmaskin:shared-entitlement:user-generation-lock:account%2Fa", "new-owner");
    await releaseChatGenerationLock(first);
    expect(evaluate).toHaveBeenCalledWith(
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
      1, "sajtmaskin:shared-entitlement:user-generation-lock:account%2Fa", first.token,
    );
    expect(await acquireUserGenerationLock("account/a")).toEqual({ status: "held" });
  });

  it("shares account admission across preview/prod module instances while preserving chat namespaces", async () => {
    // Two module instances model separate workers with different runtime
    // prefixes. Only their durable Redis store is shared, as deployments must be.
    const values = new Map<string, string>();
    const set = vi.fn(async (key: string, token: string) => {
      if (values.has(key)) return null;
      values.set(key, token);
      return "OK";
    });
    const evaluate = vi.fn(async (_script: string, _count: number, key: string, token: string) => {
      if (values.get(key) !== token) return 0;
      values.delete(key);
      return 1;
    });
    getRedis.mockReturnValue({ set, eval: evaluate });
    try {
      lockConfig.REDIS_KEY_PREFIX = "preview:";
      vi.stubEnv("VERCEL_ENV", "preview");
      vi.resetModules();
      const preview = await import("./generation-lock");
      lockConfig.REDIS_KEY_PREFIX = "prod:";
      vi.stubEnv("VERCEL_ENV", "production");
      vi.resetModules();
      const production = await import("./generation-lock");

      const previewHolder = expectAcquired(await preview.acquireUserGenerationLock("shared-user"));
      expect(await production.acquireUserGenerationLock("shared-user")).toEqual({ status: "held" });
      expectAcquired(await preview.acquireChatGenerationLock("same-chat"));
      expectAcquired(await production.acquireChatGenerationLock("same-chat"));
      expect(values.has("preview:generation-lock:same-chat")).toBe(true);
      expect(values.has("prod:generation-lock:same-chat")).toBe(true);

      // Expiry/reacquisition in the other deployment must also be ownership-safe.
      const accountKey = "sajtmaskin:shared-entitlement:user-generation-lock:shared-user";
      values.delete(accountKey);
      const productionHolder = expectAcquired(await production.acquireUserGenerationLock("shared-user"));
      await preview.releaseChatGenerationLock(previewHolder);
      expect(values.get(accountKey)).toBe(productionHolder.token);
      expect(await preview.acquireUserGenerationLock("shared-user")).toEqual({ status: "held" });
      await production.releaseChatGenerationLock(productionHolder);
      expectAcquired(await preview.acquireUserGenerationLock("shared-user"));
    } finally {
      lockConfig.REDIS_KEY_PREFIX = "test:";
      vi.resetModules();
    }
  });

  it("retains an untracked canceled stream until expiry rather than reopening admission", async () => {
    const lock = expectAcquired(await acquireUserGenerationLock("user-cancel"));
    const response = bindUserGenerationLockToResponse(
      new Response(new ReadableStream(), { headers: { "content-type": "text/event-stream" } }), lock,
    );
    await response.body!.cancel();
    expect(await acquireUserGenerationLock("user-cancel")).toEqual({ status: "held" });
  });

  it("releases normal account stream completion", async () => {
    const lock = expectAcquired(await acquireUserGenerationLock("user-done"));
    const response = bindUserGenerationLockToResponse(
      new Response("data: done\n\n", { headers: { "content-type": "text/event-stream" } }), lock,
    );
    await response.text();
    expectAcquired(await acquireUserGenerationLock("user-done"));
  });
});
