import { db } from "../client";
import { engineVersions } from "../schema";
import { and, eq, sql } from "drizzle-orm";
import { assertPromoteAllowed } from "../promote-guard";
import type { Version } from "./types";
import {
  getStoredVersion,
  isLockTimeoutError,
  LEASE_LOCK_TIMEOUT_MS,
  versionWriteWhere,
} from "./internal";
import { leaseTableExists } from "./leases";

export async function markVersionVerifying(
  versionId: string,
  verificationSummary: string | null = "Automatic verification in progress.",
  runId?: string,
): Promise<Version | null> {
  const result = await db
    .update(engineVersions)
    .set({
      releaseState: "draft",
      verificationState: "verifying",
      verificationSummary,
      repairedFilesJson: null,
      repairAvailableAt: null,
      promotedAt: null,
    })
    .where(versionWriteWhere(versionId, runId));
  if ((result.rowCount ?? 0) === 0) {
    return null;
  }
  return getStoredVersion(versionId);
}

/**
 * Revert the optimistic `markVersionVerifying` transition back to the canonical
 * `pending` (awaiting-verification) resting state.
 *
 * Used when the verify lane could NOT run (preview-host unreachable / network /
 * timeout) and the quality-gate route already moved the row to `verifying`
 * up-front. Leaving it `verifying` would advertise an in-flight verify that is
 * not running and let the readiness stale-verification watchdog eventually mark
 * it `failed` despite the gate never evaluating the code (Codex P2 on #296).
 * `pending` is the honest state — the version still needs verification and the
 * client can retry — and is strictly better than the previous behaviour, which
 * marked the row `failed` (a false-RED verdict). The readiness watchdog still
 * provides the existing lease-safe long-timeout backstop for a chronically
 * unverifiable version, so this introduces no new stuck state.
 */
export async function resetVersionVerificationToPending(
  versionId: string,
  verificationSummary: string | null = "Automatic verification could not run (verify lane unavailable). Retry shortly.",
  runId?: string,
): Promise<Version | null> {
  const result = await db
    .update(engineVersions)
    .set({
      releaseState: "draft",
      verificationState: "pending",
      verificationSummary,
      repairedFilesJson: null,
      repairAvailableAt: null,
      promotedAt: null,
    })
    .where(versionWriteWhere(versionId, runId));
  if ((result.rowCount ?? 0) === 0) {
    return null;
  }
  return getStoredVersion(versionId);
}

export async function markVersionRepairing(
  versionId: string,
  verificationSummary: string | null = "Server-side repair in progress.",
  runId?: string,
): Promise<Version | null> {
  const result = await db
    .update(engineVersions)
    .set({
      releaseState: "draft",
      verificationState: "repairing",
      verificationSummary,
      repairedFilesJson: null,
      repairAvailableAt: null,
      promotedAt: null,
    })
    .where(versionWriteWhere(versionId, runId));
  if ((result.rowCount ?? 0) === 0) {
    return null;
  }
  return getStoredVersion(versionId);
}

export async function promoteVersion(
  versionId: string,
  verificationSummary: string | null = "Automatic verification passed.",
  runId?: string,
): Promise<Version | null> {
  // False-green invariant guard: refuse `promoted` while the finalize quality
  // gate (telemetry) says the verifier/preflight blocked this version. Every
  // promote path consults `assertPromoteAllowed`: this function (quality-gate
  // route, server-verify, createAndPromoteDraftVersion) and `acceptRepair` (the
  // repair-accept/auto-accept path, which reads the repaired-pass signal
  // stamped by `saveRepairedFiles`). Fail-open when NO SIGNAL exists (legacy /
  // template-import / rollback rows without telemetry) — but a READ ERROR now
  // fails closed-but-retryable (M#pg1 / B08 follow-up): a transient DB hiccup
  // must not be able to false-green a `verifier_failed` row into `promoted`.
  // Returning null here never terminal-fails the version; callers treat it as
  // "not promoted" and the flow retries.
  const guard = await assertPromoteAllowed(versionId, undefined, {
    onReadError: "indeterminate",
  });
  if (!guard.allowed) {
    console.warn(
      "indeterminate" in guard && guard.indeterminate
        ? `[promote-guard] Promote signal unavailable for version ${versionId} (retryable): ${guard.reason}`
        : `[promote-guard] Refusing to promote version ${versionId}: ${guard.reason}`,
    );
    return null;
  }
  const promotedAt = new Date();
  const result = await db
    .update(engineVersions)
    .set({
      releaseState: "promoted",
      verificationState: "passed",
      verificationSummary,
      repairedFilesJson: null,
      repairAvailableAt: null,
      promotedAt,
    })
    .where(versionWriteWhere(versionId, runId));
  if ((result.rowCount ?? 0) === 0) {
    return null;
  }
  return getStoredVersion(versionId);
}

