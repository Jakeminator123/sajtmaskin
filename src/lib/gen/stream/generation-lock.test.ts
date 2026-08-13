import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getRedis = vi.hoisted(() => vi.fn());

vi.mock("@/lib/data/redis", () => ({ getRedis }));
vi.mock("@/lib/config", () => ({ REDIS_KEY_PREFIX: "test:" }));

import {
  acquireChatGenerationLock,
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
});
