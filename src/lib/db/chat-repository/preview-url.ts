import { db } from "../client";
import { engineVersions } from "../schema";
import { and, eq, sql } from "drizzle-orm";
import { isLockTimeoutError, LEASE_LOCK_TIMEOUT_MS, versionWriteWhere } from "./internal";

export async function updateVersionPreviewUrl(
  versionId: string,
  previewUrl: string | null,
  options?: {
    /** Atomically bind this receipt to the exact files served by the preview. */
    expectedFilesRevision?: string;
    /** Existing chain lease; this writer never acquires or releases it. */
    holderRunId?: string;
    /**
     * Fail-fast, best-effort mode (prod-incident 2026-07-03, chat 69aae3d5):
     * the preview_url persist from POST /preview-session blocked on the
     * `engine_versions` row lock (held by a concurrent verify/lease
     * transaction) until Supabase's `statement_timeout` killed it (57014) and
     * the whole route 500:ade — even though the preview session itself had
     * started fine. Same medicine as `updateVersionFiles` heal-persist
     * (M#files1): a transaction-local `lock_timeout` makes a contended write
     * give up in ~ms, NEVER throws, and returns false so the caller can treat
     * the persist as best-effort (the next preview-session start re-persists
     * the idempotent URL).
     */
    lockTimeoutMs?: number;
    /**
     * Bounded retry-after-lease-release (M#pv2, prod-incident chat 3120c05c v1).
     * Only meaningful together with `lockTimeoutMs`. When a best-effort write is
     * skipped on row-lock contention (55P03) against the quality-gate's
     * `acquireVersionLease` (`FOR UPDATE`), a version whose preview session
     * *consistently* coincides with the verify lease could NEVER persist its
     * `preview_url` (left `preview_url = null` despite a running preview). Retry
     * up to `maxRetries` times with a small `retryDelayMs` awaited pause between
     * attempts so the write lands in a gap once the (brief) lease/verify row
     * lock releases. Bounded (no busy-wait, no unbounded loop) and still
     * best-effort — never throws, and only contention is retried (a missing row
     * or non-lock error gives up immediately). Default: no retry (back-compat).
     */
    maxRetries?: number;
    /** Awaited delay (ms) between contention retries. Default 250. */
    retryDelayMs?: number;
  },
): Promise<boolean> {
  // Explicit but empty fences must never degrade to the legacy unguarded path.
  if (options?.holderRunId !== undefined && !options.holderRunId.trim()) return false;
  if (options?.expectedFilesRevision !== undefined && !options.expectedFilesRevision.trim()) return false;
  const guarded = options?.holderRunId !== undefined || options?.expectedFilesRevision !== undefined;
  const where = and(
    versionWriteWhere(versionId, options?.holderRunId),
    options?.expectedFilesRevision !== undefined
      ? eq(engineVersions.filesRevision, options.expectedFilesRevision)
      : undefined,
  );
  const writeInTransaction = (timeoutMs: number) => db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('lock_timeout', ${String(Math.floor(timeoutMs))}, true)`);
    if (guarded) {
      // Wait out lease acquisition first. The SECOND statement gets a fresh
      // READ COMMITTED snapshot for versionWriteWhere (not a stale subquery).
      await tx.execute(sql`SELECT 1 FROM engine_versions WHERE id = ${versionId} FOR UPDATE`);
    }
    const result = await tx.update(engineVersions).set({ previewUrl }).where(where);
    return (result.rowCount ?? 0) > 0;
  });
  const lockTimeoutMs = options?.lockTimeoutMs;
  if (typeof lockTimeoutMs === "number" && Number.isFinite(lockTimeoutMs) && lockTimeoutMs > 0) {
    const maxRetries =
      typeof options?.maxRetries === "number" &&
      Number.isFinite(options.maxRetries) &&
      options.maxRetries > 0
        ? Math.floor(options.maxRetries)
        : 0;
    const retryDelayMs =
      typeof options?.retryDelayMs === "number" &&
      Number.isFinite(options.retryDelayMs) &&
      options.retryDelayMs > 0
        ? Math.floor(options.retryDelayMs)
        : 250;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const persisted = await writeInTransaction(lockTimeoutMs);
        if (persisted) return true;
        // rowCount 0 = the version row is gone/missing, NOT contention — the
        // lock was acquired and the UPDATE simply matched nothing. Retrying
        // can't help, so give up immediately.
        return false;
      } catch (err) {
        // Only row-lock contention (55P03) is worth retrying: the verify lease
        // holds the engine_versions row briefly, so a bounded pause lets the
        // persist land once it releases. Any other error (or the last attempt)
        // → give up best-effort. NEVER throws from this hot path.
        if (!isLockTimeoutError(err) || attempt >= maxRetries) {
          return false;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
    return false;
  }
  if (guarded) return writeInTransaction(LEASE_LOCK_TIMEOUT_MS);
  const result = await db
    .update(engineVersions)
    .set({ previewUrl })
    .where(eq(engineVersions.id, versionId));
  return (result.rowCount ?? 0) > 0;
}
