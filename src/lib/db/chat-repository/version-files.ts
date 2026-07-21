import { db } from "../client";
import {
  type EngineVersionReleaseState,
  type EngineVersionVerificationState,
} from "../engine-version-lifecycle";
import { engineVersions } from "../schema";
import { and, eq, sql } from "drizzle-orm";
import { VersionLeaseHeldError } from "../version-lease-error";
import {
  isLockTimeoutError,
  LEASE_LOCK_TIMEOUT_MS,
  versionWriteWhere,
} from "./internal";

export async function updateVersionFiles(
  versionId: string,
  filesJson: string,
  options?: {
    lockTimeoutMs?: number;
    /**
     * Post-#351 P1 (false-green on in-place edits): a MATERIAL file mutation —
     * a user saving edited code via PUT/PATCH/DELETE `/files` — must not keep
     * a `promoted`/`passed` verdict that was earned by the PREVIOUS file
     * contents. Pass `true` on user-edit save paths to reset the row to
     * `draft`/`pending` (same reset the `repair_available` case below does).
     * Leave unset for idempotent heal/materialize persists (GET `/files`),
     * where the row's verdict still describes the same logical content.
     */
    invalidateVerification?: boolean;
    /**
     * Set by a verify/repair caller that OWNS the active version lease (the
     * `runId` returned by {@link acquireVersionLease}). The write is then bound
     * — atomically, in the UPDATE's WHERE — to this run still holding the
     * unexpired lease ({@link versionWriteWhere}), so the lease holder can
     * persist its own files while EVERY OTHER writer is blocked.
     *
     * Leave unset on user-edit / normalize / validate / heal paths: those are
     * blocked whenever ANY unexpired lease owns the version, so a concurrent
     * verify/repair snapshot can never be clobbered (ReleaseGate false-green).
     * A blocked non-holder write throws {@link VersionLeaseHeldError} (→ 409
     * `version_busy`) on the normal path, or no-ops (returns `false`) on the
     * best-effort `lockTimeoutMs` heal path.
     *
     * NOTE: no current caller passes this — the verify/repair flow mutates via
     * `saveRepairedFiles` / `promoteVersion` / `markVersion*` (which already use
     * `versionWriteWhere(runId)`). It exists so a future lease-holding
     * `files_json` writer has the escape hatch instead of being fail-closed.
     */
    holderRunId?: string;
  },
): Promise<boolean> {
  const baseValues = {
    filesJson,
    // Invalidate the cached tier-2 preview URL: the next preview-session
    // request must boot a fresh VM against the updated files instead of
    // short-circuiting to `startOutcome: "reused_url"` and showing the
    // previous snapshot. Without this, file mutations via /files were
    // silently masked by the stale URL (P19 ingress point 1).
    previewUrl: null,
    repairedFilesJson: null,
    repairAvailableAt: null,
  };
  const setValues = options?.invalidateVerification
    ? {
        ...baseValues,
        releaseState: "draft" as EngineVersionReleaseState,
        verificationState: "pending" as EngineVersionVerificationState,
        verificationSummary: null,
        promotedAt: null,
      }
    : {
        ...baseValues,
        releaseState: sql<EngineVersionReleaseState>`
      CASE
        WHEN ${engineVersions.verificationState} = 'repair_available' THEN 'draft'
        ELSE ${engineVersions.releaseState}
      END
    `,
        verificationState: sql<EngineVersionVerificationState>`
      CASE
        WHEN ${engineVersions.verificationState} = 'repair_available' THEN 'pending'
        ELSE ${engineVersions.verificationState}
      END
    `,
        verificationSummary: sql<string | null>`
      CASE
        WHEN ${engineVersions.verificationState} = 'repair_available' THEN NULL
        ELSE ${engineVersions.verificationSummary}
      END
    `,
        promotedAt: sql<Date | null>`
      CASE
        WHEN ${engineVersions.verificationState} = 'repair_available' THEN NULL
        ELSE ${engineVersions.promotedAt}
      END
    `,
      };

  // ── Version-lease guard (P1 false-green-rest) ──────────────────────────────
  // The canonical `files_json` writer must take the SAME lease the verify flow
  // holds, so a user edit / normalize / validate / heal can't advance the DB
  // snapshot to B while ReleaseGate verified in-memory A and then promotion
  // (lease-conditioned only on the verify runId) stamps `promoted`/`passed` on
  // unverified content. The guard is embedded in the UPDATE's WHERE, so the
  // lease check + write are ONE atomic statement (no "check then write" race).
  //
  //  - `holderRunId` set  → the lease-holder exception: write only if THIS run
  //    still holds the active unexpired lease (`versionWriteWhere`).
  //  - `holderRunId` unset → block whenever ANY unexpired lease owns the row
  //    (`NOT EXISTS`), the same predicate `failVersionVerificationIfUnleased`
  //    and `acceptRepair` use. Fail-closed for the idempotent heal path too.
  //
  // Postgres resolves relation names at plan time, so we must decide whether to
  // reference `engine_version_jobs` BEFORE building the statement (an
  // in-statement guard can't short-circuit a missing table). ONLY a definitive
  // "table missing" (`to_regclass` → null) may degrade to the legacy
  // unconditional write — a TRANSIENT probe error keeps the guard ON
  // (fail-closed, Codex P1 on #507): if the table then really is missing the
  // guarded UPDATE fails loudly instead of silently saving through a lease.
  const holderRunId = options?.holderRunId;
  let jobsExist = true;
  if (!holderRunId) {
    try {
      const res = await db.execute(
        sql`SELECT to_regclass('public.engine_version_jobs') AS oid`,
      );
      const rows = (res as unknown as { rows?: Array<{ oid: string | null }> }).rows ?? [];
      jobsExist = rows.length > 0 && rows[0]?.oid != null;
    } catch {
      jobsExist = true;
    }
  }
  const where = holderRunId
    ? versionWriteWhere(versionId, holderRunId)
    : jobsExist
      ? and(
          eq(engineVersions.id, versionId),
          sql`NOT EXISTS (SELECT 1 FROM engine_version_jobs j WHERE j.version_id = ${versionId} AND j.status = 'running' AND j.lease_expires_at > now())`,
        )
      : eq(engineVersions.id, versionId);

  const lockTimeoutMs = options?.lockTimeoutMs;
  if (typeof lockTimeoutMs === "number" && Number.isFinite(lockTimeoutMs) && lockTimeoutMs > 0) {
    // Fail-fast, best-effort mode for HOT READ paths (GET /files heal-persist,
    // M#files1). Writing the whole ~120 KB `files_json` on a read is a
    // write-on-read anti-pattern: several concurrent /files reads on the same
    // `engine_versions` row (plus a concurrent error-log INSERT needing a
    // `FOR KEY SHARE` FK-lock on that row) serialized on the row lock and
    // blocked to `statement_timeout` (57014) — surfacing as /files 429 +
    // /error-log 500, and the timed-out UPDATE rolled back so the heal never
    // stuck (a feedback loop). A transaction-local `lock_timeout` makes a
    // contended write give up in ~ms so ONE writer commits the (idempotent)
    // heal fast and the rest bail; NEVER throws, so a read can't 429/500.
    // A lease block here is just a 0-row no-op (fail-closed skip): the next
    // uncontended read after the lease releases re-persists the idempotent heal.
    try {
      return await db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('lock_timeout', ${String(Math.floor(lockTimeoutMs))}, true)`,
        );
        // Lock-then-second-statement (Codex P1 on #507): serialize against an
        // in-flight `acquireVersionLease` (which locks this row before
        // committing its lease) so the guarded UPDATE below re-snapshots and
        // SEES the committed lease. A single-statement UPDATE's NOT EXISTS
        // subquery keeps the pre-wait snapshot after a lock wait (EvalPlanQual
        // does not refresh subqueries) and could save through the new lease.
        await tx.execute(sql`SELECT 1 FROM engine_versions WHERE id = ${versionId} FOR UPDATE`);
        const result = await tx.update(engineVersions).set(setValues).where(where);
        return (result.rowCount ?? 0) > 0;
      });
    } catch {
      // Lock contention (55P03) / transient error → skip the heal-persist. The
      // caller already holds the repaired files and returns them; the next
      // uncontended read persists the idempotent heal.
      return false;
    }
  }

  // Lock-then-second-statement for the normal path too (Codex P1 on #507; same
  // pattern as `acceptRepair` / `failVersionVerificationIfUnleased`): take the
  // version row lock FIRST — waiting out any in-flight lease acquisition —
  // then run the guarded UPDATE as a SEPARATE statement whose fresh
  // READ COMMITTED snapshot sees the committed lease. Bounded lock wait: a
  // timeout means a verify/repair (or another save) owns the row right now →
  // honest retryable busy.
  let result: { rowCount: number | null };
  try {
    result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('lock_timeout', ${String(LEASE_LOCK_TIMEOUT_MS)}, true)`,
      );
      await tx.execute(sql`SELECT 1 FROM engine_versions WHERE id = ${versionId} FOR UPDATE`);
      return await tx.update(engineVersions).set(setValues).where(where);
    });
  } catch (err) {
    if (!holderRunId && isLockTimeoutError(err)) {
      throw new VersionLeaseHeldError(versionId);
    }
    throw err;
  }
  if ((result.rowCount ?? 0) > 0) {
    return true;
  }
  // 0-row: distinguish a foreign-lease block (→ retryable 409 `version_busy`)
  // from a plain no-op (missing row → the caller's existing `false`/404 path).
  // Only the NON-holder guarded path can be lease-blocked; the holder path's
  // 0-row means its own lease was lost/taken over, which its callers already
  // treat as a plain `false` (same as `markVersionVerifying` et al.).
  //
  // EXACT classification via ROW-EXISTENCE, not a lease re-probe (Bugbot on
  // #507, two rounds): the guarded WHERE is `id = X AND NOT EXISTS(active
  // lease)`, so a 0-row result while the ROW EXISTS can only mean the lease
  // blocked the write AT EXECUTION TIME — even if the lease was released
  // between the UPDATE and this probe (the re-probe race), and regardless of
  // probe-query hiccups (`.catch` classifies as busy: the table is known to
  // exist via `jobsExist`, so an error here is a real DB hiccup and busy is
  // the retryable, honest answer). The probe runs AFTER the atomic write
  // no-op'd — it never gates the write, so no TOCTOU.
  if (!holderRunId && jobsExist) {
    const rowExists = await db
      .select({ id: engineVersions.id })
      .from(engineVersions)
      .where(eq(engineVersions.id, versionId))
      .limit(1)
      .then((rows) => rows.length > 0)
      .catch(() => true);
    if (rowExists) {
      throw new VersionLeaseHeldError(versionId);
    }
  }
  return false;
}
