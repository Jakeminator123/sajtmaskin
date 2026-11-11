import { randomUUID } from "node:crypto";
import { REDIS_KEY_PREFIX } from "@/lib/config";
import { getRedis } from "@/lib/data/redis";

/**
 * Cross-instance start lock per chat.
 *
 * The host keeps ONE session per chat, and every host `/start` on it rotates
 * the lifecycle token and restarts the boot. Vercel runs the stream's
 * postchecks chain and the builder's `/preview-session` bootstrap in different
 * instances, so both used to call the host for the same version within a
 * second (2026-11-11, chat ff62820f: the second start superseded the first,
 * the chain then tore the booting session down and the builder tore down the
 * next one — three sessions and three guest machines for one version).
 *
 * The holder runs `startPreviewSession` as before. A waiter polls until the
 * holder releases and then runs the same code, which now finds the holder's
 * pointer for its version and resumes it (a booting session included) instead
 * of starting the host again.
 *
 * `run` learns whether it had to wait. A caller can use that to avoid undoing
 * the other instance's work (a forced restart must not destroy the session the
 * holder just started).
 *
 * Fail-open, as before this lock: no Redis, a Redis error or a holder that
 * outlives the wait all fall through to running without the lock. TTL bounds a
 * crashed holder.
 */
export const PREVIEW_START_LOCK_TTL_SECONDS = 120;
export const PREVIEW_START_LOCK_MAX_WAIT_MS = 90_000;
export const PREVIEW_START_LOCK_POLL_MS = 750;
/** The holder extends its TTL this often, so a start that outlives the TTL keeps the lock. */
export const PREVIEW_START_LOCK_RENEW_MS = 40_000;

const RELEASE_IF_OWNER_SCRIPT =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
const RENEW_IF_OWNER_SCRIPT =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("expire", KEYS[1], ARGV[2]) else return 0 end';

function startLockKey(chatId: string): string {
  return `${REDIS_KEY_PREFIX}preview-session:start-lock:${encodeURIComponent(chatId)}`;
}

export type PreviewStartLockRun = {
  /** Another instance held the lock when this caller arrived. */
  waited: boolean;
  /** This caller holds the lock (false when Redis is missing/failing or the wait ran out). */
  acquired: boolean;
};

export async function withPreviewStartLock<T>(
  chatId: string,
  run: (lock: PreviewStartLockRun) => Promise<T>,
  options?: {
    /** Caller's own deadline; the wait never outlives it. */
    deadlineEpochMs?: number;
    /** Test seams. */
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<T> {
  const id = chatId.trim();
  const redis = getRedis();
  if (!redis || !id) return run({ waited: false, acquired: false });
  const now = options?.now ?? Date.now;
  const sleep =
    options?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const key = startLockKey(id);
  const token = randomUUID();
  const waitUntil = Math.min(
    now() + PREVIEW_START_LOCK_MAX_WAIT_MS,
    options?.deadlineEpochMs ?? Number.POSITIVE_INFINITY,
  );
  let acquired = false;
  let waited = false;
  try {
    for (;;) {
      const ok = await redis.set(key, token, "EX", PREVIEW_START_LOCK_TTL_SECONDS, "NX");
      if (ok === "OK") {
        acquired = true;
        break;
      }
      waited = true;
      if (now() + PREVIEW_START_LOCK_POLL_MS >= waitUntil) break;
      await sleep(PREVIEW_START_LOCK_POLL_MS);
    }
  } catch (error) {
    console.warn(
      `[preview-session] start lock unavailable for ${id}; continuing without it:`,
      error instanceof Error ? error.message : error,
    );
  }
  if (waited) {
    if (acquired) {
      console.info(`[preview-session] waited for another instance's preview start for ${id}`);
    } else {
      console.warn(`[preview-session] start lock for ${id} still held after waiting; continuing without it`);
    }
  }
  // A crashed instance still loses the lock after the TTL; a live holder
  // whose host call outlasts it (host /start allows 300 s) keeps it.
  const renewTimer = acquired
    ? setInterval(() => {
        void Promise.resolve(
          redis.eval(RENEW_IF_OWNER_SCRIPT, 1, key, token, String(PREVIEW_START_LOCK_TTL_SECONDS)),
        ).catch(() => {});
      }, PREVIEW_START_LOCK_RENEW_MS)
    : null;
  try {
    return await run({ waited, acquired });
  } finally {
    if (renewTimer) clearInterval(renewTimer);
    if (acquired) {
      try {
        await redis.eval(RELEASE_IF_OWNER_SCRIPT, 1, key, token);
      } catch {
        // TTL is the backstop.
      }
    }
  }
}
