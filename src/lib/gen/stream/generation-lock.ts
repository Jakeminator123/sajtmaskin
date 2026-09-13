/**
 * Cross-instance "one codegen stream at a time" lock per chatId.
 *
 * Verify/repair already serialize per versionId via `engine_version_jobs`.
 * Codegen has no chat-level mutex — two tabs (or two serverless instances)
 * can both stream and persist versions. This lock closes that door for the
 * duration of the HTTP/SSE response.
 *
 * Account admission also serializes create/follow-up across distinct chats.
 * Account locks require Redis in production; the memory fallback is for local
 * development/tests. Legacy chat-only locks retain their existing fallback.
 */

import { randomUUID } from "node:crypto";
import { REDIS_KEY_PREFIX } from "@/lib/config";
import { getRedis } from "@/lib/data/redis";

export const CHAT_GENERATION_LOCK_TTL_SECONDS = 12 * 60;
// Admission includes pre-stream work and cleanup. This exceeds the deployed
// create/follow-up route ceiling (950s). Expiry is the crash-recovery backstop;
// ordinary cancellation releases after tracked billing/finalize cleanup.
export const USER_GENERATION_LOCK_TTL_SECONDS = 20 * 60;

export type ChatGenerationLock = {
  chatId: string;
  token: string;
  scope?: "user";
};

export type AcquireChatGenerationLockResult =
  | { status: "acquired"; lock: ChatGenerationLock }
  | { status: "held" }
  | { status: "unavailable" };

export function chatGenerationLockFailureResponse(
  status: "held" | "unavailable",
  extras?: { chatId?: string; scope?: "user" },
): Response {
  const chatId = extras?.chatId?.trim();
  if (status === "held") {
    return new Response(
      JSON.stringify({
        error: "generation_in_progress",
        reason: "generation_in_progress",
        message: extras?.scope === "user"
          ? "En generation pågår redan för ditt konto. Vänta tills den är klar."
          : "En generation pågår redan för den här sajten. Vänta tills den är klar.",
        ...(chatId ? { chatId } : {}),
      }),
      { status: 409, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(
    JSON.stringify({
      error: "generation_lock_unavailable",
      reason: "generation_lock_unavailable",
      message: "Kunde inte starta generationen just nu. Försök igen om en stund.",
      ...(chatId ? { chatId } : {}),
    }),
    { status: 503, headers: { "content-type": "application/json" } },
  );
}

const REDIS_LOCK_PREFIX = `${REDIS_KEY_PREFIX}generation-lock:`;
// Preview and production currently share the users/credits database, so the
// entitlement mutex MUST NOT inherit the runtime/cache environment prefix.
// Deployment prerequisite: every deployment sharing those entitlements must
// point getRedis() at the SAME Redis instance/logical database (REDIS_URL or
// REDIS_HOST/REDIS_PASSWORD). The separate Upstash rate-limiter is not this lock
// backend. A common key cannot coordinate independently configured Redis stores.
const USER_GENERATION_LOCK_PREFIX = "sajtmaskin:shared-entitlement:user-generation-lock:";

type MemoryLock = { token: string; expiresAt: number };
const memoryLocks = new Map<string, MemoryLock>();

function redisKey(chatId: string, scope?: "user"): string {
  return scope === "user"
    ? `${USER_GENERATION_LOCK_PREFIX}${encodeURIComponent(chatId)}`
    : `${REDIS_LOCK_PREFIX}${encodeURIComponent(chatId)}`;
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
): Promise<AcquireChatGenerationLockResult> {
  return acquireGenerationLock(chatId);
}

/** Serialize paid work across every chat belonging to the verified account. */
export async function acquireUserGenerationLock(
  userId: string,
): Promise<AcquireChatGenerationLockResult> {
  return acquireGenerationLock(userId, "user");
}

async function acquireGenerationLock(
  chatId: string,
  scope?: "user",
): Promise<AcquireChatGenerationLockResult> {
  const trimmed = chatId.trim();
  if (!trimmed) return { status: "unavailable" };
  const token = randomUUID();
  const lock: ChatGenerationLock = { chatId: trimmed, token, ...(scope ? { scope } : {}) };
  const key = redisKey(trimmed, scope);
  const ttl = scope ? USER_GENERATION_LOCK_TTL_SECONDS : CHAT_GENERATION_LOCK_TTL_SECONDS;
  const redis = getRedis();
  if (redis) {
    try {
      const ok = await redis.set(
        key,
        token,
        "EX",
        ttl,
        "NX",
      );
      if (ok === "OK") return { status: "acquired", lock };
      return { status: "held" };
    } catch {
      // Redis is the cross-instance mutex. Do not fall through to the
      // in-process map (another instance may hold the Redis lock). Do not
      // pretend a generation is already running either — callers map this
      // to 503 so the user can retry.
      return { status: "unavailable" };
    }
  }
  // Local development/tests may use memory; deployed admission must never
  // silently permit independent workers when the durable mutex is missing.
  if (scope && (process.env.NODE_ENV === "production" ||
      process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview")) {
    return { status: "unavailable" };
  }
  if (pruneMemoryLock(key)) return { status: "held" };
  memoryLocks.set(key, {
    token,
    expiresAt: Date.now() + ttl * 1000,
  });
  return { status: "acquired", lock };
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
        redisKey(lock.chatId, lock.scope),
        lock.token,
      );
    } catch {
      // Best-effort; TTL is the backstop.
    }
  }
  const key = redisKey(lock.chatId, lock.scope);
  const current = memoryLocks.get(key);
  if (current?.token === lock.token) memoryLocks.delete(key);
}

/**
 * Hold the lock for as long as an SSE body is being consumed. JSON error
 * responses release immediately. Safe to call with `lock === null`.
 */
export function bindChatGenerationLockToResponse(
  response: Response,
  lock: ChatGenerationLock | null,
  options: { retainOnFailure?: boolean; signal?: AbortSignal; workComplete?: Promise<void> } = {},
): Response {
  if (!lock) return response;
  let released = false;
  const releaseOnce = (handlerFinished = false) => {
    if (released) return;
    // Without execution tracking, an abort is not proof that billing stopped.
    if (options.signal?.aborted && !options.workComplete && !handlerFinished) return;
    released = true;
    if (options.workComplete) {
      void options.workComplete.then(
        () => releaseChatGenerationLock(lock),
        () => releaseChatGenerationLock(lock),
      );
    } else {
      void releaseChatGenerationLock(lock);
    }
  };
  const contentType = response.headers.get("content-type") ?? "";
  const isSse = contentType.includes("text/event-stream");
  if (!isSse || !response.body) {
    releaseOnce(true);
    return response;
  }

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);
    },
    flush() {
      releaseOnce();
    },
  });
  response.body.pipeTo(transform.writable).catch(() => {
    // Read-side cancellation is not execution completion. A tracked engine
    // releases after cleanup; unknown streams conservatively keep the TTL.
    if (options.workComplete || !options.retainOnFailure) releaseOnce();
  });

  return new Response(transform.readable, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/**
 * Admission outlives canceled response readers until the engine's complete
 * finalize/billing execution finishes. TTL covers crashes or untracked streams.
 */
export function bindUserGenerationLockToResponse(
  response: Response,
  lock: ChatGenerationLock | null,
  signal?: AbortSignal,
  workComplete?: Promise<void>,
): Response {
  return bindChatGenerationLockToResponse(response, lock, {
    retainOnFailure: true, signal, workComplete,
  });
}

/** Testhjälp. */
export function resetChatGenerationLocksForTests(): void {
  memoryLocks.clear();
}