export async function failVersionVerification(
  versionId: string,
  verificationSummary: string | null = "Automatic verification failed.",
  runId?: string,
): Promise<Version | null> {
  const result = await db
    .update(engineVersions)
    .set({
      releaseState: "draft",
      verificationState: "failed",
      verificationSummary,
      repairedFilesJson: null,
      repairAvailableAt: null,
      promotedAt: null,
    })
    .where(versionWriteWhere(versionId, runId));
  if ((result.rowCount ?? 0) === 0) {
    return null;
  }
  return getStoredVersion(versionId);
}

/**
 * Watchdog-only fail (Codex P2): marks a stale version failed ONLY if no active
 * lease owns it, atomically (single UPDATE with a NOT EXISTS guard). Stops a
 * readiness poll from failing a version that a verify/repair run legitimately
 * acquired in the gap between a separate `hasActiveVersionLease` check and the
 * write. Returns null (no-op) when a job holds the lease or the row is gone.
 */
export async function failVersionVerificationIfUnleased(
  versionId: string,
  verificationSummary: string,
): Promise<Version | null> {
  // Codex P2 (missing-table fail-safe): decide whether to reference the lease
  // table BEFORE building the statement (Postgres resolves relations at plan
  // time; an in-statement to_regclass guard cannot short-circuit a missing one).
  const jobsExist = await leaseTableExists();
  let updated: boolean;
  try {
    updated = await db.transaction(async (tx) => {
    // Fas 4 P2-fix (2026-07-03): bounded lock wait — a watchdog that can't get
    // the row lock quickly no-ops (returns null) and retries on the next poll,
    // instead of blocking to statement_timeout (57014).
    await tx.execute(
      sql`SELECT set_config('lock_timeout', ${String(LEASE_LOCK_TIMEOUT_MS)}, true)`,
    );
    // Codex P2 (serialize with acquireVersionLease): lock the version row FIRST.
    // acquireVersionLease locks the same row before committing its lease, so a
    // verify/repair that starts in the gap can't slip its lease in after our
    // no-active-lease snapshot — the conditional UPDATE below is a separate
    // statement and re-snapshots after the lock, seeing the committed lease.
    await tx.execute(sql`SELECT 1 FROM engine_versions WHERE id = ${versionId} FOR UPDATE`);
    const result = await tx
      .update(engineVersions)
      .set({
        releaseState: "draft",
        verificationState: "failed",
        verificationSummary,
        repairedFilesJson: null,
        repairAvailableAt: null,
        promotedAt: null,
      })
      .where(
        and(
          eq(engineVersions.id, versionId),
          // Only enforce the no-active-lease guard once the table exists; before
          // migration this degrades to the legacy unconditional watchdog.
          jobsExist
            ? sql`NOT EXISTS (SELECT 1 FROM engine_version_jobs j WHERE j.version_id = ${versionId} AND j.status = 'running' AND j.lease_expires_at > now())`
            : undefined,
        ),
      );
    return (result.rowCount ?? 0) > 0;
  });
  } catch (err) {
    if (isLockTimeoutError(err)) {
      console.warn(
        `[lease] failVersionVerificationIfUnleased lock contention on ${versionId} — no-op, next poll retries.`,
      );
      return null;
    }
    throw err;
  }
  if (!updated) {
    return null;
  }
  return getStoredVersion(versionId);
}

/**
 * Watchdog-only promote (Bugbot high on #518): reconcile a proven-green stale
 * version to `passed`/`promoted` ONLY if no active lease owns it. Mirrors
 * `failVersionVerificationIfUnleased`'s lease-safety EXACTLY (bounded
 * `lock_timeout`, `FOR UPDATE` row lock that serializes with
 * `acquireVersionLease`, then a separate conditional UPDATE re-snapshotting the
 * committed lease) so the reconciliation promote can never mutate a row while a
 * quality-gate/repair job still holds the lease and re-runs checks — the
 * multi-actor-on-one-row class that M#vlane1 closes. Also runs the SAME
 * false-green promote-guard as `promoteVersion` (`assertPromoteAllowed`,
 * `onReadError: "indeterminate"`), so a verifier-blocked or read-error row is
 * never advanced.
 *
 * Return contract (Codex round 2, #518):
 *   - `Version`       → promoted to terminal `passed`/`promoted`.
 *   - `"guard_denied"`→ the promote-guard EXPLICITLY refused (telemetry says
 *     `verifier_failed`/`preflight_failed`, NOT an indeterminate read error). The
 *     guard's telemetry is a fresher truth than the (stale) gate log the caller
 *     reconciled on, so the caller should SETTLE the row terminally instead of
 *     protecting it forever (P1b).
 *   - `null`          → retryable no-op: indeterminate guard read error, a job
 *     holds the lease, the lock wait timed out, the row is gone, OR the row is no
 *     longer in the `verifying` state this reconcile decided on (P1a TOCTOU: a
 *     concurrent client-retry already failed/passed/repairing it). The caller
 *     keeps the row spinning and a later sweep retries. NEVER terminal-fails.
 */
