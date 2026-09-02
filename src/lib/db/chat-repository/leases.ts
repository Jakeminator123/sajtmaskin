import { db } from "../client";
import { engineVersionJobs } from "../schema";
import { and, eq, gt, sql } from "drizzle-orm";
import { uuid, isLockTimeoutError, LEASE_LOCK_TIMEOUT_MS } from "./internal";

// ── Distributed version lease (Plan C / P1) ──────────────────────────────────
//
// engine_version_jobs gives a cross-instance lock so two serverless instances
// can't run verify/repair on the same versionId concurrently, and so a frozen
// instance that thaws after its lease expired can't silently clobber a newer
// repair. The lock is per version_id (kind is metadata): whoever holds the one
// active (status='running') lease owns every mutation of that engine_versions
// row. See docs/plans/avklarat/2026-06-27-server-verify-distributed-lock.md.

export type VersionJobKind =
  | "server_verify"
  | "build_error_repair"
  | "manual_repair"
  | "quick_edit";

/**
 * Lease TTL in seconds. Generous (verify+repair can run several LLM passes);
 * holders call {@link renewVersionLease} between long passes. Tunable via the
 * owner decision in the plan doc (open question 1).
 */
export const VERSION_LEASE_TTL_SECONDS = 15 * 60;

const leaseTtlInterval = sql`now() + ${VERSION_LEASE_TTL_SECONDS} * interval '1 second'`;

/**
 * Atomically acquire the single active lease for a version. Returns the owning
 * `runId` when this caller won the lease (fresh insert OR takeover of an EXPIRED
 * lease), or `null` when another live lease already owns the version (caller
 * must then NOT run — same semantics as the old process-local `inflight` Set).
 */

export async function acquireVersionLease(
  versionId: string,
  kind: VersionJobKind,
): Promise<{ runId: string } | null> {
  const runId = uuid();
  try {
    const won = await db.transaction(async (tx) => {
      // Fas 4 P2-fix (2026-07-03): bound the row-lock wait. On expiry Postgres
      // raises 55P03, which we translate to `null` below — semantically
      // identical to "another live lease owns the version, don't run".
      await tx.execute(
        sql`SELECT set_config('lock_timeout', ${String(LEASE_LOCK_TIMEOUT_MS)}, true)`,
      );
      // Codex P2 (serialize lease acquisition with version-row updates): lock the
      // engine_versions row FIRST, in the same transaction as the lease insert.
      // The accept/readiness no-active-lease UPDATEs lock the same row before
      // re-checking the lease, so they can no longer take a NOT EXISTS snapshot
      // that predates this (uncommitted) lease and then promote/fail the version
      // out from under the new run. Without this, the lease insert touches only
      // engine_version_jobs, so the two paths never contend on a common lock.
      await tx.execute(sql`SELECT 1 FROM engine_versions WHERE id = ${versionId} FOR UPDATE`);
      const result = await tx.execute(sql`
      INSERT INTO engine_version_jobs (id, version_id, kind, run_id, status, lease_expires_at)
      VALUES (${uuid()}, ${versionId}, ${kind}, ${runId}, 'running', ${leaseTtlInterval})
      ON CONFLICT (version_id) WHERE status = 'running'
      DO UPDATE SET run_id = EXCLUDED.run_id, kind = EXCLUDED.kind,
                    lease_expires_at = EXCLUDED.lease_expires_at, updated_at = now()
        WHERE engine_version_jobs.lease_expires_at < now()
      RETURNING run_id
    `);
      const rows = (result as unknown as { rows?: unknown[] }).rows ?? [];
      return rows.length > 0;
    });
    return won ? { runId } : null;
  } catch (err) {
    if (isLockTimeoutError(err)) {
      console.warn(
        `[lease] acquireVersionLease lock contention on ${versionId} (${kind}) — treating as not acquired.`,
      );
      return null;
    }
    throw err;
  }
}

/** Extend the lease (call between long passes). False when the lease is no longer ours/active. */
export async function renewVersionLease(versionId: string, runId: string): Promise<boolean> {
  const result = await db
    .update(engineVersionJobs)
    .set({ leaseExpiresAt: leaseTtlInterval, updatedAt: sql`now()` })
    .where(
      and(
        eq(engineVersionJobs.versionId, versionId),
        eq(engineVersionJobs.runId, runId),
        eq(engineVersionJobs.status, "running"),
        // Codex P2: never resurrect an already-expired lease. A job that froze
        // or ran past the TTL has lost ownership (the row may have been taken
        // over via acquire's expiry path); renew must FAIL so the caller treats
        // it as lost and stops writing, instead of silently re-extending.
        gt(engineVersionJobs.leaseExpiresAt, sql`now()`),
      ),
    );
  return (result.rowCount ?? 0) > 0;
}

/** Release the lease (status -> done|failed) so the version is free for the next job. */
export async function releaseVersionLease(
  versionId: string,
  runId: string,
  status: "done" | "failed" = "done",
): Promise<void> {
  await db
    .update(engineVersionJobs)
    .set({ status, updatedAt: sql`now()` })
    .where(and(eq(engineVersionJobs.versionId, versionId), eq(engineVersionJobs.runId, runId)));
}

/**
 * Definitive presence of `engine_version_jobs`.
 *
 * Postgres resolves relation names at parse/plan time, so callers that name the
 * table in a statement must decide BEFORE building SQL. Collapsing probe errors
 * into "missing" is a distributed-ownership hole: watchdog/accept then drop the
 * lease EXISTS and can fail or promote under a live lease.
 *
 *  - `exists`       — `to_regclass` returned a non-null oid
 *  - `missing`      — `to_regclass` returned NULL without error (pre-migration)
 *  - `unavailable`  — error, timeout, or an empty/unreadable probe result
 */
export type LeaseTablePresence = "exists" | "missing" | "unavailable";

export async function leaseTableExists(): Promise<LeaseTablePresence> {
  try {
    const res = await db.execute(sql`SELECT to_regclass('public.engine_version_jobs') AS oid`);
    const rows = (res as unknown as { rows?: Array<{ oid: string | null }> }).rows ?? [];
    // `missing` is only a successful NULL. An empty result set is not NULL —
    // we did not observe the catalog answer, so fail closed as unavailable.
    if (rows.length === 0) return "unavailable";
    return rows[0]?.oid != null ? "exists" : "missing";
  } catch {
    return "unavailable";
  }
}

/**
 * True when an UNEXPIRED active lease exists for the version (any owner).
 *
 * Throws when the lease table cannot be queried (`unavailable` or a query
 * error against a table that exists). Callers must treat a throw as
 * retryable / no-op — never as "no lease". A definitive `missing` table
 * returns false (pre-migration: no leases can exist).
 */
export async function hasActiveVersionLease(versionId: string): Promise<boolean> {
  try {
    const rows = await db
      .select({ id: engineVersionJobs.id })
      .from(engineVersionJobs)
      .where(
        and(
          eq(engineVersionJobs.versionId, versionId),
          eq(engineVersionJobs.status, "running"),
          gt(engineVersionJobs.leaseExpiresAt, sql`now()`),
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch (err) {
    const presence = await leaseTableExists();
    if (presence === "missing") {
      return false;
    }
    console.warn(`[lease] hasActiveVersionLease unavailable for ${versionId}:`, err);
    throw err instanceof Error ? err : new Error("lease query unavailable");
  }
}
