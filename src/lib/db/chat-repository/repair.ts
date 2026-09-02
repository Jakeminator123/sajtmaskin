import { db } from "../client";
import {
  type EngineVersionReleaseState,
  type EngineVersionVerificationState,
} from "../engine-version-lifecycle";
import { engineVersions } from "../schema";
import { and, eq, sql } from "drizzle-orm";
import { REPAIR_ACCEPT_TIMEOUT_MS } from "@/lib/gen/defaults";
import { assertPromoteAllowed } from "../promote-guard";
import { recordRepairPassedQualityGate } from "../services/generation-telemetry";
import {
  decodeRepairedFilesPayload,
  encodeRepairedFilesEnvelope,
  hashFilesJson,
} from "../repair-files-payload";
import type { Version, VersionRepairStatus } from "./types";
import { toRow, getStoredVersion, versionWriteWhere } from "./internal";
import { leaseTableExists, hasActiveVersionLease } from "./leases";

/**
 * Outcome of {@link saveRepairedFiles}. Callers MUST distinguish a stale-base
 * no-op from a genuine failure: `stale_base` means a concurrent user edit
 * advanced `files_json` past the snapshot the repair was based on, so the
 * version must NOT be finalized as `failed` from this (stale) repair — doing so
 * would mark the user's newer edit B failed based on repair(A) (#260 Codex P2).
 */
export type SaveRepairedFilesResult =
  | { status: "saved"; version: Version }
  | { status: "stale_base" }
  | { status: "failed" };

export async function saveRepairedFiles(
  versionId: string,
  repairedFilesJson: string,
  verificationSummary: string | null = "Server repair completed. Waiting for acceptance.",
  runId?: string,
  /**
   * The EXACT `files_json` string the repair was computed from (#260 / Codex P2
   * #5). When provided, the repaired files are stored as a base-hashed envelope
   * and the write is bound — atomically, in the same UPDATE — to `files_json`
   * still equalling this base. If a concurrent user edit advanced `files_json`
   * in the meantime the UPDATE matches no row and this no-ops (returns
   * `stale_base`), so a stale repair can never overwrite the newer edit on
   * accept. Omitting it preserves the legacy unguarded write (no base known).
   */
  baseFilesJson?: string,
): Promise<SaveRepairedFilesResult> {
  if (!repairedFilesJson.trim()) return { status: "failed" };
  const storedPayload =
    baseFilesJson != null
      ? encodeRepairedFilesEnvelope({ repairedFilesJson, baseFilesJson })
      : repairedFilesJson;
  const where =
    baseFilesJson != null
      ? and(
          versionWriteWhere(versionId, runId),
          // Revision-binding: only persist the repair if the version still holds
          // the exact snapshot it was based on. Comparing the literal DB string
          // is atomic and needs no migration / hash column.
          sql`${engineVersions.filesJson} = ${baseFilesJson}`,
        )
      : versionWriteWhere(versionId, runId);
  const result = await db
    .update(engineVersions)
    .set({
      repairedFilesJson: storedPayload,
      repairAvailableAt: new Date(),
      releaseState: "draft",
      verificationState: "repair_available",
      verificationSummary,
      promotedAt: null,
    })
    .where(where);
  if ((result.rowCount ?? 0) === 0) {
    // Distinguish a stale-base no-op from a genuine failure. With a base
    // provided, a 0-row UPDATE is either (a) the revision-binding predicate
    // missing because a concurrent user edit advanced `files_json` past the
    // base, or (b) a real failure (lost lease / superseded / missing row).
    // Only (a) must stop the caller from finalizing the (newer) version as
    // failed, so probe the current `files_json` once to tell them apart.
    if (baseFilesJson != null) {
      const rows = await db
        .select({ filesJson: engineVersions.filesJson })
        .from(engineVersions)
        .where(eq(engineVersions.id, versionId))
        .limit(1);
      const current = rows[0]?.filesJson;
      if (typeof current === "string" && current !== baseFilesJson) {
        return { status: "stale_base" };
      }
    }
    return { status: "failed" };
  }
  // A repair only reaches `repair_available` after it passed its own quality
  // gate (`shouldPromoteAfterRepair`). Stamp that pass so the promotion guard
  // reads the *current* (repaired) signal instead of the stale finalize
  // `verifier_failed`/`preflight_failed` that flagged the pre-repair content —
  // otherwise `acceptRepair`'s guard would wedge a legitimately-fixed row.
  //
  // Decode the payload we just stored rather than reusing `repairedFilesJson`:
  // that is byte-for-byte what `acceptRepair` will promote into `files_json`,
  // so `md5()` of it equals the generated `files_revision` the version gets on
  // acceptance. Passing the raw argument instead would risk a whitespace/
  // key-order drift through the envelope round-trip.
  await recordRepairPassedQualityGate(
    versionId,
    decodeRepairedFilesPayload(storedPayload)?.filesJson ?? null,
  );
  const version = await getStoredVersion(versionId);
  return { status: "saved", version };
}

