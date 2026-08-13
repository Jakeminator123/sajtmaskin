/**
 * Cross-instance "one codegen stream at a time" lock per chatId.
 *
 * Verify/repair already serialize per versionId via `engine_version_jobs`.
 * Codegen has no chat-level mutex — two tabs (or two serverless instances)
 * can both stream and persist versions. This lock closes that door for the
 * duration of the HTTP/SSE response.
 *
 * Redis when configured (same pattern as preview-session-store). Otherwise
 * an in-process Map — same-instance double-submit only.
 */

import { randomUUID } from "node:crypto";
import { REDIS_KEY_PREFIX } from "@/lib/config";
import { getRedis } from "@/lib/data/redis";

export const CHAT_GENERATION_LOCK_TTL_SECONDS = 12 * 60;

export type ChatGenerationLock = {
  chatId: string;
  token: string;
};

const REDIS_LOCK_PREFIX = `${REDIS_KEY_PREFIX}generation-lock:`;

type MemoryLock = { token: string; expiresAt: number };
const memoryLocks = new Map<string, MemoryLock>();

function redisKey(chatId: string): string {
  return `${REDIS_LOCK_PREFIX}${encodeURIComponent(chatId)}`;
}

function pruneMemoryLock(chatId: string): MemoryLock | undefined {
  const current = memoryLocks.get(chatId);
  if (!current) return undefined;
  if (current.expiresAt <= Date.now()) {
    memoryLocks.delete(chatId);
    return undefined;
  }
  return current;
}

export async function acquireChatGenerationLock(
  chatId: string,
): Promise<ChatGenerationLock | null> {
  const trimmed = chatId.trim();
  if (!trimmed) return null;
  const token = randomUUID();
  const redis = getRedis();
  if (redis) {
    try {
      const ok = await redis.set(
        redisKey(trimmed),
        token,
        "EX",
        CHAT_GENERATION_LOCK_TTL_SECONDS,
        "NX",
      );
      if (ok === "OK") return { chatId: trimmed, token };
      return null;
    } catch {
      // Fall through to in-process lock rather than failing the generation.
    }
  }
  if (pruneMemoryLock(trimmed)) return null;
  memoryLocks.set(trimmed, {
    token,
    expiresAt: Date.now() + CHAT_GENERATION_LOCK_TTL_SECONDS * 1000,
  });
  return { chatId: trimmed, token };
}

export async function releaseChatGenerationLock(
  lock: ChatGenerationLock,
): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.eval(
        `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
        1,
        redisKey(lock.chatId),
        lock.token,
      );
    } catch {
      // Best-effort; TTL is the backstop.
    }
  }
  const current = memoryLocks.get(lock.chatId);
  if (current?.token === lock.token) memoryLocks.delete(lock.chatId);
}

/**
 * Hold the lock for as long as an SSE body is being consumed. JSON error
 * responses release immediately. Safe to call with `lock === null`.
 */
export function bindChatGenerationLockToResponse(
  response: Response,
  lock: ChatGenerationLock | null,
): Response {
  if (!lock) return response;
  const contentType = response.headers.get("content-type") ?? "";
  const isSse = contentType.includes("text/event-stream");
  if (!isSse || !response.body) {
    void releaseChatGenerationLock(lock);
    return response;
  }

  let released = false;
  const releaseOnce = () => {
    if (released) return;
    released = true;
    void releaseChatGenerationLock(lock);
  };

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);
    },
    flush() {
      releaseOnce();
    },
  });
  response.body.pipeTo(transform.writable).catch(() => {
    releaseOnce();
  });

  return new Response(transform.readable, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/** Testhjälp. */
export function resetChatGenerationLocksForTests(): void {
  memoryLocks.clear();
}