export async function promoteVersionIfUnleased(
  versionId: string,
  verificationSummary: string | null = "Automatic verification passed.",
): Promise<Version | "guard_denied" | null> {
  // Same false-green invariant guard as `promoteVersion`: refuse while the
  // finalize quality-gate telemetry says the version is blocked, and fail
  // closed-but-retryable (null) on a read error. Never promotes a blocked row.
  const guard = await assertPromoteAllowed(versionId, undefined, {
    onReadError: "indeterminate",
  });
  if (!guard.allowed) {
    const indeterminate = "indeterminate" in guard && guard.indeterminate === true;
    console.warn(
      indeterminate
        ? `[promote-guard] Reconcile promote signal unavailable for version ${versionId} (retryable): ${guard.reason}`
        : `[promote-guard] Refusing to reconcile-promote version ${versionId}: ${guard.reason}`,
    );
    // P1b: an indeterminate read error is retryable (null); an EXPLICIT denial is
    // a fresher truth than the caller's stale gate log → signal `"guard_denied"`
    // so the watchdog settles the row terminally instead of spinning forever.
    return indeterminate ? null : "guard_denied";
  }
  // Codex P2 (missing-table fail-safe): decide whether to reference the lease
  // table BEFORE building the statement (Postgres resolves relations at plan
  // time; an in-statement to_regclass guard cannot short-circuit a missing one).
  const jobsExist = await leaseTableExists();
  const promotedAt = new Date();
  let updated: boolean;
  try {
    updated = await db.transaction(async (tx) => {
      // Bounded lock wait: a reconcile poll that can't get the row lock quickly
      // no-ops (returns null) and retries on the next poll instead of blocking
      // to statement_timeout (57014).
      await tx.execute(
        sql`SELECT set_config('lock_timeout', ${String(LEASE_LOCK_TIMEOUT_MS)}, true)`,
      );
      // Serialize with acquireVersionLease: lock the version row FIRST so a
      // verify/repair that starts in the gap can't slip its lease in after our
      // no-active-lease snapshot — the conditional UPDATE below is a separate
      // statement and re-snapshots after the lock, seeing the committed lease.
      await tx.execute(sql`SELECT 1 FROM engine_versions WHERE id = ${versionId} FOR UPDATE`);
      const result = await tx
        .update(engineVersions)
        .set({
          releaseState: "promoted",
          verificationState: "passed",
          verificationSummary,
          repairedFilesJson: null,
          repairAvailableAt: null,
          promotedAt,
        })
        .where(
          and(
            eq(engineVersions.id, versionId),
            // P1a (Codex round 2 TOCTOU): only promote a row STILL in the stale
            // `verifying` state this reconcile decided on. If a concurrent
            // client-retry already failed/passed/repairing it (a fresher truth),
            // rowCount 0 → null, so a stale green decision can't flip a freshly
            // `failed` row back to `passed`/`promoted`.
            eq(engineVersions.verificationState, "verifying"),
            // Only enforce the no-active-lease guard once the table exists; before
            // migration this degrades to the legacy unconditional write.
            jobsExist
              ? sql`NOT EXISTS (SELECT 1 FROM engine_version_jobs j WHERE j.version_id = ${versionId} AND j.status = 'running' AND j.lease_expires_at > now())`
              : undefined,
          ),
        );
      return (result.rowCount ?? 0) > 0;
    });
  } catch (err) {
    if (isLockTimeoutError(err)) {
      console.warn(
        `[lease] promoteVersionIfUnleased lock contention on ${versionId} — no-op, next poll retries.`,
      );
      return null;
    }
    throw err;
  }
  if (!updated) {
    return null;
  }
  return getStoredVersion(versionId);
}

export async function markVersionSupersededByRepair(
  versionId: string,
  repairedVersionId: string | null = null,
  runId?: string,
): Promise<Version | null> {
  const summary = repairedVersionId
    ? `Superseded by repaired version ${repairedVersionId}.`
    : "Superseded by repaired version.";
  return failVersionVerification(versionId, summary, runId);
}