export async function getRepairStatus(versionId: string): Promise<VersionRepairStatus | null> {
  const rows = await db
    .select({
      id: engineVersions.id,
      verificationState: engineVersions.verificationState,
      repairedFilesJson: engineVersions.repairedFilesJson,
      repairAvailableAt: engineVersions.repairAvailableAt,
    })
    .from(engineVersions)
    .where(eq(engineVersions.id, versionId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    versionId: row.id,
    verificationState:
      (row.verificationState as EngineVersionVerificationState) ?? "pending",
    hasPendingRepair:
      typeof row.repairedFilesJson === "string" && row.repairedFilesJson.trim().length > 0,
    repairAvailableAt:
      row.repairAvailableAt instanceof Date ? row.repairAvailableAt.toISOString() : null,
  };
}

/**
 * Outcome of {@link acceptRepair}. `lease_unavailable` is distinct from
 * `null`: the caller could not prove lease-table presence, so HTTP routes
 * must retry (503) instead of treating it as "no pending repair" (409).
 */
export type AcceptRepairResult = Version | null | "lease_unavailable";

export async function acceptRepair(
  versionId: string,
  verificationSummary: string | null = "Server repair accepted.",
): Promise<AcceptRepairResult> {
  // Resolve lease-table presence ONCE, out of band. We must NOT name
  // engine_version_jobs inside the UPDATE when it is absent — Postgres
  // resolves relations at parse/plan time. `unavailable` refuses the accept
  // as its own retryable state — never as `null` ("no pending repair").
  const presence = await leaseTableExists();
  if (presence === "unavailable") {
    console.warn(
      `[lease] acceptRepair probe unavailable on ${versionId} — refusing accept (retryable).`,
    );
    return "lease_unavailable";
  }
  const jobsExist = presence === "exists";
  return db.transaction(async (tx) => {
    // Codex P2 (serialize with acquireVersionLease): take the version-row lock
    // FIRST (FOR UPDATE). acquireVersionLease locks the same row before inserting
    // its lease, so the two contend; the no-active-lease UPDATE below then runs
    // as a later statement with a fresh READ COMMITTED snapshot and sees any
    // lease that committed in the gap — closing the promote-then-lease race.
    const rows = await tx
      .select({
        repairedFilesJson: engineVersions.repairedFilesJson,
        filesJson: engineVersions.filesJson,
      })
      .from(engineVersions)
      .where(eq(engineVersions.id, versionId))
      .limit(1)
      .for("update");
    const repairedFilesJson = rows[0]?.repairedFilesJson;
    if (typeof repairedFilesJson !== "string" || repairedFilesJson.trim().length === 0) {
      return null;
    }
    // #260 / Codex P2 #5 (repair-vs-user-edit clobber): the pending repair is
    // stored as a base-hashed envelope. Decode it, then refuse to promote unless
    // the version still holds the exact `files_json` the repair was based on.
    const payload = decodeRepairedFilesPayload(repairedFilesJson);
    if (!payload) {
      console.warn(`[accept-repair] Unparseable pending repair payload for version ${versionId}.`);
      return null;
    }
    if (payload.kind === "legacy") {
      // A plain pre-envelope array carries no base hash, so we cannot prove the
      // current files are the ones it repaired. Fail closed AND clear the
      // pending repair so the versions/readiness routes stop advertising an
      // un-acceptable repair forever (manual accept + timed auto-accept would
      // otherwise loop on this same refusal, blocking publish). files_json is
      // left untouched — the user's current files are never overwritten; they
      // just re-run repair. These rows only exist transiently across the deploy
      // that shipped the envelope.
      console.warn(
        `[accept-repair] Clearing legacy (no base-hash) pending repair for version ${versionId}; re-run repair.`,
      );
      await tx
        .update(engineVersions)
        .set({
          repairedFilesJson: null,
          repairAvailableAt: null,
          releaseState: "draft" as EngineVersionReleaseState,
          verificationState: "failed" as EngineVersionVerificationState,
          verificationSummary:
            "Pending repair could not be verified against the current files; please re-run repair.",
          promotedAt: null,
        })
        .where(
          and(
            eq(engineVersions.id, versionId),
            // Bind to the exact legacy payload read above: if a replacement
            // (envelope) repair was saved in the gap, this no-ops instead of
            // clearing a now-valid pending repair.
            sql`${engineVersions.repairedFilesJson} = ${repairedFilesJson}`,
            // Same active-lease guard as the promote update below: the route +
            // maybeAutoAcceptTimedOutRepair "no active lease" pre-checks are only
            // a fast-fail. If a verify/repair job acquired the lease in the gap
            // before this transaction locked the row, do NOT clear/fail the row
            // from under it — the running job will produce a fresh envelope
            // repair that supersedes this legacy payload. Only name
            // engine_version_jobs when it exists (see leaseTableExists).
            jobsExist
              ? sql`NOT EXISTS (SELECT 1 FROM engine_version_jobs j WHERE j.version_id = ${versionId} AND j.status = 'running' AND j.lease_expires_at > now())`
              : undefined,
          ),
        );
      return null;
    }
    const currentFilesJson = rows[0]?.filesJson;
    if (typeof currentFilesJson !== "string" || hashFilesJson(currentFilesJson) !== payload.baseFilesHash) {
      // files_json changed since the repair snapshot (a concurrent user edit):
      // promoting repair(A) over B would lose the edit. Leave B intact.
      console.warn(
        `[accept-repair] Refusing stale repair for version ${versionId}: files_json changed since the repair base.`,
      );
      return null;
    }
    // False-green invariant: accepting a repair also promotes, so it must pass
    // through the same guard as `promoteVersion`. `saveRepairedFiles` stamped a
    // fresh `preflight_passed` signal when the repair passed its gate, so a
    // legitimate repair is allowed; a still-failing latest signal (e.g. the
    // stamp never landed, or telemetry was re-flagged) blocks promotion instead
    // of leaking a verifier-rejected row to `promoted`/`passed`. A READ ERROR
    // fails closed-but-retryable (M#pg1 / B08 follow-up) — returning null keeps
    // the pending repair intact so a later accept can retry; only a no-telemetry
    // row (signal === null) keeps the historic fail-open.
    //
    // `promotedFilesJson` is what makes the revision-aware guard (steg 3) correct
    // here: the content being promoted is the repaired payload, not the version's
    // current `files_json`. Without it the repair verdict — stamped with the
    // repaired revision by `saveRepairedFiles` — would read as a stale revision
    // against the pre-accept base and wedge every legitimate accept.
    const guard = await assertPromoteAllowed(versionId, undefined, {
      onReadError: "indeterminate",
      promotedFilesJson: payload.filesJson,
    });
    if (!guard.allowed) {
      console.warn(
        "indeterminate" in guard && guard.indeterminate
          ? `[promote-guard] Repair-accept signal unavailable for version ${versionId} (retryable): ${guard.reason}`
          : `[promote-guard] Refusing to accept repair for version ${versionId}: ${guard.reason}`,
      );
      return null;
    }
    const result = await tx
      .update(engineVersions)
      .set({
        // Promote the files extracted from the verified envelope (base-hash
        // confirmed to match the current files_json above). The WHERE binds to
        // the exact envelope string SELECTed, so a replacement repair saved in
        // the gap no-ops instead of being promoted early.
        filesJson: payload.filesJson,
        previewUrl: null,
        repairedFilesJson: null,
        repairAvailableAt: null,
        releaseState: "promoted" as EngineVersionReleaseState,
        verificationState: "passed" as EngineVersionVerificationState,
        verificationSummary,
        promotedAt: new Date(),
      })
      .where(
        and(
          eq(engineVersions.id, versionId),
          // Codex P2 (replacement-repair guard): only promote when the pending
          // repair is STILL the exact one read above. If a newer repair was
          // saved between the SELECT and here (and may not have reached its own
          // accept timeout), this no-ops instead of promoting it early. This
          // also subsumes the "not cleared" check (a non-empty string != NULL).
          sql`${engineVersions.repairedFilesJson} = ${repairedFilesJson}`,
          // Codex P2 (no active lease): atomic guard — the route +
          // maybeAutoAcceptTimedOutRepair pre-checks are only a fast-fail. Only
          // reference engine_version_jobs when it exists (see leaseTableExists).
          jobsExist
            ? sql`NOT EXISTS (SELECT 1 FROM engine_version_jobs j WHERE j.version_id = ${versionId} AND j.status = 'running' AND j.lease_expires_at > now())`
            : undefined,
        ),
      );
    if ((result.rowCount ?? 0) === 0) {
      return null;
    }
    const versionRows = await tx
      .select()
      .from(engineVersions)
      .where(eq(engineVersions.id, versionId))
      .limit(1);
    return toRow(versionRows[0]) as unknown as Version;
  });
}

type AutoAcceptResult = {
  version: Version;
  wasAutoAccepted: boolean;
};

function parseIsoToMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function shouldAutoAcceptRepair(
  verificationState: EngineVersionVerificationState | null | undefined,
  repairAvailableAt: string | null | undefined,
): boolean {
  if (verificationState !== "repair_available") return false;
  const repairAvailableAtMs = parseIsoToMs(repairAvailableAt);
  if (repairAvailableAtMs === null) return false;
  return Date.now() - repairAvailableAtMs >= REPAIR_ACCEPT_TIMEOUT_MS;
}

export async function maybeAutoAcceptTimedOutRepair(version: Version): Promise<AutoAcceptResult> {
  if (!shouldAutoAcceptRepair(version.verification_state, version.repair_available_at)) {
    return { version, wasAutoAccepted: false };
  }
  // Codex P2: the explicit POST /accept-repair route guards on an active lease,
  // but auto-accept reaches `acceptRepair` from polling paths (readiness /
  // versions / chat GET). Guard it here too so a still-running verify/repair job
  // (which holds the lease) can never have its row promoted out from under it.
  // Fail-closed: a probe/query error is treated as "lease may exist" — never
  // as permission to accept unlocked.
  try {
    if (await hasActiveVersionLease(version.id)) {
      return { version, wasAutoAccepted: false };
    }
  } catch (err) {
    console.warn(
      `[lease] maybeAutoAcceptTimedOutRepair lease probe unavailable on ${version.id} — no-op.`,
      err,
    );
    return { version, wasAutoAccepted: false };
  }
  const accepted = await acceptRepair(
    version.id,
    "Server repair auto-accepted after timeout.",
  );
  if (!accepted || accepted === "lease_unavailable") {
    return { version, wasAutoAccepted: false };
  }
  return { version: accepted, wasAutoAccepted: true };
}
