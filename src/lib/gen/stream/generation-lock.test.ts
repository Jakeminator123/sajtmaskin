import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getRedis = vi.hoisted(() => vi.fn());

vi.mock("@/lib/data/redis", () => ({ getRedis }));
vi.mock("@/lib/config", () => ({ REDIS_KEY_PREFIX: "test:" }));

import {
  acquireChatGenerationLock,
  bindChatGenerationLockToResponse,
  releaseChatGenerationLock,
  resetChatGenerationLocksForTests,
} from "./generation-lock";

describe("chat generation lock", () => {
  beforeEach(() => {
    getRedis.mockReturnValue(null);
    resetChatGenerationLocksForTests();
  });

  afterEach(() => {
    resetChatGenerationLocksForTests();
  });

  it("låter bara en lock-hållare per chat i samma process", async () => {
    const first = await acquireChatGenerationLock("chat-a");
    const second = await acquireChatGenerationLock("chat-a");
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    await releaseChatGenerationLock(first!);
    const third = await acquireChatGenerationLock("chat-a");
    expect(third).not.toBeNull();
  });

  it("isolerar olika chattar", async () => {
    const a = await acquireChatGenerationLock("chat-a");
    const b = await acquireChatGenerationLock("chat-b");
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
  });

  it("failar stängt när Redis är konfigurerad men SET kastar", async () => {
    getRedis.mockReturnValue({
      set: vi.fn().mockRejectedValue(new Error("redis down")),
    });
    const lock = await acquireChatGenerationLock("chat-redis-down");
    expect(lock).toBeNull();
  });

  it("släpper JSON-svar omedelbart så nästa generation kan starta", async () => {
    const lock = await acquireChatGenerationLock("chat-json");
    expect(lock).not.toBeNull();
    const response = bindChatGenerationLockToResponse(
      new Response(JSON.stringify({ error: "nope" }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
      lock,
    );
    expect(response.status).toBe(409);
    await Promise.resolve();
    const again = await acquireChatGenerationLock("chat-json");
    expect(again).not.toBeNull();
  });

  it("håller locken tills SSE-bodyn stängs", async () => {
    const lock = await acquireChatGenerationLock("chat-sse");
    expect(lock).not.toBeNull();
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
    const blocked = await acquireChatGenerationLock("chat-sse");
    expect(blocked).toBeNull();
    await response.text();
    await vi.waitFor(async () => {
      const after = await acquireChatGenerationLock("chat-sse");
      expect(after).not.toBeNull();
    });
  });
});
